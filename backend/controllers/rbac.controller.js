/**
 * rbac.controller.js — CivicChain RBAC Controllers  (Phase 14A + 14C)
 *
 * GET  /api/rbac/role/:address  →  { address, role }                    (authenticated)
 * GET  /api/rbac/roles          →  { roles: {...} }                     (ADMIN only)
 * POST /api/rbac/assign         →  { address, role, department, city }  (ADMIN only)
 *   body: { address, role, department?, city? }
 */

import { getRole, setRole, getAllRoles, VALID_ROLES } from '../services/rbac.service.js';
import { DEPARTMENTS } from '../services/department.service.js';
import {
  setUserJurisdiction, getUserJurisdiction,
  getCityName, isValidCity,
} from '../services/jurisdiction.service.js';
import { isValidAddress, normalizeAddress, toChecksum, invalidWallet } from '../utils/address.js';

/**
 * GET /api/rbac/role/:address
 * Returns the role for a given address.
 */
export function getRoleController(req, res) {
  try {
    const { address } = req.params;
    if (!isValidAddress(address)) return invalidWallet(res);
    const key   = normalizeAddress(address);
    const role  = getRole(key);
    const juris = getUserJurisdiction(key);
    return res.json({
      address:    toChecksum(address),
      role,
      department: juris?.department || null,
      city:       juris?.city       || null,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

/**
 * GET /api/rbac/roles
 * Returns all role assignments. ADMIN only.
 */
export function getRolesController(req, res) {
  try {
    const roles = getAllRoles();
    return res.json({ roles, count: Object.keys(roles).length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

/**
 * POST /api/rbac/assign
 * Assigns a role (and optionally department + city) to an address. ADMIN only.
 * body: { address: string, role: string, department?: string, city?: string }
 */
export function assignRoleController(req, res) {
  try {
    const { address, role, department, city } = req.body || {};

    if (!isValidAddress(address)) return invalidWallet(res);
    if (!role || !VALID_ROLES.includes(role)) {
      return res.status(400).json({
        error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}`,
      });
    }

    // Validate department + city BEFORE writing anything
    if (department && !DEPARTMENTS.includes(department)) {
      return res.status(400).json({ error: `Invalid department: "${department}"` });
    }
    if (city && !isValidCity(city)) {
      return res.status(400).json({ error: `Invalid city: "${city}"` });
    }

    const key = normalizeAddress(address);
    setRole(key, role);

    // Phase 14C: optionally assign department + city at the same time
    let assignedDept = null;
    let assignedCity = null;

    if (department) {
      setUserJurisdiction(key, department, city || null);
      assignedDept = department;
      assignedCity = city || null;
    }

    console.log(`[RBAC] Admin assigned ${role}${assignedDept ? ' + ' + assignedDept : ''}${assignedCity ? ' + ' + assignedCity : ''} → ${key.slice(0, 10)}…`);

    return res.json({
      success:    true,
      address:    toChecksum(address),
      role,
      department: assignedDept,
      city:       assignedCity,
      cityName:   assignedCity ? getCityName(assignedCity) : null,
      assignedBy: req.user?.address,
    });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
}
