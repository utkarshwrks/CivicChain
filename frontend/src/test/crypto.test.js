// @vitest-environment node
// ethers' crypto needs the node realm (jsdom's Buffer/Uint8Array mismatch).
import { describe, it, expect, beforeEach } from 'vitest';
import { verifyMessage, Wallet } from 'ethers';
import { generateWallet, importWallet, signAuthMessage, buildAuthMessage, upgradeLegacyWallet } from '../utils/crypto.js';
import { loadStoredWallet, STORAGE_KEY } from '../hooks/useWallet.jsx';
import { ipfsToGateway, shortAddress, txUrl, nftUrl, formatLocation } from '../utils/format.js';

describe('wallet crypto (ethers)', () => {
  it('generates an EIP-55 0x wallet', () => {
    const w = generateWallet();
    expect(w.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(new Wallet(w.privateKey).address).toBe(w.address);
  });

  it('imports with or without 0x and rejects bad keys', () => {
    const w = Wallet.createRandom();
    expect(importWallet(w.privateKey).address).toBe(w.address);
    expect(importWallet(w.privateKey.slice(2)).address).toBe(w.address);
    expect(() => importWallet('1234')).toThrow(/Invalid private key/);
    expect(() => importWallet('zz'.repeat(32))).toThrow(/Invalid private key/);
  });

  it('signs the exact login challenge (EIP-191) and the signer recovers', async () => {
    const w = generateWallet();
    const sig = await signAuthMessage(w.privateKey, w.address.toLowerCase(), 'abc123');
    expect(buildAuthMessage(w.address.toLowerCase(), 'abc123')).toBe(`CivicChain:${w.address}:abc123`);
    expect(verifyMessage(`CivicChain:${w.address}:abc123`, sig)).toBe(w.address);
  });

  it('upgrades a legacy wallet (same key → standard 0x address)', () => {
    const w = Wallet.createRandom();
    const up = upgradeLegacyWallet({ privateKey: w.privateKey.slice(2), address: 'a'.repeat(40) });
    expect(up.address).toBe(w.address);
    expect(upgradeLegacyWallet({ privateKey: 'nope' })).toBeNull();
  });
});

describe('localStorage wallet upgrade', () => {
  beforeEach(() => localStorage.clear());

  it('cp_wallet_v2 → cp_wallet_v3 once, removes the old keys', () => {
    const w = Wallet.createRandom();
    localStorage.setItem('cp_wallet_v2', JSON.stringify({ privateKey: w.privateKey.slice(2), publicKey: '04…', address: 'b'.repeat(40) }));
    localStorage.setItem('cp_token_v1', 'old.jwt.token');
    const first = loadStoredWallet();
    expect(first.upgraded).toBe(true);
    expect(first.wallet.address).toBe(w.address);
    expect(localStorage.getItem('cp_wallet_v2')).toBeNull();
    expect(localStorage.getItem('cp_token_v1')).toBeNull();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).address).toBe(w.address);
    const second = loadStoredWallet();
    expect(second.upgraded).toBe(false);
    expect(second.wallet.address).toBe(w.address);
  });

  it('no wallet stored → null', () => {
    expect(loadStoredWallet()).toEqual({ wallet: null, upgraded: false });
  });
});

describe('format helpers', () => {
  it('builds explorer + gateway URLs', () => {
    expect(ipfsToGateway('ipfs://bafyabc')).toBe('https://gateway.pinata.cloud/ipfs/bafyabc');
    expect(ipfsToGateway('https://x/y')).toBe('https://x/y');
    expect(txUrl('0xabc')).toBe('https://sepolia.etherscan.io/tx/0xabc');
    expect(nftUrl('0xC', '3')).toBe('https://sepolia.etherscan.io/nft/0xC/3');
    expect(shortAddress('0x1234567890abcdef1234567890abcdef12345678')).toBe('0x1234…5678');
  });
  it('formats structured and legacy locations', () => {
    expect(formatLocation({ location: '{"address":"MP Nagar","city":"BHOPAL"}' })).toBe('MP Nagar · Bhopal');
    expect(formatLocation({ location: { address: 'Unknown location', city: 'PUNE' }, cityName: 'Pune' })).toBe('Pune');
    expect(formatLocation({ location: 'MG Road' })).toBe('MG Road');
  });
});
