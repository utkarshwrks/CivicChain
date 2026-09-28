/**
 * paths.js — location of the JSON data stores.
 *
 * Defaults to backend/data. CIVICCHAIN_DATA_DIR overrides it (tests use a
 * temporary directory so they never touch the real data files).
 */
import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_DIR = path.join(__dirname, '..', 'data');

/**
 * A fresh CIVICCHAIN_DATA_DIR (e.g. an empty persistent disk on first deploy)
 * is seeded once with the default data files — cities.json is required.
 * Existing files are never overwritten. Skipped in tests.
 */
function seedDataDir() {
  const dir = process.env.CIVICCHAIN_DATA_DIR;
  if (!dir || process.env.NODE_ENV === 'test' || path.resolve(dir) === DEFAULT_DATA_DIR) return;
  try {
    fs.mkdirSync(dir, { recursive: true });
    for (const f of fs.readdirSync(DEFAULT_DATA_DIR)) {
      const src = path.join(DEFAULT_DATA_DIR, f);
      const dst = path.join(dir, f);
      if (f.endsWith('.json') && fs.statSync(src).isFile() && !fs.existsSync(dst)) fs.copyFileSync(src, dst);
    }
  } catch (e) {
    console.error('[data] Could not seed CIVICCHAIN_DATA_DIR:', e.message);
  }
}
seedDataDir();

export function dataDir() {
  return process.env.CIVICCHAIN_DATA_DIR || DEFAULT_DATA_DIR;
}

export function dataPath(file) {
  return path.join(dataDir(), file);
}

/** Atomic JSON write: temp file + rename, so a crash never leaves half a file. */
export function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

export function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.warn(`[data] Failed to read ${path.basename(file)}:`, e.message);
    return fallback;
  }
}
