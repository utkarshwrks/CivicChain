/**
 * auth.middleware.js — CivicChain Auth & RBAC Middleware
 *
 * authenticate    → verifies JWT from Authorization: Bearer <token>
 *                   attaches { address (EIP-55), role } to req.user
 *                   (role is re-read from the role store so admin changes
 *                   take effect without a new login)
 *
 * requireRole     → factory that returns a middleware checking req.user.role
 */

import { verifyToken } from '../services/auth.service.js';
import { getRole }     from '../services/rbac.service.js';
import { isValidAddress, toChecksum } from '../utils/address.js';

/**
 * Verify the Bearer JWT token. Attaches req.user = { address, role }.
 * Returns 401 if missing, invalid, or not issued for an Ethereum address.
 */
export function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Authentication required. Connect your wallet and sign in.',
    });
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return res.status(401).json({ error: 'Empty token.' });
  }

  let decoded;
  try {
    decoded = verifyToken(token);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session. Please reconnect your wallet.' });
  }

  // Tokens issued before the Ethereum migration carry a 40-char legacy address.
  if (!isValidAddress(decoded.address)) {
    return res.status(401).json({ error: 'Session is from an older wallet format. Please sign in again.' });
  }

  const address = toChecksum(decoded.address);
  req.user = { address, role: getRole(address) };
  next();
}

/**
 * Role guard — must be used AFTER authenticate().
 *
 * Usage:
 *   router.post('/verify', authenticate, requireRole('AUTHORITY', 'ADMIN'), controller)
 *
 * @param {...string} allowedRoles
 */
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Forbidden. You do not have permission to perform this action.',
        required: allowedRoles,
        actual:   req.user.role,
      });
    }
    next();
  };
}
