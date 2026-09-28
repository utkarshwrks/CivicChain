/**
 * redact.js — masks secrets before anything is logged or returned.
 *
 * Masks 64-hex strings (private keys, with or without 0x), JWT-looking tokens,
 * and API keys embedded in RPC / gateway URLs. Transaction hashes are 64-hex as
 * well and are masked too in logs, which is the safe default.
 */
const HEX64 = /\b(0x)?[0-9a-fA-F]{64}\b/g;
const JWT   = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
// https://host/v2/<key>, https://host/v3/<key>, ?apikey=..., ?key=...
const URL_KEY_PATH  = /(https?:\/\/[^\s/]+\/(?:v\d+|rpc)\/)([A-Za-z0-9_-]{16,})/gi;
const URL_KEY_QUERY = /([?&](?:api[-_]?key|key|token)=)([^&\s]+)/gi;

export function redact(value) {
  let s;
  if (typeof value === 'string') s = value;
  else if (value instanceof Error) s = value.message;
  else {
    try { s = JSON.stringify(value); } catch { s = String(value); }
  }
  if (!s) return s;
  return s
    .replace(HEX64, (_m, p) => `${p || ''}<redacted-64hex>`)
    .replace(JWT, '<redacted-jwt>')
    .replace(URL_KEY_PATH, '$1<redacted>')
    .replace(URL_KEY_QUERY, '$1<redacted>');
}

/** Also masks any exact secret values currently present in the environment. */
export function redactSecrets(value) {
  let s = redact(value);
  for (const name of ['DEPLOYER_PRIVATE_KEY', 'PINATA_JWT', 'GEMINI_API_KEY', 'JWT_SECRET', 'SEPOLIA_RPC_URL', 'ETHERSCAN_API_KEY']) {
    const secret = process.env[name];
    if (secret && secret.length >= 8 && typeof s === 'string') s = s.split(secret).join(`<${name}>`);
  }
  return s;
}
