import { describe, it, expect, beforeAll, vi, afterEach } from 'vitest';
import request from 'supertest';
import { Wallet } from 'ethers';

let app;
beforeAll(async () => {
  app = (await import('../app.js')).default;
});

afterEach(() => {
  vi.useRealTimers();
});

async function getNonce(address) {
  const res = await request(app).get(`/api/auth/nonce/${address}`);
  expect(res.status).toBe(200);
  return res.body;
}

async function login(wallet, { signer = wallet, address = wallet.address } = {}) {
  const { nonce, message } = await getNonce(address);
  const signature = await signer.signMessage(message);
  const res = await request(app).post('/api/auth/login').send({ address, nonce, signature });
  return { res, nonce, signature };
}

describe('EIP-191 wallet auth', () => {
  it('nonce endpoint returns the exact message to sign (checksummed address)', async () => {
    const w = Wallet.createRandom();
    const body = await getNonce(w.address.toLowerCase());
    expect(body.message).toBe(`CivicChain:${w.address}:${body.nonce}`);
    expect(body.nonce).toMatch(/^[0-9a-f]{32}$/);
  });

  it('valid ethers signature → JWT with checksummed address and CITIZEN role', async () => {
    const w = Wallet.createRandom();
    const { res } = await login(w);
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.address).toBe(w.address);
    expect(res.body.role).toBe('CITIZEN');

    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${res.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body).toEqual({ address: w.address, role: 'CITIZEN' });
  });

  it('accepts and ignores a legacy publicKey field', async () => {
    const w = Wallet.createRandom();
    const { nonce, message } = await getNonce(w.address);
    const signature = await w.signMessage(message);
    const res = await request(app).post('/api/auth/login').send({ address: w.address, nonce, signature, publicKey: '04abc' });
    expect(res.status).toBe(200);
  });

  it('signature from a different wallet → 401', async () => {
    const w = Wallet.createRandom();
    const other = Wallet.createRandom();
    const { res } = await login(w, { signer: other });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('SIGNER_MISMATCH');
  });

  it('reused nonce → 401', async () => {
    const w = Wallet.createRandom();
    const first = await login(w);
    expect(first.res.status).toBe(200);
    const again = await request(app).post('/api/auth/login')
      .send({ address: w.address, nonce: first.nonce, signature: first.signature });
    expect(again.status).toBe(401);
  });

  it('expired nonce → 401', async () => {
    const w = Wallet.createRandom();
    const { nonce, message } = await getNonce(w.address);
    const signature = await w.signMessage(message);
    const realNow = Date.now;
    Date.now = () => realNow() + 6 * 60 * 1000;
    try {
      const res = await request(app).post('/api/auth/login').send({ address: w.address, nonce, signature });
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('NONCE_EXPIRED');
    } finally {
      Date.now = realNow;
    }
  });

  it('malformed address → 400 INVALID_WALLET (nonce and login)', async () => {
    const legacy = 'a'.repeat(40); // old 40-char format
    const n = await request(app).get(`/api/auth/nonce/${legacy}`);
    expect(n.status).toBe(400);
    expect(n.body.error).toBe('INVALID_WALLET');
    const l = await request(app).post('/api/auth/login').send({ address: '0x123', nonce: 'x', signature: '0x00' });
    expect(l.status).toBe(400);
    expect(l.body.error).toBe('INVALID_WALLET');
  });

  it('address is case-insensitive (lowercase request, checksum in JWT)', async () => {
    const w = Wallet.createRandom();
    const lower = w.address.toLowerCase();
    const { res } = await login(w, { address: lower });
    expect(res.status).toBe(200);
    expect(res.body.address).toBe(w.address);
  });

  it('ADMIN_ADDRESSES are seeded as ADMIN', async () => {
    const { getRole } = await import('../services/rbac.service.js');
    expect(getRole('0x00000000000000000000000000000000000000AA')).toBe('ADMIN');
  });

  it('rejects a JWT that carries a legacy 40-char address', async () => {
    const jwt = (await import('jsonwebtoken')).default;
    const token = jwt.sign({ address: 'b'.repeat(40), role: 'ADMIN' }, process.env.JWT_SECRET);
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(401);
  });

  it('role changes take effect without re-login', async () => {
    const w = Wallet.createRandom();
    const { res } = await login(w);
    const { setRole } = await import('../services/rbac.service.js');
    setRole(w.address, 'AUTHORITY');
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${res.body.token}`);
    expect(me.body.role).toBe('AUTHORITY');
  });
});
