// Local stand-in for Pinata (rehearsal only): stores files in HARNESS_IPFS_DIR,
// served by run-local.mjs at PINATA_GATEWAY.
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
export class IpfsError extends Error { constructor(code, message) { super(message); this.code = code; } }
export const getGateway = () => process.env.PINATA_GATEWAY;
const cidOf = (buf) => `bafkrei${crypto.createHash('sha256').update(buf).digest('hex').slice(0, 52)}`;
function put(buf) {
  const cid = cidOf(buf);
  fs.writeFileSync(path.join(process.env.HARNESS_IPFS_DIR, cid), buf);
  return { cid, ipfsUri: `ipfs://${cid}`, ipfsUrl: `ipfs://${cid}`, gatewayUrl: `${getGateway()}/${cid}`, publicUrl: `${getGateway()}/${cid}` };
}
export async function uploadToIPFS(buffer) { return put(buffer); }
export async function uploadJSON(obj) { return put(Buffer.from(JSON.stringify(obj, null, 2))); }
