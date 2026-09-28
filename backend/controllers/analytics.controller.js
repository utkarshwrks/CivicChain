/**
 * analytics.controller.js — CivicChain analytics (reads the report store directly)
 *
 * GET /api/analytics/overview | categories | severity | top-reporters | hotspots | trends | insights | nfts
 */
import {
  getOverview, getCategoryDistribution, getSeverityDistribution, getTopReporters,
  getHotspots, getTrends, generateInsights, getNftAnalytics,
} from '../services/analytics.service.js';
import { getReports } from '../services/reportCache.js';
import { enrichReports } from '../services/assignment.service.js';
import { getPoints } from '../services/reward.service.js';
import { getReputation } from '../services/reputation.service.js';
import { isValidAddress } from '../utils/address.js';

const allReports = () => enrichReports(getReports());

function handler(fn) {
  return async (_req, res) => {
    try {
      return res.json(await fn(allReports()));
    } catch (e) {
      console.error('[ANALYTICS] error:', e.message);
      return res.status(500).json({ error: 'Analytics are temporarily unavailable.' });
    }
  };
}

export const overviewController   = handler((r) => getOverview(r));
export const categoriesController = handler((r) => getCategoryDistribution(r));
export const severityController   = handler((r) => getSeverityDistribution(r));
export const hotspotsController   = handler((r) => getHotspots(r));
export const trendsController     = handler((r) => getTrends(r));
export const insightsController   = handler((r) => generateInsights(r));
export const nftsController       = handler((r) => getNftAnalytics(r));

export const topReportersController = handler(async (all) => {
  // Legacy (pre-Ethereum) reporter ids cannot sign in any more — history only.
  const reports = all.filter((r) => isValidAddress(r.reporter));
  const addresses = [...new Set(reports.map((r) => r.reporter).filter(Boolean))];
  const pointsMap = {};
  const reputationMap = {};
  for (const a of addresses) {
    pointsMap[a] = (await getPoints(a)).points;
    reputationMap[a] = (await getReputation(a)).score;
  }
  return getTopReporters(reports, pointsMap, reputationMap);
});
