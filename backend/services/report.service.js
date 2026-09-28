/**
 * report.service.js — CivicChain report pipeline
 *
 * processReport()    AI + IPFS preview (no NFT, nothing stored)
 * createFullReport() the full pipeline. The order is mandatory — an NFT is
 *                    never minted before every gate has passed:
 *
 *   1  AI analysis (Gemini)      error → AI_FAILED · not civic → NOT_CIVIC_ISSUE
 *   2  Fraud gate                score ≥ 71 → FRAUD_BLOCKED (31–70 → warning)
 *   3  Duplicate check (SHA-256) match → DUPLICATE (links the original report)
 *   4  Report ID                 existing RP-<timestamp> format
 *   5  IPFS image                failure → IPFS_FAILED (nothing stored)
 *   6  NFT metadata → IPFS       failure → IPFS_FAILED (nothing stored)
 *   7  Store report              NFT_MINT_PENDING; register hash; auto-assign; OPEN
 *   8  Mint on Sepolia           serialised queue; wait up to MINT_WAIT_MS
 *   9  Confirmed                 NFT_MINTED (token id from the event)
 *   10 Gamification              off-chain points + reputation
 */

import crypto from 'crypto';
import { analyzeImage }            from './ai.service.js';
import { uploadToIPFS, uploadJSON } from './ipfs.service.js';
import { calculateFraudScore }     from './fraud.service.js';
import { checkDuplicate, registerHash } from './duplicate.service.js';
import { awardForReport }          from './reward.service.js';
import { increaseForReport }       from './reputation.service.js';
import { buildCivicIssueMetadata } from './nftMetadata.service.js';
import { getDepartmentForCategory } from './department.service.js';
import { getCityName }             from './jurisdiction.service.js';
import { ensureAssigned }          from './assignment.service.js';
import { registerReport }          from './workflow.service.js';
import { addReport, getReportById, reportExists } from './reportCache.js';
import { mintForReport }           from './nftMint.service.js';
import { redact }                  from '../utils/redact.js';

// ─── Preview — AI + IPFS (no NFT) ────────────────────────────────────────────

export async function processReport(buffer, mimeType, filename, meta = {}) {
  const [aiResult, ipfsResult] = await Promise.allSettled([
    analyzeImage(buffer, mimeType),
    uploadToIPFS(buffer, mimeType, filename, { kind: 'preview', sha256: sha256(buffer) }),
  ]);

  const analysis = aiResult.status === 'fulfilled'
    ? aiResult.value
    : { isCivicIssue: false, category: 'OTHER', severity: 'LOW', confidence: 0, reason: `AI analysis failed: ${aiResult.reason?.message || 'unknown error'}` };

  const evidence = ipfsResult.status === 'fulfilled' ? ipfsResult.value : null;
  const errors = {
    ai:   aiResult.status   === 'rejected' ? (aiResult.reason?.message   || 'AI error')   : null,
    ipfs: ipfsResult.status === 'rejected' ? (ipfsResult.reason?.message || 'IPFS error') : null,
  };

  if (!evidence) {
    const err = new Error(errors.ipfs || 'IPFS upload failed');
    err.code = ipfsResult.reason?.code || 'IPFS_FAILED';
    err.analysis = analysis;
    throw err;
  }
  void meta;
  return { analysis, evidence, errors };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/** Existing report id format (RP-<ms timestamp>), made unique under concurrency. */
export function generateReportId() {
  let ts = Date.now();
  while (reportExists(`RP-${ts}`)) ts++;
  return `RP-${ts}`;
}

function mintWaitMs() {
  const n = Number(process.env.MINT_WAIT_MS);
  return Number.isFinite(n) && n >= 0 ? n : 90_000;
}

function aiFailureStatus(e) {
  const msg = String(e?.message || '').toLowerCase();
  if (msg.includes('gemini_api_key') || msg.includes('quota') || msg.includes('429') || msg.includes('rate')) return 503;
  return 502;
}

function ipfsFailureStatus(e) {
  return e?.code === 'IPFS_AUTH_FAILED' || e?.code === 'IPFS_QUOTA' ? 503 : 502;
}

class Pipeline {
  constructor() { this.stages = []; }
  async run(stage, fn) {
    const t = Date.now();
    try {
      const v = await fn();
      this.stages.push({ stage, status: 'done', ms: Date.now() - t });
      return v;
    } catch (e) {
      this.stages.push({ stage, status: 'failed', ms: Date.now() - t, detail: redact(e?.message || 'failed').slice(0, 200) });
      throw e;
    }
  }
  mark(stage, status, detail) {
    this.stages.push({ stage, status, ms: 0, ...(detail ? { detail } : {}) });
  }
  skipRest(from) {
    const order = ['AI_ANALYSIS', 'FRAUD_CHECK', 'DUPLICATE_CHECK', 'IPFS_IMAGE', 'NFT_METADATA', 'NFT_MINT', 'NFT_CONFIRMED', 'CONTRIBUTION_RECORDED'];
    for (const s of order.slice(order.indexOf(from))) {
      if (!this.stages.find((x) => x.stage === s)) this.stages.push({ stage: s, status: 'skipped', ms: 0 });
    }
  }
}

export const PIPELINE_STAGES = ['AI_ANALYSIS', 'FRAUD_CHECK', 'DUPLICATE_CHECK', 'IPFS_IMAGE', 'NFT_METADATA', 'NFT_MINT', 'NFT_CONFIRMED', 'CONTRIBUTION_RECORDED'];

function publicNft(nft) {
  if (!nft) return null;
  return {
    status: nft.status,
    tokenId: nft.tokenId ?? null,
    transactionHash: nft.transactionHash ?? null,
    contractAddress: nft.contractAddress ?? null,
    recipient: nft.recipient ?? null,
    metadataCid: nft.metadataCid ?? null,
    imageCid: nft.imageCid ?? null,
    tokenURI: nft.tokenURI ?? null,
    blockNumber: nft.blockNumber ?? null,
    mintedAt: nft.mintedAt ?? null,
    explorerUrl: nft.explorerUrl ?? null,
    tokenExplorerUrl: nft.tokenExplorerUrl ?? null,
    attempts: nft.attempts ?? 0,
    ...(nft.errorCode ? { errorCode: nft.errorCode, errorMessage: nft.errorMessage || null } : {}),
  };
}
export { publicNft };

// ─── Full pipeline ───────────────────────────────────────────────────────────

/**
 * @param {Buffer} buffer    validated image bytes
 * @param {string} mimeType  image/jpeg | image/png | image/webp
 * @param {string} filename
 * @param {object} meta      { reporter (checksum 0x, from the JWT), city (code), landmark }
 * @returns {Promise<{ httpStatus: number, body: object }>}
 */
export async function createFullReport(buffer, mimeType, filename, meta) {
  const pipeline = new Pipeline();
  const reporter = meta.reporter;
  const cityCode = meta.city;
  const cityName = getCityName(cityCode);
  const landmark = (meta.landmark || '').trim();
  const reject = (httpStatus, status, extra = {}) => ({
    httpStatus,
    body: { success: false, status, pipeline: pipeline.stages, address: reporter, city: cityCode, cityName, ...extra },
  });

  // 1 ── AI analysis ──────────────────────────────────────────────────────────
  let analysis;
  try {
    analysis = await pipeline.run('AI_ANALYSIS', () => analyzeImage(buffer, mimeType));
  } catch (e) {
    pipeline.skipRest('FRAUD_CHECK');
    return reject(aiFailureStatus(e), 'AI_FAILED', {
      error: 'AI verification is unavailable right now. Nothing was stored — please try again.',
      detail: redact(e?.message || '').slice(0, 200),
    });
  }
  if (!analysis.isCivicIssue) {
    pipeline.skipRest('FRAUD_CHECK');
    return reject(422, 'NOT_CIVIC_ISSUE', { analysis, error: analysis.reason || 'The photo does not show a civic issue.' });
  }

  // 2 ── Fraud gate ───────────────────────────────────────────────────────────
  const fraudResult = await pipeline.run('FRAUD_CHECK', () => calculateFraudScore(analysis));
  const fraud = { score: fraudResult.fraudScore, warning: fraudResult.allowed && fraudResult.fraudScore > 30, riskLevel: fraudResult.riskLevel, reason: fraudResult.reason };
  if (!fraudResult.allowed) {
    pipeline.skipRest('DUPLICATE_CHECK');
    return reject(422, 'FRAUD_BLOCKED', { analysis, fraud, blocked: true, fraudScore: fraud.score, riskLevel: fraud.riskLevel, error: fraudResult.reason });
  }

  // 3 ── Duplicate check ─────────────────────────────────────────────────────
  const imageSha256 = sha256(buffer);
  const dup = await pipeline.run('DUPLICATE_CHECK', () => checkDuplicate(buffer));
  if (dup.isDuplicate) {
    pipeline.skipRest('IPFS_IMAGE');
    return reject(409, 'DUPLICATE', {
      analysis, fraud, duplicate: true, existingReportId: dup.existingReportId,
      error: 'This image has already been reported.', reason: dup.reason,
    });
  }

  // 4 ── Report ID ───────────────────────────────────────────────────────────
  const reportId = generateReportId();
  const createdAt = Date.now();
  const department = getDepartmentForCategory(analysis.category);

  // 5 ── IPFS image ──────────────────────────────────────────────────────────
  let image;
  try {
    image = await pipeline.run('IPFS_IMAGE', () => uploadToIPFS(buffer, mimeType, filename, { reportId, sha256: imageSha256 }));
  } catch (e) {
    pipeline.skipRest('NFT_METADATA');
    return reject(ipfsFailureStatus(e), 'IPFS_FAILED', { reportId, analysis, fraud, errorCode: e?.code || 'IPFS_FAILED', error: e?.message || 'IPFS upload failed. Nothing was stored.' });
  }

  // 6 ── NFT metadata ────────────────────────────────────────────────────────
  let metaPin;
  try {
    const metadata = buildCivicIssueMetadata({ reportId, analysis, city: cityName, department, submittedAt: createdAt, imageCid: image.cid, imageSha256 });
    metaPin = await pipeline.run('NFT_METADATA', () => uploadJSON(metadata, { reportId }));
  } catch (e) {
    if (!pipeline.stages.find((s) => s.stage === 'NFT_METADATA')) pipeline.mark('NFT_METADATA', 'failed', redact(e.message));
    pipeline.skipRest('NFT_MINT');
    return reject(ipfsFailureStatus(e), 'IPFS_FAILED', { reportId, analysis, fraud, errorCode: e?.code || 'IPFS_FAILED', error: e?.message || 'Metadata upload failed. Nothing was stored.' });
  }

  const evidence = {
    imageCid: image.cid,
    imageUrl: image.gatewayUrl,
    metadataCid: metaPin.cid,
    metadataUrl: metaPin.gatewayUrl,
    imageSha256,
  };
  const tokenURI = `ipfs://${metaPin.cid}`;

  // 7 ── Persist the report BEFORE minting ────────────────────────────────────
  const report = {
    id: reportId,
    reportId,
    reporter,
    category: analysis.category,
    severity: analysis.severity,
    confidence: analysis.confidence,
    reason: analysis.reason,
    description: analysis.reason,
    location: { address: landmark || 'Unknown location', city: cityCode },
    city: cityCode,
    cityName,
    department,
    status: 'OPEN',
    fraud,
    createdAt,
    updatedAt: createdAt,
    evidence,
    nft: { status: 'NFT_MINT_PENDING', attempts: 0, tokenURI, metadataCid: metaPin.cid, imageCid: image.cid },
  };
  addReport(report);
  registerHash(imageSha256, reportId);
  ensureAssigned([report]);
  registerReport(reportId, reporter);

  // 8/9 ── Mint (wait at most MINT_WAIT_MS; the mint keeps going in the background)
  const t0 = Date.now();
  const mintPromise = mintForReport(reportId);
  const waited = await Promise.race([mintPromise, new Promise((r) => setTimeout(() => r(null), mintWaitMs()).unref?.())]);
  const stored = getReportById(reportId);
  const nft = stored?.nft || waited || report.nft;
  const mintMs = Date.now() - t0;
  if (nft.status === 'NFT_MINTED') {
    pipeline.mark('NFT_MINT', 'done');
    pipeline.stages.push({ stage: 'NFT_CONFIRMED', status: 'done', ms: mintMs });
  } else if (nft.status === 'NFT_MINT_PENDING') {
    pipeline.stages.push({ stage: 'NFT_MINT', status: nft.transactionHash ? 'done' : 'pending', ms: mintMs });
    pipeline.mark('NFT_CONFIRMED', 'pending');
  } else {
    pipeline.stages.push({ stage: 'NFT_MINT', status: 'failed', ms: mintMs, detail: nft.errorCode || 'UNKNOWN' });
    pipeline.mark('NFT_CONFIRMED', 'skipped');
  }

  // 10 ── Off-chain gamification (independent of the mint outcome) ─────────────
  const points = await pipeline.run('CONTRIBUTION_RECORDED', async () => awardForReport(reporter, analysis));
  const reputation = await increaseForReport(reporter, analysis);

  const httpStatus = nft.status === 'NFT_MINTED' ? 201 : 202;
  return {
    httpStatus,
    body: {
      success: true,
      status: nft.status,
      reportId,
      analysis,
      fraud,
      evidence,
      nft: publicNft(nft),
      reputation,
      points,
      rewards: points,               // compatibility with older clients
      city: cityCode,
      cityName,
      department,
      address: reporter,
      landmark: landmark || null,
      pipeline: pipeline.stages,
    },
  };
}
