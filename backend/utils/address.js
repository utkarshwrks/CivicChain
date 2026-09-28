/**
 * address.js — Ethereum address helpers used by every service/controller that
 * accepts a wallet address.
 *
 *   isValidAddress(a)   → true for a 0x-prefixed 20-byte hex address
 *   normalizeAddress(a) → lowercase 0x form (storage keys)
 *   toChecksum(a)       → EIP-55 checksum form (API responses)
 */
import { getAddress, isAddress } from 'ethers';

const HEX_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export function isValidAddress(a) {
  if (typeof a !== 'string' || !HEX_ADDRESS.test(a.trim())) return false;
  // isAddress rejects mixed-case strings with a wrong checksum.
  return isAddress(a.trim());
}

export function normalizeAddress(a) {
  if (!isValidAddress(a)) return null;
  return a.trim().toLowerCase();
}

export function toChecksum(a) {
  if (!isValidAddress(a)) return null;
  return getAddress(a.trim().toLowerCase());
}

/** Express helper: 400 { error: 'INVALID_WALLET' } for a malformed address. */
export function invalidWallet(res, field = 'address') {
  return res.status(400).json({
    error:   'INVALID_WALLET',
    message: `"${field}" must be a 0x-prefixed Ethereum address.`,
  });
}
