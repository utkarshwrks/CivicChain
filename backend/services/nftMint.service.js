/**
 * nftMint.service.js — minting, idempotent retry and reconciliation for reports
 *
 *   mintForReport(reportId)   mint the stored report's NFT (per-report lock)
 *   retryReport(reportId)     idempotent retry — never double-mints:
 *                               NFT_MINTED            → no-op, existing data
 *                               has a tx hash         → ask the chain first:
 *                                 CONFIRMED            → reconcile to NFT_MINTED
 *                                 PENDING              → stay pending
 *                                 REVERTED / NOT_FOUND for > 10 min → mint again (same tokenURI)
 *                               otherwise             → mint again
 *   retryAllFailed()          sequentially retry every NFT_MINT_FAILED report
 *                             (ADMIN retries may exceed MAX_MINT_ATTEMPTS; automatic ones never do)
 *   reconcileOnce()           finish NFT_MINT_PENDING reports that have a tx hash;
 *                             auto-retry transient failures with backoff
 *   startReconciler()         run reconcileOnce at startup + every 60 s,
 *                             and syncFromChain every 5 min (never blocks startup)
 */

import { ethereumService, TRANSIENT_MINT_ERRORS } from './ethereum.service.js';
import { getReportById, getReports, updateReport } from './reportCache.js';
import { recordToken, syncFromChain } from './nftCache.js';
import { redact } from '../utils/redact.js';

const LOG = '[MINT]';
const STALE_MS = 10 * 60 * 1000;          // tx not found for 10 min → re-mint
const RECONCILE_EVERY_MS = 60_000;
const SYNC_EVERY_MS = 5 * 60_000;

const locks = new Set();

export function maxAttempts() {
  const n = Number(process.env.MAX_MINT_ATTEMPTS);
  return Number.isInteger(n) && n > 0 ? n : 5;
}

export function isLocked(reportId) {
  return locks.has(reportId);
}

function patchNft(reportId, patch) {
  return updateReport(reportId, (r) => ({ nft: { ...(r.nft || {}), ...patch } }))?.nft || null;
}

function finalizeMinted(report, res) {
  const nft = patchNft(report.reportId, {
    status: 'NFT_MINTED',
    tokenId: String(res.tokenId),
    contractAddress: res.contractAddress,
    transactionHash: res.transactionHash,
    recipient: res.recipient,
    metadataCid: report.nft?.metadataCid || report.evidence?.metadataCid || null,
    imageCid: report.nft?.imageCid || report.evidence?.imageCid || null,
    tokenURI: report.nft?.tokenURI,
    blockNumber: res.blockNumber ?? null,
    mintedAt: new Date().toISOString(),
    explorerUrl: res.explorerUrl || ethereumService.txUrl(res.transactionHash),
    tokenExplorerUrl: res.tokenExplorerUrl || ethereumService.tokenUrl(res.contractAddress, res.tokenId),
    errorCode: null,
    errorMessage: null,
  });
  recordToken(res.contractAddress, {
    tokenId: String(res.tokenId),
    reportId: report.reportId,
    recipient: res.recipient,
    tokenURI: report.nft?.tokenURI,
    metadataCid: nft.metadataCid,
    imageCid: nft.imageCid,
    transactionHash: res.transactionHash,
    blockNumber: res.blockNumber ?? null,
    mintedAt: nft.mintedAt,
    category: report.category,
    severity: report.severity,
    city: report.city,
    confidence: report.confidence,
  });
  console.log(`${LOG} ${report.reportId} → token #${res.tokenId}`);
  return nft;
}

/**
 * Mint the NFT of a stored report. Resolves with the report's nft object.
 * The caller must not hold the lock.
 */
export async function mintForReport(reportId, { ignoreCap = false } = {}) {
  const report = getReportById(reportId);
  if (!report) return null;
  if (report.nft?.status === 'NFT_MINTED') return report.nft;
  if (report.nft?.status === 'NOT_ELIGIBLE_LEGACY' || !report.nft?.tokenURI) return report.nft || null;
  if (locks.has(reportId)) return { ...report.nft, busy: true };

  locks.add(reportId);
  try {
    const attempts = (report.nft.attempts || 0) + 1;
    if (attempts > maxAttempts() && !ignoreCap) {
      return patchNft(reportId, {
        status: 'NFT_MINT_FAILED',
        errorCode: 'MAX_ATTEMPTS_REACHED',
        errorMessage: `Mint was attempted ${maxAttempts()} times. An admin can review the minter wallet and retry.`,
      });
    }
    patchNft(reportId, { status: 'NFT_MINT_PENDING', attempts, lastAttemptAt: new Date().toISOString(), errorCode: null, errorMessage: null });

    const res = await ethereumService.mintCivicIssueNFT(report.reporter, report.nft.tokenURI, {
      reportId,
      onSubmitted: (hash) => patchNft(reportId, {
        transactionHash: hash,
        submittedAt: new Date().toISOString(),
        explorerUrl: ethereumService.txUrl(hash),
      }),
    });

    if (res.success) return finalizeMinted(getReportById(reportId), res);

    if (res.code === 'TX_TIMEOUT' && res.transactionHash) {
      // Sent but not yet confirmed — the reconciler finishes it.
      return patchNft(reportId, { status: 'NFT_MINT_PENDING', transactionHash: res.transactionHash, errorCode: 'TX_TIMEOUT', errorMessage: res.message });
    }
    return patchNft(reportId, {
      status: 'NFT_MINT_FAILED',
      errorCode: res.code || 'UNKNOWN',
      errorMessage: redact(res.message || 'Mint failed').slice(0, 300),
      ...(res.transactionHash ? { transactionHash: res.transactionHash } : {}),
      lastAttemptAt: new Date().toISOString(),
    });
  } catch (e) {
    return patchNft(reportId, { status: 'NFT_MINT_FAILED', errorCode: 'UNKNOWN', errorMessage: redact(e.message).slice(0, 300) });
  } finally {
    locks.delete(reportId);
  }
}

function sinceMs(iso) {
  const t = iso ? new Date(iso).getTime() : 0;
  return t ? Date.now() - t : Infinity;
}

/** Move the old hash aside so a fresh mint can record its own. */
function prepareRemint(reportId) {
  updateReport(reportId, (r) => ({
    nft: {
      ...r.nft,
      previousTransactionHashes: [...(r.nft?.previousTransactionHashes || []), r.nft?.transactionHash].filter(Boolean),
      transactionHash: null,
      submittedAt: null,
    },
  }));
}

/**
 * Idempotent retry. Returns { outcome, nft } where outcome is one of
 * ALREADY_MINTED | RECONCILED | PENDING | MINTED | FAILED | BUSY | NOT_ELIGIBLE | NOT_FOUND.
 */
export async function retryReport(reportId, { ignoreCap = false } = {}) {
  const report = getReportById(reportId);
  if (!report) return { outcome: 'NOT_FOUND', nft: null };
  const nft = report.nft || {};
  if (nft.status === 'NFT_MINTED') return { outcome: 'ALREADY_MINTED', nft };
  if (nft.status === 'NOT_ELIGIBLE_LEGACY' || !nft.tokenURI) return { outcome: 'NOT_ELIGIBLE', nft };
  if (locks.has(reportId)) return { outcome: 'BUSY', nft };

  if (nft.transactionHash) {
    let tx;
    try {
      tx = await ethereumService.getTransactionOutcome(nft.transactionHash);
    } catch {
      return { outcome: 'PENDING', nft: patchNft(reportId, { errorCode: 'RPC_UNAVAILABLE', errorMessage: 'Could not reach Sepolia to check the previous transaction.' }) };
    }
    if (tx.state === 'CONFIRMED' && tx.tokenId) {
      const info = await ethereumService.getContractInfo();
      const reconciled = finalizeMinted(report, {
        tokenId: tx.tokenId,
        transactionHash: nft.transactionHash,
        contractAddress: info.contractAddress,
        recipient: tx.recipient || report.reporter,
        blockNumber: tx.blockNumber,
      });
      return { outcome: 'RECONCILED', nft: reconciled };
    }
    if (tx.state === 'PENDING') {
      return { outcome: 'PENDING', nft: patchNft(reportId, { status: 'NFT_MINT_PENDING' }) };
    }
    if (tx.state === 'NOT_FOUND' && sinceMs(nft.submittedAt || nft.lastAttemptAt) < STALE_MS) {
      return { outcome: 'PENDING', nft: patchNft(reportId, { status: 'NFT_MINT_PENDING' }) };
    }
    prepareRemint(reportId); // REVERTED, or missing for > 10 min
  }

  const after = await mintForReport(reportId, { ignoreCap });
  if (after?.busy) return { outcome: 'BUSY', nft: after };
  const outcome = after?.status === 'NFT_MINTED' ? 'MINTED' : after?.status === 'NFT_MINT_PENDING' ? 'PENDING' : 'FAILED';
  return { outcome, nft: after };
}

/** ADMIN: retry every NFT_MINT_FAILED report one by one. */
export async function retryAllFailed() {
  const failed = getReports().filter((r) => r.nft?.status === 'NFT_MINT_FAILED');
  const results = [];
  for (const r of failed) {
    const res = await retryReport(r.reportId, { ignoreCap: true });
    results.push({ reportId: r.reportId, outcome: res.outcome, status: res.nft?.status || null, tokenId: res.nft?.tokenId || null });
  }
  return { total: failed.length, results };
}

let lastBalanceCheck = { at: 0, ok: false };
async function minterHasFunds() {
  if (Date.now() - lastBalanceCheck.at < 60_000) return lastBalanceCheck.ok;
  try {
    const st = await ethereumService.getStatus();
    lastBalanceCheck = { at: Date.now(), ok: st.minterBalanceEth !== null && Number(st.minterBalanceEth) >= 0.005 };
  } catch {
    lastBalanceCheck = { at: Date.now(), ok: false };
  }
  return lastBalanceCheck.ok;
}

/** One reconciliation pass. Never throws. */
export async function reconcileOnce() {
  const summary = { checked: 0, reconciled: 0, retried: 0 };
  try {
    await ethereumService.ensureInit();
    if (!ethereumService.isReady()) return { ...summary, skipped: true };
    for (const r of getReports()) {
      const nft = r.nft;
      if (!nft || !nft.tokenURI || locks.has(r.reportId)) continue;

      if (nft.status === 'NFT_MINT_PENDING') {
        summary.checked++;
        if (nft.transactionHash || sinceMs(nft.lastAttemptAt) > STALE_MS) {
          const res = await retryReport(r.reportId);
          if (res.outcome === 'RECONCILED') summary.reconciled++;
          if (res.outcome === 'MINTED') summary.retried++;
        }
        continue;
      }

      if (nft.status === 'NFT_MINT_FAILED' && (nft.attempts || 0) < maxAttempts()) {
        const transient = TRANSIENT_MINT_ERRORS.includes(nft.errorCode);
        const funds = nft.errorCode === 'INSUFFICIENT_FUNDS';
        if (!transient && !funds) continue;
        const backoff = 60_000 * 2 ** Math.max(0, (nft.attempts || 1) - 1);
        if (sinceMs(nft.lastAttemptAt) < backoff) continue;
        if (funds && !(await minterHasFunds())) continue;
        summary.checked++;
        const res = await retryReport(r.reportId);
        if (res.outcome === 'MINTED' || res.outcome === 'RECONCILED') summary.retried++;
      }
    }
  } catch (e) {
    console.error(`${LOG} reconcile error:`, redact(e.message));
  }
  return summary;
}

function findReportByTokenURI(uri) {
  return getReports().find((r) => r.nft?.tokenURI === uri) || null;
}

let timers = [];
export function startReconciler() {
  stopReconciler();
  const run = () => reconcileOnce().catch(() => {});
  const sync = () => syncFromChain(ethereumService, findReportByTokenURI).catch(() => {});
  timers.push(setTimeout(() => { run(); sync(); }, 2_000));
  timers.push(setInterval(run, RECONCILE_EVERY_MS));
  timers.push(setInterval(sync, SYNC_EVERY_MS));
  for (const t of timers) t.unref?.();
}

export function stopReconciler() {
  for (const t of timers) { clearTimeout(t); clearInterval(t); }
  timers = [];
}
