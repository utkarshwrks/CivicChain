/**
 * e2e-sepolia.js — REAL end-to-end check on Ethereum Sepolia.
 *
 *   npm run dev            (backend on :3001 with a funded minter + real keys)
 *   npm run e2e:sepolia    (or E2E_BASE_URL=https://your-backend npm run e2e:sepolia)
 *
 * 1. creates a fresh ethers wallet and logs in through the API (EIP-191)
 * 2. uploads a civic photo from test/fixtures/ (tries the next one if already reported)
 * 3. polls until NFT_MINTED
 * 4. independently checks on-chain ownerOf(tokenId) == wallet and tokenURI == ipfs://metadataCid
 * 5. fetches the metadata from the gateway and checks image == ipfs://imageCid
 * Prints reportId, tokenId, tx hash, Etherscan links, metadata + image gateway links.
 * If the backend or Sepolia is not configured it prints NOT RUN and the reason.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Contract, JsonRpcProvider, Wallet } from 'ethers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const BASE = (process.env.E2E_BASE_URL || `http://localhost:${process.env.PORT || 3001}`).replace(/\/+$/, '');
const GATEWAY = (process.env.PINATA_GATEWAY || 'https://gateway.pinata.cloud/ipfs').replace(/\/+$/, '');
const FIXTURES = ['pothole.png', 'garbage.png', 'flood.png', 'pothole3.png', 'garbage2.png'];

function notRun(reason) {
  console.log(`\nE2E: NOT RUN — ${reason}\n`);
  process.exit(2);
}
function fail(msg) {
  console.error(`\n❌ E2E FAILED — ${msg}\n`);
  process.exit(1);
}
async function json(res) {
  try { return await res.json(); } catch { return {}; }
}

// 0. Preconditions ────────────────────────────────────────────────────────────
let chain;
try {
  chain = await json(await fetch(`${BASE}/api/chain/status`));
} catch {
  notRun(`backend not reachable at ${BASE} — start it with npm run dev`);
}
if (!chain?.ready) notRun(`Sepolia is not ready on the backend: ${(chain?.issues || []).join('; ') || 'unknown'}`);
if (!process.env.SEPOLIA_RPC_URL) notRun('SEPOLIA_RPC_URL is not set for the independent on-chain check');

// 1. Wallet + login ───────────────────────────────────────────────────────────
const wallet = Wallet.createRandom();
console.log(`Citizen wallet: ${wallet.address}`);
const { nonce, message } = await json(await fetch(`${BASE}/api/auth/nonce/${wallet.address}`));
const login = await json(await fetch(`${BASE}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ address: wallet.address, nonce, signature: await wallet.signMessage(message) }),
}));
if (!login.token) fail(`login failed: ${JSON.stringify(login)}`);

// 2. Submit ───────────────────────────────────────────────────────────────────
let result = null;
for (const name of FIXTURES) {
  const file = path.join(ROOT, 'test', 'fixtures', name);
  if (!fs.existsSync(file)) continue;
  const form = new FormData();
  form.append('image', new Blob([fs.readFileSync(file)], { type: 'image/png' }), name);
  form.append('city', 'JABALPUR');
  form.append('address', 'CivicChain e2e check');
  console.log(`Submitting ${name}…`);
  const res = await fetch(`${BASE}/api/report/create`, { method: 'POST', headers: { Authorization: `Bearer ${login.token}` }, body: form });
  const body = await json(res);
  if (body.status === 'DUPLICATE') { console.log(`  already reported (${body.existingReportId}) — trying the next photo`); continue; }
  if (!body.reportId || !['NFT_MINTED', 'NFT_MINT_PENDING', 'NFT_MINT_FAILED'].includes(body.status)) {
    fail(`submission rejected (${res.status} ${body.status}): ${body.error || JSON.stringify(body).slice(0, 300)}`);
  }
  result = body;
  break;
}
if (!result) notRun('every fixture photo was already reported (duplicate detection works) — add a new civic photo to test/fixtures/');

// 3. Poll until minted ────────────────────────────────────────────────────────
let nft = result.nft;
const deadline = Date.now() + 4 * 60_000;
while (nft?.status !== 'NFT_MINTED' && Date.now() < deadline) {
  if (nft?.status === 'NFT_MINT_FAILED') fail(`mint failed: ${nft.errorCode} ${nft.errorMessage || ''}`);
  process.stdout.write(`  ${nft?.status || 'waiting'}${nft?.transactionHash ? ` (tx ${nft.transactionHash})` : ''}…\r`);
  await new Promise((r) => setTimeout(r, 5000));
  nft = (await json(await fetch(`${BASE}/api/report/${result.reportId}/nft`))).nft;
}
if (nft?.status !== 'NFT_MINTED') fail(`not minted within 4 minutes (last status ${nft?.status}, tx ${nft?.transactionHash || 'none'})`);

// 4. Independent on-chain verification ────────────────────────────────────────
const abi = JSON.parse(fs.readFileSync(path.join(ROOT, 'backend', 'abi', 'CivicIssueNFT.json'), 'utf8'));
const provider = new JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
const { chainId } = await provider.getNetwork();
if (chainId !== 11155111n) fail(`independent RPC is on chain ${chainId}, expected 11155111`);
const c = new Contract(nft.contractAddress, abi, provider);
const [owner, uri] = await Promise.all([c.ownerOf(nft.tokenId), c.tokenURI(nft.tokenId)]);
if (owner.toLowerCase() !== wallet.address.toLowerCase()) fail(`ownerOf(${nft.tokenId}) = ${owner}, expected ${wallet.address}`);
if (uri !== `ipfs://${result.evidence.metadataCid}`) fail(`tokenURI = ${uri}, expected ipfs://${result.evidence.metadataCid}`);

// 5. Metadata from the gateway ────────────────────────────────────────────────
const metaUrl = `${GATEWAY}/${result.evidence.metadataCid}`;
let meta = null;
for (let i = 0; i < 6 && !meta; i++) {
  try { const r = await fetch(metaUrl); if (r.ok) meta = await r.json(); } catch { /* gateway warming up */ }
  if (!meta) await new Promise((r) => setTimeout(r, 5000));
}
if (!meta) fail(`could not fetch metadata from ${metaUrl}`);
if (meta.image !== `ipfs://${result.evidence.imageCid}`) fail(`metadata image = ${meta.image}, expected ipfs://${result.evidence.imageCid}`);

console.log('\n✅ E2E PASSED — real Civic Issue NFT on Ethereum Sepolia\n');
const row = (k, v) => console.log(`  ${k.padEnd(18)} ${v}`);
row('Report ID', result.reportId);
row('Token ID', nft.tokenId);
row('Owner', owner);
row('Contract', nft.contractAddress);
row('Tx hash', nft.transactionHash);
row('Etherscan tx', `https://sepolia.etherscan.io/tx/${nft.transactionHash}`);
row('Etherscan NFT', `https://sepolia.etherscan.io/nft/${nft.contractAddress}/${nft.tokenId}`);
row('Metadata', metaUrl);
row('Image', `${GATEWAY}/${result.evidence.imageCid}`);
console.log('');
provider.destroy();
