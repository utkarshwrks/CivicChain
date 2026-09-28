/**
 * nftCache.js — operational cache of minted Civic Issue NFTs (backend/data/nft-cache.json)
 *
 * Shape (keyed by contract so a redeploy never shows stale tokens):
 * {
 *   "<contract lowercase>": {
 *     chainId, lastSyncedBlock,
 *     tokens:   { "<tokenId>": { tokenId, reportId, recipient, tokenURI, metadataCid, imageCid,
 *                                transactionHash, blockNumber, mintedAt, category, severity, city, confidence } },
 *     byReport: { "<reportId>": "<tokenId>" }
 *   }
 * }
 *
 * The cache keeps the UI fast and avoids free-tier log-range limits. The chain
 * is the evidence: any token can be re-verified with ownerOf / tokenURI.
 */
import { dataPath, readJson, writeJsonAtomic } from '../config/paths.js';
import { SEPOLIA_CHAIN_ID } from '../config/ethereum.config.js';

const CACHE_PATH = () => dataPath('nft-cache.json');
let store = {};

export function loadNftCache() {
  store = readJson(CACHE_PATH(), {}) || {};
  return store;
}

function save() {
  try {
    writeJsonAtomic(CACHE_PATH(), store);
  } catch (e) {
    console.error('[nftCache] Failed to save:', e.message);
  }
}

function bucket(contract, create = false) {
  if (!contract) return null;
  const key = contract.toLowerCase();
  if (!store[key] && create) store[key] = { chainId: SEPOLIA_CHAIN_ID, lastSyncedBlock: 0, tokens: {}, byReport: {} };
  return store[key] || null;
}

/** Record (or update) a minted token. */
export function recordToken(contract, token) {
  const b = bucket(contract, true);
  const id = String(token.tokenId);
  b.tokens[id] = { ...(b.tokens[id] || {}), ...token, tokenId: id };
  if (token.reportId) b.byReport[token.reportId] = id;
  if (token.blockNumber && token.blockNumber > (b.lastSyncedBlock || 0)) b.lastSyncedBlock = token.blockNumber;
  save();
  return b.tokens[id];
}

export function getToken(contract, tokenId) {
  return bucket(contract)?.tokens?.[String(tokenId)] || null;
}

export function getTokenIdForReport(contract, reportId) {
  return bucket(contract)?.byReport?.[reportId] || null;
}

/** All tokens for a contract, newest (highest id) first. */
export function listTokens(contract) {
  const b = bucket(contract);
  if (!b) return [];
  return Object.values(b.tokens).sort((a, b2) => Number(b2.tokenId) - Number(a.tokenId));
}

export function tokensByOwner(contract, address) {
  const a = String(address || '').toLowerCase();
  return listTokens(contract).filter((t) => String(t.recipient || '').toLowerCase() === a);
}

export function getLastSyncedBlock(contract) {
  return bucket(contract)?.lastSyncedBlock || 0;
}

export function setLastSyncedBlock(contract, block) {
  const b = bucket(contract, true);
  if (block > (b.lastSyncedBlock || 0)) {
    b.lastSyncedBlock = block;
    save();
  }
}

/**
 * Backfill / verify from CivicIssueNFTMinted events starting at the last synced
 * block (or NFT_DEPLOYMENT_BLOCK). Never throws — returns a summary.
 * @param {object} eth           ethereumService
 * @param {function} findReport  (tokenURI) → report | null
 */
export async function syncFromChain(eth, findReport) {
  try {
    const status = await eth.ensureInit();
    const info = await eth.getContractInfo();
    const contract = info.contractAddress;
    if (!contract || status.blocking?.includes('RPC_UNAVAILABLE') || status.blocking?.includes('CHAIN_MISMATCH')) {
      return { synced: 0, skipped: true };
    }
    const latest = await eth.getLatestBlock();
    if (latest === null) return { synced: 0, skipped: true };
    const deploymentBlock = (await eth.getStatus()).deploymentBlock || 0;
    const from = Math.max(getLastSyncedBlock(contract) + 1, deploymentBlock);
    if (from > latest) return { synced: 0, upToDate: true };

    const events = await eth.getRecentMintEvents({ fromBlock: from, toBlock: latest });
    let synced = 0;
    for (const ev of events) {
      if (getToken(contract, ev.tokenId)) continue;
      const report = findReport ? findReport(ev.tokenURI) : null;
      recordToken(contract, {
        tokenId: ev.tokenId,
        reportId: report?.reportId || null,
        recipient: ev.recipient,
        tokenURI: ev.tokenURI,
        metadataCid: ev.tokenURI?.replace(/^ipfs:\/\//, '') || null,
        imageCid: report?.evidence?.imageCid || null,
        transactionHash: ev.transactionHash,
        blockNumber: ev.blockNumber,
        mintedAt: report?.nft?.mintedAt || null,
        category: report?.category || null,
        severity: report?.severity || null,
        city: report?.city || null,
        confidence: report?.confidence ?? null,
      });
      synced++;
    }
    setLastSyncedBlock(contract, latest);
    return { synced, from, to: latest };
  } catch (e) {
    return { synced: 0, error: e.message };
  }
}

loadNftCache();
