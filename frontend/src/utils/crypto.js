/**
 * crypto.js — CivicChain browser wallet helpers (ethers v6).
 *
 * The wallet is an identity wallet only: it signs the login challenge.
 * Citizens never send transactions and never need ETH — the backend minter
 * pays gas for Civic Issue NFTs on Ethereum Sepolia.
 */
import { Wallet, getAddress } from 'ethers';

const PK_RE = /^(0x)?[0-9a-fA-F]{64}$/;

function toWalletObject(w) {
  return {
    address:    getAddress(w.address), // EIP-55 checksum
    privateKey: w.privateKey,          // 0x-prefixed
  };
}

/** Create a fresh random wallet in the browser. */
export function generateWallet() {
  return toWalletObject(Wallet.createRandom());
}

/** Import a wallet from a 64-hex private key (with or without 0x). */
export function importWallet(privateKey) {
  const pk = (privateKey || '').trim();
  if (!PK_RE.test(pk)) {
    throw new Error('Invalid private key — expected 64 hexadecimal characters (optionally prefixed with 0x).');
  }
  try {
    return toWalletObject(new Wallet(pk.startsWith('0x') ? pk : `0x${pk}`));
  } catch {
    throw new Error('Invalid private key — it is not a valid secp256k1 key.');
  }
}

/** The exact login challenge text; the backend builds the same string. */
export function buildAuthMessage(address, nonce) {
  return `CivicChain:${getAddress(address)}:${nonce}`;
}

/** EIP-191 personal_sign of the login challenge. Returns a 0x signature. */
export async function signAuthMessage(privateKey, address, nonce) {
  const wallet = new Wallet(privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`);
  return wallet.signMessage(buildAuthMessage(address, nonce));
}

/**
 * One-time upgrade of a pre-Ethereum wallet (localStorage cp_wallet_v2).
 * Old wallets stored a secp256k1 private key and a 40-char SHA-256 address;
 * the same key yields a standard 0x Ethereum address.
 * Returns the upgraded wallet object, or null if the stored key is unusable.
 */
export function upgradeLegacyWallet(legacy) {
  if (!legacy || typeof legacy.privateKey !== 'string') return null;
  try {
    return importWallet(legacy.privateKey);
  } catch {
    return null;
  }
}

// ─── Optional: injected browser wallet (MetaMask etc.) ───────────────────────

export function hasBrowserWallet() {
  return typeof window !== 'undefined' && !!window.ethereum;
}

/** Ask the injected wallet for an account. Returns { address, type: 'browser' }. */
export async function connectBrowserWallet() {
  if (!hasBrowserWallet()) throw new Error('No browser wallet found. Install MetaMask or create a CivicChain wallet instead.');
  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
  if (!accounts?.length) throw new Error('The browser wallet did not share an account.');
  return { address: getAddress(accounts[0]), type: 'browser' };
}

/** personal_sign the login challenge with the injected wallet. */
export async function signWithBrowserWallet(address, nonce) {
  const message = buildAuthMessage(address, nonce);
  return window.ethereum.request({ method: 'personal_sign', params: [message, getAddress(address)] });
}
