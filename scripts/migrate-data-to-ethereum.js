/**
 * migrate-data-to-ethereum.js — convert backend/data to the Ethereum identity model.
 *
 *   npm run migrate:data                 # migrate (backup first)
 *   npm run migrate:data -- --dry-run    # print the plan, change nothing
 *   npm run migrate:data -- --clean      # fresh demo: empty reports/workflow/assignments/duplicates
 *
 * Always backs up backend/data to backend/data/_backup_pre_sepolia_<timestamp>/
 * before writing (never deletes a backup). Idempotent: a second run changes nothing.
 *
 * Default behaviour:
 *   roles.json / user-departments.json  keep only valid 0x keys (lowercased),
 *                                        list dropped legacy keys, re-seed admins
 *   report-cache.json                    keep reports, strip legacy chain fields,
 *                                        legacy: true, nft.status NOT_ELIGIBLE_LEGACY
 *   workflow-status / assignments / duplicate-index  kept (old image hashes still
 *                                        block re-submission)
 */
import fs   from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { Wallet, isAddress } from 'ethers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_DATA_DIR = path.join(__dirname, '..', 'backend', 'data');

const LEGACY_REPORT_FIELDS = ['txId', 'blockIndex', 'blockNumber', 'blockchain', 'txHash', 'PHASE_8_STATUS'];
const CLEAN_FILES = {
  'report-cache.json':    { reports: [] },
  'workflow-status.json': {},
  'assignments.json':     {},
  'duplicate-index.json': [],
  'nft-cache.json':       {},
};

const isEthAddress = (a) => typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a) && isAddress(a.toLowerCase());

function readJson(file, fallback) {
  try { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback; }
  catch { return fallback; }
}

function stable(v) { return JSON.stringify(v, null, 2); }

function adminAddresses(env) {
  const list = (env.ADMIN_ADDRESSES || '').split(',').map((a) => a.trim()).filter(isEthAddress).map((a) => a.toLowerCase());
  if (list.length) return list;
  const pk = (env.DEPLOYER_PRIVATE_KEY || '').trim();
  if (!pk) return [];
  try { return [new Wallet(pk.startsWith('0x') ? pk : `0x${pk}`).address.toLowerCase()]; } catch { return []; }
}

function filterAddressMap(map) {
  const kept = {};
  const dropped = [];
  for (const [k, v] of Object.entries(map || {})) {
    if (isEthAddress(k)) kept[k.toLowerCase()] = v;
    else dropped.push(k);
  }
  return { kept, dropped };
}

function migrateReport(r) {
  if (!r || typeof r !== 'object') return r;
  // Reports created by the Sepolia pipeline carry an nft object that is not legacy.
  if (r.nft && r.nft.status && r.nft.status !== 'NOT_ELIGIBLE_LEGACY' && !r.legacy) return r;
  const out = { ...r };
  for (const f of LEGACY_REPORT_FIELDS) delete out[f];
  out.reportId = out.reportId || out.id;
  out.id = out.id || out.reportId;
  out.legacy = true;
  out.nft = { status: 'NOT_ELIGIBLE_LEGACY' };
  return out;
}

/**
 * Plan (and optionally apply) the migration.
 * @returns {{ changes: Array<{file, before, after}>, dropped: object, backupDir: string|null, changed: boolean }}
 */
export function migrateData({ dataDir = DEFAULT_DATA_DIR, dryRun = false, clean = false, env = process.env, now = Date.now() } = {}) {
  const plan = {};
  const dropped = {};

  // roles.json
  const roles = readJson(path.join(dataDir, 'roles.json'), {});
  const r = filterAddressMap(roles);
  dropped['roles.json'] = r.dropped;
  for (const a of adminAddresses(env)) r.kept[a] = 'ADMIN';
  plan['roles.json'] = r.kept;

  // user-departments.json
  const depts = readJson(path.join(dataDir, 'user-departments.json'), {});
  const d = filterAddressMap(depts);
  dropped['user-departments.json'] = d.dropped;
  plan['user-departments.json'] = d.kept;

  if (clean) {
    Object.assign(plan, JSON.parse(JSON.stringify(CLEAN_FILES)));
  } else {
    const cache = readJson(path.join(dataDir, 'report-cache.json'), { reports: [] });
    const reports = (cache.reports || []).map(migrateReport);
    const nextCache = { ...cache, reports };
    delete nextCache.lastBlock;
    plan['report-cache.json'] = nextCache;
  }

  // Compute the diff against what is on disk.
  const changes = [];
  for (const [file, next] of Object.entries(plan)) {
    const full = path.join(dataDir, file);
    const currentRaw = fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : null;
    let current = null;
    try { current = currentRaw ? JSON.parse(currentRaw) : null; } catch { current = null; }
    if (stable(current) !== stable(next)) changes.push({ file, before: current, after: next });
  }

  const result = { changes, dropped, backupDir: null, changed: changes.length > 0, dryRun, clean };
  if (dryRun || changes.length === 0) return result;

  // Backup first — never deleted.
  const backupDir = path.join(dataDir, `_backup_pre_sepolia_${now}`);
  fs.mkdirSync(backupDir, { recursive: true });
  for (const f of fs.readdirSync(dataDir)) {
    const src = path.join(dataDir, f);
    if (fs.statSync(src).isFile()) fs.copyFileSync(src, path.join(backupDir, f));
  }
  result.backupDir = backupDir;

  for (const { file, after } of changes) {
    const full = path.join(dataDir, file);
    const tmp = `${full}.tmp`;
    fs.writeFileSync(tmp, stable(after), 'utf8');
    fs.renameSync(tmp, full);
  }
  return result;
}

function summarise(res) {
  const lines = [];
  lines.push(res.dryRun ? '— DRY RUN (nothing written) —' : '— Migration —');
  if (res.clean) lines.push('Mode: --clean (fresh demo data; cities.json kept)');
  for (const [file, keys] of Object.entries(res.dropped)) {
    if (keys.length) lines.push(`${file}: dropping ${keys.length} legacy (non-0x) key(s): ${keys.map((k) => k.slice(0, 10) + '…').join(', ')}`);
  }
  if (!res.changed) lines.push('Nothing to change — data is already migrated.');
  for (const c of res.changes) {
    const count = (v) => (Array.isArray(v) ? v.length : Array.isArray(v?.reports) ? v.reports.length : v ? Object.keys(v).length : 0);
    lines.push(`${c.file}: ${count(c.before)} → ${count(c.after)} entries${c.file === 'report-cache.json' && !res.clean ? ' (legacy reports flagged NOT_ELIGIBLE_LEGACY)' : ''}`);
  }
  if (res.backupDir) lines.push(`Backup: ${path.relative(process.cwd(), res.backupDir)}`);
  return lines.join('\n');
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) {
  await import('dotenv/config');
  const args = new Set(process.argv.slice(2));
  const res = migrateData({ dryRun: args.has('--dry-run'), clean: args.has('--clean') });
  console.log(summarise(res));
}
