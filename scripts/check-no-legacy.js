/**
 * check-no-legacy.js — fails (exit 1) with file:line output if any reference to
 * the removed legacy chain remains outside the allowed history files.
 *   npm run check:legacy
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// Built from fragments so this file does not match itself.
const S = ['say', 'man'].join('');
const TERMS = [
  S,
  'REPORT_' + 'CREATE', 'REPORT_' + 'VERIFY', 'REPORT_' + 'START_WORK', 'REPORT_' + 'RESOLVE',
  'CONTRACT_' + 'DEPLOY', 'CONTRACT_' + 'CALL',
  'deployed' + '.json', 'blockchain' + '.service', 'blockchain' + '.config',
  'valid' + 'ators', 'mem' + 'pool', 'gasPrice' + ': 1',
];
const ALLOWED = new Set(['CHANGELOG.md', 'docs/MIGRATION_AUDIT.md', 'scripts/check-no-legacy.js']);
const SKIP = [/^node_modules\//, /\/node_modules\//, /^\.git\//, /^artifacts\//, /^cache\//, /(^|\/)dist\//,
  /^backend\/data\/_backup_/, /^android\/(app\/build|\.gradle|build)\//, /package-lock\.json$/];
const BINARY = /\.(png|jpe?g|webp|gif|ico|apk|jar|keystore|jks|zip|pdf|woff2?|ttf)$/i;

const files = execSync('git ls-files --cached --others --exclude-standard', { cwd: ROOT, encoding: 'utf8' })
  .split('\n').filter(Boolean)
  .filter((f) => !ALLOWED.has(f) && !SKIP.some((re) => re.test(f)) && !BINARY.test(f))
  .filter((f) => fs.existsSync(path.join(ROOT, f)));

const re = new RegExp(TERMS.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i');
const hits = [];
for (const f of files) {
  const lines = fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n');
  lines.forEach((line, i) => { if (re.test(line)) hits.push(`${f}:${i + 1}: ${line.trim().slice(0, 140)}`); });
}

if (hits.length) {
  console.error(`✖ ${hits.length} legacy reference(s) found:\n${hits.join('\n')}`);
  process.exit(1);
}
console.log(`✔ check:legacy — no legacy chain references in ${files.length} files (history allowed only in CHANGELOG.md and docs/MIGRATION_AUDIT.md)`);
