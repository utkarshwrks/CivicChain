import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  BarChart3, 
  TrendingUp, 
  MapPin, 
  Award, 
  Lightbulb, 
  ShieldAlert, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Loader2, 
  Zap, 
  TrendingDown,
  CalendarDays
} from 'lucide-react';
import { api } from '../utils/api.js';

const CATEGORY_COLORS = {
  ROAD_DAMAGE:     '#f97316',
  FLOOD:           '#3b82f6',
  FIRE:            '#ef4444',
  STREETLIGHT:     '#eab308',
  GARBAGE:         '#84cc16',
  WATER_LEAK:      '#06b6d4',
  UNSAFE_BUILDING: '#a855f7',
  OTHER:           '#6b7280',
};

const SEVERITY_COLORS = {
  LOW:    '#3b82f6',
  MEDIUM: '#f59e0b',
  HIGH:   '#ef4444',
};

export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // States for Phase 12 APIs
  const [overview, setOverview] = useState(null);
  const [categories, setCategories] = useState({});
  const [severity, setSeverity] = useState({});
  const [topReporters, setTopReporters] = useState([]);
  const [hotspots, setHotspots] = useState([]);
  const [trends, setTrends] = useState(null);
  const [insights, setInsights] = useState([]);

  async function loadData(silent = false) {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    
    try {
      const [
        oRes, 
        cRes, 
        sRes, 
        trRes, 
        hRes, 
        tRes, 
        iRes
      ] = await Promise.allSettled([
        api.analyticsOverview(),
        api.analyticsCategories(),
        api.analyticsSeverity(),
        api.analyticsTopReporters(),
        api.analyticsHotspots(),
        api.analyticsTrends(),
        api.analyticsInsights(),
      ]);

      if (oRes.status === 'fulfilled') setOverview(oRes.value);
      if (cRes.status === 'fulfilled') setCategories(cRes.value || {});
      if (sRes.status === 'fulfilled') setSeverity(sRes.value || {});
      if (trRes.status === 'fulfilled') setTopReporters(trRes.value || []);
      if (hRes.status === 'fulfilled') setHotspots(hRes.value || []);
      if (tRes.status === 'fulfilled') setTrends(tRes.value);
      if (iRes.status === 'fulfilled') setInsights(iRes.value?.insights || []);
    } catch (e) {
      console.error('Failed to load analytics data', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="center-loader">
        <Loader2 size={32} className="spin" />
        <p>Analyzing civic data and processing insights…</p>
      </div>
    );
  }

  // Calculate percentages/max values for scaling bar charts
  const totalReportsCount = overview?.totalReports || 0;
  const maxCategoryCount = Math.max(...Object.values(categories), 1);
  const maxSeverityCount = Math.max(...Object.values(severity), 1);
  const maxHotspotCount = Math.max(...hotspots.map(h => h.reports), 1);

  return (
    <div className="page analytics-page">
      {/* Header */}
      <div className="explorer-header">
        <div>
          <h2>Civic Intelligence Dashboard</h2>
          <p className="muted">Real-time analytical insights and platform key performance metrics.</p>
        </div>
        <button className="icon-btn" onClick={() => loadData(true)} disabled={refreshing}>
          <RefreshCw size={16} className={refreshing ? 'spin' : ''} />
        </button>
      </div>

      {/* Grid: Overview Cards */}
      {overview && (
        <div className="stats-grid-5">
          <motion.div 
            className="stat-card" 
            initial={{ opacity: 0, y: 15 }} 
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
          >
            <div className="sc-icon blue"><BarChart3 size={20} /></div>
            <div className="sc-info">
              <span className="sc-val">{overview.totalReports}</span>
              <span className="sc-label">Total Reports</span>
            </div>
            <div className="sc-glow blue" />
          </motion.div>

          <motion.div 
            className="stat-card" 
            initial={{ opacity: 0, y: 15 }} 
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <div className="sc-icon yellow"><AlertCircle size={20} /></div>
            <div className="sc-info">
              <span className="sc-val">{overview.openReports}</span>
              <span className="sc-label">Open Issues</span>
            </div>
            <div className="sc-glow yellow" />
          </motion.div>

          <motion.div 
            className="stat-card" 
            initial={{ opacity: 0, y: 15 }} 
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
          >
            <div className="sc-icon purple"><Zap size={20} /></div>
            <div className="sc-info">
              <span className="sc-val">{overview.verifiedReports}</span>
              <span className="sc-label">Verified Reports</span>
            </div>
            <div className="sc-glow purple" />
          </motion.div>

          <motion.div 
            className="stat-card" 
            initial={{ opacity: 0, y: 15 }} 
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <div className="sc-icon green"><CheckCircle2 size={20} /></div>
            <div className="sc-info">
              <span className="sc-val">{overview.resolvedReports}</span>
              <span className="sc-label">Resolved Issues</span>
            </div>
            <div className="sc-glow green" />
          </motion.div>

          <motion.div 
            className="stat-card" 
            initial={{ opacity: 0, y: 15 }} 
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
          >
            <div className="sc-icon cyan">
              {overview.resolutionRate >= 50 ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
            </div>
            <div className="sc-info">
              <span className="sc-val">{overview.resolutionRate}%</span>
              <span className="sc-label">Resolution Rate</span>
            </div>
            <div className="sc-glow cyan" />
          </motion.div>
        </div>
      )}

      {/* Grid: Insights Box */}
      {insights.length > 0 && (
        <motion.div 
          className="insights-container"
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
        >
          <div className="insights-header">
            <Lightbulb size={16} className="text-yellow" />
            <h3>Civic Intelligence Insights</h3>
          </div>
          <ul className="insights-list">
            {insights.map((ins, i) => (
              <li key={i} className="insight-item">
                <span className="insight-bullet" />
                <p>{ins}</p>
              </li>
            ))}
          </ul>
        </motion.div>
      )}

      {/* Grid: Charts (Categories vs Severity) */}
      <div className="analytics-split-grid">
        {/* Categories Chart */}
        <motion.div 
          className="dashboard-card"
          initial={{ opacity: 0, x: -15 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.35 }}
        >
          <div className="dc-header">
            <h3>Issues by Category</h3>
          </div>
          <div className="dc-body">
            {Object.keys(categories).length === 0 ? (
              <p className="muted text-center py-4">No category distribution data.</p>
            ) : (
              <div className="bar-chart-container">
                {Object.entries(categories).map(([cat, count]) => {
                  const color = CATEGORY_COLORS[cat] || CATEGORY_COLORS.OTHER;
                  const percent = Math.round((count / totalReportsCount) * 100) || 0;
                  return (
                    <div key={cat} className="bar-row">
                      <div className="bar-info">
                        <span className="bar-name">{cat.replace(/_/g, ' ')}</span>
                        <span className="bar-count">{count} ({percent}%)</span>
                      </div>
                      <div className="bar-track">
                        <motion.div 
                          className="bar-fill"
                          initial={{ width: 0 }}
                          animate={{ width: `${(count / maxCategoryCount) * 100}%` }}
                          transition={{ duration: 0.8, ease: 'easeOut' }}
                          style={{ backgroundColor: color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>

        {/* Severity Chart */}
        <motion.div 
          className="dashboard-card"
          initial={{ opacity: 0, x: 15 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
        >
          <div className="dc-header">
            <h3>Severity Distribution</h3>
          </div>
          <div className="dc-body">
            {Object.keys(severity).length === 0 ? (
              <p className="muted text-center py-4">No severity data available.</p>
            ) : (
              <div className="bar-chart-container">
                {['LOW', 'MEDIUM', 'HIGH'].map(sev => {
                  const count = severity[sev] || 0;
                  const color = SEVERITY_COLORS[sev] || '#6b7280';
                  const percent = Math.round((count / totalReportsCount) * 100) || 0;
                  return (
                    <div key={sev} className="bar-row">
                      <div className="bar-info">
                        <span className="bar-name">{sev} Severity</span>
                        <span className="bar-count">{count} ({percent}%)</span>
                      </div>
                      <div className="bar-track">
                        <motion.div 
                          className="bar-fill"
                          initial={{ width: 0 }}
                          animate={{ width: `${(count / maxSeverityCount) * 100}%` }}
                          transition={{ duration: 0.8, ease: 'easeOut' }}
                          style={{ backgroundColor: color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Grid: Bottom Split (Hotspots & Trends vs Leaderboard) */}
      <div className="analytics-split-grid bottom">
        {/* Hotspots & Trends */}
        <div className="vertical-stack">
          {/* Trends */}
          {trends && (
            <motion.div 
              className="dashboard-card compact"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45 }}
            >
              <div className="dc-header">
                <CalendarDays size={16} className="text-blue" />
                <h3>Submission Trends</h3>
              </div>
              <div className="trends-grid">
                <div className="trend-box">
                  <span className="tb-label">Today</span>
                  <span className="tb-val">{trends.today}</span>
                </div>
                <div className="trend-box">
                  <span className="tb-label">This Week</span>
                  <span className="tb-val">{trends.week}</span>
                </div>
                <div className="trend-box">
                  <span className="tb-label">This Month</span>
                  <span className="tb-val">{trends.month}</span>
                </div>
              </div>
            </motion.div>
          )}

          {/* Hotspots */}
          <motion.div 
            className="dashboard-card"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <div className="dc-header">
              <MapPin size={16} className="text-red" />
              <h3>Civic Hotspots</h3>
            </div>
            <div className="dc-body">
              {hotspots.length === 0 ? (
                <p className="muted text-center py-4">No hotspot data found.</p>
              ) : (
                <div className="hotspot-list">
                  {hotspots.map((h, i) => (
                    <div key={i} className="hotspot-row">
                      <div className="hs-rank">#{i + 1}</div>
                      <div className="hs-loc">
                        <span>{h.location}</span>
                      </div>
                      <div className="hs-bar-wrap">
                        <div className="hs-bar-track">
                          <motion.div 
                            className="hs-bar-fill" 
                            initial={{ width: 0 }}
                            animate={{ width: `${(h.reports / maxHotspotCount) * 100}%` }}
                            transition={{ duration: 0.6 }}
                          />
                        </div>
                        <span className="hs-count">{h.reports} reports</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </div>

        {/* Top Contributors Leaderboard */}
        <motion.div 
          className="dashboard-card"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55 }}
        >
          <div className="dc-header">
            <Award size={16} className="text-purple" />
            <h3>Top Contributors Leaderboard</h3>
          </div>
          <div className="dc-body">
            {topReporters.length === 0 ? (
              <p className="muted text-center py-4">No contributors registered yet.</p>
            ) : (
              <div className="analytics-leaderboard">
                <div className="alb-header-row">
                  <span>Rank</span>
                  <span>Citizen Address</span>
                  <span className="text-right">Reports</span>
                  <span className="text-right">Reputation</span>
                  <span className="text-right">Points</span>
                </div>
                <div className="alb-body">
                  {topReporters.map((rep, i) => (
                    <div key={rep.address} className="alb-row">
                      <span className="alb-rank">#{i + 1}</span>
                      <code className="alb-addr" title={rep.address}>
                        {rep.address.slice(0, 8)}…{rep.address.slice(-6)}
                      </code>
                      <span className="alb-val text-right">{rep.reports}</span>
                      <span className="alb-val reputation text-right">{rep.reputation}</span>
                      <span className="alb-val points text-right">{rep.points}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
