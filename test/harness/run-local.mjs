/**
 * run-local.mjs — LOCAL REHEARSAL of the whole CivicChain stack (not Sepolia).
 *   node test/harness/run-local.mjs
 * Starts a Hardhat node, deploys CivicIssueNFT, serves fake IPFS files and runs
 * the real backend + built frontend on http://localhost:3101 with Gemini/Pinata
 * swapped for local fakes. Uses a temporary copy of backend/data.
 * Requires: npm run compile and cd frontend && npm run build.
 */
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import crypto from 'crypto';
import { ContractFactory, HDNodeWallet, JsonRpcProvider, Wallet } from 'ethers';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const RPC_PORT = 8545, IPFS_PORT = 8088, APP_PORT = Number(process.env.HARNESS_PORT || 3101);
const MNEMONIC = 'test test test test test test test test test test test junk';
const key0 = HDNodeWallet.fromPhrase(MNEMONIC, undefined, "m/44'/60'/0'/0/0").privateKey;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'civicchain-rehearsal-'));
const dataDir = path.join(tmp, 'data');
const ipfsDir = path.join(tmp, 'ipfs');
fs.mkdirSync(ipfsDir);
fs.cpSync(path.join(ROOT, 'backend', 'data'), dataDir, { recursive: true, filter: (s) => !s.includes('_backup_') });

const children = [];
const stop = () => { for (const c of children) { try { process.kill(-c.pid); } catch { /* gone */ } } process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);

const node = spawn('npx', ['hardhat', 'node', '--port', String(RPC_PORT)], { cwd: ROOT, stdio: 'ignore', detached: true });
children.push(node);
const provider = new JsonRpcProvider(`http://127.0.0.1:${RPC_PORT}`);
for (let i = 0; ; i++) { try { await provider.getBlockNumber(); break; } catch { if (i > 120) throw new Error('hardhat node did not start'); await new Promise((r) => setTimeout(r, 250)); } }

const { abi, bytecode } = JSON.parse(fs.readFileSync(path.join(ROOT, 'artifacts/contracts/CivicIssueNFT.sol/CivicIssueNFT.json'), 'utf8'));
const deployer = new Wallet(key0, provider);
const nft = await new ContractFactory(abi, bytecode, deployer).deploy(deployer.address, deployer.address);
await nft.waitForDeployment();
const contractAddress = await nft.getAddress();
provider.destroy();

http.createServer((req, res) => {
  const cid = path.basename(decodeURIComponent(req.url.split('?')[0]));
  const file = path.join(ipfsDir, cid);
  if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  const buf = fs.readFileSync(file);
  const isJson = buf[0] === 0x7b;
  res.writeHead(200, { 'Content-Type': isJson ? 'application/json' : 'image/png', 'Access-Control-Allow-Origin': '*' });
  res.end(buf);
}).listen(IPFS_PORT);

const nonCivic = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'test/fixtures/floortiles.png'))).digest('hex');
const admin = process.env.HARNESS_ADMIN || '';
const backend = spawn('node', ['--import', './test/harness/register.mjs', 'backend/index.js'], {
  cwd: ROOT, detached: true, stdio: ['ignore', 'inherit', 'inherit'],
  env: {
    ...process.env, NODE_ENV: 'development', PORT: String(APP_PORT),
    CIVICCHAIN_DATA_DIR: dataDir, HARNESS_IPFS_DIR: ipfsDir, HARNESS_NONCIVIC: nonCivic,
    PINATA_GATEWAY: `http://localhost:${IPFS_PORT}/ipfs`, PINATA_JWT: 'harness', GEMINI_API_KEY: 'harness',
    SEPOLIA_RPC_URL: `http://127.0.0.1:${RPC_PORT}`, EXPECTED_CHAIN_ID: '31337', ALLOW_LOCAL_CHAIN: 'true',
    DEPLOYER_PRIVATE_KEY: key0, NFT_CONTRACT_ADDRESS: contractAddress, NFT_DEPLOYMENT_BLOCK: '0',
    NFT_DEPLOYMENT_FILE: path.join(tmp, 'none.json'), MINT_WAIT_MS: '30000',
    JWT_SECRET: crypto.randomBytes(32).toString('hex'), CORS_ORIGINS: `http://localhost:${APP_PORT}`,
    ADMIN_ADDRESSES: admin,
  },
});
children.push(backend);
console.log(`\nLOCAL REHEARSAL ready → http://localhost:${APP_PORT}  (contract ${contractAddress}, chain 31337, data ${dataDir})\n`);
