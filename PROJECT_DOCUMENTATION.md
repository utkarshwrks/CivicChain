# CrowdPulse — In-Depth Project Documentation

> **CivicChain** — Decentralised Civic Intelligence on the SAYMAN Blockchain
>
> _"Citizens report. AI verifies. Blockchain remembers. Nobody can hide."_

**Version:** 2.1.0
**Stack:** Node.js + Express (backend) · React 18 + Vite (frontend) · SAYMAN JS-VM smart contracts
**External services:** Google Gemini Vision · Pinata IPFS · SAYMAN blockchain RPC

---

## Table of Contents

1. [What CrowdPulse Is](#1-what-crowdpulse-is)
2. [How It Works — End to End](#2-how-it-works--end-to-end)
3. [System Architecture](#3-system-architecture)
4. [The SAYMAN Blockchain & Smart Contracts](#4-the-sayman-blockchain--smart-contracts)
5. [Backend Deep Dive](#5-backend-deep-dive)
6. [Frontend Deep Dive](#6-frontend-deep-dive)
7. [Authentication, Roles & Governance](#7-authentication-roles--governance)
8. [Data Stores](#8-data-stores)
9. [Complete API Reference](#9-complete-api-reference)
10. [Setup & Running](#10-setup--running)
11. [Environment Variables](#11-environment-variables)
12. [Project Phases](#12-project-phases)
13. [Repository Map](#13-repository-map)

---

## 1. What CrowdPulse Is

CrowdPulse (branded **CivicChain** in the UI) is a **decentralised civic-issue reporting platform**. Citizens photograph public problems — potholes, floods, garbage, broken streetlights, water leaks, unsafe buildings — and submit them. The platform then:

1. **Verifies the photo with AI** (Google Gemini Vision) — confirming it really is a civic issue and classifying its category and severity.
2. **Screens it** for fraud and duplicates before committing any storage or gas.
3. **Stores the evidence permanently** on IPFS (via Pinata) so it can never be quietly deleted or altered.
4. **Records the report on a blockchain** (SAYMAN) so the history is tamper-proof and publicly auditable.
5. **Rewards the reporter** with on-chain reward points and reputation, building a trust score over time.
6. **Routes the issue** to the right municipal department and city, where authorities verify it and municipal teams resolve it through a tracked workflow.

The core idea: make civic accountability **transparent and un-erasable**. Once a report is on-chain with IPFS-pinned evidence, nobody — citizen or official — can pretend it never happened.

### Who uses it (four roles)

| Role | What they do |
|------|--------------|
| **CITIZEN** | Submit reports, earn points/reputation, browse the public feed and analytics. |
| **AUTHORITY** | Verify pending reports in their department/city jurisdiction (OPEN → VERIFIED). |
| **MUNICIPAL_TEAM** | Take verified work and resolve it (VERIFIED → IN_PROGRESS → RESOLVED). |
| **ADMIN** | Assign roles, departments and cities; see all reports and system metrics. |

---

## 2. How It Works — End to End

A single report submission travels through this pipeline:

```
  CITIZEN (browser)
       │  photo + city + landmark
       ▼
  POST /api/report/create  (JWT-authenticated, multipart)
       │
       ▼
  ┌─────────────────────────────────────────────────────┐
  │  createFullReport()  — the unified pipeline          │
  │                                                       │
  │  1. AI Analysis      → Gemini Vision classifies the   │
  │                         image: isCivicIssue, category, │
  │                         severity, confidence, reason   │
  │                                                       │
  │  2. Fraud Gate       → score the analysis; BLOCK if    │
  │                         high-risk (low confidence,     │
  │                         "OTHER" catch-all, spam words)  │
  │                                                       │
  │  3. Duplicate Check  → SHA-256 hash of the image vs.   │
  │                         the duplicate index; REJECT     │
  │                         exact re-submissions            │
  │                                                       │
  │  4. IPFS Upload      → pin the image to Pinata → CID    │
  │                                                       │
  │  5. Blockchain Write → sign & broadcast a REPORT_CREATE │
  │                         transaction to SAYMAN           │
  │                                                       │
  │  6. Rewards          → +10 pts (+5 if HIGH severity)    │
  │  7. Reputation       → +5 reputation (valid report)    │
  │  8. Register hash    → record image hash for dedupe    │
  └─────────────────────────────────────────────────────┘
       │
       ▼
  Auto-assign → department (by category) + city (from location)
       │
       ▼
  Response: { reportId, analysis, evidence(CID), blockchain(txHash),
              rewards, reputation, city, address }
```

After submission, the report enters a **governance workflow**:

```
  OPEN ──(AUTHORITY verifies)──▶ VERIFIED ──(MUNICIPAL starts)──▶ IN_PROGRESS ──(MUNICIPAL resolves)──▶ RESOLVED
```

Each transition awards additional points and reputation, and is mirrored to the blockchain best-effort.

---

## 3. System Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│  FRONTEND  — React 18 + Vite (port 5173)                            │
│  Tab-based SPA · secp256k1 wallet · JWT auth · Framer Motion · CSS  │
│  Pages: Home, Feed, Submit, Analytics, Explorer, Profile,           │
│         Authority, Municipal, Admin                                  │
└───────────────────────────────┬────────────────────────────────────┘
                                 │  fetch + Bearer JWT
                                 ▼
┌────────────────────────────────────────────────────────────────────┐
│  BACKEND  — Express (port 3001)                                     │
│  helmet · cors · rate-limit (120 req / 60s) · JWT middleware        │
│                                                                      │
│  Controllers ─▶ Services ─▶ { Gemini, Pinata, SAYMAN RPC }          │
│  Local JSON stores (roles, jurisdictions, assignments, cache, …)    │
└──────┬───────────────────┬───────────────────────┬─────────────────┘
       │                   │                       │
       ▼                   ▼                       ▼
 ┌───────────┐      ┌────────────┐         ┌──────────────────┐
 │  Gemini   │      │  Pinata    │         │  SAYMAN RPC       │
 │  Vision   │      │  IPFS      │         │  (Render/Railway) │
 │  (AI)     │      │  (storage) │         │  smart contracts  │
 └───────────┘      └────────────┘         └──────────────────┘
```

**Key architectural decisions:**

- **Best-effort blockchain.** Every on-chain call is wrapped in try/catch. The report still succeeds (and is cached locally) even if the chain write fails — failures are logged, not fatal. This keeps the demo resilient against testnet downtime.
- **Dual-track persistence.** Services keep fast in-memory state *and* persist to JSON files on disk, so the app survives restarts without a database.
- **Server-side signing.** The backend signs all blockchain transactions with the **deployer private key**. Users have wallets for identity/auth, but the backend pays gas and submits on their behalf.
- **Fraud-first gating.** Fraud and duplicate checks run *before* IPFS and blockchain, so wasted storage and gas are avoided.

---

## 4. The SAYMAN Blockchain & Smart Contracts

### What SAYMAN is

SAYMAN is a **custom JavaScript-VM blockchain** reached over an HTTP REST RPC (hosted on Render / Railway). It is **not** Ethereum — there is no Solidity. "Smart contracts" are JavaScript files that execute inside the SAYMAN VM against a persisted global `state` object, and emit events.

- **Signing:** secp256k1 ECDSA (the `elliptic` library), signatures shaped as `{ r, s }`.
- **Address format:** `SHA256(publicKey).slice(0, 40)` — a 40-char hex string.
- **Transaction types:** `CONTRACT_DEPLOY`, `CONTRACT_CALL`, `REPORT_CREATE` (and experimental `REPORT_VERIFY` / `REPORT_START_WORK` / `REPORT_RESOLVE`).
- **Gas:** fixed model — `gasPrice: 1`, gas limit ~100 per call, ~90 per deploy.

### RPC endpoints used

| Endpoint | Purpose |
|----------|---------|
| `GET /api/chain` | Chain info |
| `GET /api/address/{addr}` | Nonce, balance, tx history |
| `GET /api/balance/{addr}` | Balance |
| `GET /api/contracts/{addr}` | Contract presence/info |
| `GET /api/stats` | Block count |
| `POST /api/faucet` | Request testnet funds |
| `POST /api/broadcast` | Submit a signed transaction |

Default RPC: `https://sayman.onrender.com` (testnet). The `.env` also references `https://sayman.up.railway.app`. Mainnet would be `https://mainnet.sayman.io`.

### The three contracts (`contracts/`)

#### `ReportRegistry.js` — the on-chain report ledger
Stores civic reports in `state.reports` (keyed by id), with `state.reportIds` (newest-first order) and `state.count`.

| Method | Purpose |
|--------|---------|
| `createReport({description, category, location, aiCategory?, aiConfidence?})` | Create a report. Validates category and 10–1000 char description. Emits `ReportCreated`. |
| `verifyReport({reportId})` | OPEN → VERIFIED. The reporter cannot verify their own report. Emits `ReportVerified`. |
| `resolveReport({reportId})` | → RESOLVED. Emits `ReportResolved`. |
| `getReport({reportId})` | Fetch one report. |
| `getReports({page?, pageSize?, category?, status?, reporter?})` | Paginated, filterable list (default 20, max 50). |
| `getStats()` | Totals by status and category. |

Report shape: `{ id, reporter, description, category, location, status, createdAt, updatedAt, verifiedBy, resolvedBy, aiCategory, aiConfidence }`.

#### `ReputationManager.js` — trust scores
`state.reputation` (address → score), `state.history` (last 50 events/address), `state.authorised`, `state.owner`.

| Method | Purpose |
|--------|---------|
| `authorise / revokeAuthorisation({address})` | Owner-only: control who may award/slash. |
| `award({address, points, reason?})` | Authorised-only. Emits `ReputationAwarded`. |
| `slash({address, points, reason?})` | Authorised-only. Emits `ReputationSlashed`. |
| `getScore({address})` | `{ address, score, level }`. |
| `getLeaderboard({limit?})` | Top N by score. |
| `getHistory({address})` | Recent reputation events. |
| `getLevels()` | Level thresholds for the UI. |

**Levels:** Newcomer (0) · Rising (10) · Trusted (50) · Elite (100) · Champion (200).

#### `RewardManager.js` — reward points
`state.points`, `state.claimed` (`{total, lastClaim}`), `state.authorised`, `state.owner`.

| Method | Purpose |
|--------|---------|
| `addPoints / deductPoints({address, points, reason?})` | Authorised-only. |
| `awardForAction({address, action})` | Fixed payout per action. |
| `claimReward()` | Claim earned points; **24-hour cooldown** enforced. Emits `RewardClaimed`. |
| `getPoints({address})` | Balance. |
| `getRewardTable()` | The reward schedule. |

**Reward schedule:** `REPORT_CREATED: 10`, `REPORT_VERIFIED: 5`, `REPORT_RESOLVED: 20`.

### Deployment (`scripts/deploy.js`)

1. Picks network from `--network` (`local` → localhost:10000, `testnet` → Render, `mainnet`).
2. Loads `DEPLOYER_PRIVATE_KEY`, derives the public key and 40-char address.
3. Checks balance; if low, hits the faucet and waits for a block.
4. Broadcasts a `CONTRACT_DEPLOY` tx for each contract (address = `SHA256(deployer+timestamp).slice(0,40)`), incrementing the nonce.
5. Polls for mining, then writes **`deployed.json`** (the manifest the backend reads).

**`deployed.json`** holds `network`, `rpcUrl`, `deployer`, `deployedAt`, and the three contract addresses. The backend **hot-reloads** this file (watches it every ~5s) so a redeploy updates contract addresses without a restart.

### Diagnostic scripts

- **`audit.js`** — Phase 14A/14B integration audit: checks RBAC, the nonce→sign→login JWT flow (asserts deployer = ADMIN), role-based tab expectations, and department routing.
- **`blockchain-probe.js`** — Phase 14C pre-audit: probes whether SAYMAN accepts the custom `REPORT_VERIFY` / `REPORT_START_WORK` / `REPORT_RESOLVE` transaction types by broadcasting and re-reading address state.

---

## 5. Backend Deep Dive

Express app (`backend/index.js`), default **port 3001**. Security via `helmet` (CSP disabled) and `cors` (open origin). Rate limit: **120 requests / 60s** on `/api/*`.

### Built-in routes (defined directly in `index.js`)

`GET /health`, `GET /api/stats`, `GET /api/nonce/:address`, `GET /api/balance/:address`, `POST /api/ai/verify` (keyword fallback classifier), `POST /api/broadcast`, `GET /api/reports` (+filters), `GET /api/reports/:id`, `GET /api/reputation/:address`, `GET /api/rewards/:address`, `GET /api/leaderboard`, `GET /api/blocks`, `GET /api/events`, `GET /api/contracts`.

A background `scanReports()` polls SAYMAN for `REPORT_CREATE` transactions and merges them into a 15-second-TTL cache.

### Mounted routers (`backend/routes/`)

`ai`, `ipfs`, `report`, `profile`, `analytics`, `workflow`, `auth`, `rbac`, `department`, `assignment` — see the [API reference](#9-complete-api-reference).

### Services (`backend/services/`) — the business logic

| Service | Responsibility |
|---------|----------------|
| **ai.service.js** | Calls Gemini 2.5 Flash Vision with a strict JSON-only prompt. Returns `{ isCivicIssue, category, severity, confidence, reason }`. Cleans markdown, validates and coerces fields. |
| **ipfs.service.js** | Uploads image buffers to **Pinata** (`pinFileToIPFS`) with metadata; returns `{ cid, gatewayUrl, ipfsUrl, publicUrl }`. |
| **report.service.js** | Orchestrates the two pipelines: `processReport()` (AI+IPFS in parallel, Phase 7) and `createFullReport()` (the full AI→fraud→dup→IPFS→chain→rewards pipeline). |
| **blockchain.service.js** | Builds, hashes (SHA-256), signs (secp256k1) and broadcasts `REPORT_CREATE` transactions using the deployer key. |
| **fraud.service.js** | Pure scoring of an AI analysis. Rules: low confidence (+40), category OTHER (+50), not-civic (+50), spam keywords (+30). 0–30 ALLOW · 31–70 ALLOW+warn · 71–100 BLOCK. |
| **duplicate.service.js** | SHA-256 exact-image dedupe against `duplicate-index.json`. `checkDuplicate()` + `registerHash()`. |
| **reward.service.js** | Awards points (+10 base, +5 HIGH severity, status bonuses) and computes balances; best-effort `CONTRACT_CALL` to RewardManager. |
| **reputation.service.js** | Awards reputation (+5 valid report, status bonuses), computes score + level, derives badges; best-effort `CONTRACT_CALL` to ReputationManager. |
| **workflow.service.js** | The state machine for OPEN→VERIFIED→IN_PROGRESS→RESOLVED; validates transitions, persists status, awards on transitions. |
| **department.service.js** | The 8 fixed departments and the category→department mapping. |
| **jurisdiction.service.js** | The 10-city registry (`cities.json`) and per-user `{department, city}` jurisdiction (backward-compatible with the old format). |
| **assignment.service.js** | Auto-assigns reports to department (by category) + city (from location); supports admin manual override. |
| **analytics.service.js** | Pure aggregation: overview, category/severity distribution, top reporters, hotspots, trends, insights. |
| **auth.service.js** | Nonce generation, wallet-signature verification (secp256k1), JWT issuance (24h). |
| **rbac.service.js** | Role storage (`roles.json`), defaults to CITIZEN, auto-seeds the deployer as ADMIN. |
| **reportCache.js** | Loads/persists `report-cache.json`, hydrates `.status` from workflow data, filters by address. |

### Reward & reputation maths (how scores are computed)

When reading a user's totals, services walk that user's cached reports and sum:

- **Reward points:** +10 per report · +5 if severity HIGH · +5 if VERIFIED/IN_PROGRESS/RESOLVED · +20 if RESOLVED.
- **Reputation:** +5 per valid report · +5 if VERIFIED/IN_PROGRESS/RESOLVED · +15 if RESOLVED.

### Departments (fixed registry)

`ROAD_DEPARTMENT`, `SANITATION_DEPARTMENT`, `ELECTRICITY_DEPARTMENT`, `DRAINAGE_DEPARTMENT`, `FIRE_DEPARTMENT`, `WATER_DEPARTMENT`, `URBAN_DEPARTMENT`, `GENERAL_DEPARTMENT` — mapped from AI categories (e.g. `ROAD_DAMAGE → ROAD_DEPARTMENT`, `GARBAGE → SANITATION_DEPARTMENT`, `OTHER → GENERAL_DEPARTMENT`).

### Cities (10)

Bhopal, Indore, Jabalpur, Gwalior, Ujjain (MP), Raipur (CG), Nagpur, Pune (MH), Delhi (DL), Bengaluru (KA).

---

## 6. Frontend Deep Dive

### Stack

- **React 18.3** + **Vite 7** (ES modules).
- **framer-motion** — page/element animations.
- **lucide-react** — icons.
- **elliptic** — secp256k1 wallet keygen, import and signing in-browser.
- **No** React Router, **no** Redux/Zustand, **no** CSS framework — all custom.

### Navigation (no router)

`App.jsx` holds a `tab` state and maps it through `PAGE_MAP` to a page component. Tabs shown depend on role via `ROLE_TABS`. Framer Motion animates transitions. If a role change makes the current tab invalid, it resets to Home.

### Pages

| Page | Access | What it does |
|------|--------|--------------|
| **HomePage** | all | Three.js scroll-driven blockchain hero; live network stats (blocks, reports, resolved, validators, mempool); explore cards routing into the app. |
| **FeedPage** | all | Live, searchable, category-filtered report stream; status badges; severity meter; inline workflow actions for authorised roles; 15s auto-refresh. |
| **SubmitPage** | CITIZEN, ADMIN | Image drag/drop + city selector + landmark; animated 6-step pipeline; success screen with AI confidence, severity, points, reputation, IPFS URL, tx hash; confetti. |
| **AnalyticsPage** | all | KPI cards, AI insight chips, category bar chart, severity donut, trends (today/week/month), hotspots, contributor leaderboard with podium. |
| **ExplorerPage** | all | Block explorer (16 latest blocks, clickable, raw-JSON toggle) + deployed contracts grid; network stats strip. |
| **ProfilePage** | wallet | Identity card, trust level, balance/reputation/points/report counts, 6 unlockable badges, leaderboard with the user highlighted. |
| **AuthorityPage** | AUTHORITY, ADMIN | Pending/Verified/Rejected tabs; verify reports within jurisdiction; optional notes; access-denied screen otherwise. |
| **MunicipalPage** | MUNICIPAL_TEAM, ADMIN | Assigned/In-Progress/Completed tabs; start and resolve work; notes; access-denied screen otherwise. |
| **AdminPage** | ADMIN | Users tab (assign role + department + city) and Metrics tab (overview + per-department distribution). |

### Components & state

- **Header.jsx** — logo, role-aware tabs, wallet chip (short address, role, balance, reputation) with a dropdown (copy full address, disconnect).
- **WalletModal.jsx** — create a new wallet or import a private key.
- **ui.jsx** — shared primitives: `CountUp`, `Donut`, `CopyButton`, `LiveBadge`, `Skeleton`.
- **hooks/useWallet.jsx** — the **WalletProvider** context: `{ wallet, balance, reputation, rewards, role, department, city, token, isAuthenticated }` plus `connect`, `disconnect`, `refresh`, `authFlow`. Restores wallet/token from localStorage (`cp_wallet_v2`, `cp_token_v1`), validates via `/api/auth/me`, auto-refreshes every 15s.
- **utils/api.js** — fetch wrapper; base URL from `VITE_API_URL` (defaults to same origin); injects `Authorization: Bearer <JWT>`.
- **utils/crypto.js** — `generateWallet()`, `importWallet()`, and `signAuthMessage()` (signs `CrowdPulse:{address}:{nonce}`).

### Branding & styling

CivicChain dark theme via CSS custom properties — saffron `#FF9A3A` + green `#19c37d` on near-black `#07080a`. Fonts: Space Grotesk (text) and a monospace (addresses/code). Glassmorphism, grid background, radial glow, Three.js hero. Dark mode only.

---

## 7. Authentication, Roles & Governance

### Wallet login flow (passwordless, signature-based)

```
1. Browser generates/imports a secp256k1 wallet (private key never leaves the client).
2. GET /api/auth/nonce/{address}          → server returns a one-time nonce (5-min TTL).
3. Browser signs sha256("CrowdPulse:{address}:{nonce}") → { r, s }.
4. POST /api/auth/login { address, publicKey, nonce, signature }
       → server verifies the signature, confirms the address derives from the public key,
         looks up the role, and issues a JWT (24h).
5. All protected calls send Authorization: Bearer <JWT>.
6. GET /api/auth/me validates the token and returns { address, role }.
```

### Authorisation middleware

`authenticate` attaches `req.user = { address, role }`; `requireRole(...roles)` guards endpoints. The **governance workflow** endpoints are role-gated:

- `POST /api/workflow/:id/verify` → AUTHORITY or ADMIN
- `POST /api/workflow/:id/start` → MUNICIPAL_TEAM or ADMIN
- `POST /api/workflow/:id/resolve` → MUNICIPAL_TEAM or ADMIN

RBAC and department assignment endpoints require ADMIN. Authority/Municipal users only see reports within their assigned **department + city** jurisdiction; ADMIN sees everything.

---

## 8. Data Stores

Local JSON files under `backend/data/` (no database):

| File | Holds |
|------|-------|
| `roles.json` | address → role (CITIZEN/AUTHORITY/MUNICIPAL_TEAM/ADMIN). |
| `user-departments.json` | address → `{ department, city }` jurisdiction. |
| `cities.json` | The supported-city registry. |
| `assignments.json` | reportId → `{ department, city, category, reporter, assignedAt, overriddenBy, … }`. |
| `workflow-status.json` | reportId → `{ status, reporter, notes[], updatedAt }`. |
| `duplicate-index.json` | SHA-256 hashes of submitted images → reportId. |
| `report-cache.json` | Cached scanned reports `{ reports[], lastBlock, updatedAt }`. |

The **source of truth** for permanent data is the blockchain + IPFS; these files are a fast local mirror/cache plus governance state.

---

## 9. Complete API Reference

### AI & evidence
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/ai/analyze` | — | Gemini Vision image classification. |
| POST | `/api/ai/verify` | — | Keyword fallback classifier. |
| POST | `/api/ipfs/upload` | — | Pin image to Pinata IPFS. |

### Reports
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/report/process` | — | AI + IPFS only (Phase 7, no chain). |
| POST | `/api/report/create` | JWT | Full pipeline (AI→fraud→dup→IPFS→chain→rewards). |
| GET | `/api/reports` | — | List (filter by category/status/city/dept/reporter). |
| GET | `/api/reports/:id` | — | Single report. |

### Profile & gamification
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/profile/:address/points` | — | Reward points. |
| GET | `/api/profile/:address/reputation` | — | Score + level. |
| GET | `/api/profile/:address/badges` | — | Earned badges. |
| GET | `/api/leaderboard` | — | Top 20 reporters. |

### Analytics
`GET /api/analytics/overview · /categories · /severity · /top-reporters · /hotspots · /trends · /insights` (all public).

### Workflow (governance)
| Method | Path | Auth |
|--------|------|------|
| POST | `/api/workflow/:reportId/verify` | AUTHORITY/ADMIN |
| POST | `/api/workflow/:reportId/start` | MUNICIPAL_TEAM/ADMIN |
| POST | `/api/workflow/:reportId/resolve` | MUNICIPAL_TEAM/ADMIN |

### Auth & RBAC
| Method | Path | Auth |
|--------|------|------|
| GET | `/api/auth/nonce/:address` | — |
| POST | `/api/auth/login` | — |
| GET | `/api/auth/me` | JWT |
| GET | `/api/rbac/role/:address` | JWT |
| GET | `/api/rbac/roles` | ADMIN |
| POST | `/api/rbac/assign` | ADMIN |

### Departments, cities & assignments
| Method | Path | Auth |
|--------|------|------|
| GET | `/api/departments` | — |
| GET | `/api/departments/analytics` | — |
| GET | `/api/departments/me` · `/me/reports` | JWT |
| GET | `/api/departments/users` | ADMIN |
| POST | `/api/departments/assign-user` | ADMIN |
| GET | `/api/cities` | — |
| GET | `/api/assignments` | ADMIN |
| GET | `/api/assignments/:reportId` | JWT |
| POST | `/api/assignments/assign` | ADMIN |

### Chain
`GET /health · /api/stats · /api/nonce/:address · /api/balance/:address · /api/blocks · /api/events · /api/contracts · /api/reputation/:address · /api/rewards/:address` · `POST /api/broadcast`.

---

## 10. Setup & Running

```bash
# 1. Install dependencies (root)
npm install

# 2. Install frontend dependencies
cd frontend && npm install && cd ..

# 3. Configure environment
cp .env.example .env
#   → set GEMINI_API_KEY, PINATA_JWT, DEPLOYER_PRIVATE_KEY, SAYMAN_RPC

# 4. (Optional) Deploy the smart contracts → writes deployed.json
npm run deploy:testnet      # or deploy:local / deploy:mainnet

# 5. Run
npm run backend             # backend on :3001
npm run frontend            # frontend (Vite) on :5173
npm run dev                 # both concurrently
```

Other scripts: `npm run build` (frontend production build), `npm run backend:dev` / `dev:local` (point at the Render RPC explicitly).

---

## 11. Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `DEPLOYER_PRIVATE_KEY` | yes | 64-char hex key that pays gas and **signs all backend transactions**. |
| `SAYMAN_RPC` | yes | SAYMAN RPC URL (e.g. `https://sayman.onrender.com`). |
| `PORT` | no | Backend port (default 3001). |
| `NODE_ENV` | no | `development` / `production`. |
| `GEMINI_API_KEY` | yes | Google AI Studio key for Gemini Vision (`/api/ai/analyze`). |
| `PINATA_JWT` | yes | Pinata JWT for IPFS pinning (`/api/ipfs/upload`). |
| `JWT_SECRET` | yes | Secret for signing auth JWTs. |
| `VITE_API_URL` | no | Frontend → backend base URL when not same-origin. |

> ⚠️ **Security note:** `.env.example` ships with a real-looking `DEPLOYER_PRIVATE_KEY`. For any non-demo deployment, generate a fresh key, keep it out of version control, and rotate the committed one.

---

## 12. Project Phases

The project was built in incremental phases (reflected in code comments and the README):

| Phase | Feature |
|-------|---------|
| 1–5 | AI Vision (Gemini), classification scaffold |
| 6 | IPFS evidence storage (Pinata) |
| 7 | Unified AI + IPFS processing pipeline |
| 8 | Blockchain report creation (SAYMAN) |
| 9 | Fraud-detection gate |
| 10 | Rewards + reputation |
| 11 | Duplicate detection (SHA-256 exact match) |
| 12 | Analytics dashboard |
| 13 | Authority workflow (verify → resolve) |
| 14A | Wallet auth + RBAC |
| 14B | Department auto-assignment |
| 14C | City layer + per-user jurisdiction |
| 15 | Final governance phase (departments fixed) |
| — | CivicChain rebrand + redesigned Feed/Submit/Analytics/Explorer UI |

---

## 13. Repository Map

```
CrowdPulse/
├── backend/
│   ├── index.js                 # Express app, built-in routes, report scanner
│   ├── config/blockchain.config.js   # reads & hot-reloads deployed.json
│   ├── routes/                  # ai, ipfs, report, profile, analytics,
│   │                            #   workflow, auth, rbac, department, assignment
│   ├── controllers/             # thin request handlers per route group
│   ├── services/                # AI, IPFS, blockchain, fraud, duplicate,
│   │                            #   reward, reputation, workflow, department,
│   │                            #   jurisdiction, assignment, analytics, auth, rbac
│   ├── middleware/auth.middleware.js  # authenticate + requireRole
│   ├── utils/fraudRules.js
│   └── data/                    # JSON stores (roles, jurisdictions, cache, …)
│
├── contracts/
│   ├── ReportRegistry.js        # on-chain report ledger
│   ├── ReputationManager.js     # trust scores
│   └── RewardManager.js         # reward points
│
├── scripts/deploy.js            # deploy contracts → deployed.json
├── deployed.json                # contract addresses + RPC manifest
├── audit.js                     # RBAC/auth integration audit
├── blockchain-probe.js          # SAYMAN tx-type capability probe
│
├── frontend/
│   ├── index.html
│   └── src/
│       ├── App.jsx              # tab router
│       ├── main.jsx
│       ├── styles.css           # CivicChain design tokens
│       ├── components/          # Header, WalletModal, ui
│       ├── hooks/useWallet.jsx  # wallet + auth context
│       ├── pages/               # Home, Feed, Submit, Analytics, Explorer,
│       │                        #   Profile, Authority, Municipal, Admin
│       └── utils/               # api.js, crypto.js
│
├── package.json                 # root scripts & backend deps
├── .env.example
└── README.md
```

---

_Generated from a full read of the backend, contracts, scripts, and frontend. For the canonical behaviour of any endpoint, the service files under `backend/services/` are the source of truth._
