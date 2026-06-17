/**
 * report.service.js — CrowdPulse Unified Report Processing Service
 *
 * Phase 7:  processReport   — AI + IPFS in parallel
 * Phase 8:  createFullReport — AI + IPFS + Blockchain (full pipeline)
 * Phase 9:  Fraud gate       — AI → Fraud Check → (IPFS + Blockchain) or Reject
 * Phase 10: Rewards + Reputation after blockchain
 * Phase 11: Duplicate detection before IPFS
 */

import { analyzeImage }  from './ai.service.js';
import { uploadToIPFS }  from './ipfs.service.js';
import { createReport as createBlockchainReport } from './blockchain.service.js';
import { calculateFraudScore }              from './fraud.service.js';
import { checkDuplicate, registerHash }     from './duplicate.service.js';
import { awardForReport }                   from './reward.service.js';
import { increaseForReport }                from './reputation.service.js';

// ─── Phase 7 — AI + IPFS ─────────────────────────────────────────────────────

/**
 * Process a report image: run Gemini Vision + pin to IPFS in parallel.
 *
 * @param {Buffer} buffer
 * @param {string} mimeType
 * @param {string} filename
 * @param {object} [meta]  { reporter, location }
 */
export async function processReport(buffer, mimeType, filename, meta = {}) {
  const [aiResult, ipfsResult] = await Promise.allSettled([
    analyzeImage(buffer, mimeType),
    uploadToIPFS(buffer, mimeType, filename, {
      source:   'CrowdPulse-report',
      reporter: meta.reporter || 'unknown',
      location: meta.location || 'unknown',
    }),
  ]);

  const analysis = aiResult.status === 'fulfilled'
    ? aiResult.value
    : {
        isCivicIssue: false,
        category:     'OTHER',
        severity:     'LOW',
        confidence:   0,
        reason:       `AI analysis failed: ${aiResult.reason?.message || 'unknown error'}`,
      };

  const evidence = ipfsResult.status === 'fulfilled' ? ipfsResult.value : null;

  const errors = {
    ai:   aiResult.status   === 'rejected' ? (aiResult.reason?.message   || 'AI error')   : null,
    ipfs: ipfsResult.status === 'rejected' ? (ipfsResult.reason?.message || 'IPFS error') : null,
  };

  if (!evidence) {
    const err = new Error(errors.ipfs || 'IPFS upload failed');
    err.analysis = analysis;
    throw err;
  }

  return { analysis, evidence, errors };
}

// ─── Phase 8–11 — AI → Fraud → Duplicate → IPFS → Blockchain → Rewards ──────

/**
 * Full pipeline:
 *
 *   1. Gemini Vision analysis
 *   2. Fraud detection (Phase 9)      — blocks non-civic images
 *   3. Duplicate detection (Phase 11) — blocks re-submitted images
 *   4. IPFS upload                    — only if checks pass
 *   5. Blockchain tx                  — only if checks pass
 *   6. Reward + Reputation (Phase 10) — after blockchain
 *
 * @param {Buffer} buffer
 * @param {string} mimeType
 * @param {string} filename
 * @param {object} [meta]  { reporter, location, description }
 *
 * @returns {Promise<{
 *   reportId:   string,
 *   analysis:   object,
 *   fraud:      object,
 *   evidence?:  object,
 *   blockchain?: object,
 *   blocked?:   boolean,
 *   duplicate?: boolean,
 * }>}
 */
export async function createFullReport(buffer, mimeType, filename, meta = {}) {
  const reportId = `RP-${Date.now()}`;

  // ── Step 1: AI Analysis ────────────────────────────────────────────────────
  let analysis;
  try {
    analysis = await analyzeImage(buffer, mimeType);
  } catch (e) {
    analysis = {
      isCivicIssue: false,
      category:     'OTHER',
      severity:     'LOW',
      confidence:   0,
      reason:       `AI failed: ${e.message || 'unknown'}`,
    };
  }

  // ── Step 2: Fraud Detection (Phase 9) ──────────────────────────────────────
  const fraud = calculateFraudScore(analysis);

  if (!fraud.allowed) {
    // BLOCKED — do NOT upload to IPFS, do NOT send to blockchain
    return {
      success:    false,
      reportId,
      blocked:    true,
      fraudScore: fraud.fraudScore,
      riskLevel:  fraud.riskLevel,
      reason:     fraud.reason,
      analysis,
      fraud,
    };
  }

  // ── Step 3: Duplicate Detection (Phase 11) ─────────────────────────────────
  const dupCheck = checkDuplicate(buffer, reportId);

  if (dupCheck.isDuplicate) {
    // DUPLICATE — do NOT upload to IPFS, do NOT send to blockchain, do NOT award rewards
    return {
      success:         false,
      reportId,
      duplicate:       true,
      similarity:      dupCheck.similarity,
      existingReportId: dupCheck.existingReportId,
      reason:          dupCheck.reason,
      analysis,
      fraud,
    };
  }

  // ── Step 4: IPFS Upload (only if all checks passed) ────────────────────────
  let evidence;
  try {
    evidence = await uploadToIPFS(buffer, mimeType, filename, {
      source:   'CrowdPulse-report',
      reportId,
      reporter: meta.reporter || 'unknown',
      location: meta.location || 'unknown',
    });
  } catch (e) {
    const err = new Error(`IPFS upload failed: ${e.message || 'unknown'}`);
    err.analysis = analysis;
    err.fraud    = fraud;
    throw err;
  }

  // ── Step 5: Blockchain Transaction ─────────────────────────────────────────
  const blockchain = await createBlockchainReport({
    reportId,
    category:    analysis.category,
    severity:    analysis.severity,
    confidence:  analysis.confidence,
    cid:         evidence.cid,
    description: meta.description
      || analysis.reason
      || `AI-detected civic issue: ${analysis.category}`,
    location:    meta.location || 'Unknown',
  });

  // ── Step 5.5: Register hash in duplicate index (Phase 11) ──────────────────
  registerHash(dupCheck.hash, reportId);

  // ── Step 6: Reward + Reputation (Phase 10) ──────────────────────────────────
  let rewards = null;
  let reputation = null;

  try {
    rewards = await awardForReport(blockchain.sender, analysis);
    console.log('[REWARD_AWARDED] Points earned:', rewards.earned, 'Reasons:', rewards.reason);
  } catch (e) {
    console.error('[REWARD_AWARDED] Failed:', e.message);
    rewards = { earned: 0, reason: [] };
  }

  try {
    reputation = await increaseForReport(blockchain.sender, analysis);
    console.log('[REPUTATION_UPDATED] Reputation earned:', reputation.earned);
  } catch (e) {
    console.error('[REPUTATION_UPDATED] Failed:', e.message);
    reputation = { earned: 0 };
  }

  return {
    reportId,
    analysis,
    fraud,
    evidence,
    blockchain,
    rewards,
    reputation,
  };
}
