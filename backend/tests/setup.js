/**
 * Test setup: every test file gets its own temporary data directory seeded
 * with cities.json, so the real backend/data files are never touched, and
 * no test ever talks to a real network.
 */
import fs   from 'fs';
import os   from 'os';
import path from 'path';

const REAL_DATA = path.join(process.cwd(), 'backend', 'data');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'civicchain-test-'));
fs.copyFileSync(path.join(REAL_DATA, 'cities.json'), path.join(dir, 'cities.json'));

process.env.NODE_ENV = 'test';
process.env.CIVICCHAIN_DATA_DIR = dir;
process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long';
process.env.SEPOLIA_RPC_URL = '';
process.env.DEPLOYER_PRIVATE_KEY = '';
process.env.NFT_CONTRACT_ADDRESS = '';
process.env.NFT_DEPLOYMENT_FILE = path.join(dir, 'no-deployment.json');
process.env.ADMIN_ADDRESSES = '0x00000000000000000000000000000000000000aa';
process.env.GEMINI_API_KEY = 'test-gemini';
process.env.PINATA_JWT = 'test-pinata';
