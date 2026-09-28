/**
 * ethereum.config.js — Ethereum Sepolia configuration for the backend.
 *
 * Sources (env wins over the committed deployment record):
 *   SEPOLIA_RPC_URL        JSON-RPC endpoint (may contain an API key — never exposed)
 *   DEPLOYER_PRIVATE_KEY   minter key (never exposed)
 *   NFT_CONTRACT_ADDRESS   fallback: deployments/sepolia.json → contractAddress
 *   NFT_DEPLOYMENT_BLOCK   fallback: deployments/sepolia.json → blockNumber
 *   EXPECTED_CHAIN_ID      default 11155111
 *   MINT_CONFIRMATIONS     default 1
 *   MINT_TIMEOUT_MS        default 180000
 *   MINT_WAIT_MS           default 90000
 *   MAX_MINT_ATTEMPTS      default 5
 *   LOG_CHUNK_SIZE         default 1000
 *   EXPLORER_BASE_URL      default https://sepolia.etherscan.io
 *
 * loadEthereumConfig() never throws: invalid or missing values are reported
 * in `issues` and `configured` is false, so the server keeps running.
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isValidAddress, toChecksum } from '../utils/address.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.join(__dirname, '..', '..');

export const SEPOLIA_CHAIN_ID = 11155111;
export const LOCAL_CHAIN_ID   = 31337;
export const MAINNET_CHAIN_ID = 1;

function intEnv(name, fallback, min = 0) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= min ? n : fallback;
}

export function readDeployment() {
  const file = process.env.NFT_DEPLOYMENT_FILE || path.join(ROOT, 'deployments', 'sepolia.json');
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

export function readAbi() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'abi', 'CivicIssueNFT.json'), 'utf8'));
  } catch {
    return null;
  }
}

function normaliseKey(pk) {
  const k = (pk || '').trim();
  if (!k) return null;
  const hex = k.startsWith('0x') ? k : `0x${k}`;
  return /^0x[0-9a-fA-F]{64}$/.test(hex) ? hex : undefined; // undefined = present but invalid
}

export function loadEthereumConfig() {
  const issues     = [];
  const deployment = readDeployment();

  const rpcUrl = (process.env.SEPOLIA_RPC_URL || '').trim() || null;
  if (!rpcUrl) issues.push('SEPOLIA_RPC_URL is not set');
  else if (!/^https?:\/\//i.test(rpcUrl)) issues.push('SEPOLIA_RPC_URL must be an http(s) URL');

  const privateKey = normaliseKey(process.env.DEPLOYER_PRIVATE_KEY);
  if (privateKey === null) issues.push('DEPLOYER_PRIVATE_KEY is not set');
  if (privateKey === undefined) issues.push('DEPLOYER_PRIVATE_KEY must be 0x + 64 hex characters');

  const rawAddress = (process.env.NFT_CONTRACT_ADDRESS || '').trim() || deployment?.contractAddress || '';
  let contractAddress = null;
  if (!rawAddress) issues.push('NFT_CONTRACT_ADDRESS is not set and deployments/sepolia.json is missing');
  else if (!isValidAddress(rawAddress)) issues.push('NFT_CONTRACT_ADDRESS is not a valid 0x address');
  else contractAddress = toChecksum(rawAddress);

  const deploymentBlock = intEnv('NFT_DEPLOYMENT_BLOCK', Number(deployment?.blockNumber) || 0);
  const abi = readAbi();
  if (!abi) issues.push('backend/abi/CivicIssueNFT.json is missing — run npm run compile && npm run deploy:sepolia');

  return {
    rpcUrl,
    privateKey: privateKey || null,
    contractAddress,
    deploymentBlock,
    deployment,
    abi,
    expectedChainId:   intEnv('EXPECTED_CHAIN_ID', SEPOLIA_CHAIN_ID, 1),
    mintConfirmations: intEnv('MINT_CONFIRMATIONS', 1, 1),
    mintTimeoutMs:     intEnv('MINT_TIMEOUT_MS', 180_000, 1),
    mintWaitMs:        intEnv('MINT_WAIT_MS', 90_000, 0),
    maxMintAttempts:   intEnv('MAX_MINT_ATTEMPTS', 5, 1),
    logChunkSize:      intEnv('LOG_CHUNK_SIZE', 1000, 1),
    rpcTimeoutMs:      intEnv('RPC_TIMEOUT_MS', 15_000, 1),
    explorerBaseUrl:   (process.env.EXPLORER_BASE_URL || 'https://sepolia.etherscan.io').replace(/\/+$/, ''),
    allowLocalChain:   process.env.NODE_ENV === 'test' || process.env.ALLOW_LOCAL_CHAIN === 'true',
    configured:        issues.length === 0,
    issues,
  };
}
