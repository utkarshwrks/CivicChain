/**
 * analytics.service.js — CivicChain Civic Analytics Engine  (Phase 12)
 *
 * Pure aggregation layer — no AI calls, no blockchain writes.
 * Transforms raw report data into civic intelligence.
 */


// ─── Time helpers ─────────────────────────────────────────────────────────────

const MS_DAY   = 24 * 60 * 60 * 1000;
const MS_WEEK  = 7 * MS_DAY;
const MS_MONTH = 30 * MS_DAY;

// ─── API 1: Overview Stats ────────────────────────────────────────────────────

/**
 * @param {Array} reports
 * @returns {{ totalReports, openReports, resolvedReports, verifiedReports, resolutionRate }}
 */
export function getOverview(reports) {
  const totalReports    = reports.length;
  const openReports     = reports.filter(r => r.status === 'OPEN').length;
  const resolvedReports = reports.filter(r => r.status === 'RESOLVED').length;
  const verifiedReports = reports.filter(r => r.status === 'VERIFIED').length;
  const resolutionRate  = totalReports > 0
    ? parseFloat(((resolvedReports / totalReports) * 100).toFixed(1))
    : 0;

  const inProgressReports = reports.filter(r => r.status === 'IN_PROGRESS').length;
  const nft = getNftAnalytics(reports);

  return {
    totalReports, openReports, resolvedReports, verifiedReports, inProgressReports, resolutionRate,
    totalNFTs: nft.totalNFTs, mintSuccessRate: nft.mintSuccessRate,
  };
}

// ─── API 2: Category Distribution ─────────────────────────────────────────────

/**
 * @param {Array} reports
 * @returns {Object}  e.g. { ROAD_DAMAGE: 40, FLOOD: 25, ... }
 */
export function getCategoryDistribution(reports) {
  const dist = {};
  for (const r of reports) {
    const cat = r.category || 'OTHER';
    dist[cat] = (dist[cat] || 0) + 1;
  }

  return dist;
}

// ─── API 3: Severity Analytics ────────────────────────────────────────────────

/**
 * @param {Array} reports
 * @returns {Object}  e.g. { LOW: 20, MEDIUM: 60, HIGH: 70 }
 */
export function getSeverityDistribution(reports) {
  const dist = {};
  for (const r of reports) {
    const sev = r.severity || 'MEDIUM';
    dist[sev] = (dist[sev] || 0) + 1;
  }

  return dist;
}

// ─── API 4: Top Reporters ─────────────────────────────────────────────────────

/**
 * @param {Array}  reports
 * @param {object} pointsMap      address → points (from reward store)
 * @param {object} reputationMap  address → score  (from reputation store)
 * @param {number} [limit=10]
 * @returns {Array<{ address, reports, points, reputation }>}
 */
export function getTopReporters(reports, pointsMap = {}, reputationMap = {}, limit = 10) {
  const counts = {};
  for (const r of reports) {
    if (r.reporter) {
      counts[r.reporter] = (counts[r.reporter] || 0) + 1;
    }
  }

  const top = Object.entries(counts)
    .map(([address, count]) => ({
      address,
      reports:    count,
      points:     pointsMap[address]     || 0,
      reputation: reputationMap[address] || 0,
    }))
    .sort((a, b) => b.reports - a.reports)
    .slice(0, limit);

  return top;
}

// ─── API 5: Civic Hotspots ────────────────────────────────────────────────────

/**
 * @param {Array}  reports
 * @param {number} [limit=10]
 * @returns {Array<{ location, reports }>}
 */
export function getHotspots(reports, limit = 10) {
  const counts = {};
  for (const r of reports) {
    const loc = locationLabel(r);
    counts[loc] = (counts[loc] || 0) + 1;
  }

  const hotspots = Object.entries(counts)
    .map(([location, count]) => ({ location, reports: count }))
    .sort((a, b) => b.reports - a.reports)
    .slice(0, limit);

  return hotspots;
}

/** Readable hotspot label: "<landmark> · <City>" or the city alone. */
export function locationLabel(r) {
  let loc = r.location;
  if (typeof loc === 'string') {
    try { loc = JSON.parse(loc); } catch { return loc.trim() || 'Unknown'; }
  }
  const address = loc?.address && loc.address !== 'Unknown location' ? String(loc.address).trim() : null;
  const cityCode = r.city || loc?.city || null;
  const city = r.cityName || (cityCode ? cityCode.charAt(0) + cityCode.slice(1).toLowerCase() : null);
  return [address, city].filter(Boolean).join(' · ') || 'Unknown';
}

// ─── API 6: Trend Analysis ────────────────────────────────────────────────────

/**
 * @param {Array} reports
 * @returns {{ today, week, month }}
 */
export function getTrends(reports) {
  const now = Date.now();

  const today = reports.filter(r => (now - r.createdAt) < MS_DAY).length;
  const week  = reports.filter(r => (now - r.createdAt) < MS_WEEK).length;
  const month = reports.filter(r => (now - r.createdAt) < MS_MONTH).length;

  return { today, week, month };
}

// ─── Bonus: AI Civic Insights (Rule Engine) ───────────────────────────────────

/**
 * Generate rule-based civic insights from report data.
 * No LLM needed — simple statistical observations.
 *
 * @param {Array} reports
 * @returns {{ insights: Array<string> }}
 */
export function generateInsights(reports) {
  const insights = [];

  if (reports.length === 0) {
    return { insights: ['No reports submitted yet.'] };
  }

  // ── Insight 1: Most reported category ──────────────────────────────────────
  const catDist = getCategoryDistribution(reports);
  const topCat  = Object.entries(catDist).sort((a, b) => b[1] - a[1])[0];
  if (topCat) {
    insights.push(`Most reported issue is ${topCat[0]} with ${topCat[1]} reports.`);
  }

  // ── Insight 2: Severity breakdown ──────────────────────────────────────────
  const sevDist   = getSeverityDistribution(reports);
  const highCount = sevDist['HIGH'] || 0;
  const highPct   = reports.length > 0
    ? Math.round((highCount / reports.length) * 100)
    : 0;
  if (highPct > 30) {
    insights.push(`${highPct}% of reports are HIGH severity — immediate attention needed.`);
  }

  // ── Insight 3: Weekly trend comparison ─────────────────────────────────────
  const now       = Date.now();
  const thisWeek  = reports.filter(r => (now - r.createdAt) < MS_WEEK).length;
  const lastWeek  = reports.filter(r => {
    const age = now - r.createdAt;
    return age >= MS_WEEK && age < 2 * MS_WEEK;
  }).length;

  if (lastWeek > 0 && thisWeek > lastWeek) {
    const increase = Math.round(((thisWeek - lastWeek) / lastWeek) * 100);
    insights.push(`Reports increased ${increase}% this week compared to last week.`);
  } else if (lastWeek > 0 && thisWeek < lastWeek) {
    const decrease = Math.round(((lastWeek - thisWeek) / lastWeek) * 100);
    insights.push(`Reports decreased ${decrease}% this week compared to last week.`);
  }

  // ── Insight 4: Hotspot alert ───────────────────────────────────────────────
  const hotspots = getHotspots(reports, 1);
  if (hotspots.length > 0 && hotspots[0].reports >= 3 && hotspots[0].location !== 'Unknown') {
    insights.push(`Hotspot alert: ${hotspots[0].location} has ${hotspots[0].reports} reports — requires priority action.`);
  }

  // ── Insight 5: Resolution rate ─────────────────────────────────────────────
  const overview = getOverview(reports);
  if (overview.resolutionRate < 30 && reports.length >= 5) {
    insights.push(`Resolution rate is only ${overview.resolutionRate}% — civic response needs improvement.`);
  }

  // Fallback
  if (insights.length === 0) {
    insights.push(`${reports.length} civic reports are being tracked across the system.`);
  }

  return { insights };
}

// ─── Civic Issue NFT metrics ──────────────────────────────────────────────────

/**
 * @returns {{ totalNFTs, byCategory, byCity, bySeverity, minted, pending, failed, legacy, mintSuccessRate }}
 * mintSuccessRate = minted / (minted + failed) × 100 (null when nothing was attempted)
 */
export function getNftAnalytics(reports) {
  const minted = reports.filter(r => r.nft?.status === 'NFT_MINTED');
  const pending = reports.filter(r => r.nft?.status === 'NFT_MINT_PENDING').length;
  const failed = reports.filter(r => r.nft?.status === 'NFT_MINT_FAILED').length;
  const legacy = reports.filter(r => !r.nft || r.nft.status === 'NOT_ELIGIBLE_LEGACY').length;
  const count = (key) => {
    const out = {};
    for (const r of minted) {
      const k = r[key] || 'UNKNOWN';
      out[k] = (out[k] || 0) + 1;
    }
    return out;
  };
  const attempted = minted.length + failed;
  return {
    totalNFTs: minted.length,
    byCategory: count('category'),
    byCity: count('city'),
    bySeverity: count('severity'),
    minted: minted.length,
    pending,
    failed,
    legacy,
    mintSuccessRate: attempted ? parseFloat(((minted.length / attempted) * 100).toFixed(1)) : null,
  };
}
