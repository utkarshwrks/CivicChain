# CivicChain — Complete Project Documentation

> **CivicChain v3.0.0** — Decentralized Civic Intelligence on **Ethereum Sepolia**.
> Citizens report. AI verifies. IPFS preserves. Ethereum records. NFTs reward civic participation.

**Version:** 3.0.0
**Stack:** Node.js + Express, ethers v6 (backend) · React 18 + Vite 7, ethers v6 (frontend) · `CivicIssueNFT.sol` — Solidity ^0.8.24, OpenZeppelin v5, Hardhat 2 · Android app via Capacitor 6
**Blockchain:** Ethereum Sepolia Testnet (chain ID 11155111)
**External services (all free tiers):** Google Gemini Vision · Pinata IPFS · a Sepolia JSON-RPC endpoint

> Ethereum Sepolia is a test network. Civic Issue NFTs are testnet assets with **no monetary value**. There is no ERC-20 token and no cryptocurrency.

---

## Table of Contents

1. [What CivicChain Is](#1-what-civicchain-is)
2. [How It Works — End to End](#2-how-it-works--end-to-end)
3. [System Architecture](#3-system-architecture)
4. [Ethereum Sepolia & the CivicIssueNFT Contract](#4-ethereum-sepolia--the-civicissuenft-contract)
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

## 1. What CivicChain Is

CivicChain is a decentralised civic-issue reporting platform. Citizens photograph public problems such as potholes, floods, garbage, broken streetlights, water leaks and unsafe buildings. Google Gemini Vision confirms the photo shows a real civic issue and classifies it; fraud and duplicate gates screen it before any storage or gas is spent; Pinata pins the photo and an NFT metadata file to IPFS; the backend mints an **ERC-721 Civic Issue NFT** on Ethereum Sepolia directly to the citizen's wallet; and the report is routed to the right municipal department and city, where authorities verify it and municipal teams resolve it through a tracked workflow.

**What the Civic Issue NFT means**

* It proves this citizen submitted a civic issue that passed CivicChain's AI, fraud and duplicate checks, and that its evidence is permanently on IPFS.
* It does **not** prove the municipality resolved the issue. Resolution is tracked separately in the off-chain workflow.
* Reputation, civic points and badges are off-chain gamification, clearly separated from the NFT.

### Who uses it (four roles)

| Role | What they do |
|---|---|
| **CITIZEN** | Submit reports; receive a Civic Issue NFT for each accepted report; earn reputation, civic points and badges; browse Feed, Explorer and Analytics. |
| **AUTHORITY** | Verify pending reports inside their assigned city (`OPEN → VERIFIED`), with optional notes. |
| **MUNICIPAL_TEAM** | Start and resolve verified work inside their city (`VERIFIED → IN_PROGRESS → RESOLVED`), with notes. |
| **ADMIN** | Assign roles, departments and cities; override assignments; see every report; view system and NFT metrics; retry failed mints. |

---

## 2. How It Works — End to End

Every submission to `POST /api/report/create` (JWT, multipart) runs `createFullReport()`. The order is fixed — **an NFT is never minted before every gate has passed**.

| # | Stage | What happens | Stop status |
|---|---|---|---|
| 0 | Input validation | JPEG/PNG/WebP only (magic bytes checked), ≤ `MAX_UPLOAD_MB` (10), city must be in the registry, landmark ≤ 200 chars. The reporter address comes from the JWT, never the request body. | 400 |
| 1 | AI analysis | Gemini 2.5 Flash Vision returns `isCivicIssue`, `category`, `severity`, `confidence`, `reason` (45 s timeout). | `AI_FAILED` / `NOT_CIVIC_ISSUE` |
| 2 | Fraud gate | Score 0–100 from the fraud rules; ≥ 71 blocks; 31–70 continues with `fraud.warning = true`. | `FRAUD_BLOCKED` |
| 3 | Duplicate check | SHA-256 of the image compared with `duplicate-index.json`. | `DUPLICATE` (returns the original report id) |
| 4 | Report ID | Existing generator, `RP-<ms timestamp>` (made unique under concurrency). | — |
| 5 | IPFS image | Image pinned to Pinata → `imageCid`. | `IPFS_FAILED` (nothing stored) |
| 6 | NFT metadata | Metadata JSON built and pinned → `metadataCid`; `tokenURI = ipfs://metadataCid`. | `IPFS_FAILED` (nothing stored) |
| 7 | Store report | Report saved with `evidence` and `nft.status = NFT_MINT_PENDING`; image hash registered; department + city auto-assigned; workflow `OPEN`. | — |
| 8 | Mint NFT | `ethereum.service` mints to the reporter's `0x` address through the serialised mint queue; waits up to `MINT_WAIT_MS` for the receipt. | `NFT_MINT_PENDING` / `NFT_MINT_FAILED` |
| 9 | Confirmed | Token ID parsed from the `CivicIssueNFTMinted` event; `nft-cache.json` updated. | `NFT_MINTED` |
| 10 | Gamification | Off-chain reputation and civic points for the valid stored report (independent of the mint outcome). | — |

### Response of `POST /api/report/create`

```jsonc
// 201 (minted) / 202 (pending or failed, report stored)
{
  "success": true,
  "status": "NFT_MINTED",
  "reportId": "RP-1790635565871",
  "analysis": { "isCivicIssue": true, "category": "ROAD_DAMAGE", "severity": "HIGH", "confidence": 96, "reason": "…" },
  "fraud": { "score": 0, "warning": false, "riskLevel": "LOW", "reason": "…" },
  "evidence": { "imageCid": "…", "imageUrl": "…", "metadataCid": "…", "metadataUrl": "…", "imageSha256": "…" },
  "nft": {
    "status": "NFT_MINTED", "tokenId": "1", "transactionHash": "0x…", "contractAddress": "0x…",
    "recipient": "0xA12…", "metadataCid": "…", "imageCid": "…", "tokenURI": "ipfs://…",
    "blockNumber": 123, "mintedAt": "2026-…", "explorerUrl": "https://sepolia.etherscan.io/tx/0x…",
    "tokenExplorerUrl": "https://sepolia.etherscan.io/nft/0x…/1", "attempts": 1
  },
  "reputation": { "earned": 5 }, "points": { "earned": 15, "reason": ["REPORT_ACCEPTED", "HIGH_SEVERITY"] },
  "rewards": { "earned": 15, "reason": [ … ] },     // compatibility alias of points
  "city": "JABALPUR", "cityName": "Jabalpur", "department": "ROAD_DEPARTMENT",
  "address": "0xA12…", "landmark": "Near …",
  "pipeline": [
    { "stage": "AI_ANALYSIS", "status": "done", "ms": 2100 },
    { "stage": "FRAUD_CHECK", "status": "done", "ms": 1 },
    …
    { "stage": "CONTRIBUTION_RECORDED", "status": "done", "ms": 3 }
  ]
}
```

Pipeline stages: `AI_ANALYSIS`, `FRAUD_CHECK`, `DUPLICATE_CHECK`, `IPFS_IMAGE`, `NFT_METADATA`, `NFT_MINT`, `NFT_CONFIRMED`, `CONTRIBUTION_RECORDED`, each `done`, `failed`, `skipped` or `pending`.

**Governance workflow (off-chain):** `OPEN` —(AUTHORITY verifies)→ `VERIFIED` —(MUNICIPAL starts)→ `IN_PROGRESS` —(MUNICIPAL resolves)→ `RESOLVED`. Each transition adds civic points and reputation. The NFT is never transferred, burned or rewritten.

---

## 3. System Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│ FRONTEND — React 18 + Vite 7 (:5173) · Android app (Capacitor 6)     │
│ Tab SPA · ethers v6 wallet · EIP-191 login · JWT · framer-motion     │
│ Home · Feed · Submit · Analytics · Explorer · Profile ·              │
│ Authority · Municipal · Admin                                         │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ fetch + Bearer JWT
┌───────────────────────────────▼──────────────────────────────────────┐
│ BACKEND — Express (:3001)                                            │
│ helmet (CSP) · CORS allow-list · rate limits · JWT · validation      │
│ Controllers → Services → { Gemini, Pinata, Sepolia RPC }             │
│ JSON stores: roles, jurisdictions, assignments, workflow,            │
│ duplicate-index, report-cache, nft-cache                             │
└──────┬─────────────────────────┬──────────────────────────┬──────────┘
       ▼                         ▼                          ▼
┌─────────────┐        ┌──────────────────┐       ┌──────────────────────┐
│ Gemini      │        │ Pinata IPFS      │       │ Ethereum Sepolia     │
│ Vision (AI) │        │ image + JSON     │       │ CivicIssueNFT.sol    │
└─────────────┘        └──────────────────┘       │ chain ID 11155111    │
                                                  └──────────────────────┘
```

| Decision | What it means |
|---|---|
| Fraud-first gating | AI, fraud and duplicate checks run before any IPFS upload or transaction, so no storage or gas is wasted on rejected photos. |
| Backend-paid gas | Only the backend minter wallet signs transactions. Citizens need no ETH and never sign transactions — their wallet is identity only. |
| Store before mint | A report whose evidence is on IPFS is saved as `NFT_MINT_PENDING` before the mint, so a failed mint never loses the civic report. |
| Serialised mints | One in-process mint queue + an ethers `NonceManager` prevents nonce collisions from simultaneous submissions. |
| Idempotent retry | Retries check the previous tx hash on-chain first; only reverted or long-missing txs are re-minted, with the same tokenURI. |
| Honest statuses | Nothing is called minted until the receipt is confirmed. Metadata uses "Status at Mint"; the live workflow status is separate. |
| Chain guard | The backend and deploy script refuse chain ID 1; the app only runs on 11155111 (31337 only in tests / local rehearsal). |
| Cache vs evidence | Local JSON files are the fast operational state; the blockchain and IPFS are the permanent public evidence. Any token can be re-verified on-chain. |
| Never crash | Every external call (Gemini, Pinata, RPC) is wrapped with typed error codes; the server keeps running with clear messages. |

---

## 4. Ethereum Sepolia & the CivicIssueNFT Contract

| Item | Value |
|---|---|
| Network | Ethereum Sepolia Testnet |
| Chain ID | 11155111 |
| Explorer | https://sepolia.etherscan.io |
| RPC | `SEPOLIA_RPC_URL` (free Alchemy / Infura / public endpoint), backend-only |
| Gas | Paid by the backend minter wallet with free faucet test ETH |
| Contract | `CivicIssueNFT` — name "CivicChain Civic Issue", symbol "CIVIC" |
| Standard | ERC-721 (OpenZeppelin v5 `ERC721URIStorage` + `Ownable`), Solidity ^0.8.24, EVM Cancun |
| Token IDs | Start at 1, increase by 1 per mint, never reused |
| Address | `NFT_CONTRACT_ADDRESS` — recorded in `deployments/sepolia.json` |

### Functions

| Function | Access | Purpose |
|---|---|---|
| `mintCivicIssueNFT(address recipient, string tokenURI_) → uint256` | onlyMinter | Mints the next token to `recipient` with the IPFS tokenURI; reverts on zero address or empty URI; emits `CivicIssueNFTMinted`. |
| `setMinter(address newMinter)` | onlyOwner | Changes the authorised minter; zero-address check; emits `MinterUpdated`. |
| `minter() → address` | view | Current authorised minter. |
| `totalMinted() → uint256` | view | Number of tokens minted so far. |
| `owner()` / `transferOwnership` / `renounceOwnership` | Ownable | Standard OpenZeppelin ownership. |
| `tokenURI(uint256) → string` | view | `ipfs://<metadataCid>` for the token. |
| `ownerOf`, `balanceOf`, `transferFrom`, `safeTransferFrom`, `approve`, `setApprovalForAll`, `getApproved`, `isApprovedForAll` | ERC-721 | Standard ERC-721; tokens are transferable (not soulbound). |
| `supportsInterface(bytes4)` | view | ERC-165 (ERC-721, ERC-721 Metadata, ERC-4906). |

No upgradeability, no proxy, no ERC-20, no payable functions, no withdraw.

### Events and errors

| Event / error | Meaning |
|---|---|
| `CivicIssueNFTMinted(uint256 indexed tokenId, address indexed recipient, string tokenURI)` | Emitted on every mint; the backend reads the token ID from it. |
| `MinterUpdated(address indexed previousMinter, address indexed newMinter)` | Emitted in the constructor and when the owner changes the minter. |
| `Transfer` / `Approval` / `ApprovalForAll` / `MetadataUpdate` | Standard OpenZeppelin events. |
| `error NotMinter(address caller)` | Caller is not the authorised minter. |
| `error ZeroAddress()` | Recipient or new minter is the zero address. |
| `error EmptyTokenURI()` | tokenURI is empty. |
| `error OwnableUnauthorizedAccount(address)` | Non-owner called an owner-only function. |

### NFT metadata (pinned to IPFS, schema `civicchain-nft-v1`)

```json
{
  "name": "CivicChain Civic Issue RP-1790635565871",
  "description": "Verified civic issue reported through CivicChain. Category ROAD_DAMAGE, severity HIGH, Jabalpur. Ethereum Sepolia testnet asset with no monetary value.",
  "image": "ipfs://<IMAGE_CID>",
  "external_url": "<FRONTEND_PUBLIC_URL>/?report=RP-1790635565871",
  "attributes": [
    { "trait_type": "Category", "value": "ROAD_DAMAGE" },
    { "trait_type": "Severity", "value": "HIGH" },
    { "trait_type": "AI Confidence", "value": 96 },
    { "trait_type": "City", "value": "Jabalpur" },
    { "trait_type": "Department", "value": "ROAD_DEPARTMENT" },
    { "trait_type": "Status at Mint", "value": "OPEN" },
    { "trait_type": "Report ID", "value": "RP-1790635565871" },
    { "display_type": "date", "trait_type": "Submitted", "value": 1790635565 }
  ],
  "properties": { "schema": "civicchain-nft-v1", "network": "ethereum-sepolia", "chainId": 11155111, "imageSha256": "<hex>" }
}
```

**Metadata rules:** named by report ID, not token ID (the token ID is only known after the mint; pinned metadata is immutable) · "Status at Mint" is always OPEN · no reporter address, no GPS, no free-text landmark · `image` → `ipfs://<imageCid>`; `tokenURI` → `ipfs://<metadataCid>` · `external_url` is omitted when `FRONTEND_PUBLIC_URL` is unset. The app opens `/?report=<id>` straight into the NFT details.

### Deployment

* `npm run deploy:sepolia` runs `scripts/deploy-sepolia.js` on the `sepolia` Hardhat network.
* It aborts on any chain other than 11155111 (31337 allowed only with `--network localhost`/`hardhat`) and always on chain 1.
* It checks the deployer balance (≥ 0.01 test ETH), deploys `CivicIssueNFT(owner = deployer, minter = MINTER_ADDRESS or deployer)` and waits for 2 confirmations.
* It writes `deployments/sepolia.json`, exports the ABI to `backend/abi/CivicIssueNFT.json` and prints the next steps.
* Optional: `npx hardhat verify --network sepolia <address> <owner> <minter>` publishes the source on Etherscan (needs `ETHERSCAN_API_KEY`).

```json
// deployments/sepolia.json
{
  "network": "sepolia", "chainId": 11155111, "contractName": "CivicIssueNFT",
  "contractAddress": "0x…", "deployer": "0x…", "owner": "0x…", "minter": "0x…",
  "transactionHash": "0x…", "blockNumber": 0, "deployedAt": "2026-…",
  "explorerUrl": "https://sepolia.etherscan.io/address/0x…"
}
```

| Link type | URL pattern |
|---|---|
| Transaction | `https://sepolia.etherscan.io/tx/<txHash>` |
| Address / contract | `https://sepolia.etherscan.io/address/<address>` |
| Single NFT | `https://sepolia.etherscan.io/nft/<contract>/<tokenId>` |
| IPFS (gateway) | `<PINATA_GATEWAY>/<cid>` (default `https://gateway.pinata.cloud/ipfs/<cid>`) |

---

## 5. Backend Deep Dive

Express app in `backend/app.js` (exported for tests), started by `backend/index.js` on port 3001. Middleware order: helmet (CSP enabled) → CORS allow-list from `CORS_ORIGINS` (+ the Android app origins) → JSON body parser (64 kb) → rate limits (120 req / 60 s on `/api/*`, plus stricter limits on report creation, NFT retry and login) → routers → 404 → central error handler (no stack traces or secrets in production). Log lines pass through `redact()`, which masks private keys, JWTs and RPC URLs containing API keys.

`index.js` refuses to start in production without a `JWT_SECRET` of at least 32 characters, warns when Gemini / Pinata keys are missing, then initialises the Sepolia connection and the mint reconciler — none of which block startup.

**Routers:** ai, ipfs, report, nft, profile, analytics, workflow, auth, rbac, department, assignment, chain — each with a thin controller in `backend/controllers/` and logic in `backend/services/`.

### Services (`backend/services/`)

| Service | Responsibility |
|---|---|
| **ai.service.js** | Gemini 2.5 Flash Vision with a strict JSON-only prompt; cleans markdown; validates and coerces `isCivicIssue`, `category`, `severity`, `confidence` (0–100), `reason`; 45 s timeout. |
| **ipfs.service.js** | `uploadToIPFS()` via pinFileToIPFS and `uploadJSON()` via pinJSONToIPFS; keyvalues `{ app, reportId, sha256 }`; 30 s timeout, one retry; codes `IPFS_AUTH_FAILED` / `IPFS_QUOTA` / `IPFS_FAILED`. |
| **nftMetadata.service.js** | `buildCivicIssueMetadata()` — the `civicchain-nft-v1` schema shown in §4; validates before upload. |
| **report.service.js** | `processReport()` (AI + IPFS preview, no NFT) and `createFullReport()` (the full pipeline in §2) with the `pipeline[]` stage log. |
| **ethereum.service.js** | Sepolia provider (`staticNetwork`) + minter wallet (`NonceManager`); init checks (chain ID via `eth_chainId`, contract code, minter authorised); `getStatus()`; serialised mint queue with gas + balance pre-flight; receipt parsing; `getTransactionOutcome()`; `getOnChainToken()`, `balanceOf()`, chunked `getRecentMintEvents()`; explorer URL helpers. Never returns the RPC URL or a key. |
| **nftCache.js** | `nft-cache.json` keyed by contract address; in-memory mirror; atomic writes; `syncFromChain()` from `NFT_DEPLOYMENT_BLOCK` (startup + every 5 min). |
| **nftMint.service.js** | `mintForReport()` (per-report lock, `MAX_MINT_ATTEMPTS`), idempotent `retryReport()`, `retryAllFailed()`, `reconcileOnce()` + `startReconciler()` (startup + every 60 s): completes `NFT_MINT_PENDING` reports that have a tx hash; auto-retries transient failures with backoff; never auto-retries `INSUFFICIENT_FUNDS` without a balance check. |
| **fraud.service.js** | Pure scoring of the AI analysis (rules below). |
| **duplicate.service.js** | SHA-256 exact-image dedupe; `checkDuplicate()` and `registerHash()` (called only after the report is stored). |
| **reward.service.js** | Off-chain civic points computed from the user's reports. |
| **reputation.service.js** | Off-chain reputation score, level and badges (including the NFT badges). |
| **workflow.service.js** | `OPEN → VERIFIED → IN_PROGRESS → RESOLVED` state machine; validates transitions; persists status and notes; never touches the NFT. |
| **department.service.js** | The 8 fixed departments and the category → department map. |
| **jurisdiction.service.js** | The 10-city registry (`cities.json`) and per-user `{ department, city }` jurisdiction. |
| **assignment.service.js** | Auto-assigns reports to a department (by category) and a city (from location); admin manual override. |
| **analytics.service.js** | Overview, category and severity distribution, top reporters, hotspots, trends, insights, and NFT metrics. |
| **auth.service.js** | Single-use nonces (5-min TTL), EIP-191 signature verification with `ethers.verifyMessage`, JWT issuance (24 h). |
| **rbac.service.js** | `roles.json` (lowercase `0x` keys), default CITIZEN, seeds `ADMIN_ADDRESSES` (fallback: deployer address). |
| **reportCache.js** | `report-cache.json` — the primary report store; merges the live workflow status; filters by address. |

| Utility | Purpose |
|---|---|
| `utils/address.js` | `isValidAddress()`, `normalizeAddress()` (lowercase for storage), `toChecksum()` (EIP-55 for responses), 400 `INVALID_WALLET`. |
| `utils/fraudRules.js` | Fraud rule definitions and thresholds. |
| `utils/redact.js` | Masks secrets in logs. |
| `config/ethereum.config.js` | Env + `deployments/sepolia.json` → validated config (`configured`, `issues[]`); never throws. |
| `config/paths.js` | Data directory (`CIVICCHAIN_DATA_DIR`), atomic JSON writes, first-boot seeding. |
| `middleware/upload.js` | Single-file multer upload, size limit, magic-byte type check. |
| `middleware/auth.middleware.js` | `authenticate` (JWT → `{ address, role }`, role re-read from the store) and `requireRole(...)`. |

### Fraud rules

| Rule / band | Effect |
|---|---|
| Low AI confidence (< 50) | +40 |
| Category OTHER (catch-all) | +50 |
| Not a civic issue | +50 |
| Spam keywords in the AI reason | +30 |
| Score 0–30 | ALLOW |
| Score 31–70 | ALLOW with warning (`fraud.warning = true`) |
| Score 71–100 | BLOCK → `FRAUD_BLOCKED`, no IPFS, no NFT |

### Reward, reputation and NFT maths (computed from the user's stored reports)

| Item | Rule |
|---|---|
| Civic points (off-chain) | +10 per accepted report · +5 if severity HIGH · +5 once VERIFIED / IN_PROGRESS / RESOLVED · +20 when RESOLVED |
| Reputation (off-chain) | +5 per valid report · +5 once VERIFIED or later · +15 when RESOLVED |
| Levels | NEWCOMER 0 · RISING 10 · TRUSTED 50 · ELITE 100 · CHAMPION 200 |
| Badges | First Report, Rising Contributor, Trusted Reporter + **First Civic NFT** (1 NFT) and **Civic Collector** (5 NFTs); the UI adds 5 Reports, Power User, Elite Reporter, Champion |
| NFT (on-chain) | One ERC-721 Civic Issue NFT per accepted report — the primary, verifiable reward |

### Departments (8)

| Department | Handles |
|---|---|
| ROAD_DEPARTMENT | Road damage, potholes (`ROAD_DAMAGE`) |
| SANITATION_DEPARTMENT | Garbage and waste (`GARBAGE`) |
| ELECTRICITY_DEPARTMENT | Streetlights and electrical faults (`STREETLIGHT`) |
| DRAINAGE_DEPARTMENT | Drains, waterlogging, flooding, sewage (`FLOOD`, `WATER_LOGGING`, `SEWAGE`) |
| FIRE_DEPARTMENT | Fire hazards (`FIRE`) |
| WATER_DEPARTMENT | Water leaks and supply (`WATER_LEAK`, `WATER_LEAKAGE`) |
| URBAN_DEPARTMENT | Unsafe buildings, urban infrastructure, public safety (`UNSAFE_BUILDING`, `PUBLIC_SAFETY`) |
| GENERAL_DEPARTMENT | Everything else (`OTHER`) |

### Cities (10)

Bhopal, Indore, Jabalpur, Gwalior, Ujjain (Madhya Pradesh) · Raipur (Chhattisgarh) · Nagpur, Pune (Maharashtra) · Delhi (DL) · Bengaluru (Karnataka).

### Statuses and HTTP codes

| Status / code | HTTP | Meaning |
|---|---|---|
| `NFT_MINTED` | 201 | Report stored; NFT confirmed on Sepolia. |
| `NFT_MINT_PENDING` | 202 | Report stored; tx sent or queued; the frontend polls. |
| `NFT_MINT_FAILED` | 202 | Report stored; mint failed; retry available. |
| `NOT_CIVIC_ISSUE` | 422 | AI says not a civic issue; nothing stored. |
| `FRAUD_BLOCKED` | 422 | Fraud score ≥ 71; nothing stored. |
| `DUPLICATE` | 409 | Same image already reported; returns the original report ID. |
| `AI_FAILED` | 502 / 503 | Gemini error, timeout or quota. |
| `IPFS_FAILED` (`IPFS_AUTH_FAILED` / `IPFS_QUOTA`) | 502 / 503 | Pinata failure, bad JWT or free quota used. |
| `INVALID_WALLET` | 400 | Malformed `0x` address. |
| `NOT_ELIGIBLE_LEGACY` | — | A report from before the Ethereum migration, kept for history (no NFT). |

Mint error codes (stored in `nft.errorCode`): `CONTRACT_NOT_CONFIGURED`, `CHAIN_MISMATCH`, `MINTER_NOT_AUTHORIZED`, `INVALID_RECIPIENT`, `INSUFFICIENT_FUNDS`, `RPC_UNAVAILABLE`, `NONCE_ERROR`, `TX_REVERTED`, `TX_TIMEOUT` (tx hash kept), `MAX_ATTEMPTS_REACHED`, `UNKNOWN`.

**Retry and reconciliation**

* `POST /api/nft/retry/:reportId` — the reporter or an ADMIN. Already minted → returns the existing data (no-op).
* Has a tx hash → the chain is checked first: CONFIRMED → reconcile to `NFT_MINTED`; PENDING → stays pending; REVERTED, or NOT_FOUND for more than 10 minutes → mint again with the same tokenURI.
* A per-report lock prevents concurrent retries. `MAX_MINT_ATTEMPTS = 5` for automatic retries (an ADMIN retry may exceed it).
* `POST /api/nft/retry-failed` (ADMIN) retries every `NFT_MINT_FAILED` report one by one.
* `INSUFFICIENT_FUNDS` is never auto-retried without a balance check — top up the minter wallet, then retry.

---

## 6. Frontend Deep Dive

### Stack

| Item | Details |
|---|---|
| Framework | React 18.3 + Vite 7 (ES modules); no router, no Redux/Zustand, no CSS framework |
| Libraries | ethers v6 (wallet + signing), framer-motion (animations), lucide-react (icons), Three.js from cdnjs (hero) |
| Testing | Vitest + @testing-library/react + jsdom |
| Android | Capacitor 6 (`frontend/android`), `npm run build:apk` |
| Public env | `VITE_API_URL`, `VITE_EXPLORER_BASE_URL`, `VITE_IPFS_GATEWAY`, `VITE_APK_URL` (the contract address comes from `/api/nft/contract`) |

### Navigation (no router)

`App.jsx` keeps tab state → `PAGE_MAP`; `ROLE_TABS` (exported by `Header.jsx`) decides the visible tabs; an invalid tab after a role change resets to Home. `/?report=<id>` (the NFT `external_url`) opens that report's NFT details. Below 1080 px the tabs collapse into a menu.

### Pages

| Page | Access | What it does |
|---|---|---|
| **HomePage** | all | Three.js hero; live stats — latest Sepolia block, reports, resolved, Civic NFTs minted, resolution and mint success rate — and the NFT contract link; the **Download APK** section; explore cards; tagline. |
| **FeedPage** | all | Live searchable, category-filtered stream; status badges; severity meter; `NftStatusBadge` ("NFT Minted ✓" opens `NftDetailModal`); inline workflow actions only for authorised roles; 15 s refresh. |
| **SubmitPage** | CITIZEN, ADMIN | Drag/drop image, city selector, landmark; 8-step pipeline driven by the server `pipeline[]`; polling for pending mints (every 4 s for up to 3 min); `NftRewardCard` on success; clear rejection states. |
| **AnalyticsPage** | all | KPIs, insight chips, category bars, severity donut, trends, hotspots, podium + Total Civic NFTs, NFT Minting Success Rate, NFTs by category / severity / city. |
| **ExplorerPage** | all | Ethereum Sepolia Explorer: network strip (network, chain ID, latest block, contract, owner, minter, total minted), latest Civic NFTs grid, recent mint transactions table, filters, pagination, 15 s refresh. |
| **ProfilePage** | wallet | Identity card, trust level, tiles (Civic Reputation · Civic NFTs · Reports Submitted · Reports Resolved), Civic NFT Collection (pending / failed mints with Retry), badges, leaderboard with NFT counts. |
| **AuthorityPage** | AUTHORITY, ADMIN | Pending / Verified / Rejected tabs; verify inside the jurisdiction with notes; NFT badge read-only. |
| **MunicipalPage** | MUNICIPAL_TEAM, ADMIN | Assigned / In-Progress / Completed tabs; start and resolve with notes; NFT badge read-only. |
| **AdminPage** | ADMIN | Users tab (role + department + city, `0x` validation); Metrics tab (overview, per-department, NFT metrics, minter balance with low-balance warning, Retry failed mints). |

**Submit pipeline (8 steps):** AI Analysis → Fraud Check → Duplicate Check → IPFS Evidence → NFT Metadata → Mint Civic NFT on Sepolia ("Minting Civic NFT on Ethereum Sepolia…" + live tx link) → NFT Confirmed → Contribution Recorded.

**Success screen (`NftRewardCard`):** header "Civic Issue Verified"; "NFT Reward — Civic Issue &lt;reportId&gt;"; NFT image; Token ID, Category, Severity, AI Confidence, Network (Ethereum Sepolia), Contract, Transaction, Owner, IPFS Evidence — each with copy and link where relevant; buttons View on Sepolia Etherscan · View NFT on Etherscan · View NFT Metadata · View Evidence; checklist ✓ Civic Issue Verified ✓ Evidence Stored on IPFS ✓ Civic NFT Minted ✓ Contribution Recorded; confetti only when `NFT_MINTED`; a separate "Also earned (off-chain)" line and the testnet disclaimer. Pending card (spinner, tx link, Check again) · failed card (reason, Retry mint) · rejection cards with no blockchain claims.

### Components & state

| Component / module | Purpose |
|---|---|
| `Header.jsx` | Logo, role-aware tabs, bold **Download APK** button (hidden inside the app), wallet chip (short checksum address, role, reputation, NFT count); dropdown: copy address, view on Etherscan, disconnect; server settings inside the app. |
| `WalletModal.jsx` | Create or import a wallet (ethers); shows the `0x` address; testnet identity-wallet warning; optional browser-wallet (MetaMask) connect. |
| `NftRewardCard.jsx` | Submit success / pending / failed / rejection card. |
| `NftCard.jsx` | Collection and Explorer card: image, token #, category, severity, city, current status, mint date, links. |
| `NftDetailModal.jsx` | Full NFT details, on-chain verification, Status at Mint vs current status, raw metadata JSON toggle, all explorer and IPFS buttons. |
| `NftStatusBadge.jsx` | NFT Minted ✓ / Minting… / Mint failed / Legacy report. |
| `NftImage.jsx` | Lazy IPFS image with skeleton and gateway-error fallback. |
| `ServerSetup.jsx` | First-run backend URL screen in the Android app. |
| `ui.jsx` | CountUp, Donut, Skeleton, CopyButton, LiveBadge. |
| `hooks/useWallet.jsx` | `WalletProvider { wallet, reputation, rewards, nftCount, role, department, city, token, isAuthenticated }` + connect, disconnect, refresh, authFlow; storage keys `cp_wallet_v3` / `cp_token_v3`; one-time upgrade from `cp_wallet_v2`; validates via `/api/auth/me`; 15 s refresh. |
| `utils/api.js` | fetch wrapper; base URL from `VITE_API_URL` (or the in-app override); Bearer JWT; helpers for every endpoint. |
| `utils/crypto.js` | `generateWallet()`, `importWallet()`, `signAuthMessage()` (EIP-191), browser-wallet helpers, legacy wallet upgrade. |
| `utils/format.js` | `shortAddress`, `shortHash`, `ipfsToGateway`, `txUrl`, `addressUrl`, `nftUrl`, `formatDate`, `formatLocation`. |
| `utils/platform.js` | Native-app detection, `APK_URL`, backend URL override for the Android app. |

### Branding & styling

Dark theme only via CSS custom properties: saffron `#FF9A3A` and green `#19c37d` on near-black `#07080a`. Fonts: Space Grotesk (text) and JetBrains Mono (addresses, hashes, code). Glassmorphism, grid background, radial glow, Three.js hero. Minted NFT cards get a subtle saffron glow; the APK button is green.

---

## 7. Authentication, Roles & Governance

### Wallet login (passwordless, EIP-191)

1. The browser creates or imports an ethers wallet. The private key never leaves the browser.
2. `GET /api/auth/nonce/{address}` → a one-time nonce (5-minute TTL) and the exact message.
3. The browser signs the text `CivicChain:{checksumAddress}:{nonce}` with `wallet.signMessage()` (EIP-191).
4. `POST /api/auth/login { address, nonce, signature }` → the server recovers the signer with `ethers.verifyMessage()`, checks it equals the address, consumes the nonce, looks up the role and issues a JWT (24 h) containing `{ address (checksum), role }`.
5. Every protected call sends `Authorization: Bearer <JWT>`; the role is re-read from the store on each request.
6. `GET /api/auth/me` validates the token and returns `{ address, role }`.

| Guard / endpoint | Who |
|---|---|
| `authenticate` | Attaches `req.user = { address, role }` from the JWT. |
| `requireRole(...roles)` | Guards role-restricted endpoints. |
| `POST /api/workflow/:id/verify` | AUTHORITY or ADMIN |
| `POST /api/workflow/:id/start` | MUNICIPAL_TEAM or ADMIN |
| `POST /api/workflow/:id/resolve` | MUNICIPAL_TEAM or ADMIN |
| `POST /api/report/create` | Any signed-in wallet |
| `POST /api/nft/retry/:reportId` | The reporter or ADMIN |
| RBAC, department assignment, retry-failed | ADMIN only |
| Jurisdiction | AUTHORITY / MUNICIPAL_TEAM only see and act on reports in their assigned city; ADMIN sees everything. Enforced server-side. |

Old `cp_wallet_v2` users are upgraded once in the browser: the same private key now yields a standard `0x` Ethereum address.

---

## 8. Data Stores

Local JSON files under `backend/data/` (or `CIVICCHAIN_DATA_DIR`) — no database. The blockchain and IPFS are the permanent public evidence; these files are the fast operational state. Writes are atomic (temp file + rename).

| File | Holds |
|---|---|
| `roles.json` | lowercase `0x` address → CITIZEN / AUTHORITY / MUNICIPAL_TEAM / ADMIN |
| `user-departments.json` | `0x` address → `{ department, city }` |
| `cities.json` | The supported-city registry |
| `assignments.json` | reportId → `{ department, city, category, reporter, assignedAt, overriddenBy, … }` |
| `workflow-status.json` | reportId → `{ status, reporter, notes[], updatedAt }` |
| `duplicate-index.json` | SHA-256 image hash → reportId |
| `report-cache.json` | All reports (primary report store) including `evidence` and `nft` objects |
| `nft-cache.json` | Per contract: `chainId`, `lastSyncedBlock`, `tokens{}`, `byReport{}` |
| `_backup_pre_sepolia_<timestamp>/` | Automatic backup made by the data migration script (git-ignored) |

### Report object (`report-cache.json`)

```json
{
  "reportId": "RP-1790635565871", "id": "RP-1790635565871",
  "reporter": "0xA12…",
  "category": "ROAD_DAMAGE", "severity": "HIGH", "confidence": 96,
  "reason": "Large pothole on a main road", "description": "Large pothole on a main road",
  "location": { "address": "Near …", "city": "JABALPUR" },
  "city": "JABALPUR", "cityName": "Jabalpur", "department": "ROAD_DEPARTMENT",
  "status": "OPEN",
  "fraud": { "score": 10, "warning": false },
  "createdAt": 1790635565871, "updatedAt": 1790635569000,
  "evidence": { "imageCid": "bafy…", "imageUrl": "https://gateway…/bafy…", "metadataCid": "bafy…", "metadataUrl": "https://gateway…/bafy…", "imageSha256": "…" },
  "nft": {
    "status": "NFT_MINTED", "tokenId": "123", "contractAddress": "0x…", "transactionHash": "0x…",
    "recipient": "0xA12…", "metadataCid": "bafy…", "imageCid": "bafy…", "tokenURI": "ipfs://bafy…",
    "blockNumber": 123456, "mintedAt": "…", "attempts": 1,
    "explorerUrl": "https://sepolia.etherscan.io/tx/0x…",
    "tokenExplorerUrl": "https://sepolia.etherscan.io/nft/0x…/123"
  }
}
```

### `nft-cache.json`

```json
{
  "0x<contract lowercase>": {
    "chainId": 11155111,
    "lastSyncedBlock": 0,
    "tokens": {
      "123": { "tokenId": "123", "reportId": "RP-…", "recipient": "0xA12…", "tokenURI": "ipfs://…",
               "metadataCid": "…", "imageCid": "…", "transactionHash": "0x…", "blockNumber": 0,
               "mintedAt": "…", "category": "ROAD_DAMAGE", "severity": "HIGH", "city": "JABALPUR", "confidence": 96 }
    },
    "byReport": { "RP-…": "123" }
  }
}
```

### Data migration

`npm run migrate:data` (`scripts/migrate-data-to-ethereum.js`) always backs up `backend/data` first, keeps only valid `0x` keys in `roles.json` / `user-departments.json` (listing dropped legacy keys), re-seeds admins, keeps old reports but strips legacy chain fields and marks them `legacy: true` with `nft.status = NOT_ELIGIBLE_LEGACY`, and keeps `workflow-status.json`, `assignments.json` and `duplicate-index.json` (old image hashes still block re-submission). Flags: `--dry-run` (print only), `--clean` (fresh demo data, cities kept). Running it twice changes nothing the second time.

---

## 9. Complete API Reference

### AI & evidence

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/ai/analyze` | — | Gemini Vision image classification |
| POST | `/api/ai/verify` | — | Keyword fallback classifier |
| POST | `/api/ipfs/upload` | — | Pin an image to Pinata IPFS |

### Reports

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/report/process` | — | AI + IPFS preview only (no NFT) |
| POST | `/api/report/create` | JWT | Full pipeline → Civic Issue NFT |
| GET | `/api/reports` | — | List; filters `category`, `status`, `city`, `department`, `reporter`; `page`, `pageSize ≤ 200`; includes `nft` |
| GET | `/api/reports/:id` | — | Single report including `nft` |
| GET | `/api/report/:reportId/nft` | — | Current NFT status (frontend polling) |

### Civic Issue NFTs

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/nft/contract` | — | Network, chain ID, contract, name, symbol, owner, minter, totalMinted, deployment |
| GET | `/api/nfts` | — | All NFTs, newest first; `page`, `pageSize ≤ 50`, `category`, `city`, `severity` |
| GET | `/api/nft/owner/:address` | — | NFTs owned by an address + its pending / failed mints (400 `INVALID_WALLET` if malformed) |
| GET | `/api/nft/:tokenId` | — | One NFT + on-chain owner/tokenURI check (`verifiedOnChain`) |
| POST | `/api/nft/retry/:reportId` | JWT (reporter / ADMIN) | Idempotent mint retry |
| POST | `/api/nft/retry-failed` | ADMIN | Retry every `NFT_MINT_FAILED` report |

### Profile & gamification

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/profile/:address/points` | — | Civic points (off-chain) + `nftCount` |
| GET | `/api/profile/:address/reputation` | — | Score + level + `nftCount` |
| GET | `/api/profile/:address/badges` | — | Earned badges |
| GET | `/api/profile/:address/nfts` | — | The user's Civic NFT collection |
| GET | `/api/leaderboard` | — | Top 20 reporters (points, reputation, NFT count) |
| GET | `/api/reputation/:address` · `/api/rewards/:address` | — | Compatibility aliases (off-chain data) |

### Analytics

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/analytics/overview` | — | KPIs including NFT totals |
| GET | `/api/analytics/categories` · `/severity` | — | Distributions |
| GET | `/api/analytics/top-reporters` · `/hotspots` · `/trends` · `/insights` | — | Leaderboard, hotspots, trends, insights |
| GET | `/api/analytics/nfts` | — | Total, by category / city / severity, minted / pending / failed, success rate |

### Workflow (governance)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/workflow/:reportId/verify` | AUTHORITY / ADMIN | OPEN → VERIFIED |
| POST | `/api/workflow/:reportId/start` | MUNICIPAL_TEAM / ADMIN | VERIFIED → IN_PROGRESS |
| POST | `/api/workflow/:reportId/resolve` | MUNICIPAL_TEAM / ADMIN | IN_PROGRESS → RESOLVED |

### Auth & RBAC

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/auth/nonce/:address` | — | One-time login nonce |
| POST | `/api/auth/login` | — | EIP-191 signature login → JWT |
| GET | `/api/auth/me` | JWT | Current `{ address, role }` |
| GET | `/api/rbac/role/:address` | JWT | Role of an address |
| GET | `/api/rbac/roles` | ADMIN | All role assignments |
| POST | `/api/rbac/assign` | ADMIN | Assign a role (+ department + city) |

### Departments, cities & assignments

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/departments` · `/api/departments/analytics` | — | Departments and per-department stats |
| GET | `/api/departments/me` · `/me/reports` | JWT | My jurisdiction and its reports |
| GET | `/api/departments/users` | ADMIN | Users with jurisdictions |
| POST | `/api/departments/assign-user` | ADMIN | Set a user's department + city |
| GET | `/api/cities` | — | City registry |
| GET | `/api/assignments` | ADMIN | All assignments |
| GET | `/api/assignments/:reportId` | JWT | One assignment |
| POST | `/api/assignments/assign` | ADMIN | Manual override |

### Chain & system

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | — | Service health incl. a chain section |
| GET | `/api/chain/status` | — | Sepolia status: chain ID, latest block, contract, owner, minter, minter balance, low-balance flag, totalMinted (never keys or the RPC URL) |
| GET | `/api/stats` | — | Network, chain ID, latest block, reports, resolved, NFTs, mint success rate |
| GET | `/api/contracts` | — | Alias of `/api/nft/contract` |
| GET | `/api/events` | — | Recent `CivicIssueNFTMinted` mints |
| GET | `/api/balance/:address` | — | Sepolia ETH balance (informational) |
| GET | `/downloads/CivicChain.apk` | — | The Android app |

### Removed endpoints

| Endpoint | Status |
|---|---|
| `POST /api/broadcast` | Removed — the backend never relays client transactions. |
| `GET /api/nonce/:address` | Removed — login nonces live at `/api/auth/nonce/:address`. |
| `GET /api/blocks` | Removed (410 `REMOVED`, use `/api/nfts`). |
| `POST /api/report/prepare`, `/api/report/finalize` | Removed — the backend runs the whole pipeline. |
| Background block poller | Removed — reports are written directly by the pipeline. |

---

## 10. Setup & Running

```bash
# 1. Install
npm install
cd frontend && npm install && cd ..

# 2. Configure (never commit .env)
cp .env.example .env          # SEPOLIA_RPC_URL, DEPLOYER_PRIVATE_KEY, GEMINI_API_KEY, PINATA_JWT, JWT_SECRET, ADMIN_ADDRESSES
cp frontend/.env.example frontend/.env   # VITE_* public values only

# 3. Contract
npm run compile
npm run test:contracts        # = npx hardhat test
npm run deploy:sepolia        # writes deployments/sepolia.json + backend/abi
#    → copy NFT_CONTRACT_ADDRESS and NFT_DEPLOYMENT_BLOCK into .env

# 4. (Optional) migrate old demo data
npm run migrate:data -- --dry-run
npm run migrate:data          # or: -- --clean for a fresh demo

# 5. Check and run
npm run smoke:sepolia         # read-only Sepolia status
npm run dev                   # backend :3001 + frontend :5173
npm run e2e:sepolia           # real end-to-end mint with a fixture photo

# 6. Tests and build
npm test                      # check:legacy + check:secrets + backend + frontend
npm run build                 # frontend production build
npm run build:apk             # Android APK → frontend/public/downloads/CivicChain.apk
```

| npm script | What it does |
|---|---|
| `npm run backend` / `frontend` / `dev` / `start` | Start backend, frontend, both, or production |
| `npm run build` | Frontend production build |
| `npm run build:apk` | Android APK (Capacitor 6) published to `frontend/public/downloads/` |
| `npm run compile` | `hardhat compile` |
| `npm run test:contracts` | `hardhat test` (contract tests) |
| `npm run chain:local` / `deploy:local` | Local Hardhat node + rehearsal deploy (31337) |
| `npm run deploy:sepolia` | Deploy CivicIssueNFT to Sepolia |
| `npm run migrate:data` | Back up and convert `backend/data` (`--dry-run`, `--clean`) |
| `npm run smoke:sepolia` | Read-only live chain/contract check |
| `npm run e2e:sepolia` | Real end-to-end submission → NFT mint → on-chain checks |
| `npm run check:legacy` | Fails if any reference to the removed chain remains |
| `npm run check:secrets` | Fails if an env file or key-like value would be committed |
| `npm test` / `test:backend` / `test:frontend` | Full suite / backend / frontend |
| `npm run rehearsal:local` / `rehearsal:ui` | Local full-stack rehearsal (fake AI/IPFS) and headless UI walkthrough |

**Deployment:** `render.yaml` (Render Blueprint, one web service), `Dockerfile` (any container host), or any Node host with `npm install --include=dev && npm run build && npm start`.

---

## 11. Environment Variables

| Variable | Required | Where | Purpose |
|---|---|---|---|
| `SEPOLIA_RPC_URL` | Yes | backend | Sepolia JSON-RPC URL (may contain an API key) |
| `DEPLOYER_PRIVATE_KEY` | Yes | backend | Sepolia-only deployer + minter key; pays gas |
| `MINTER_ADDRESS` | No | backend | Separate minter at deploy time (default: deployer) |
| `NFT_CONTRACT_ADDRESS` | Yes | backend | Deployed CivicIssueNFT (fallback: `deployments/sepolia.json`) |
| `NFT_DEPLOYMENT_BLOCK` | Recommended | backend | Start block for event sync |
| `EXPECTED_CHAIN_ID` | No | backend | 11155111 |
| `MINT_CONFIRMATIONS` | No | backend | Default 1 |
| `MINT_TIMEOUT_MS` | No | backend | Default 180000 |
| `MINT_WAIT_MS` | No | backend | Default 90000 (sync wait before 202) |
| `MAX_MINT_ATTEMPTS` | No | backend | Default 5 |
| `LOG_CHUNK_SIZE` | No | backend | Default 1000 blocks per getLogs query |
| `EXPLORER_BASE_URL` | No | backend | `https://sepolia.etherscan.io` |
| `ETHERSCAN_API_KEY` | No | backend | Contract source verification |
| `ADMIN_ADDRESSES` | Recommended | backend | Comma-separated `0x` admins |
| `GEMINI_API_KEY` | Yes | backend | Gemini Vision |
| `PINATA_JWT` | Yes | backend | Pinata pinning |
| `PINATA_GATEWAY` | No | backend | Gateway base (default `https://gateway.pinata.cloud/ipfs`) |
| `JWT_SECRET` | Yes | backend | ≥ 32 chars |
| `CORS_ORIGINS` | No | backend | Default `http://localhost:5173` |
| `MAX_UPLOAD_MB` | No | backend | Default 10 |
| `FRONTEND_PUBLIC_URL` | No | backend | `external_url` in metadata |
| `CIVICCHAIN_DATA_DIR` | No | backend | Data directory (default `backend/data`; seeded on first boot) |
| `AI_TIMEOUT_MS` | No | backend | Default 45000 |
| `PORT` / `NODE_ENV` | No | backend | 3001 / development |
| `ALLOW_LOCAL_CHAIN` | No | backend | Tests / rehearsal only: allow chain 31337 |
| `LOG_LEVEL` | No | backend | `debug` prints verbose fraud / duplicate logs |
| `VITE_API_URL` | No | frontend | Backend URL when not same-origin |
| `VITE_EXPLORER_BASE_URL` | No | frontend | `https://sepolia.etherscan.io` |
| `VITE_IPFS_GATEWAY` | No | frontend | `https://gateway.pinata.cloud/ipfs` |
| `VITE_APK_URL` | No | frontend | Download APK link (default `/downloads/CivicChain.apk`) |

Only `VITE_*` variables reach the browser, and they hold public values only.

---

## 12. Project Phases

| Phase | Feature |
|---|---|
| 1–5 | AI Vision (Gemini), classification scaffold |
| 6 | IPFS evidence storage (Pinata) |
| 7 | Unified AI + IPFS processing pipeline |
| 8 | Blockchain report creation (originally on a custom JS-VM chain) |
| 9 | Fraud-detection gate |
| 10 | Rewards + reputation |
| 11 | Duplicate detection (SHA-256 exact match) |
| 12 | Analytics dashboard |
| 13 | Authority workflow (verify → resolve) |
| 14A | Wallet auth + RBAC |
| 14B | Department auto-assignment |
| 14C | City layer + per-user jurisdiction |
| 15 | Final governance phase (departments fixed) |
| — | CivicChain rebrand + redesigned Feed / Submit / Analytics / Explorer UI |
| 16.1 | Migration 1 — CivicIssueNFT.sol, Hardhat, contract tests, Sepolia deploy script |
| 16.2 | Migration 2 — Ethereum wallets, EIP-191 login, data migration, ethereum.service |
| 16.3 | Migration 3 — NFT pipeline, statuses, retry, nft-cache, NFT APIs, NFT analytics |
| 16.4 | Migration 4 — Frontend NFT experience, Sepolia Explorer, NFT collection, Download APK |
| 16.5 | Migration 5 — legacy chain removed, security hardening, docs, Android APK, deployment config (v3.0.0) |

---

## 13. Repository Map

```
CivicChain/
├── backend/
│   ├── index.js                  # entry: config checks, listen, chain init, reconciler
│   ├── app.js                    # Express app, middleware, routers, built-in routes
│   ├── abi/CivicIssueNFT.json    # exported ABI (public)
│   ├── config/                   # ethereum.config.js, paths.js
│   ├── routes/                   # ai, ipfs, report, nft, profile, analytics, workflow,
│   │                             # auth, rbac, department, assignment, chain
│   ├── controllers/              # thin handlers per route group
│   ├── services/                 # ai, ipfs, nftMetadata, report, ethereum, nftCache, nftMint,
│   │                             # fraud, duplicate, reward, reputation, workflow,
│   │                             # department, jurisdiction, assignment, analytics,
│   │                             # auth, rbac, reportCache
│   ├── middleware/               # auth.middleware.js, upload.js
│   ├── utils/                    # address.js, fraudRules.js, redact.js
│   ├── tests/                    # Vitest + supertest (+ local Hardhat integration)
│   └── data/                     # JSON stores (+ nft-cache.json)
├── contracts/
│   └── CivicIssueNFT.sol         # ERC-721 Civic Issue NFT
├── scripts/
│   ├── deploy-sepolia.js         # deploy + deployments file + ABI export
│   ├── migrate-data-to-ethereum.js
│   ├── sepolia-smoke.js          # read-only live check
│   ├── e2e-sepolia.js            # real end-to-end mint
│   ├── check-no-legacy.js        # legacy reference guard
│   ├── check-secrets.js          # secrets guard
│   ├── gen-city-keys.js          # demo AUTHORITY / MUNICIPAL wallets per city
│   ├── gen-android-assets.mjs    # app icons + splash screens
│   └── build-apk.sh              # Android APK build → frontend/public/downloads
├── test/
│   ├── contracts/CivicIssueNFT.test.js
│   ├── fixtures/                 # real civic photos for e2e
│   └── harness/                  # local rehearsal + headless UI walkthrough
├── deployments/sepolia.json      # public deployment record (after deploy)
├── docs/                         # MIGRATION_AUDIT.md, VERIFICATION_REPORT.md, MIGRATION_STATUS.md
├── frontend/
│   ├── index.html
│   ├── capacitor.config.json
│   ├── android/                  # Capacitor Android project
│   ├── public/downloads/CivicChain.apk
│   └── src/
│       ├── App.jsx · main.jsx · styles.css
│       ├── components/           # Header, WalletModal, ui, NftCard, NftDetailModal,
│       │                         # NftRewardCard, NftStatusBadge, NftImage, ServerSetup
│       ├── hooks/useWallet.jsx
│       ├── pages/                # Home, Feed, Submit, Analytics, Explorer, Profile,
│       │                         # Authority, Municipal, Admin
│       ├── utils/                # api.js, crypto.js, format.js, platform.js
│       └── test/                 # Vitest + Testing Library
├── audit.js                      # live RBAC / wallet-auth audit (ethers signing)
├── hardhat.config.cjs
├── render.yaml · Dockerfile · .dockerignore
├── package.json · .env.example · .gitignore
└── README.md · PROJECT_DOCUMENTATION.md · CHANGELOG.md
```
