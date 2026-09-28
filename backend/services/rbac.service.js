/**
 * rbac.service.js — CivicChain Role-Based Access Control
 *
 * Manages address → role mappings, persisted to backend/data/roles.json.
 * Keys are lowercase 0x Ethereum addresses.
 *
 * Admin seeding on startup:
 *   • every address in ADMIN_ADDRESSES (comma-separated 0x addresses)
 *   • if ADMIN_ADDRESSES is empty: the deployer's Ethereum address derived
 *     from DEPLOYER_PRIVATE_KEY (a warning recommends a separate admin wallet)
 *
 * Valid roles: CITIZEN | AUTHORITY | MUNICIPAL_TEAM | ADMIN
 */

import { Wallet }    from 'ethers';
import { isValidAddress, normalizeAddress } from '../utils/address.js';
import { dataPath, readJson, writeJsonAtomic } from '../config/paths.js';

const LOG = '[RBAC]';

export const VALID_ROLES = ['CITIZEN', 'AUTHORITY', 'MUNICIPAL_TEAM', 'ADMIN'];
const DEFAULT_ROLE = 'CITIZEN';

const rolesPath = () => dataPath('roles.json');

// ─── Role Store ──────────────────────────────────────────────────────────────

let roleStore = {}; // lowercase 0x address → role

function loadStore() {
  roleStore = {};
  const raw = readJson(rolesPath(), {});
  for (const [addr, role] of Object.entries(raw || {})) {
    const key = normalizeAddress(addr);
    if (key && VALID_ROLES.includes(role)) roleStore[key] = role;
  }
}

function saveStore() {
  try {
    writeJsonAtomic(rolesPath(), roleStore);
  } catch (e) {
    console.error(`${LOG} Failed to save roles.json:`, e.message);
  }
}

// ─── Admin Seed ──────────────────────────────────────────────────────────────

/** Deployer's 0x address from DEPLOYER_PRIVATE_KEY, or null. Never logs the key. */
export function deriveDeployerAddress() {
  const pk = (process.env.DEPLOYER_PRIVATE_KEY || '').trim();
  if (!pk) return null;
  try {
    return new Wallet(pk.startsWith('0x') ? pk : `0x${pk}`).address;
  } catch {
    return null;
  }
}

/** Addresses from ADMIN_ADDRESSES that are valid 0x addresses (lowercase). */
export function getConfiguredAdmins() {
  return (process.env.ADMIN_ADDRESSES || '')
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean)
    .filter((a) => {
      if (isValidAddress(a)) return true;
      console.warn(`${LOG} Ignoring invalid ADMIN_ADDRESSES entry "${a.slice(0, 12)}…"`);
      return false;
    })
    .map(normalizeAddress);
}

export function seedAdmins() {
  let admins = getConfiguredAdmins();
  if (admins.length === 0) {
    const deployer = deriveDeployerAddress();
    if (!deployer) {
      console.warn(`${LOG} No ADMIN_ADDRESSES and no DEPLOYER_PRIVATE_KEY — ADMIN auto-seed skipped`);
      return [];
    }
    console.warn(`${LOG} ADMIN_ADDRESSES is empty — seeding the deployer address as ADMIN. ` +
      'Set ADMIN_ADDRESSES to a separate admin wallet; do not log into the browser with the deployer key.');
    admins = [normalizeAddress(deployer)];
  }
  let changed = false;
  for (const a of admins) {
    if (roleStore[a] !== 'ADMIN') {
      roleStore[a] = 'ADMIN';
      changed = true;
      console.log(`${LOG} Seeded ${a.slice(0, 10)}… as ADMIN`);
    }
  }
  if (changed) saveStore();
  return admins;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Role for an address. Returns 'CITIZEN' if unassigned or not a 0x address. */
export function getRole(address) {
  const key = normalizeAddress(address);
  if (!key) return DEFAULT_ROLE;
  return roleStore[key] || DEFAULT_ROLE;
}

/** Assign a role to an address. Throws on an invalid role or address. */
export function setRole(address, role) {
  if (!VALID_ROLES.includes(role)) {
    throw new Error(`Invalid role: "${role}". Must be one of: ${VALID_ROLES.join(', ')}`);
  }
  const key = normalizeAddress(address);
  if (!key) throw new Error('INVALID_WALLET');
  roleStore[key] = role;
  saveStore();
  console.log(`${LOG} Assigned role ${role} to ${key.slice(0, 10)}…`);
}

/** All role assignments (lowercase 0x address → role). */
export function getAllRoles() {
  return { ...roleStore };
}

/** Re-read roles.json and re-seed admins (used by tests and the migration). */
export function reloadRoles() {
  loadStore();
  return seedAdmins();
}

// ─── Init ────────────────────────────────────────────────────────────────────

loadStore();
seedAdmins();
