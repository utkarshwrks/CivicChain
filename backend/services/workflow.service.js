/**
 * workflow.service.js — CivicChain governance workflow (off-chain)
 *
 *   OPEN → VERIFIED (AUTHORITY) → IN_PROGRESS (MUNICIPAL_TEAM) → RESOLVED (MUNICIPAL_TEAM)
 *
 * Status and notes are persisted to backend/data/workflow-status.json.
 * The Civic Issue NFT is never touched: it certifies the validated submission,
 * not the resolution, and its metadata keeps "Status at Mint: OPEN".
 *
 * Status rewards (off-chain, informational in the response; the running totals
 * are recomputed from reports by reward/reputation services):
 *   VERIFIED  → +5 points, +5 reputation
 *   RESOLVED  → +20 points, +15 reputation
 */

import { dataPath, readJson, writeJsonAtomic } from '../config/paths.js';

const LOG = '[WORKFLOW]';
const STATUS_PATH = () => dataPath('workflow-status.json');

let statusStore = {};   // reportId → { status, reporter, notes: [], updatedAt }

function loadStore() {
  statusStore = readJson(STATUS_PATH(), {}) || {};
}

function saveStore() {
  try {
    writeJsonAtomic(STATUS_PATH(), statusStore);
  } catch (e) {
    console.error(`${LOG} Failed to save store:`, e.message);
  }
}

loadStore();

export const VALID_TRANSITIONS = {
  OPEN:        ['VERIFIED'],
  VERIFIED:    ['IN_PROGRESS'],
  IN_PROGRESS: ['RESOLVED'],
  RESOLVED:    [],   // terminal state
};

const STATUS_REWARDS = {
  VERIFIED: { points: 5,  reputation: 5  },
  RESOLVED: { points: 20, reputation: 15 },
};

export const MAX_NOTE_LENGTH = 500;

/** Raw status entry for a report, or null. */
export function getStatusEntry(reportId) {
  return reportId ? statusStore[reportId] || null : null;
}

/** Current status of a report (OPEN if never transitioned). */
export function getReportStatus(reportId) {
  return statusStore[reportId]?.status || 'OPEN';
}

/** Register a new report as OPEN (idempotent). */
export function registerReport(reportId, reporter) {
  if (!statusStore[reportId]) {
    statusStore[reportId] = { status: 'OPEN', reporter: reporter || null, notes: [], updatedAt: Date.now() };
    saveStore();
  }
}

/**
 * Transition a report to a new status.
 * @returns {{ success, reportId, previousStatus, newStatus, note, rewards, reputation, error? }}
 */
export async function transitionStatus(reportId, newStatus, note = '', actor = null) {
  const currentStatus = getReportStatus(reportId);
  const allowed = VALID_TRANSITIONS[currentStatus] || [];

  if (!allowed.includes(newStatus)) {
    return {
      success: false,
      error:   `Invalid status transition: ${currentStatus} → ${newStatus}. Allowed: ${allowed.join(', ') || 'none'}`,
      reportId,
      previousStatus: currentStatus,
      newStatus:      currentStatus,
    };
  }

  const cleanNote = typeof note === 'string' ? note.trim().slice(0, MAX_NOTE_LENGTH) : '';
  if (!statusStore[reportId]) {
    statusStore[reportId] = { status: 'OPEN', reporter: null, notes: [], updatedAt: Date.now() };
  }
  const entry = statusStore[reportId];
  entry.status    = newStatus;
  entry.updatedAt = Date.now();
  if (!Array.isArray(entry.notes)) entry.notes = [];
  if (cleanNote) entry.notes.push({ note: cleanNote, status: newStatus, timestamp: Date.now(), by: actor || null });
  saveStore();

  console.log(`${LOG} ${reportId}: ${currentStatus} → ${newStatus}`);

  const reward = STATUS_REWARDS[newStatus];
  return {
    success: true,
    reportId,
    previousStatus: currentStatus,
    newStatus,
    note:       cleanNote || null,
    rewards:    reward ? { earned: reward.points, reason: `STATUS_${newStatus}` } : null,
    reputation: reward ? { earned: reward.reputation } : null,
  };
}

/** Tests: reload the store from disk. */
export function reloadWorkflow() {
  loadStore();
}
