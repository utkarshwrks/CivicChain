/**
 * nft.controller.js — Civic Issue NFT API
 *
 * GET  /api/nft/contract           network, chain ID, contract, name, symbol, owner, minter, totalMinted, deployment
 * GET  /api/nfts                   newest first; page, pageSize ≤ 50, category, city, severity
 * GET  /api/nft/owner/:address     NFTs owned by an address (+ that address's pending/failed mints)
 * GET  /api/nft/:tokenId           one NFT + on-chain owner/tokenURI check (verifiedOnChain)
 * POST /api/nft/retry/:reportId    (JWT: reporter or ADMIN) idempotent mint retry
 * POST /api/nft/retry-failed       (ADMIN) retry every NFT_MINT_FAILED report
 */

import { ethereumService } from '../services/ethereum.service.js';
import { getReports, getReportById } from '../services/reportCache.js';
import { listTokens } from '../services/nftCache.js';
import { getCityName } from '../services/jurisdiction.service.js';
import { retryReport, retryAllFailed } from '../services/nftMint.service.js';
import { readDeployment } from '../config/ethereum.config.js';
import { isValidAddress, toChecksum, invalidWallet } from '../utils/address.js';
import { publicNft } from '../services/report.service.js';

const gateway = () => (process.env.PINATA_GATEWAY || 'https://gateway.pinata.cloud/ipfs').replace(/\/+$/, '');
const REPORT_ID_RE = /^[A-Za-z0-9_-]{1,80}$/;

function publicDeployment() {
  const d = readDeployment();
  if (!d) return null;
  const { network, chainId, contractName, contractAddress, deployer, owner, minter, transactionHash, blockNumber, deployedAt, explorerUrl } = d;
  return { network, chainId, contractName, contractAddress, deployer, owner, minter, transactionHash, blockNumber, deployedAt, explorerUrl };
}

/** Build the public view of a minted token joined with its report. */
function toItem(report, token = {}) {
  const nft = report?.nft || {};
  const contractAddress = nft.contractAddress || token.contractAddress || null;
  const tokenId = String(nft.tokenId ?? token.tokenId);
  const imageCid = nft.imageCid || report?.evidence?.imageCid || token.imageCid || null;
  const metadataCid = nft.metadataCid || report?.evidence?.metadataCid || token.metadataCid || null;
  const city = report?.city || token.city || null;
  return {
    tokenId,
    reportId: report?.reportId || token.reportId || null,
    owner: toChecksum(nft.recipient || token.recipient) || null,
    contractAddress,
    tokenURI: nft.tokenURI || token.tokenURI || null,
    metadataCid,
    imageCid,
    imageUrl: imageCid ? `${gateway()}/${imageCid}` : null,
    metadataUrl: metadataCid ? `${gateway()}/${metadataCid}` : null,
    transactionHash: nft.transactionHash || token.transactionHash || null,
    blockNumber: nft.blockNumber ?? token.blockNumber ?? null,
    mintedAt: nft.mintedAt || token.mintedAt || null,
    category: report?.category || token.category || null,
    severity: report?.severity || token.severity || null,
    confidence: report?.confidence ?? token.confidence ?? null,
    city,
    cityName: report?.cityName || getCityName(city) || null,
    department: report?.department || null,
    statusAtMint: 'OPEN',
    currentStatus: report?.status || null,
    explorerUrl: nft.explorerUrl || (token.transactionHash ? ethereumService.txUrl(token.transactionHash) : null),
    tokenExplorerUrl: nft.tokenExplorerUrl || (contractAddress ? ethereumService.tokenUrl(contractAddress, tokenId) : null),
  };
}

/** Every minted NFT known to the backend, newest first (reports + chain-synced cache). */
export async function getAllMinted() {
  const info = await ethereumService.getContractInfo().catch(() => ({}));
  const current = info?.contractAddress?.toLowerCase() || null;
  const reports = getReports().filter((r) => r.nft?.status === 'NFT_MINTED' && r.nft?.tokenId);
  const items = reports
    .filter((r) => !current || !r.nft.contractAddress || r.nft.contractAddress.toLowerCase() === current)
    .map((r) => toItem(r));
  if (current) {
    const seen = new Set(items.map((i) => i.tokenId));
    for (const t of listTokens(current)) {
      if (seen.has(String(t.tokenId))) continue;
      const report = t.reportId ? getReportById(t.reportId) : null;
      items.push(toItem(report, { ...t, contractAddress: info.contractAddress }));
    }
  }
  return items.sort((a, b) => Number(b.tokenId) - Number(a.tokenId));
}

export async function contractController(_req, res) {
  try {
    const info = await ethereumService.getContractInfo();
    return res.json({ ...info, deployment: publicDeployment() });
  } catch {
    return res.status(503).json({ error: 'CHAIN_UNAVAILABLE' });
  }
}

export async function listNftsController(req, res) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize, 10) || 12));
  const { category, city, severity } = req.query;
  for (const [k, v] of Object.entries({ category, city, severity })) {
    if (v !== undefined && !/^[A-Z_]{1,40}$/.test(String(v))) return res.status(400).json({ error: `Invalid ${k} filter.` });
  }
  let items = await getAllMinted();
  if (category) items = items.filter((i) => i.category === category);
  if (city)     items = items.filter((i) => i.city === city);
  if (severity) items = items.filter((i) => i.severity === severity);
  const total = items.length;
  return res.json({ nfts: items.slice((page - 1) * pageSize, page * pageSize), total, page, pageSize, pages: Math.ceil(total / pageSize) });
}

export async function ownerNftsData(address) {
  const lower = address.toLowerCase();
  const nfts = (await getAllMinted()).filter((i) => i.owner?.toLowerCase() === lower);
  const inFlight = getReports()
    .filter((r) => r.reporter?.toLowerCase() === lower && ['NFT_MINT_PENDING', 'NFT_MINT_FAILED'].includes(r.nft?.status))
    .map((r) => ({
      reportId: r.reportId, category: r.category, severity: r.severity, city: r.city, cityName: r.cityName || getCityName(r.city),
      createdAt: r.createdAt, currentStatus: r.status, imageUrl: r.evidence?.imageUrl || null, nft: publicNft(r.nft),
    }));
  return { address: toChecksum(address), total: nfts.length, nftCount: nfts.length, nfts, pending: inFlight };
}

export async function ownerController(req, res) {
  const { address } = req.params;
  if (!isValidAddress(address)) return invalidWallet(res);
  return res.json(await ownerNftsData(address));
}

export async function tokenController(req, res) {
  const { tokenId } = req.params;
  if (!/^[1-9][0-9]{0,15}$/.test(tokenId || '')) return res.status(400).json({ error: 'tokenId must be a positive integer.' });
  const item = (await getAllMinted()).find((i) => i.tokenId === tokenId);
  let onChain = null;
  let verifiedOnChain = false;
  try {
    onChain = await ethereumService.getOnChainToken(tokenId);
    verifiedOnChain = !!(onChain && item && onChain.owner?.toLowerCase() === item.owner?.toLowerCase() && onChain.tokenURI === item.tokenURI);
  } catch {
    onChain = null;
  }
  if (!item && !onChain) return res.status(404).json({ error: 'Token not found.' });
  const report = item?.reportId ? getReportById(item.reportId) : null;
  return res.json({
    ...(item || { tokenId, owner: onChain.owner, tokenURI: onChain.tokenURI }),
    onChain,
    verifiedOnChain,
    report: report ? {
      reportId: report.reportId, category: report.category, severity: report.severity, confidence: report.confidence,
      reason: report.reason || report.description, city: report.city, cityName: report.cityName, department: report.department,
      currentStatus: report.status, createdAt: report.createdAt, evidence: report.evidence,
    } : null,
  });
}

export async function retryController(req, res) {
  const { reportId } = req.params;
  if (!REPORT_ID_RE.test(reportId || '')) return res.status(400).json({ error: 'Invalid report id.' });
  const report = getReportById(reportId);
  if (!report) return res.status(404).json({ error: 'Report not found.' });
  const isAdmin = req.user.role === 'ADMIN';
  if (!isAdmin && report.reporter?.toLowerCase() !== req.user.address.toLowerCase()) {
    return res.status(403).json({ error: 'Only the reporter or an ADMIN can retry this mint.' });
  }
  const { outcome, nft } = await retryReport(reportId, { ignoreCap: isAdmin });
  const body = { reportId, outcome, status: nft?.status || null, nft: publicNft(nft) };
  if (outcome === 'NOT_ELIGIBLE') return res.status(409).json({ ...body, error: 'This report is not eligible for a Civic Issue NFT.' });
  if (outcome === 'BUSY') return res.status(409).json({ ...body, error: 'A mint for this report is already in progress.' });
  if (['ALREADY_MINTED', 'RECONCILED', 'MINTED'].includes(outcome)) return res.status(200).json(body);
  return res.status(202).json(body);
}

export async function retryFailedController(_req, res) {
  return res.json(await retryAllFailed());
}
