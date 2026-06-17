import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Clock, CheckCircle2, AlertCircle, Loader2, RefreshCw, TrendingUp, Shield, Play, CheckSquare } from 'lucide-react';
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

const STATUS_CONFIG = {
  OPEN:        { icon: <AlertCircle size={14} />,  color: '#f59e0b', label: 'OPEN' },
  VERIFIED:    { icon: <Shield size={14} />,       color: '#3b82f6', label: 'VERIFIED' },
  IN_PROGRESS: { icon: <Play size={14} />,         color: '#a855f7', label: 'IN PROGRESS' },
  RESOLVED:    { icon: <CheckCircle2 size={14} />, color: '#22c55e', label: 'RESOLVED' },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.OPEN;
  return (
    <span className="status-badge" style={{ background: cfg.color + '18', color: cfg.color, borderColor: cfg.color + '44' }}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

function WorkflowActions({ report, onAction }) {
  const [loading, setLoading] = useState(null);
  const [msg, setMsg]         = useState(null);
  const status = report.status || 'OPEN';
  const id     = report.id || report.txId;

  async function act(action, label) {
    setLoading(label);
    setMsg(null);
    try {
      let result;
      if (action === 'verify')  result = await api.workflowVerify(id, `Verified via dashboard`);
      if (action === 'start')   result = await api.workflowStart(id, `Work started via dashboard`);
      if (action === 'resolve') result = await api.workflowResolve(id, `Resolved via dashboard`);
      setMsg({ type: 'success', text: `→ ${result.newStatus}` });
      onAction?.(id, result.newStatus);
    } catch (e) {
      setMsg({ type: 'error', text: e.message?.slice(0, 60) || 'Failed' });
    } finally {
      setLoading(null);
    }
  }

  const actions = [];
  if (status === 'OPEN')        actions.push({ key: 'verify',  label: 'Verify',  icon: <Shield size={12} /> });
  if (status === 'VERIFIED')    actions.push({ key: 'start',   label: 'Start',   icon: <Play size={12} /> });
  if (status === 'IN_PROGRESS') actions.push({ key: 'resolve', label: 'Resolve', icon: <CheckSquare size={12} /> });

  if (actions.length === 0 && !msg) return null;

  return (
    <div className="wf-actions">
      {actions.map(a => (
        <button key={a.key} className="wf-btn" onClick={() => act(a.key, a.label)} disabled={!!loading}>
          {loading === a.label ? <Loader2 size={12} className="spin" /> : a.icon}
          {a.label}
        </button>
      ))}
      <AnimatePresence>
        {msg && (
          <motion.span className={`wf-msg ${msg.type}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {msg.text}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

function ReportCard({ report, index, onStatusChange }) {
  const color = CATEGORY_COLORS[report.category] || CATEGORY_COLORS.OTHER;
  const [status, setStatus] = useState(report.status || 'OPEN');
  const ago = ts => {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s/60)}m ago`;
    if (s < 86400) return `${Math.floor(s/3600)}h ago`;
    return `${Math.floor(s/86400)}d ago`;
  };

  function handleAction(id, newStatus) {
    setStatus(newStatus);
    onStatusChange?.(id, newStatus);
  }

  return (
    <motion.div
      className="report-card"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      style={{ '--accent': color }}
    >
      <div className="rc-top">
        <span className="rc-category" style={{ background: color + '22', color }}>
          {report.category?.replace(/_/g, ' ')}
        </span>
        <StatusBadge status={status} />
      </div>
      <p className="rc-desc">{report.description || 'AI-detected civic issue'}</p>
      {report.severity && (
        <span className={`rc-severity sev-${report.severity?.toLowerCase()}`}>
          {report.severity}
        </span>
      )}
      <div className="rc-meta">
        <span><MapPin size={11} /> {report.location || 'Unknown'}</span>
        <span><Clock size={11} /> {ago(report.createdAt)}</span>
        <span className="rc-addr">{report.reporter?.slice(0,8)}…</span>
      </div>
      <WorkflowActions report={{ ...report, status }} onAction={handleAction} />
      <div className="rc-bar" style={{ background: color }} />
    </motion.div>
  );
}

export default function FeedPage() {
  const [reports, setReports]   = useState([]);
  const [overview, setOverview] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState('ALL');
  const [refreshing, setRefreshing] = useState(false);

  async function load(silent = false) {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [r, o] = await Promise.allSettled([api.reports(), api.analyticsOverview()]);
      if (r.status === 'fulfilled') setReports(r.value.reports || []);
      if (o.status === 'fulfilled') setOverview(o.value);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const id = setInterval(() => load(true), 15_000);
    return () => clearInterval(id);
  }, []);

  const filtered = filter === 'ALL' ? reports : reports.filter(r => r.category === filter);
  const categories = ['ALL', ...Object.keys(CATEGORY_COLORS)];

  return (
    <div className="page">
      {/* Analytics overview bar */}
      {overview && (
        <motion.div className="stats-row" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          {[
            ['Total',    overview.totalReports,    '#3b82f6'],
            ['Open',     overview.openReports,     '#f59e0b'],
            ['Verified', overview.verifiedReports,  '#a855f7'],
            ['Resolved', overview.resolvedReports,  '#22c55e'],
            ['Rate',     overview.resolutionRate + '%', '#06b6d4'],
          ].map(([label, val, clr]) => (
            <div key={label} className="stat-pill">
              <span className="stat-val" style={{ color: clr }}>{val ?? '—'}</span>
              <span className="stat-label">{label}</span>
            </div>
          ))}
          <button className="icon-btn ml-auto" onClick={() => load(true)} disabled={refreshing}>
            <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
          </button>
        </motion.div>
      )}

      {/* Filter chips */}
      <div className="filter-row">
        {categories.map(c => (
          <button
            key={c}
            className={`filter-chip ${filter === c ? 'active' : ''}`}
            onClick={() => setFilter(c)}
            style={filter === c && c !== 'ALL' ? { background: CATEGORY_COLORS[c] + '22', color: CATEGORY_COLORS[c], borderColor: CATEGORY_COLORS[c] + '55' } : {}}
          >
            {c.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      {/* Feed */}
      {loading ? (
        <div className="center-loader">
          <Loader2 size={28} className="spin" />
          <p>Loading reports…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <TrendingUp size={40} />
          <p>No reports yet. Be the first to submit one.</p>
        </div>
      ) : (
        <div className="report-grid">
          <AnimatePresence>
            {filtered.map((r, i) => (
              <ReportCard key={r.id || i} report={r} index={i} onStatusChange={() => load(true)} />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}