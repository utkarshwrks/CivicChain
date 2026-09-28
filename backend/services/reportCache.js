/**
 * reportCache.js — CivicChain primary report store (backend/data/report-cache.json)
 *
 * Every report written by the pipeline lives here, including its evidence and
 * nft objects. The live workflow status is merged in from workflow.service at
 * read time, so the stored report never needs rewriting when status changes.
 */
import { dataPath, readJson, writeJsonAtomic } from '../config/paths.js';
import { getStatusEntry } from './workflow.service.js';

const CACHE_PATH = () => dataPath('report-cache.json');

let cache = { reports: [] };

export function loadCache() {
  const parsed = readJson(CACHE_PATH(), { reports: [] });
  cache = { reports: Array.isArray(parsed?.reports) ? parsed.reports : [], updatedAt: parsed?.updatedAt || 0 };
  return cache;
}

function saveCache() {
  cache.updatedAt = Date.now();
  try {
    writeJsonAtomic(CACHE_PATH(), cache);
  } catch (e) {
    console.error('[reportCache] Failed to save cache to disk:', e.message);
  }
}

const idOf = (r) => r?.reportId || r?.id;

function withStatus(r) {
  const entry = getStatusEntry(idOf(r));
  return { ...r, id: r.id || r.reportId, reportId: idOf(r), status: entry?.status || r.status || 'OPEN' };
}

/** All reports (newest first) with the live workflow status merged in. */
export function getReports() {
  return [...cache.reports]
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .map(withStatus);
}

export function getReportById(id) {
  if (!id) return null;
  const r = cache.reports.find((x) => idOf(x) === id || x.id === id || x.txId === id);
  return r ? withStatus(r) : null;
}

export function reportExists(id) {
  return cache.reports.some((x) => idOf(x) === id || x.id === id);
}

/** Insert a new report. Throws if the id already exists. */
export function addReport(report) {
  const id = idOf(report);
  if (!id) throw new Error('report id is required');
  if (reportExists(id)) throw new Error(`report ${id} already exists`);
  cache.reports.push({ ...report, id, reportId: id });
  saveCache();
  return getReportById(id);
}

/**
 * Update a stored report. `patch` is an object merged shallowly, or a function
 * (report) → patch. Returns the updated report (with status) or null.
 */
export function updateReport(id, patch) {
  const idx = cache.reports.findIndex((x) => idOf(x) === id || x.id === id);
  if (idx === -1) return null;
  const current = cache.reports[idx];
  const delta = typeof patch === 'function' ? patch(current) : patch;
  cache.reports[idx] = { ...current, ...delta, updatedAt: Date.now() };
  saveCache();
  return withStatus(cache.reports[idx]);
}

export function getReportsForAddress(address) {
  if (!address) return [];
  const normalized = String(address).toLowerCase();
  return getReports().filter((r) => r.reporter && String(r.reporter).toLowerCase() === normalized);
}

// Initialise on load
loadCache();
