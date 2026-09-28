/**
 * nftMetadata.service.js — Civic Issue NFT metadata (schema civicchain-nft-v1)
 *
 * Rules:
 *   • Named by REPORT ID — the token id is only known after the mint and the
 *     pinned metadata is immutable, so the next token id is never predicted.
 *   • "Status at Mint" (always OPEN), never a live status.
 *   • No reporter address (ownership is on-chain), no GPS, no free-text landmark.
 *   • image → ipfs://<imageCid>; the tokenURI is ipfs://<metadataCid>.
 */

import { SEPOLIA_CHAIN_ID } from '../config/ethereum.config.js';

const CID_RE = /^[A-Za-z0-9]{20,}$/;
const HEX64  = /^[0-9a-f]{64}$/;

export class MetadataError extends Error {
  constructor(message) {
    super(message);
    this.code = 'METADATA_INVALID';
  }
}

/**
 * @param {object} p
 * @param {string} p.reportId
 * @param {{ category: string, severity: string, confidence: number }} p.analysis
 * @param {string} p.city          display name, e.g. "Jabalpur"
 * @param {string} p.department    e.g. "ROAD_DEPARTMENT"
 * @param {number|string|Date} p.submittedAt
 * @param {string} p.imageCid
 * @param {string} p.imageSha256   hex
 */
export function buildCivicIssueMetadata({ reportId, analysis, city, department, submittedAt, imageCid, imageSha256 }) {
  if (!reportId || typeof reportId !== 'string') throw new MetadataError('reportId is required');
  if (!analysis?.category || !analysis?.severity) throw new MetadataError('analysis.category and analysis.severity are required');
  if (!city) throw new MetadataError('city is required');
  if (!department) throw new MetadataError('department is required');
  if (!imageCid || !CID_RE.test(imageCid)) throw new MetadataError('imageCid is invalid');
  if (!imageSha256 || !HEX64.test(String(imageSha256).toLowerCase())) throw new MetadataError('imageSha256 must be a 64-hex SHA-256');

  const confidence = Math.max(0, Math.min(100, Math.round(Number(analysis.confidence) || 0)));
  const ts = submittedAt instanceof Date ? submittedAt.getTime() : Number(new Date(submittedAt).getTime() || submittedAt);
  if (!Number.isFinite(ts)) throw new MetadataError('submittedAt is invalid');
  const submittedUnix = Math.floor(ts / 1000);

  const metadata = {
    name: `CivicChain Civic Issue ${reportId}`,
    description: `Verified civic issue reported through CivicChain. Category ${analysis.category}, severity ${analysis.severity}, ${city}. Ethereum Sepolia testnet asset with no monetary value.`,
    image: `ipfs://${imageCid}`,
  };

  const publicUrl = (process.env.FRONTEND_PUBLIC_URL || '').trim().replace(/\/+$/, '');
  if (publicUrl) metadata.external_url = `${publicUrl}/?report=${encodeURIComponent(reportId)}`;

  metadata.attributes = [
    { trait_type: 'Category',      value: analysis.category },
    { trait_type: 'Severity',      value: analysis.severity },
    { trait_type: 'AI Confidence', value: confidence },
    { trait_type: 'City',          value: city },
    { trait_type: 'Department',    value: department },
    { trait_type: 'Status at Mint', value: 'OPEN' },
    { trait_type: 'Report ID',     value: reportId },
    { display_type: 'date', trait_type: 'Submitted', value: submittedUnix },
  ];

  metadata.properties = {
    schema: 'civicchain-nft-v1',
    network: 'ethereum-sepolia',
    chainId: SEPOLIA_CHAIN_ID,
    imageSha256: String(imageSha256).toLowerCase(),
  };

  return metadata;
}
