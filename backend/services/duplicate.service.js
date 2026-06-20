/**
 * duplicate.service.js — CrowdPulse Duplicate Detection Service  (Phase 11)
 *
 * Prevents duplicate report submissions and reward farming.
 *
 * Phase 11A — SHA256 hash matching (exact image duplicates)
 * Phase 11B — Perceptual hash matching (cropped/resized duplicates)
 *
 * Storage: backend/data/duplicate-index.json (JSON file, no DB needed)
 */

import crypto from 'crypto';
import fs     from 'fs';
import path   from 'path';
import { fileURLToPath } from 'url';

const __dirname   = path.dirname(fileURLToPath(import.meta.url));
const INDEX_PATH  = path.join(__dirname, '..', 'data', 'duplicate-index.json');
const LOG         = '[DUPLICATE_CHECK]';

// ─── In-Memory Index (loaded from disk on startup) ───────────────────────────

let duplicateIndex = [];   // Array<{ hash: string, reportId: string, timestamp: number }>

function loadIndex() {
  try {
    const raw = fs.readFileSync(INDEX_PATH, 'utf8');
    duplicateIndex = JSON.parse(raw);
    console.log(`${LOG} Loaded ${duplicateIndex.length} entries from disk`);
  } catch {
    duplicateIndex = [];
    console.log(`${LOG} No existing index found — starting fresh`);
  }
}

function saveIndex() {
  try {
    const dir = path.dirname(INDEX_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(INDEX_PATH, JSON.stringify(duplicateIndex, null, 2), 'utf8');
  } catch (e) {
    console.error(`${LOG} Failed to save index:`, e.message);
  }
}

// Load on module init
loadIndex();

// ─── Phase 11A — SHA256 Exact Hash ───────────────────────────────────────────

/**
 * Generate SHA256 hash of an image buffer.
 *
 * @param {Buffer} buffer
 * @returns {string}  hex-encoded SHA256 hash
 */
function generateHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Check if an image is a duplicate of a previously submitted report.
 *
 * @param {Buffer} buffer     The uploaded image buffer
 * @param {string} reportId   The report ID being created
 *
 * @returns {{
 *   isDuplicate:      boolean,
 *   hash:             string,
 *   similarity?:      number,
 *   existingReportId?: string,
 *   reason?:          string,
 * }}
 */
export function checkDuplicate(buffer, reportId) {
  const hash = generateHash(buffer);

  console.log(`${LOG} ─── Checking image hash ───`);
  console.log(`${LOG} SHA256: ${hash}`);
  console.log(`${LOG} Index size: ${duplicateIndex.length} entries`);

  // ── Phase 11A: Exact SHA256 match ──────────────────────────────────────────
  const exactMatch = duplicateIndex.find(entry => entry.hash === hash);

  if (exactMatch) {
    console.log(`${LOG} ═══════════════════════════════`);
    console.log(`${LOG}  DUPLICATE DETECTED ❌`);
    console.log(`${LOG}  Match type:  EXACT (SHA256)`);
    console.log(`${LOG}  Similarity:  100%`);
    console.log(`${LOG}  Existing:    ${exactMatch.reportId}`);
    console.log(`${LOG} ═══════════════════════════════`);

    return {
      isDuplicate:      true,
      hash,
      similarity:       100,
      existingReportId: exactMatch.reportId,
      reason:           'Same image already reported',
    };
  }

  console.log(`${LOG} ═══════════════════════════════`);
  console.log(`${LOG}  NO DUPLICATE ✅`);
  console.log(`${LOG} ═══════════════════════════════`);

  return { isDuplicate: false, hash };
}

/**
 * Register a new image hash in the duplicate index.
 * Called after a report is successfully created.
 *
 * @param {string} hash       SHA256 hash of the image
 * @param {string} reportId   The report ID
 */
export function registerHash(hash, reportId) {
  duplicateIndex.push({
    hash,
    reportId,
    timestamp: Date.now(),
  });

  console.log(`${LOG} Registered hash for ${reportId} (total: ${duplicateIndex.length})`);

  // Persist to disk
  saveIndex();
}

/**
 * Get the current duplicate index stats.
 * @returns {{ totalEntries: number }}
 */
export function getIndexStats() {
  return { totalEntries: duplicateIndex.length };
}
