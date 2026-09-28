import { getApiBase } from './platform.js';

// ── Module-level auth token ──────────────────────────────────────────────────
// Set by useWallet after successful login. All requests automatically include it.
let _authToken = null;
export const setAuthToken   = (t) => { _authToken = t; };
export const clearAuthToken = ()  => { _authToken = null; };

/** Error carrying the HTTP status and the parsed JSON body. */
export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data   = data;
  }
}

// ── Core fetch wrapper ───────────────────────────────────────────────────────
async function req(path, opts = {}) {
  const headers = {};
  if (!(opts.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (_authToken) headers['Authorization'] = `Bearer ${_authToken}`;

  let res;
  try {
    res = await fetch(getApiBase() + path, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
  } catch {
    throw new ApiError('Cannot reach the CivicChain server. Check your connection.', 0, null);
  }
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok && !opts.allowStatus?.includes(res.status)) {
    throw new ApiError(data?.message || data?.error || data?.reason || `HTTP ${res.status}`, res.status, data);
  }
  return data;
}

const json = (body) => JSON.stringify(body);
const qs   = (params) => {
  const clean = Object.fromEntries(Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  const s = new URLSearchParams(clean).toString();
  return s ? `?${s}` : '';
};

// Report pipeline statuses that come back with a 4xx/5xx but a useful body.
const REPORT_STATUSES = [201, 202, 400, 409, 422, 502, 503];

export const api = {
  // ── Core / chain ─────────────────────────────────────────────────────────
  health:      ()        => req('/health'),
  stats:       ()        => req('/api/stats'),
  chainStatus: ()        => req('/api/chain/status'),
  reports:     (params)  => req('/api/reports' + qs(params)),
  report:      (id)      => req(`/api/reports/${encodeURIComponent(id)}`),
  aiVerify:    (body)    => req('/api/ai/verify', { method: 'POST', body: json(body) }),

  // ── Civic Issue NFTs ─────────────────────────────────────────────────────
  nftContract:    ()            => req('/api/nft/contract'),
  nfts:           (params)      => req('/api/nfts' + qs(params)),
  nft:            (tokenId)     => req(`/api/nft/${encodeURIComponent(tokenId)}`),
  nftsByOwner:    (address)     => req(`/api/nft/owner/${address}`),
  reportNft:      (reportId)    => req(`/api/report/${encodeURIComponent(reportId)}/nft`),
  retryMint:      (reportId)    => req(`/api/nft/retry/${encodeURIComponent(reportId)}`, { method: 'POST', body: json({}), allowStatus: [202, 409] }),
  retryFailed:    ()            => req('/api/nft/retry-failed', { method: 'POST', body: json({}) }),
  events:         ()            => req('/api/events'),

  // ── Report submission (full pipeline → Civic Issue NFT) ─────────────────
  submitReport: (file, city, address) => {
    const formData = new FormData();
    formData.append('image', file);
    if (city)    formData.append('city', city);
    if (address) formData.append('address', address);
    return req('/api/report/create', { method: 'POST', body: formData, allowStatus: REPORT_STATUSES });
  },

  // ── Profile / gamification (off-chain) ───────────────────────────────────
  profilePoints:     (addr) => req(`/api/profile/${addr}/points`),
  profileReputation: (addr) => req(`/api/profile/${addr}/reputation`),
  profileBadges:     (addr) => req(`/api/profile/${addr}/badges`),
  profileNfts:       (addr) => req(`/api/profile/${addr}/nfts`),
  leaderboard:       ()     => req('/api/leaderboard'),

  // ── Analytics ────────────────────────────────────────────────────────────
  analyticsOverview:     () => req('/api/analytics/overview'),
  analyticsCategories:   () => req('/api/analytics/categories'),
  analyticsSeverity:     () => req('/api/analytics/severity'),
  analyticsTopReporters: () => req('/api/analytics/top-reporters'),
  analyticsHotspots:     () => req('/api/analytics/hotspots'),
  analyticsTrends:       () => req('/api/analytics/trends'),
  analyticsInsights:     () => req('/api/analytics/insights'),
  analyticsNfts:         () => req('/api/analytics/nfts'),

  // ── Workflow (JWT) ───────────────────────────────────────────────────────
  workflowVerify:  (id, note = '') => req(`/api/workflow/${encodeURIComponent(id)}/verify`,  { method: 'POST', body: json({ note }) }),
  workflowStart:   (id, note = '') => req(`/api/workflow/${encodeURIComponent(id)}/start`,   { method: 'POST', body: json({ note }) }),
  workflowResolve: (id, note = '') => req(`/api/workflow/${encodeURIComponent(id)}/resolve`, { method: 'POST', body: json({ note }) }),

  // ── Auth ─────────────────────────────────────────────────────────────────
  authNonce: (address) => req(`/api/auth/nonce/${address}`),
  authLogin: (body)    => req('/api/auth/login', { method: 'POST', body: json(body) }),
  authMe:    ()        => req('/api/auth/me'),

  // ── RBAC (JWT) ───────────────────────────────────────────────────────────
  rbacRole:   (address) => req(`/api/rbac/role/${address}`),
  rbacRoles:  ()        => req('/api/rbac/roles'),
  rbacAssign: (body)    => req('/api/rbac/assign', { method: 'POST', body: json(body) }),

  // ── Departments / assignments / cities ───────────────────────────────────
  departments:    ()     => req('/api/departments'),
  deptAnalytics:  ()     => req('/api/departments/analytics'),
  myDepartment:   ()     => req('/api/departments/me'),
  myDeptReports:  ()     => req('/api/departments/me/reports'),
  deptUsers:      ()     => req('/api/departments/users'),
  assignUserDept: (body) => req('/api/departments/assign-user', { method: 'POST', body: json(body) }),
  assignments:    ()     => req('/api/assignments'),
  assignment:     (id)   => req(`/api/assignments/${encodeURIComponent(id)}`),
  manualAssign:   (body) => req('/api/assignments/assign', { method: 'POST', body: json(body) }),
  cities:         ()     => req('/api/cities'),
};
