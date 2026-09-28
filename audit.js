/**
 * audit.js — live RBAC / wallet-auth audit against a running backend.
 *
 *   node audit.js            (backend on http://localhost:3001, or AUDIT_BASE_URL)
 *
 * Admin key: AUDIT_ADMIN_PRIVATE_KEY, else demo-admin-key.json, else — only when
 * ADMIN_ADDRESSES is empty — DEPLOYER_PRIVATE_KEY (the deployer fallback rule).
 * No key is ever hard-coded or printed.
 */
import 'dotenv/config';
import fs from 'fs';
import { Wallet } from 'ethers';

const BASE = process.env.AUDIT_BASE_URL || 'http://localhost:3001';
let passed = 0;
let failed = 0;

const pass = (label, detail = '') => { passed++; console.log(`✅ PASS  ${label}${detail ? ' — ' + detail : ''}`); };
const fail = (label, detail = '') => { failed++; console.log(`❌ FAIL  ${label}${detail ? ' — ' + detail : ''}`); };
const section = (s) => console.log(`\n${'─'.repeat(55)}\n  ${s}\n${'─'.repeat(55)}`);

function adminWallet() {
  if (process.env.AUDIT_ADMIN_PRIVATE_KEY) return new Wallet(process.env.AUDIT_ADMIN_PRIVATE_KEY);
  try {
    const k = JSON.parse(fs.readFileSync('demo-admin-key.json', 'utf8'));
    if (k.privateKey) return new Wallet(k.privateKey);
  } catch { /* none */ }
  if (!process.env.ADMIN_ADDRESSES && process.env.DEPLOYER_PRIVATE_KEY) {
    const pk = process.env.DEPLOYER_PRIVATE_KEY.trim();
    return new Wallet(pk.startsWith('0x') ? pk : `0x${pk}`);
  }
  return null;
}

async function login(wallet) {
  const n = await fetch(`${BASE}/api/auth/nonce/${wallet.address}`).then((r) => r.json());
  const signature = await wallet.signMessage(`CivicChain:${wallet.address}:${n.nonce}`);
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: wallet.address, nonce: n.nonce, signature }),
  });
  return { res, body: await res.json(), nonce: n.nonce, signature };
}

const authed = (path, token, method = 'GET', body) => fetch(`${BASE}${path}`, {
  method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: body ? JSON.stringify(body) : undefined,
});

section('1. Wallet login (EIP-191)');
const citizen = Wallet.createRandom();
const c = await login(citizen);
if (c.res.status === 200 && c.body.token) pass('citizen login issues JWT', c.body.address);
else fail('citizen login', JSON.stringify(c.body));
if (c.body.role === 'CITIZEN') pass('new wallet defaults to CITIZEN');
else fail('default role', c.body.role);

const replay = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ address: citizen.address, nonce: c.nonce, signature: c.signature }),
});
if (replay.status === 401) pass('reused nonce rejected (401)');
else fail('reused nonce', String(replay.status));

const bad = await fetch(`${BASE}/api/auth/nonce/not-an-address`);
const badBody = await bad.json();
if (bad.status === 400 && badBody.error === 'INVALID_WALLET') pass('malformed address → 400 INVALID_WALLET');
else fail('malformed address', `${bad.status} ${JSON.stringify(badBody)}`);

section('2. RBAC');
const forbidden = await authed('/api/rbac/roles', c.body.token);
if (forbidden.status === 403) pass('CITIZEN cannot list roles (403)');
else fail('citizen /api/rbac/roles', String(forbidden.status));

const admin = adminWallet();
if (!admin) {
  console.log('ℹ️  No admin key available (set AUDIT_ADMIN_PRIVATE_KEY) — admin checks NOT RUN');
} else {
  const a = await login(admin);
  if (a.body.role === 'ADMIN') pass('ADMIN_ADDRESSES / deployer rule → ADMIN', a.body.address);
  else fail('admin role', JSON.stringify(a.body));
  const roles = await authed('/api/rbac/roles', a.body.token);
  if (roles.status === 200) pass('ADMIN can list roles', `${(await roles.json()).count} assignments`);
  else fail('admin /api/rbac/roles', String(roles.status));
  const assign = await authed('/api/rbac/assign', a.body.token, 'POST', { address: 'abc', role: 'AUTHORITY' });
  if (assign.status === 400) pass('assigning a role to a malformed address → 400');
  else fail('assign malformed', String(assign.status));
}

section('3. Workflow guards');
const wf = await authed('/api/workflow/CC-DOES-NOT-EXIST/verify', c.body.token, 'POST', {});
if (wf.status === 403) pass('CITIZEN cannot verify reports (403)');
else fail('citizen verify', String(wf.status));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
