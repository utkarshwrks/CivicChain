const BASE = import.meta.env.VITE_API_URL || '';

async function req(path, opts = {}) {
  const res = await fetch(BASE + path, {
    headers: opts.body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
    ...opts,
  });
  const data = await res.json();
  if (!res.ok && !data.duplicate) throw new Error(data.error || data.reason || `HTTP ${res.status}`);
  return data;
}

export const api = {
  // ── Existing ─────────────────────────────────────────────────────────────
  health:      ()       => req('/health'),
  stats:       ()       => req('/api/stats'),
  nonce:       (addr)   => req(`/api/nonce/${addr}`),
  balance:     (addr)   => req(`/api/balance/${addr}`),
  reports:     (params) => req('/api/reports?' + new URLSearchParams(params || {})),
  report:      (id)     => req(`/api/reports/${id}`),
  blocks:      (n = 10) => req(`/api/blocks?count=${n}`),
  contracts:   ()       => req('/api/contracts'),
  aiVerify:    (body)   => req('/api/ai/verify',  { method: 'POST', body: JSON.stringify(body) }),
  broadcast:   (tx)     => req('/api/broadcast',  { method: 'POST', body: JSON.stringify(tx) }),

  // ── Phase 10 — Profile APIs ──────────────────────────────────────────────
  profilePoints:     (addr) => req(`/api/profile/${addr}/points`),
  profileReputation: (addr) => req(`/api/profile/${addr}/reputation`),
  profileBadges:     (addr) => req(`/api/profile/${addr}/badges`),

  // ── Phase 12 — Analytics APIs ────────────────────────────────────────────
  analyticsOverview:     () => req('/api/analytics/overview'),
  analyticsCategories:   () => req('/api/analytics/categories'),
  analyticsSeverity:     () => req('/api/analytics/severity'),
  analyticsTopReporters: () => req('/api/analytics/top-reporters'),
  analyticsHotspots:     () => req('/api/analytics/hotspots'),
  analyticsTrends:       () => req('/api/analytics/trends'),
  analyticsInsights:     () => req('/api/analytics/insights'),

  // ── Phase 13 — Workflow APIs ─────────────────────────────────────────────
  workflowVerify:  (id, note = '') => req(`/api/workflow/${id}/verify`,  { method: 'POST', body: JSON.stringify({ note }) }),
  workflowStart:   (id, note = '') => req(`/api/workflow/${id}/start`,   { method: 'POST', body: JSON.stringify({ note }) }),
  workflowResolve: (id, note = '') => req(`/api/workflow/${id}/resolve`, { method: 'POST', body: JSON.stringify({ note }) }),

  // ── Phase 14 — Image Upload (replaces wallet-based submit) ───────────────
  submitReport: (file) => {
    const formData = new FormData();
    formData.append('image', file);
    return req('/api/report/create', { method: 'POST', body: formData });
  },
};