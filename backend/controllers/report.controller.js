/**
 * report.controller.js — CivicChain report endpoints
 *
 * POST /api/report/process          AI + IPFS preview (no NFT, nothing stored)
 * POST /api/report/create   (JWT)   full pipeline → Civic Issue NFT
 * GET  /api/report/:reportId/nft    current NFT status (frontend polling)
 *
 * The reporter is ALWAYS req.user.address from the JWT — never the request body.
 */

import { processReport, createFullReport, publicNft } from '../services/report.service.js';
import { isValidCity, getCityName } from '../services/jurisdiction.service.js';
import { getReportById } from '../services/reportCache.js';
import { getReportStatus } from '../services/workflow.service.js';
import { redact } from '../utils/redact.js';

export const MAX_LANDMARK = 200;
const REPORT_ID_RE = /^[A-Za-z0-9_-]{1,80}$/;

function readCityAndLandmark(req, res) {
  const city = String(req.body?.city || '').trim().toUpperCase();
  const landmark = String(req.body?.address ?? req.body?.landmark ?? '').trim();
  if (!city) {
    res.status(400).json({ error: 'city is required. Select a city from the list.', code: 'CITY_REQUIRED' });
    return null;
  }
  if (!isValidCity(city)) {
    res.status(400).json({ error: `Invalid city: "${city.slice(0, 40)}". Use one of the supported cities.`, code: 'INVALID_CITY' });
    return null;
  }
  if (landmark.length > MAX_LANDMARK) {
    res.status(400).json({ error: `Address / landmark must be at most ${MAX_LANDMARK} characters.`, code: 'LANDMARK_TOO_LONG' });
    return null;
  }
  return { city, landmark };
}

/** POST /api/report/process — AI + IPFS preview. */
export async function processReportController(req, res) {
  try {
    const { buffer, mimetype, originalname, size } = req.file;
    const { analysis, evidence, errors } = await processReport(buffer, mimetype, originalname);
    return res.status(200).json({
      success: true,
      filename: originalname,
      sizeKb: Math.round(size / 1024),
      analysis,
      evidence,
      ...(errors.ai || errors.ipfs ? { warnings: errors } : {}),
    });
  } catch (err) {
    const code = err.code || 'IPFS_FAILED';
    const status = code === 'IPFS_AUTH_FAILED' || code === 'IPFS_QUOTA' ? 503 : 502;
    return res.status(status).json({
      error: err.message || 'Report processing failed.',
      code,
      ...(err.analysis ? { partialAnalysis: err.analysis } : {}),
    });
  }
}

/** POST /api/report/create — full pipeline, reporter from the JWT. */
export async function createReportController(req, res) {
  const fields = readCityAndLandmark(req, res);
  if (!fields) return undefined;
  try {
    const { buffer, mimetype, originalname } = req.file;
    const { httpStatus, body } = await createFullReport(buffer, mimetype, originalname, {
      reporter: req.user.address,
      city: fields.city,
      landmark: fields.landmark,
    });
    return res.status(httpStatus).json(body);
  } catch (err) {
    console.error('[Report/Create] pipeline error:', redact(err.message));
    return res.status(500).json({ success: false, status: 'UNKNOWN', error: 'The report pipeline failed unexpectedly. Please try again.' });
  }
}

/** GET /api/report/:reportId/nft — NFT status for polling. */
export function reportNftController(req, res) {
  const { reportId } = req.params;
  if (!REPORT_ID_RE.test(reportId || '')) return res.status(400).json({ error: 'Invalid report id.' });
  const report = getReportById(reportId);
  if (!report) return res.status(404).json({ error: 'Report not found.' });
  return res.json({
    reportId: report.reportId,
    status: report.nft?.status || 'NOT_ELIGIBLE_LEGACY',
    nft: publicNft(report.nft),
    currentStatus: getReportStatus(report.reportId),
    evidence: report.evidence || null,
    city: report.city || null,
    cityName: report.cityName || getCityName(report.city) || null,
  });
}
