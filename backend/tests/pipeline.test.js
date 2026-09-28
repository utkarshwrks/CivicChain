import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Wallet } from 'ethers';
import { makeFakeChain } from './helpers/fakeChain.js';

vi.mock('../services/ai.service.js', () => ({ analyzeImage: vi.fn() }));
vi.mock('../services/ipfs.service.js', () => {
  class IpfsError extends Error { constructor(code, message) { super(message); this.code = code; } }
  return { uploadToIPFS: vi.fn(), uploadJSON: vi.fn(), getGateway: () => 'https://gateway.pinata.cloud/ipfs', IpfsError };
});

const ai = await import('../services/ai.service.js');
const ipfs = await import('../services/ipfs.service.js');
const eth = await import('../services/ethereum.service.js');

let app;
let chain;
const CIVIC = { isCivicIssue: true, category: 'ROAD_DAMAGE', severity: 'HIGH', confidence: 96, reason: 'Large pothole on a main road' };

function png() {
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), crypto.randomBytes(64)]);
}
function tokenFor(address, role = 'CITIZEN') {
  return jwt.sign({ address, role }, process.env.JWT_SECRET);
}
let cidN = 0;
const fakeCid = (p) => `bafk${p}${String(++cidN).padStart(40, 'x')}`;

// Each test gets its own contract address (like a fresh deployment), so token
// ids from earlier tests never collide in the shared report store.
function installChain(opts = {}) {
  chain = makeFakeChain({ address: Wallet.createRandom().address, ...opts });
  eth.setEthereumService(eth.createEthereumService({
    provider: chain.provider, signer: chain.signer, contract: chain.contract,
    config: { rpcTimeoutMs: 1000, mintTimeoutMs: 1000, contractAddress: chain.address, issues: [] },
  }));
  return chain;
}

function submit(wallet, { image = png(), city = 'BHOPAL', landmark = 'Near DB Mall', extra = {} } = {}) {
  let r = request(app).post('/api/report/create').set('Authorization', `Bearer ${tokenFor(wallet.address)}`)
    .attach('image', image, { filename: 'photo.png', contentType: 'image/png' })
    .field('city', city).field('address', landmark);
  for (const [k, v] of Object.entries(extra)) r = r.field(k, v);
  return r;
}

beforeAll(async () => {
  process.env.MINT_WAIT_MS = '3000';
  installChain();
  app = (await import('../app.js')).default;
});

beforeEach(() => {
  installChain();
  ai.analyzeImage.mockReset().mockResolvedValue(CIVIC);
  ipfs.uploadToIPFS.mockReset().mockImplementation(async () => {
    const cid = fakeCid('img');
    return { cid, ipfsUri: `ipfs://${cid}`, gatewayUrl: `https://gateway.pinata.cloud/ipfs/${cid}` };
  });
  ipfs.uploadJSON.mockReset().mockImplementation(async () => {
    const cid = fakeCid('meta');
    return { cid, ipfsUri: `ipfs://${cid}`, gatewayUrl: `https://gateway.pinata.cloud/ipfs/${cid}` };
  });
});

describe('report pipeline — rejections never store or mint', () => {
  it('not a civic issue → 422 NOT_CIVIC_ISSUE, no IPFS, no mint, no report', async () => {
    ai.analyzeImage.mockResolvedValue({ ...CIVIC, isCivicIssue: false, category: 'OTHER', reason: 'A selfie' });
    const w = Wallet.createRandom();
    const res = await submit(w);
    expect(res.status).toBe(422);
    expect(res.body.status).toBe('NOT_CIVIC_ISSUE');
    expect(ipfs.uploadToIPFS).not.toHaveBeenCalled();
    expect(chain.sendLog).toEqual([]);
    const list = await request(app).get('/api/reports').query({ reporter: w.address });
    expect(list.body.total).toBe(0);
  });

  it('fraud score ≥ 71 → 422 FRAUD_BLOCKED, no IPFS, no mint', async () => {
    ai.analyzeImage.mockResolvedValue({ isCivicIssue: true, category: 'OTHER', severity: 'LOW', confidence: 20, reason: 'blurry floor tiles' });
    const res = await submit(Wallet.createRandom());
    expect(res.status).toBe(422);
    expect(res.body.status).toBe('FRAUD_BLOCKED');
    expect(res.body.fraud.score).toBeGreaterThanOrEqual(71);
    expect(ipfs.uploadToIPFS).not.toHaveBeenCalled();
    expect(chain.sendLog).toEqual([]);
  });

  it('AI error → AI_FAILED (502), nothing stored', async () => {
    ai.analyzeImage.mockRejectedValue(new Error('Gemini timed out after 45000 ms'));
    const res = await submit(Wallet.createRandom());
    expect(res.status).toBe(502);
    expect(res.body.status).toBe('AI_FAILED');
    expect(ipfs.uploadToIPFS).not.toHaveBeenCalled();
  });

  it('duplicate image → 409 DUPLICATE linking the original, second submission never pins or mints', async () => {
    const image = png();
    const first = await submit(Wallet.createRandom(), { image });
    expect(first.status).toBe(201);
    ipfs.uploadToIPFS.mockClear();
    const sendsBefore = chain.sendLog.length;
    const second = await submit(Wallet.createRandom(), { image });
    expect(second.status).toBe(409);
    expect(second.body.status).toBe('DUPLICATE');
    expect(second.body.existingReportId).toBe(first.body.reportId);
    expect(ipfs.uploadToIPFS).not.toHaveBeenCalled();
    expect(chain.sendLog.length).toBe(sendsBefore);
  });

  it('IPFS image failure → IPFS_FAILED, no report, hash NOT registered (re-submit works)', async () => {
    const image = png();
    ipfs.uploadToIPFS.mockRejectedValueOnce(Object.assign(new Error('pin failed'), { code: 'IPFS_FAILED' }));
    const w = Wallet.createRandom();
    const res = await submit(w, { image });
    expect(res.status).toBe(502);
    expect(res.body.status).toBe('IPFS_FAILED');
    expect(chain.sendLog).toEqual([]);
    expect((await request(app).get('/api/reports').query({ reporter: w.address })).body.total).toBe(0);
    const again = await submit(w, { image });
    expect(again.status).toBe(201);
  });

  it('metadata pin failure (quota) → 503 IPFS_FAILED, no mint, no report', async () => {
    ipfs.uploadJSON.mockRejectedValueOnce(Object.assign(new Error('quota'), { code: 'IPFS_QUOTA' }));
    const w = Wallet.createRandom();
    const res = await submit(w);
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('IPFS_FAILED');
    expect(res.body.errorCode).toBe('IPFS_QUOTA');
    expect(chain.sendLog).toEqual([]);
    expect((await request(app).get('/api/reports').query({ reporter: w.address })).body.total).toBe(0);
  });
});

describe('report pipeline — success', () => {
  it('201 NFT_MINTED with nft, evidence, pipeline stages and nft-cache mapping', async () => {
    const w = Wallet.createRandom();
    const res = await submit(w, { extra: { reporter: Wallet.createRandom().address } }); // body reporter ignored
    expect(res.status).toBe(201);
    const b = res.body;
    expect(b.status).toBe('NFT_MINTED');
    expect(b.reportId).toMatch(/^RP-\d+$/);
    expect(b.address).toBe(w.address);
    expect(b.nft).toMatchObject({ status: 'NFT_MINTED', tokenId: '1', contractAddress: chain.address, recipient: w.address });
    expect(b.nft.tokenURI).toBe(`ipfs://${b.evidence.metadataCid}`);
    expect(b.nft.explorerUrl).toBe(`https://sepolia.etherscan.io/tx/${b.nft.transactionHash}`);
    expect(b.nft.tokenExplorerUrl).toBe(`https://sepolia.etherscan.io/nft/${chain.address}/1`);
    expect(b.evidence).toMatchObject({ imageCid: expect.any(String), metadataCid: expect.any(String), imageSha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(b.points.earned).toBe(15);
    expect(b.reputation.earned).toBe(5);
    expect(b.rewards).toEqual(b.points);
    expect(b.department).toBe('ROAD_DEPARTMENT');
    expect(b.blockchain).toBeUndefined();
    expect(b.pipeline.map((s) => s.stage)).toEqual(['AI_ANALYSIS', 'FRAUD_CHECK', 'DUPLICATE_CHECK', 'IPFS_IMAGE', 'NFT_METADATA', 'NFT_MINT', 'NFT_CONFIRMED', 'CONTRIBUTION_RECORDED']);
    expect(b.pipeline.every((s) => s.status === 'done')).toBe(true);

    // minted to the JWT address, not the body address
    expect(chain.txs.values().next().value.recipient).toBe(w.address);

    const cache = JSON.parse(fs.readFileSync(path.join(process.env.CIVICCHAIN_DATA_DIR, 'nft-cache.json'), 'utf8'));
    expect(cache[chain.address.toLowerCase()].byReport[b.reportId]).toBe('1');

    const one = await request(app).get(`/api/reports/${b.reportId}`);
    expect(one.body.nft.status).toBe('NFT_MINTED');
    expect(one.body.status).toBe('OPEN');
    expect(one.body.city).toBe('BHOPAL');
    const poll = await request(app).get(`/api/report/${b.reportId}/nft`);
    expect(poll.body).toMatchObject({ status: 'NFT_MINTED', currentStatus: 'OPEN' });
  });

  it('metadata uploaded to IPFS has no reporter address, GPS or landmark', async () => {
    const w = Wallet.createRandom();
    await submit(w, { landmark: 'Secret Lane 42' });
    const metadata = ipfs.uploadJSON.mock.calls[0][0];
    const text = JSON.stringify(metadata);
    expect(text).not.toContain(w.address);
    expect(text.toLowerCase()).not.toContain(w.address.toLowerCase());
    expect(text).not.toContain('Secret Lane');
    expect(metadata.name).toMatch(/^CivicChain Civic Issue RP-\d+$/);
    expect(metadata.image).toMatch(/^ipfs:\/\//);
    expect(metadata.attributes).toContainEqual({ trait_type: 'Status at Mint', value: 'OPEN' });
    expect(metadata.attributes).toContainEqual({ trait_type: 'City', value: 'Bhopal' });
    expect(metadata.properties).toMatchObject({ schema: 'civicchain-nft-v1', network: 'ethereum-sepolia', chainId: 11155111 });
  });
});

describe('report pipeline — mint failure, retry, reconciliation', () => {
  it('mint failure keeps the report (202 NFT_MINT_FAILED); retry succeeds; retry again is a no-op', async () => {
    installChain({ balance: 1000n });
    const w = Wallet.createRandom();
    const res = await submit(w);
    expect(res.status).toBe(202);
    expect(res.body.status).toBe('NFT_MINT_FAILED');
    expect(res.body.nft.errorCode).toBe('INSUFFICIENT_FUNDS');
    expect(res.body.reportId).toBeTruthy();
    expect(chain.sendLog).toEqual([]);

    chain.opts.balance = 10n ** 18n;
    const retry = await request(app).post(`/api/nft/retry/${res.body.reportId}`).set('Authorization', `Bearer ${tokenFor(w.address)}`);
    expect(retry.status).toBe(200);
    expect(retry.body.outcome).toBe('MINTED');
    expect(retry.body.nft.tokenId).toBe('1');

    const again = await request(app).post(`/api/nft/retry/${res.body.reportId}`).set('Authorization', `Bearer ${tokenFor(w.address)}`);
    expect(again.body.outcome).toBe('ALREADY_MINTED');
    expect(chain.sendLog.filter((s) => s.startsWith('send')).length).toBe(1);
  });

  it('concurrent retries do not double-mint', async () => {
    installChain({ balance: 1000n });
    const w = Wallet.createRandom();
    const res = await submit(w);
    chain.opts.balance = 10n ** 18n;
    chain.opts.waitDelayMs = 50;
    const auth = `Bearer ${tokenFor(w.address)}`;
    const [a, b] = await Promise.all([
      request(app).post(`/api/nft/retry/${res.body.reportId}`).set('Authorization', auth),
      request(app).post(`/api/nft/retry/${res.body.reportId}`).set('Authorization', auth),
    ]);
    const outcomes = [a.body.outcome, b.body.outcome].sort();
    expect(outcomes).toContain('MINTED');
    expect(chain.sendLog.filter((s) => s.startsWith('send')).length).toBe(1);
  });

  it('only the reporter or an ADMIN may retry', async () => {
    installChain({ balance: 1000n });
    const w = Wallet.createRandom();
    const res = await submit(w);
    const other = await request(app).post(`/api/nft/retry/${res.body.reportId}`).set('Authorization', `Bearer ${tokenFor(Wallet.createRandom().address)}`);
    expect(other.status).toBe(403);
    const anon = await request(app).post(`/api/nft/retry/${res.body.reportId}`);
    expect(anon.status).toBe(401);
  });

  it('timeout → 202 pending with tx hash; the reconciler completes it without re-minting', async () => {
    const err = Object.assign(new Error('timeout'), { code: 'TIMEOUT' });
    installChain({ waitError: err });
    const w = Wallet.createRandom();
    const res = await submit(w);
    expect(res.status).toBe(202);
    expect(res.body.status).toBe('NFT_MINT_PENDING');
    expect(res.body.nft.transactionHash).toMatch(/^0x/);

    const { reconcileOnce } = await import('../services/nftMint.service.js');
    const summary = await reconcileOnce();
    expect(summary.reconciled).toBeGreaterThanOrEqual(1);
    const poll = await request(app).get(`/api/report/${res.body.reportId}/nft`);
    expect(poll.body.status).toBe('NFT_MINTED');
    expect(poll.body.nft.tokenId).toBe('1');
    expect(chain.sendLog.filter((s) => s.startsWith('send')).length).toBe(1);
  });

  it('ADMIN retry-failed retries every failed report sequentially', async () => {
    installChain({ balance: 1000n });
    const r1 = await submit(Wallet.createRandom());
    const r2 = await submit(Wallet.createRandom());
    expect(r1.body.status).toBe('NFT_MINT_FAILED');
    expect(r2.body.status).toBe('NFT_MINT_FAILED');
    chain.opts.balance = 10n ** 18n;
    const admin = '0x00000000000000000000000000000000000000aa';
    const res = await request(app).post('/api/nft/retry-failed').set('Authorization', `Bearer ${tokenFor(admin, 'ADMIN')}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(2);
    expect(res.body.results.filter((x) => x.status === 'NFT_MINTED').length).toBeGreaterThanOrEqual(2);
    const citizen = await request(app).post('/api/nft/retry-failed').set('Authorization', `Bearer ${tokenFor(Wallet.createRandom().address)}`);
    expect(citizen.status).toBe(403);
  });
});

describe('report pipeline — input validation', () => {
  it('requires a JWT', async () => {
    const res = await request(app).post('/api/report/create').attach('image', png(), 'a.png').field('city', 'BHOPAL');
    expect(res.status).toBe(401);
  });

  it('rejects a non-image disguised as PNG (magic bytes)', async () => {
    const res = await submit(Wallet.createRandom(), { image: Buffer.from('this is definitely not an image at all') });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_FILE_TYPE');
    expect(ai.analyzeImage).not.toHaveBeenCalled();
  });

  it('rejects files over MAX_UPLOAD_MB', async () => {
    process.env.MAX_UPLOAD_MB = '0.001';
    try {
      const res = await submit(Wallet.createRandom(), { image: Buffer.concat([png(), crypto.randomBytes(4096)]) });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('FILE_TOO_LARGE');
    } finally {
      delete process.env.MAX_UPLOAD_MB;
    }
  });

  it('rejects an unknown city and a landmark over 200 chars', async () => {
    const a = await submit(Wallet.createRandom(), { city: 'ATLANTIS' });
    expect(a.status).toBe(400);
    const b = await submit(Wallet.createRandom(), { landmark: 'x'.repeat(201) });
    expect(b.status).toBe(400);
    expect(ai.analyzeImage).not.toHaveBeenCalled();
  });
});

describe('NFT API', () => {
  it('contract, list (pagination + filters), owner, token, validation', async () => {
    const w = Wallet.createRandom();
    const first = await submit(w);
    ai.analyzeImage.mockResolvedValue({ ...CIVIC, category: 'GARBAGE', severity: 'MEDIUM' });
    await submit(w, { city: 'INDORE' });

    const c = await request(app).get('/api/nft/contract');
    expect(c.body).toMatchObject({ network: 'Ethereum Sepolia', chainId: 11155111, contractAddress: chain.address, symbol: 'CIVIC', totalMinted: 2 });
    expect((await request(app).get('/api/contracts')).body.contractAddress).toBe(chain.address);

    const all = await request(app).get('/api/nfts').query({ pageSize: 500 });
    expect(all.body.pageSize).toBe(50);
    expect(all.body.nfts[0].tokenId).toBe('2'); // newest first
    expect(all.body.nfts[0]).toMatchObject({ category: 'GARBAGE', city: 'INDORE', statusAtMint: 'OPEN', currentStatus: 'OPEN' });
    const garbage = await request(app).get('/api/nfts').query({ category: 'GARBAGE' });
    expect(garbage.body.nfts.every((n) => n.category === 'GARBAGE')).toBe(true);
    const page2 = await request(app).get('/api/nfts').query({ pageSize: 1, page: 2 });
    expect(page2.body.nfts).toHaveLength(1);
    expect(page2.body.nfts[0].tokenId).toBe('1');

    const owner = await request(app).get(`/api/nft/owner/${w.address.toLowerCase()}`);
    expect(owner.body.total).toBe(2);
    expect(owner.body.address).toBe(w.address);
    expect((await request(app).get('/api/nft/owner/0x123')).status).toBe(400);
    expect((await request(app).get(`/api/profile/${w.address}/nfts`)).body.nftCount).toBe(2);

    const token = await request(app).get('/api/nft/1');
    expect(token.body).toMatchObject({ tokenId: '1', reportId: first.body.reportId, verifiedOnChain: true });
    expect(token.body.onChain.owner).toBe(w.address);
    expect((await request(app).get('/api/nft/0')).status).toBe(400);
    expect((await request(app).get('/api/nft/abc')).status).toBe(400);
    expect((await request(app).get('/api/nft/999')).status).toBe(404);

    const badges = await request(app).get(`/api/profile/${w.address}/badges`);
    expect(badges.body.map((b) => b.name)).toContain('First Civic NFT');
    const rep = await request(app).get(`/api/profile/${w.address}/reputation`);
    expect(rep.body).toMatchObject({ score: 10, nftCount: 2 });
  });

  it('events, stats, removed endpoints', async () => {
    await submit(Wallet.createRandom());
    const ev = await request(app).get('/api/events');
    expect(ev.body.events[0].event).toBe('CivicIssueNFTMinted');
    const stats = await request(app).get('/api/stats');
    expect(stats.body).toMatchObject({ network: 'Ethereum Sepolia', chainId: 11155111, latestBlock: 5_000_000 });
    expect(stats.body.totalNFTs).toBeGreaterThanOrEqual(1);
    expect(Object.keys(stats.body).sort()).toEqual(['chainId', 'latestBlock', 'mintSuccessRate', 'network', 'resolvedReports', 'totalNFTs', 'totalReports']);
    expect((await request(app).get('/api/blocks')).status).toBe(410);
    expect((await request(app).post('/api/broadcast').send({ type: 'x' })).status).toBe(404);
    expect((await request(app).get(`/api/nonce/${Wallet.createRandom().address}`)).status).toBe(404);
    const health = await request(app).get('/health');
    expect(JSON.stringify(health.body)).not.toMatch(/rpcUrl|privateKey/i);
  });
});

describe('workflow + analytics', () => {
  it('workflow changes the current status but never the NFT; jurisdiction enforced', async () => {
    const w = Wallet.createRandom();
    const res = await submit(w, { city: 'PUNE' });
    const id = res.body.reportId;
    const { setRole } = await import('../services/rbac.service.js');
    const { setUserJurisdiction } = await import('../services/jurisdiction.service.js');

    const auth = Wallet.createRandom().address;
    setRole(auth, 'AUTHORITY');
    setUserJurisdiction(auth.toLowerCase(), 'ROAD_DEPARTMENT', 'BHOPAL');
    const denied = await request(app).post(`/api/workflow/${id}/verify`).set('Authorization', `Bearer ${tokenFor(auth, 'AUTHORITY')}`).send({ note: 'ok' });
    expect(denied.status).toBe(403);

    setUserJurisdiction(auth.toLowerCase(), 'ROAD_DEPARTMENT', 'PUNE');
    const ok = await request(app).post(`/api/workflow/${id}/verify`).set('Authorization', `Bearer ${tokenFor(auth, 'AUTHORITY')}`).send({ note: 'ok' });
    expect(ok.status).toBe(200);
    expect(ok.body.newStatus).toBe('VERIFIED');

    const citizen = await request(app).post(`/api/workflow/${id}/start`).set('Authorization', `Bearer ${tokenFor(w.address)}`);
    expect(citizen.status).toBe(403);

    const nftAfter = await request(app).get(`/api/report/${id}/nft`);
    expect(nftAfter.body.currentStatus).toBe('VERIFIED');
    expect(nftAfter.body.nft).toEqual(res.body.nft);
    expect(chain.sendLog.filter((s) => s.startsWith('send')).length).toBe(1);
    expect((await request(app).post('/api/workflow/NOPE-1/verify').set('Authorization', `Bearer ${tokenFor(auth, 'AUTHORITY')}`)).status).toBe(404);
  });

  it('analytics exposes NFT metrics and keeps the existing ones', async () => {
    await submit(Wallet.createRandom(), { city: 'DELHI' });
    installChain({ balance: 1000n });
    await submit(Wallet.createRandom(), { city: 'DELHI' });
    const nfts = await request(app).get('/api/analytics/nfts');
    expect(nfts.body.minted).toBeGreaterThanOrEqual(1);
    expect(nfts.body.failed).toBeGreaterThanOrEqual(1);
    expect(nfts.body.byCity.DELHI).toBeGreaterThanOrEqual(1);
    expect(nfts.body.mintSuccessRate).toBeGreaterThan(0);
    expect(nfts.body.mintSuccessRate).toBeLessThan(100);
    const overview = await request(app).get('/api/analytics/overview');
    expect(overview.body).toHaveProperty('totalReports');
    expect(overview.body).toHaveProperty('totalNFTs');
    expect(overview.body).toHaveProperty('resolutionRate');
    for (const p of ['categories', 'severity', 'top-reporters', 'hotspots', 'trends', 'insights']) {
      expect((await request(app).get(`/api/analytics/${p}`)).status).toBe(200);
    }
    const hot = await request(app).get('/api/analytics/hotspots');
    expect(JSON.stringify(hot.body)).not.toContain('[object Object]');
  });
});
