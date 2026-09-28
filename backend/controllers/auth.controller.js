/**
 * auth.controller.js — CivicChain Auth Controllers  (EIP-191 wallet login)
 *
 * GET  /api/auth/nonce/:address  →  { nonce, expiresAt, message }
 * POST /api/auth/login           →  { token, address, role }
 * GET  /api/auth/me              →  { address, role }
 */

import { generateNonce, verifyLogin, AuthError } from '../services/auth.service.js';
import { getRole } from '../services/rbac.service.js';
import { isValidAddress, invalidWallet, toChecksum } from '../utils/address.js';

function sendAuthError(res, e, fallbackStatus = 401) {
  if (e instanceof AuthError) {
    if (e.code === 'INVALID_WALLET') return invalidWallet(res);
    return res.status(e.status).json({ error: e.message, code: e.code });
  }
  console.error('[AUTH] unexpected error:', e.message);
  return res.status(fallbackStatus).json({ error: 'Authentication failed.' });
}

/**
 * GET /api/auth/nonce/:address
 * Issues a one-time nonce for the wallet to sign.
 */
export function getNonceController(req, res) {
  const { address } = req.params;
  if (!isValidAddress(address)) return invalidWallet(res);
  try {
    return res.json(generateNonce(address));
  } catch (e) {
    return sendAuthError(res, e, 500);
  }
}

/**
 * POST /api/auth/login
 * Body: { address, nonce, signature }   (publicKey is accepted and ignored)
 * Returns: { token, address, role }
 */
export function loginController(req, res) {
  const { address, nonce, signature } = req.body || {};
  if (!isValidAddress(address)) return invalidWallet(res);
  if (!nonce || !signature) {
    return res.status(400).json({ error: 'Missing required fields: address, nonce, signature.' });
  }
  try {
    return res.json(verifyLogin({ address, nonce, signature }));
  } catch (e) {
    return sendAuthError(res, e);
  }
}

/**
 * GET /api/auth/me
 * Requires: authenticate middleware
 * Returns the caller's address and current role (re-read from the role store).
 */
export function meController(req, res) {
  const address = toChecksum(req.user.address) || req.user.address;
  return res.json({ address, role: getRole(address) });
}
