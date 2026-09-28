/**
 * Integration: the real ethereum.service (ethers JsonRpcProvider + NonceManager)
 * against a real local Hardhat node running the compiled CivicIssueNFT.
 * Chain 31337 is only accepted because allowLocalChain is set (tests only).
 * Skipped automatically if the contract has not been compiled.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { ContractFactory, HDNodeWallet, JsonRpcProvider, Wallet } from 'ethers';
import { createEthereumService } from '../services/ethereum.service.js';

const ARTIFACT = path.join(process.cwd(), 'artifacts', 'contracts', 'CivicIssueNFT.sol', 'CivicIssueNFT.json');
const PORT = 8599;
const RPC = `http://127.0.0.1:${PORT}`;
// Hardhat's public default test mnemonic → accounts #0 and #1 (not secrets).
const MNEMONIC = 'test test test test test test test test test test test junk';
const KEY0 = HDNodeWallet.fromPhrase(MNEMONIC, undefined, "m/44'/60'/0'/0/0").privateKey;
const KEY1 = HDNodeWallet.fromPhrase(MNEMONIC, undefined, "m/44'/60'/0'/0/1").privateKey;

const hasArtifact = fs.existsSync(ARTIFACT);
let node;
let contractAddress;

async function waitForRpc() {
  const p = new JsonRpcProvider(RPC);
  for (let i = 0; i < 80; i++) {
    try { await p.getBlockNumber(); p.destroy(); return; } catch { await new Promise((r) => setTimeout(r, 250)); }
  }
  throw new Error('hardhat node did not start');
}

describe.skipIf(!hasArtifact)('ethereum.service ↔ local Hardhat node (real ethers)', () => {
  beforeAll(async () => {
    node = spawn('npx', ['hardhat', 'node', '--port', String(PORT)], { cwd: process.cwd(), stdio: 'ignore', detached: true });
    await waitForRpc();
    const { abi, bytecode } = JSON.parse(fs.readFileSync(ARTIFACT, 'utf8'));
    const provider = new JsonRpcProvider(RPC);
    const deployer = new Wallet(KEY0, provider);
    const factory = new ContractFactory(abi, bytecode, deployer);
    const c = await factory.deploy(deployer.address, deployer.address);
    await c.waitForDeployment();
    contractAddress = await c.getAddress();
    provider.destroy();
  }, 60_000);

  afterAll(() => {
    try { process.kill(-node.pid); } catch { /* already gone */ }
  });

  const make = (key = KEY0, extra = {}) => createEthereumService({
    config: {
      rpcUrl: RPC, privateKey: key, contractAddress, expectedChainId: 31337, allowLocalChain: true,
      mintConfirmations: 1, mintTimeoutMs: 20_000, rpcTimeoutMs: 5_000, deploymentBlock: 0, issues: [], ...extra,
    },
  });

  it('init is ready, status reports the real contract', async () => {
    const svc = make();
    expect((await svc.init()).ready).toBe(true);
    const st = await svc.getStatus();
    expect(st).toMatchObject({ chainId: 31337, contractAddress, name: 'CivicChain Civic Issue', symbol: 'CIVIC', minterAuthorized: true, totalMinted: 0 });
    expect(Number(st.minterBalanceEth)).toBeGreaterThan(1);
  });

  it('refuses chain 31337 when local chains are not allowed', async () => {
    const svc = make(KEY0, { expectedChainId: 11155111, allowLocalChain: false });
    const r = await svc.init();
    expect(r.blocking).toContain('CHAIN_MISMATCH');
  });

  it('a non-minter backend key is detected as MINTER_NOT_AUTHORIZED', async () => {
    const r = await make(KEY1).init();
    expect(r.blocking).toContain('MINTER_NOT_AUTHORIZED');
  });

  it('mints for real, parses the token id and the chain agrees', async () => {
    const svc = make();
    const citizen = Wallet.createRandom().address;
    let submitted = null;
    const res = await svc.mintCivicIssueNFT(citizen, 'ipfs://bafkreilocalintegration', { onSubmitted: (h) => { submitted = h; } });
    expect(res.success).toBe(true);
    expect(res.tokenId).toBe('1');
    expect(submitted).toBe(res.transactionHash);
    expect(await svc.getOnChainToken(1)).toEqual({ owner: citizen, tokenURI: 'ipfs://bafkreilocalintegration' });
    expect((await svc.getTransactionOutcome(res.transactionHash))).toMatchObject({ state: 'CONFIRMED', tokenId: '1' });
    const events = await svc.getRecentMintEvents({ fromBlock: 0 });
    expect(events.map((e) => e.tokenId)).toContain('1');
  });

  it('three concurrent mints from one wallet get sequential ids (no nonce collision)', async () => {
    const svc = make();
    const results = await Promise.all([1, 2, 3].map((i) => svc.mintCivicIssueNFT(Wallet.createRandom().address, `ipfs://bafkreiconcurrent${i}`)));
    expect(results.every((r) => r.success)).toBe(true);
    expect(results.map((r) => Number(r.tokenId)).sort()).toEqual([2, 3, 4]);
  });
});
