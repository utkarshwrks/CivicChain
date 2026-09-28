/**
 * ipfs.service.js — CivicChain IPFS storage (Pinata)
 *
 *   uploadToIPFS(buffer, mimeType, filename, meta) → pinFileToIPFS (evidence image)
 *   uploadJSON(obj, { name, reportId })            → pinJSONToIPFS (NFT metadata)
 *
 * Auth: PINATA_JWT (backend only). Gateway: PINATA_GATEWAY
 * (default https://gateway.pinata.cloud/ipfs). 30 s timeout, one retry on
 * network errors / 5xx. Typed errors (err.code):
 *   IPFS_AUTH_FAILED  401/403 — check PINATA_JWT
 *   IPFS_QUOTA        429 / plan limit — free quota exhausted (never switches to a paid service)
 *   IPFS_FAILED       anything else
 */

import axios    from 'axios';
import FormData from 'form-data';
import { redactSecrets } from '../utils/redact.js';

const PIN_FILE_URL = 'https://api.pinata.cloud/pinning/pinFileToIPFS';
const PIN_JSON_URL = 'https://api.pinata.cloud/pinning/pinJSONToIPFS';
const PUBLIC_GATEWAY = 'https://ipfs.io/ipfs';
const TIMEOUT_MS = 30_000;

export class IpfsError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function getGateway() {
  return (process.env.PINATA_GATEWAY || 'https://gateway.pinata.cloud/ipfs').replace(/\/+$/, '');
}

function getJwt() {
  const jwt = (process.env.PINATA_JWT || '').trim();
  if (!jwt || jwt === 'paste_your_pinata_jwt_here') {
    throw new IpfsError('IPFS_AUTH_FAILED', 'PINATA_JWT is not configured on the server — add a free Pinata JWT to .env.');
  }
  return jwt;
}

function toIpfsError(e) {
  if (e instanceof IpfsError) return e;
  const status = e?.response?.status;
  const body = JSON.stringify(e?.response?.data || '').toLowerCase();
  if (status === 401 || status === 403) {
    return new IpfsError('IPFS_AUTH_FAILED', 'Pinata rejected the credentials — check PINATA_JWT.', status);
  }
  if (status === 429 || body.includes('quota') || body.includes('plan limit') || body.includes('limit reached')) {
    return new IpfsError('IPFS_QUOTA', 'The free Pinata quota is exhausted. No paid service is used — try again later or use another free key.', status);
  }
  return new IpfsError('IPFS_FAILED', `IPFS pinning failed${status ? ` (HTTP ${status})` : ''}.`, status);
}

function retryable(e) {
  const status = e?.response?.status;
  return !status || status >= 500;
}

async function postWithRetry(url, data, headers) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await axios.post(url, data, { headers, timeout: TIMEOUT_MS, maxBodyLength: Infinity });
    } catch (e) {
      lastErr = e;
      if (attempt === 0 && retryable(e) && !(e?.response?.status === 401 || e?.response?.status === 403)) {
        await new Promise((r) => setTimeout(r, 750));
        continue;
      }
      break;
    }
  }
  console.error('[IPFS] pin failed:', redactSecrets(lastErr?.message || 'unknown'));
  throw toIpfsError(lastErr);
}

/** Pinata keyvalues must be strings/numbers; keep them short and non-personal. */
function keyvalues(meta) {
  const out = { app: 'civicchain' };
  for (const [k, v] of Object.entries(meta || {})) {
    if (v === undefined || v === null) continue;
    out[k] = typeof v === 'number' ? v : String(v).slice(0, 250);
  }
  return out;
}

function result(cid) {
  const gateway = getGateway();
  return {
    cid,
    ipfsUri:    `ipfs://${cid}`,
    ipfsUrl:    `ipfs://${cid}`,
    gatewayUrl: `${gateway}/${cid}`,
    publicUrl:  `${PUBLIC_GATEWAY}/${cid}`,
  };
}

/**
 * Pin an image buffer.
 * @param {object} [meta] Pinata keyvalues, e.g. { reportId, sha256 }
 * @returns {Promise<{ cid, ipfsUri, ipfsUrl, gatewayUrl, publicUrl }>}
 */
export async function uploadToIPFS(buffer, mimeType, filename, meta = {}) {
  const jwt = getJwt();
  const form = new FormData();
  form.append('file', buffer, { filename: filename || 'evidence', contentType: mimeType });
  form.append('pinataMetadata', JSON.stringify({ name: meta.reportId ? `civicchain-${meta.reportId}-evidence` : (filename || 'civicchain-evidence'), keyvalues: keyvalues(meta) }));
  form.append('pinataOptions', JSON.stringify({ cidVersion: 1 }));

  const res = await postWithRetry(PIN_FILE_URL, form, { Authorization: `Bearer ${jwt}`, ...form.getHeaders() });
  const cid = res.data?.IpfsHash;
  if (!cid) throw new IpfsError('IPFS_FAILED', 'Pinata returned no CID for the image.');
  return result(cid);
}

/**
 * Pin a JSON document (NFT metadata).
 * @returns {Promise<{ cid, ipfsUri, ipfsUrl, gatewayUrl, publicUrl }>}
 */
export async function uploadJSON(obj, { name, reportId } = {}) {
  const jwt = getJwt();
  if (!obj || typeof obj !== 'object') throw new IpfsError('IPFS_FAILED', 'uploadJSON expects an object.');
  const body = {
    pinataContent: obj,
    pinataMetadata: { name: name || (reportId ? `civicchain-${reportId}-metadata` : 'civicchain-metadata'), keyvalues: keyvalues({ reportId, kind: 'nft-metadata' }) },
    pinataOptions: { cidVersion: 1 },
  };
  const res = await postWithRetry(PIN_JSON_URL, body, { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' });
  const cid = res.data?.IpfsHash;
  if (!cid) throw new IpfsError('IPFS_FAILED', 'Pinata returned no CID for the metadata.');
  return result(cid);
}
