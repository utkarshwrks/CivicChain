/**
 * format.js — display + explorer/IPFS link helpers.
 * Only public values: VITE_EXPLORER_BASE_URL and VITE_IPFS_GATEWAY.
 */
export const EXPLORER_BASE = (import.meta.env.VITE_EXPLORER_BASE_URL || 'https://sepolia.etherscan.io').replace(/\/+$/, '');
export const IPFS_GATEWAY  = (import.meta.env.VITE_IPFS_GATEWAY || 'https://gateway.pinata.cloud/ipfs').replace(/\/+$/, '');

export function shortAddress(addr, head = 6, tail = 4) {
  if (!addr || typeof addr !== 'string') return '—';
  if (addr.length <= head + tail + 1) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

export function shortHash(hash, head = 10, tail = 6) {
  return shortAddress(hash, head, tail);
}

/** ipfs://<cid>[/path] → <gateway>/<cid>[/path]; http(s) URLs pass through. */
export function ipfsToGateway(uri) {
  if (!uri || typeof uri !== 'string') return null;
  if (/^https?:\/\//i.test(uri)) return uri;
  const cid = uri.replace(/^ipfs:\/\//i, '').replace(/^ipfs\//i, '');
  return cid ? `${IPFS_GATEWAY}/${cid}` : null;
}

export const txUrl      = (hash) => (hash ? `${EXPLORER_BASE}/tx/${hash}` : null);
export const addressUrl = (addr) => (addr ? `${EXPLORER_BASE}/address/${addr}` : null);
export const nftUrl     = (contract, tokenId) => (contract && tokenId != null ? `${EXPLORER_BASE}/nft/${contract}/${tokenId}` : null);

export function formatDate(value) {
  if (value === null || value === undefined || value === '') return '—';
  const d = typeof value === 'number' ? new Date(value < 1e12 ? value * 1000 : value) : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function humanize(code) {
  if (!code) return '—';
  return String(code).replace(/_/g, ' ');
}

/** Location of a report as a readable string (location may be JSON or plain). */
export function formatLocation(report) {
  let loc = report?.location;
  if (typeof loc === 'string') {
    try { loc = JSON.parse(loc); } catch { return loc || report?.cityName || report?.city || 'Unknown'; }
  }
  const address = loc?.address && loc.address !== 'Unknown location' ? loc.address : null;
  const city = report?.cityName || loc?.city || report?.city || null;
  const cityPretty = city ? city.charAt(0) + city.slice(1).toLowerCase() : null;
  return [address, cityPretty].filter(Boolean).join(' · ') || 'Unknown';
}
