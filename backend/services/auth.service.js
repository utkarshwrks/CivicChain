/**
 * auth.service.js — CivicChain Wallet Authentication  (EIP-191)
 *
 * Passwordless challenge-response login with standard Ethereum wallets.
 *
 * Flow:
 *   1. generateNonce(address)  →  { nonce, expiresAt }  (single use, 5-min TTL)
 *   2. The browser signs the text  CivicChain:<checksumAddress>:<nonce>
 *      with wallet.signMessage()  (EIP-191 personal_sign)
 *   3. verifyLogin({ address, nonce, signature })
 *        → ethers.verifyMessage recovers the signer, which must equal the
 *          claimed address; the nonce is consumed; a 24 h JWT is issued
 *   4. verifyToken(token)  →  decoded { address, role, iat, exp }
 */

import crypto          from 'crypto';
import jwt             from 'jsonwebtoken';
import { verifyMessage } from 'ethers';
import { getRole }     from './rbac.service.js';
import { isValidAddress, normalizeAddress, toChecksum } from '../utils/address.js';

const LOG = '[AUTH]';

// ─── Nonce Store (in-memory, ephemeral by design) ─────────────────────────────
// address (lowercase 0x) → { nonce: string, expiresAt: ms }
const nonceStore = new Map();
export const NONCE_TTL = 5 * 60 * 1000; // 5 minutes

/** Typed auth error; `status` is the HTTP code the controller should use. */
export class AuthError extends Error {
  constructor(code, message, status = 401) {
    super(message);
    this.code   = code;
    this.status = status;
  }
}

function cleanExpiredNonces() {
  const now = Date.now();
  for (const [addr, entry] of nonceStore.entries()) {
    if (entry.expiresAt < now) nonceStore.delete(addr);
  }
}

/** The exact text the wallet signs. The address is always EIP-55 checksummed. */
export function buildLoginMessage(address, nonce) {
  return `CivicChain:${toChecksum(address)}:${nonce}`;
}

export function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new AuthError('JWT_NOT_CONFIGURED', 'JWT_SECRET is not configured on the server.', 500);
  return secret;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate a one-time nonce for the given address.
 * @param {string} address  0x Ethereum address (any case)
 * @returns {{ nonce: string, expiresAt: number, message: string }}
 */
export function generateNonce(address) {
  if (!isValidAddress(address)) throw new AuthError('INVALID_WALLET', 'Invalid wallet address.', 400);
  cleanExpiredNonces();
  const key       = normalizeAddress(address);
  const nonce     = crypto.randomBytes(16).toString('hex');
  const expiresAt = Date.now() + NONCE_TTL;
  nonceStore.set(key, { nonce, expiresAt });
  return { nonce, expiresAt, message: buildLoginMessage(address, nonce) };
}

/**
 * Verify a wallet login attempt.
 *
 * @param {object} params
 * @param {string} params.address   claimed 0x wallet address
 * @param {string} params.nonce     nonce received from generateNonce
 * @param {string} params.signature EIP-191 signature (0x…, 65 bytes)
 * @returns {{ token: string, address: string, role: string }}  address is checksummed
 * @throws {AuthError}
 */
export function verifyLogin({ address, nonce, signature }) {
  if (!isValidAddress(address)) throw new AuthError('INVALID_WALLET', 'Invalid wallet address.', 400);
  if (typeof nonce !== 'string' || !nonce) throw new AuthError('INVALID_NONCE', 'Nonce is required.', 400);
  if (typeof signature !== 'string' || !/^0x[0-9a-fA-F]+$/.test(signature)) {
    throw new AuthError('INVALID_SIGNATURE', 'Signature must be a 0x-prefixed hex string.', 400);
  }

  const key = normalizeAddress(address);

  // ── 1. Nonce: must exist, match and be unexpired — then it is consumed ──────
  const stored = nonceStore.get(key);
  if (!stored) throw new AuthError('NONCE_NOT_FOUND', 'No pending nonce for this address. Request a new nonce first.');
  if (Date.now() > stored.expiresAt) {
    nonceStore.delete(key);
    throw new AuthError('NONCE_EXPIRED', 'Nonce expired. Request a new nonce.');
  }
  if (stored.nonce !== nonce) throw new AuthError('NONCE_MISMATCH', 'Nonce mismatch.');
  nonceStore.delete(key);

  // ── 2. Recover the signer (EIP-191) and compare to the claimed address ─────
  let recovered;
  try {
    recovered = verifyMessage(buildLoginMessage(address, nonce), signature);
  } catch {
    throw new AuthError('INVALID_SIGNATURE', 'Signature could not be verified.');
  }
  if (normalizeAddress(recovered) !== key) {
    throw new AuthError('SIGNER_MISMATCH', 'Signature was not produced by this wallet.');
  }

  // ── 3. Role + JWT ───────────────────────────────────────────────────────────
  const checksum = toChecksum(address);
  const role     = getRole(checksum);
  const token    = jwt.sign({ address: checksum, role }, getJwtSecret(), { expiresIn: '24h' });

  console.log(`${LOG} Login verified for ${checksum.slice(0, 10)}… | role: ${role}`);
  return { token, address: checksum, role };
}

/**
 * Verify a JWT and return its decoded payload.
 * @throws if token is invalid or expired
 */
export function verifyToken(token) {
  return jwt.verify(token, getJwtSecret());
}

/** Test helper — clears all pending nonces. */
export function _resetNonces() {
  nonceStore.clear();
}
