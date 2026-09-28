/**
 * check-secrets.js — fails if a secret could be committed.
 *   • no .env / .env.* (except .env.example) is tracked by git
 *   • no tracked text file contains a 64-hex value that looks like a private key
 *     (0x-prefixed or bare). Lines that label the value as a hash (hash, sha256,
 *     tx, transaction) are allowed — image hashes and tx hashes are public.
 *   • .env.example values are empty placeholders
 *   npm run check:secrets
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const tracked = execSync('git ls-files --cached --others --exclude-standard', { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
const problems = [];

for (const f of tracked) {
  if (/(^|\/)\.env(\..+)?$/.test(f) && !f.endsWith('.env.example')) problems.push(`${f}: environment file must not be committed`);
}

const HEX64 = /(^|[^0-9a-fA-F])(0x)?[0-9a-fA-F]{64}([^0-9a-fA-F]|$)/;
const LABEL = /hash|sha|tx|transaction|digest|cid|topic/i;
const SKIP = /package-lock\.json$|\.(png|jpe?g|webp|gif|ico|apk|jar|keystore|jks|zip|pdf|woff2?|ttf)$|(^|\/)(node_modules|dist|artifacts|cache)\//i;
for (const f of tracked) {
  if (SKIP.test(f) || !fs.existsSync(path.join(ROOT, f))) continue;
  const lines = fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (HEX64.test(line) && !LABEL.test(line)) problems.push(`${f}:${i + 1}: 64-hex value that looks like a private key`);
  });
}

const example = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8');
for (const name of ['DEPLOYER_PRIVATE_KEY', 'PINATA_JWT', 'GEMINI_API_KEY', 'JWT_SECRET', 'SEPOLIA_RPC_URL', 'ETHERSCAN_API_KEY']) {
  const m = example.match(new RegExp(`^${name}=(.*)$`, 'm'));
  if (m && m[1].trim()) problems.push(`.env.example: ${name} must be an empty placeholder`);
}

if (problems.length) {
  console.error(`✖ check:secrets — ${problems.length} problem(s):\n${problems.join('\n')}`);
  process.exit(1);
}
console.log(`✔ check:secrets — no committed env files or key-like values in ${tracked.length} files`);
