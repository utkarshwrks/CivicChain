/**
 * app.js — CivicChain Express application (exported for tests; index.js listens)
 *
 * Middleware order: helmet (CSP) → CORS allow-list → JSON parser → rate limits
 * → routers → 404 → central error handler (no stack traces or secrets).
 */
import express   from 'express';
import cors      from 'cors';
import rateLimit from 'express-rate-limit';
import helmet    from 'helmet';
import fs        from 'fs';
import path      from 'path';
import { fileURLToPath } from 'url';

import aiRouter         from './routes/ai.routes.js';
import ipfsRouter       from './routes/ipfs.routes.js';
import reportRouter     from './routes/report.routes.js';
import profileRouter    from './routes/profile.routes.js';
import analyticsRouter  from './routes/analytics.routes.js';
import workflowRouter   from './routes/workflow.routes.js';
import authRouter       from './routes/auth.routes.js';
import rbacRouter       from './routes/rbac.routes.js';
import departmentRouter from './routes/department.routes.js';
import assignmentRouter from './routes/assignment.routes.js';
import chainRouter      from './routes/chain.routes.js';
import nftRouter        from './routes/nft.routes.js';

import { getReports, getReportById } from './services/reportCache.js';
import { getPoints } from './services/reward.service.js';
import { getReputation } from './services/reputation.service.js';
import { ensureAssigned, enrichReports } from './services/assignment.service.js';
import { listCitiesController } from './controllers/department.controller.js';
import { listNftsController, contractController, getAllMinted } from './controllers/nft.controller.js';
import { ethereumService } from './services/ethereum.service.js';
import { getOverview, getNftAnalytics } from './services/analytics.service.js';
import { isValidAddress, invalidWallet, toChecksum } from './utils/address.js';
import { redactSecrets } from './utils/redact.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app       = express();
const isProd    = () => process.env.NODE_ENV === 'production';
const isTest    = () => process.env.NODE_ENV === 'test';

app.disable('x-powered-by');
app.set('trust proxy', 1); // behind Render / Railway / nginx

// ─── Security headers (CSP allows the IPFS gateways, Google Fonts, three.js CDN) ─
const ipfsHosts = ['https://gateway.pinata.cloud', 'https://*.mypinata.cloud', 'https://ipfs.io'];
try {
  const custom = new URL(process.env.PINATA_GATEWAY || '').origin;
  if (custom && !ipfsHosts.includes(custom)) ipfsHosts.push(custom);
} catch { /* default gateway */ }

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'default-src': ["'self'"],
      'script-src':  ["'self'", 'https://cdnjs.cloudflare.com'],
      'style-src':   ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      'font-src':    ["'self'", 'https://fonts.gstatic.com', 'data:'],
      'img-src':     ["'self'", 'data:', 'blob:', ...ipfsHosts],
      'connect-src': ["'self'", ...ipfsHosts],
      'frame-ancestors': ["'none'"],
      'object-src':  ["'none'"],
      'upgrade-insecure-requests': null,
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// ─── CORS allow-list ──────────────────────────────────────────────────────────
// CORS_ORIGINS (comma-separated) + the Android app WebView origins.
const APP_ORIGINS = ['https://localhost', 'capacitor://localhost', 'http://localhost'];
function allowedOrigins() {
  const list = (process.env.CORS_ORIGINS || 'http://localhost:5173').split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);
  return new Set([...list, ...APP_ORIGINS]);
}
app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);                  // same-origin, curl, server-to-server
    if (allowedOrigins().has(origin.replace(/\/+$/, ''))) return cb(null, true);
    return cb(null, false);                               // no CORS headers → browser blocks
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 600,
}));

app.use(express.json({ limit: '64kb' }));

// ─── Rate limits ──────────────────────────────────────────────────────────────
app.use('/api/', rateLimit({
  windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false,
  skip: isTest,
  message: { error: 'Rate limit exceeded.', code: 'RATE_LIMITED' },
}));
app.use('/api/auth/login', rateLimit({
  windowMs: 10 * 60_000, max: 20, standardHeaders: true, legacyHeaders: false,
  skip: isTest,
  message: { error: 'Too many login attempts. Try again in a few minutes.', code: 'RATE_LIMITED' },
}));

// ─── Routers ──────────────────────────────────────────────────────────────────
app.use('/api/ai',          aiRouter);          // POST /api/ai/analyze
app.use('/api/ipfs',        ipfsRouter);        // POST /api/ipfs/upload
app.use('/api/nft',         nftRouter);         // Civic Issue NFTs (before generic routes)
app.get('/api/nfts',        listNftsController);
app.use('/api/report',      reportRouter);      // /process, /create, /:reportId/nft
app.use('/api/profile',     profileRouter);
app.use('/api/analytics',   analyticsRouter);
app.use('/api/workflow',    workflowRouter);
app.use('/api/auth',        authRouter);
app.use('/api/rbac',        rbacRouter);
app.get('/api/cities',      listCitiesController);
app.use('/api/departments', departmentRouter);
app.use('/api/assignments', assignmentRouter);
app.use('/api/chain',       chainRouter);       // GET /api/chain/status

// ─── Health ───────────────────────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  let chain;
  try {
    const st = await ethereumService.getStatus();
    chain = {
      network: st.network, chainId: st.chainId, ready: st.ready, rpcReachable: st.rpcReachable,
      latestBlock: st.latestBlock, contractAddress: st.contractAddress, lowBalance: st.lowBalance,
    };
  } catch {
    chain = { network: 'Ethereum Sepolia', ready: false, rpcReachable: false };
  }
  res.json({ status: 'ok', version: '3.0.0', chain });
});

// ─── Stats / contract / events / balance ──────────────────────────────────────
app.get('/api/stats', async (_req, res) => {
  const reports = getReports();
  const overview = getOverview(reports);
  const nft = getNftAnalytics(reports);
  let latestBlock = null;
  try { latestBlock = await ethereumService.getLatestBlock(); } catch { latestBlock = null; }
  res.json({
    network: 'Ethereum Sepolia',
    chainId: 11155111,
    latestBlock,
    totalReports: overview.totalReports,
    resolvedReports: overview.resolvedReports,
    totalNFTs: nft.totalNFTs,
    mintSuccessRate: nft.mintSuccessRate,
  });
});

app.get('/api/contracts', contractController);   // alias of /api/nft/contract

app.get('/api/events', async (_req, res) => {
  const items = await getAllMinted();
  res.json({
    events: items.slice(0, 50).map((i) => ({
      event: 'CivicIssueNFTMinted', tokenId: i.tokenId, recipient: i.owner, tokenURI: i.tokenURI,
      transactionHash: i.transactionHash, blockNumber: i.blockNumber, mintedAt: i.mintedAt,
      reportId: i.reportId, explorerUrl: i.explorerUrl,
    })),
    total: items.length,
  });
});

app.get('/api/blocks', (_req, res) => res.status(410).json({ error: 'REMOVED', use: '/api/nfts' }));

app.get('/api/balance/:address', async (req, res) => {
  const { address } = req.params;
  if (!isValidAddress(address)) return invalidWallet(res);
  try {
    const balance = await ethereumService.getBalanceEth(address);
    res.json({ address: toChecksum(address), balance, unit: 'SepoliaETH', network: 'Ethereum Sepolia' });
  } catch {
    res.status(503).json({ error: 'RPC_UNAVAILABLE', address: toChecksum(address), balance: null });
  }
});

// ─── Keyword fallback classifier (no AI key needed) ───────────────────────────
const KEYWORDS = {
  ROAD_DAMAGE:     ['pothole', 'road', 'crack', 'broken', 'pavement', 'asphalt'],
  FLOOD:           ['flood', 'waterlog', 'overflow', 'drain', 'rain', 'puddle', 'submerge'],
  FIRE:            ['fire', 'burn', 'smoke', 'flame', 'blaze', 'burning'],
  STREETLIGHT:     ['light', 'dark', 'lamp', 'street light', 'bulb', 'no light', 'unlit'],
  GARBAGE:         ['garbage', 'trash', 'waste', 'litter', 'dump', 'stench', 'rubbish'],
  WATER_LEAK:      ['leak', 'pipe', 'water supply', 'burst', 'seepage'],
  UNSAFE_BUILDING: ['building', 'wall', 'collapse', 'unsafe', 'structure', 'demolish'],
};
app.post('/api/ai/verify', (req, res) => {
  const description = String(req.body?.description || '').slice(0, 2000);
  const category = String(req.body?.category || '').slice(0, 40);
  const text = `${description} ${category}`.toLowerCase();
  let detected = /^[A-Z_]+$/.test(category) ? category : 'OTHER';
  let confidence = 60;
  for (const [cat, kws] of Object.entries(KEYWORDS)) {
    if (kws.some((k) => text.includes(k))) { detected = cat; confidence = 85; break; }
  }
  res.json({ aiCategory: detected, confidence, isValid: confidence > 60, isDuplicate: false });
});

// ─── Reports ──────────────────────────────────────────────────────────────────
const FILTER_RE = /^[A-Za-z0-9_]{1,40}$/;

app.get('/api/reports', (req, res) => {
  const { category, status, reporter, department, city } = req.query;
  for (const [k, v] of Object.entries({ category, status, department, city })) {
    if (v !== undefined && !FILTER_RE.test(String(v))) return res.status(400).json({ error: `Invalid ${k} filter.` });
  }
  if (reporter !== undefined && !isValidAddress(String(reporter))) return invalidWallet(res, 'reporter');

  let reports = getReports();
  ensureAssigned(reports);
  reports = enrichReports(reports);
  if (category)   reports = reports.filter((r) => r.category === category);
  if (status)     reports = reports.filter((r) => r.status === status);
  if (reporter)   reports = reports.filter((r) => String(r.reporter || '').toLowerCase() === String(reporter).toLowerCase());
  if (department) reports = reports.filter((r) => r.department === department);
  if (city)       reports = reports.filter((r) => r.city === city);

  const page     = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize, 10) || 50));
  const start    = (page - 1) * pageSize;
  res.json({ reports: reports.slice(start, start + pageSize), total: reports.length, page, pageSize });
});

app.get('/api/reports/:id', (req, res) => {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(req.params.id)) return res.status(400).json({ error: 'Invalid report id.' });
  const report = getReportById(req.params.id);
  if (!report) return res.status(404).json({ error: 'Report not found' });
  res.json(enrichReports([report])[0]);
});

// ─── Compatibility aliases (off-chain data) ───────────────────────────────────
app.get('/api/reputation/:address', async (req, res) => {
  if (!isValidAddress(req.params.address)) return invalidWallet(res);
  const r = await getReputation(req.params.address);
  res.json({ address: toChecksum(req.params.address), reputation: r.score, level: r.level });
});

app.get('/api/rewards/:address', async (req, res) => {
  if (!isValidAddress(req.params.address)) return invalidWallet(res);
  const p = await getPoints(req.params.address);
  res.json({ address: toChecksum(req.params.address), points: p.points });
});

app.get('/api/leaderboard', async (_req, res) => {
  // Legacy (pre-Ethereum) reporter ids cannot sign in any more — history only.
  const addresses = [...new Set(getReports().map((r) => r.reporter).filter((a) => isValidAddress(a)))];
  const leaderboard = [];
  for (const address of addresses) {
    const [{ points }, { score }] = await Promise.all([getPoints(address), getReputation(address)]);
    const nftCount = getReports().filter((r) => r.reporter === address && r.nft?.status === 'NFT_MINTED').length;
    leaderboard.push({ address, score: points, reputation: score, nftCount });
  }
  leaderboard.sort((a, b) => b.score - a.score);
  res.json({ leaderboard: leaderboard.slice(0, 20) });
});

// ─── Serve the built frontend (single-deploy mode) ────────────────────────────
// When frontend/dist exists, API and UI share one origin (VITE_API_URL stays blank).
const distDir = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(distDir) && !isTest()) {
  app.use(express.static(distDir, {
    setHeaders(res, file) {
      if (file.endsWith('.apk')) {
        res.setHeader('Content-Type', 'application/vnd.android.package-archive');
        res.setHeader('Content-Disposition', 'attachment; filename="CivicChain.apk"');
      }
    },
  }));
  app.get('*', (req, res, next) => {
    // Missing downloads must 404 — never an HTML page saved as an .apk.
    if (req.path.startsWith('/api') || req.path === '/health' || req.path.startsWith('/downloads/')) return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

// ─── 404 + central error handler ──────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON body.' });
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Request body too large.' });
  console.error('[ERROR]', redactSecrets(err?.message || String(err)));
  res.status(500).json(isProd() ? { error: 'Internal server error' } : { error: 'Internal server error', detail: redactSecrets(err?.message || '') });
});

export default app;
