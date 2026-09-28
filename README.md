# CivicChain — Decentralized Civic Intelligence on Ethereum Sepolia

> **Citizens report. AI verifies. IPFS preserves. Ethereum records. NFTs reward civic participation.**

> ⚠️ **Ethereum Sepolia is a test network. The NFTs are testnet assets and have no monetary value.** There is no ERC-20 token and no cryptocurrency; citizens never need ETH.

**Version 3.0.0** · Node.js + Express · React 18 + Vite 7 · Solidity ^0.8.24 + OpenZeppelin v5 + Hardhat 2 · ethers v6 · Google Gemini Vision · Pinata IPFS · Android app (Capacitor)

📱 **Android app:** the website has a **Download APK** button in the navbar and on the home page (`/downloads/CivicChain.apk`).

---

## The problem

Civic problems — potholes, overflowing garbage, broken streetlights, water leaks, floods, unsafe buildings — are reported to portals that can be edited, ignored or quietly erased. Citizens have no proof they reported anything, and authorities have no trustworthy, spam-free signal.

## The solution

CivicChain turns a single photo into a verified, permanent civic record:

1. **AI verification** — Google Gemini 2.5 Flash Vision classifies the photo and returns strict JSON: `isCivicIssue`, `category`, `severity`, `confidence` (0–100), `reason`.
2. **Fraud detection** — rule-based scoring before anything is stored:

   | Rule | Score |
   |---|---|
   | AI confidence < 50 | +40 |
   | Category `OTHER` | +50 |
   | Not a civic issue | +50 |
   | Spam keywords in the AI reason (selfie, food, floor tiles, …) | +30 |

   0–30 → allow · 31–70 → allow with a warning · **≥ 71 → blocked** (no IPFS, no transaction).
3. **Duplicate detection** — the SHA-256 of the image is compared with every accepted report; an exact match is rejected and links the original report.
4. **IPFS** — the evidence image **and** the NFT metadata JSON are pinned to Pinata IPFS.
5. **Ethereum Sepolia** — the backend minter wallet mints an **ERC-721 Civic Issue NFT** (`CivicIssueNFT`, symbol `CIVIC`) directly to the citizen's `0x` wallet. The backend pays the gas.
6. **Governance** — the report is routed to a municipal department and city: `OPEN → VERIFIED (Authority) → IN_PROGRESS → RESOLVED (Municipal team)`.
7. **Gamification** — reputation, civic points and badges are **off-chain** and separate from the NFT.

### What the Civic Issue NFT proves — and what it does not

* ✅ *"This citizen submitted a civic issue that passed CivicChain's AI, fraud and duplicate checks, with the evidence permanently on IPFS."*
* ❌ It does **not** prove the municipality resolved the issue — resolution is tracked in the off-chain workflow and never rewrites the NFT (the metadata says **"Status at Mint: OPEN"**).

### NFT metadata (schema `civicchain-nft-v1`)

```json
{
  "name": "CivicChain Civic Issue RP-1790635565871",
  "description": "Verified civic issue reported through CivicChain. Category ROAD_DAMAGE, severity HIGH, Jabalpur. Ethereum Sepolia testnet asset with no monetary value.",
  "image": "ipfs://<imageCid>",
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

It is named by the **report ID** (the token ID is only known after the mint) and contains **no reporter address, GPS or landmark** — ownership is already on-chain.

### Reputation, points and badges (off-chain)

| | Rule |
|---|---|
| Civic points | +10 per accepted report · +5 if HIGH · +5 once VERIFIED/IN_PROGRESS/RESOLVED · +20 when RESOLVED |
| Reputation | +5 per report · +5 once VERIFIED or later · +15 when RESOLVED |
| Levels | Newcomer 0 · Rising 10 · Trusted 50 · Elite 100 · Champion 200 |
| Badges | First Report, 5 Reports, Trusted, Power User, Elite Reporter, Champion, **First Civic NFT** (1), **Civic Collector** (5) |

### Roles

| Role | Can |
|---|---|
| CITIZEN | Submit reports, receive Civic Issue NFTs, earn reputation / points / badges |
| AUTHORITY | Verify reports in their city (`OPEN → VERIFIED`) |
| MUNICIPAL_TEAM | Start and resolve verified work in their city (`VERIFIED → IN_PROGRESS → RESOLVED`) |
| ADMIN | Assign roles, departments and cities; see everything; NFT metrics; retry failed mints |

---

## Architecture

```
Citizen (0x identity wallet, no ETH)
   │ photo + city + landmark
   ▼
React + Vite UI / Android app ── Bearer JWT (EIP-191 wallet login)
   │
   ▼
Express backend
   ├─ Gemini Vision ──── not civic?  → NOT_CIVIC_ISSUE (no tx)
   ├─ Fraud engine ───── score ≥ 71? → FRAUD_BLOCKED  (no tx)
   └─ Duplicate check ── same hash?  → DUPLICATE      (no tx)
   │
   ▼
Pinata IPFS: image → ipfs://IMAGE_CID ; metadata JSON → ipfs://META_CID   (failure → IPFS_FAILED, nothing stored)
   │
   ▼
Report stored: NFT_MINT_PENDING  (evidence safe even if the mint fails)
   │
   ▼
Ethereum Sepolia · CivicIssueNFT.mintCivicIssueNFT(0xCitizen, ipfs://META_CID) — backend minter pays gas
   │
   ▼
Receipt confirmed → NFT_MINTED → token #n owned by 0xCitizen
   │
   ▼
Workflow OPEN → VERIFIED → IN_PROGRESS → RESOLVED  (off-chain; NFT unchanged)
```

Design decisions: fraud-first gating (no storage or gas spent on rejected photos) · backend-paid gas · store before mint · serialised mints (one in-process queue + ethers NonceManager) · idempotent retry (the previous tx hash is checked on-chain first — never a double mint) · honest statuses (nothing is "minted" until the receipt is confirmed) · chain guard (mainnet chain 1 is refused; Sepolia 11155111 only) · the JSON cache is operational state, the chain + IPFS are the evidence.

### Report statuses

| Status | HTTP | Meaning |
|---|---|---|
| `NFT_MINTED` | 201 | Report stored, NFT confirmed on Sepolia |
| `NFT_MINT_PENDING` | 202 | Report stored, tx sent or queued — the UI polls |
| `NFT_MINT_FAILED` | 202 | Report stored, mint failed — **Retry mint** is available |
| `NOT_CIVIC_ISSUE` / `FRAUD_BLOCKED` | 422 | Nothing stored, no tx |
| `DUPLICATE` | 409 | Nothing stored, links the original report |
| `AI_FAILED` / `IPFS_FAILED` | 502 / 503 | Nothing stored, clear message |

---

## Setup

Everything is free: Sepolia test ETH from a faucet, a free RPC, the free Pinata and Gemini tiers.

```bash
# 1. Install
npm install
cd frontend && npm install && cd ..

# 2. Configure (never commit .env)
cp .env.example .env
#   SEPOLIA_RPC_URL, DEPLOYER_PRIVATE_KEY (a NEW Sepolia-only key), GEMINI_API_KEY,
#   PINATA_JWT, JWT_SECRET (≥ 32 chars), ADMIN_ADDRESSES
cp frontend/.env.example frontend/.env        # public VITE_* values only (optional)

# 3. Contract
npm run compile
npm run test:contracts                         # 18 contract tests
npm run deploy:sepolia                         # writes deployments/sepolia.json + backend/abi
#   → copy NFT_CONTRACT_ADDRESS and NFT_DEPLOYMENT_BLOCK into .env

# 4. Check and run
npm run smoke:sepolia                          # read-only Sepolia status
npm run dev                                    # backend :3001 + frontend :5173
npm run e2e:sepolia                            # REAL end-to-end mint with a fixture photo

# 5. Tests and build
npm test                                       # legacy + secrets checks, backend, frontend
npm run build                                  # frontend production build
```

### Getting free Sepolia test ETH and an RPC

* **Deployer / minter key** — create a fresh key used only for Sepolia:
  `node -e "console.log(require('ethers').Wallet.createRandom().privateKey)"`.
  Never reuse a key that was ever committed or shared.
* **Test ETH** — use a public Sepolia faucet (Google Cloud Web3 faucet, Alchemy or Infura faucet, or a proof-of-work faucet). A few hundredths of a test ETH covers deployment and many mints.
* **RPC** — a free Alchemy / Infura Sepolia endpoint, or a public one such as `https://ethereum-sepolia-rpc.publicnode.com` (fine for development; less reliable during a live demo).

### Contract deployment and verification

```bash
npm run deploy:sepolia
# optional — publish the source on Etherscan (free ETHERSCAN_API_KEY):
npx hardhat verify --network sepolia <contract> <owner> <minter>
```

The deploy script aborts on any chain other than Sepolia (chain 1 is always refused), checks the deployer has at least 0.01 test ETH, waits for 2 confirmations and prints the Etherscan link.

### Local rehearsal (no keys needed)

```bash
npm run compile && (cd frontend && npm run build)
npm run rehearsal:local      # Hardhat chain + real backend/frontend, Gemini/Pinata swapped for local fakes
npm run rehearsal:ui         # headless Chrome walkthrough with screenshots
```

This is a test harness only (`test/harness/`); production code has no fake modes.

---

## Environment variables

| Variable | Required | Where | Purpose |
|---|---|---|---|
| `SEPOLIA_RPC_URL` | yes | backend | Sepolia JSON-RPC URL (may contain an API key) |
| `DEPLOYER_PRIVATE_KEY` | yes | backend | Sepolia-only deployer + minter key; pays gas |
| `MINTER_ADDRESS` | no | backend | Separate minter at deploy time (default: deployer) |
| `NFT_CONTRACT_ADDRESS` | yes | backend | Deployed CivicIssueNFT (fallback: `deployments/sepolia.json`) |
| `NFT_DEPLOYMENT_BLOCK` | recommended | backend | Start block for event sync |
| `EXPECTED_CHAIN_ID` | no | backend | 11155111 |
| `MINT_CONFIRMATIONS` / `MINT_TIMEOUT_MS` / `MINT_WAIT_MS` / `MAX_MINT_ATTEMPTS` | no | backend | 1 / 180000 / 90000 / 5 |
| `LOG_CHUNK_SIZE` | no | backend | 1000 blocks per `getLogs` query |
| `EXPLORER_BASE_URL` | no | backend | `https://sepolia.etherscan.io` |
| `ETHERSCAN_API_KEY` | no | backend | Contract source verification |
| `ADMIN_ADDRESSES` | recommended | backend | Comma-separated `0x` admins |
| `GEMINI_API_KEY` | yes | backend | Gemini Vision |
| `PINATA_JWT` | yes | backend | Pinata pinning |
| `PINATA_GATEWAY` | no | backend | `https://gateway.pinata.cloud/ipfs` |
| `JWT_SECRET` | yes | backend | ≥ 32 chars; production refuses to start without it |
| `CORS_ORIGINS` | no | backend | `http://localhost:5173` (the Android app origins are always allowed) |
| `MAX_UPLOAD_MB` | no | backend | 10 |
| `FRONTEND_PUBLIC_URL` | no | backend | `external_url` in NFT metadata |
| `CIVICCHAIN_DATA_DIR` | no | backend | JSON data directory (default `backend/data`; seeded on first boot) |
| `PORT` / `NODE_ENV` | no | backend | 3001 / development |
| `ALLOW_LOCAL_CHAIN` | no | backend | Tests / rehearsal only: accept chain 31337 |
| `VITE_API_URL` | no | frontend | Backend URL when not same-origin |
| `VITE_EXPLORER_BASE_URL` | no | frontend | `https://sepolia.etherscan.io` |
| `VITE_IPFS_GATEWAY` | no | frontend | `https://gateway.pinata.cloud/ipfs` |
| `VITE_APK_URL` | no | frontend | Where the Download APK buttons point (default `/downloads/CivicChain.apk`) |

Only `VITE_*` variables reach the browser, and they hold public values only.

---

## Deployment

The backend serves the built frontend, so **one web service** hosts everything.

* **Render** — `render.yaml` is a ready Blueprint: *New → Blueprint → select the repo*, then fill the secret env vars in the dashboard. Health check: `/health`.
* **Docker** — `docker build -t civicchain . && docker run -p 3001:3001 --env-file .env civicchain`.
* **Any Node host** — `npm install --include=dev && npm run build && npm start`.

The free Render plan has an ephemeral disk: `backend/data` resets on redeploy (the chain and IPFS keep the evidence). Attach a disk and set `CIVICCHAIN_DATA_DIR` for persistence.

### Android app (APK)

```bash
APK_API_URL=https://your-deployed-backend npm run build:apk
```

Builds the Capacitor 6 app (JDK 17 + Android SDK 34), signs it with the release keystore referenced in the git-ignored `frontend/android/keystore.properties`, and publishes it to `frontend/public/downloads/CivicChain.apk`, which the website serves. Without `APK_API_URL` the app asks for the server address on first launch (changeable later from the header).

---

## Testing

| Suite | Command | Covers |
|---|---|---|
| Contract (Hardhat) | `npm run test:contracts` | deployment, name/symbol, owner, authorised minter, NotMinter, mint + event, tokenURI, ownership, ID increment, totalMinted, zero-address / empty-URI reverts, setMinter, OwnableUnauthorizedAccount, old minter blocked |
| Backend (Vitest + supertest) | `npm run test:backend` | EIP-191 login (valid, wrong signer, expired/reused nonce, invalid wallet), chain guard, mint success/failure mapping, serialised queue, full pipeline gates, IPFS failures, retry idempotency, reconciler, NFT routes, workflow jurisdiction, analytics, data migration; plus a real-ethers integration test against a local Hardhat node |
| Frontend (Vitest + Testing Library) | `npm run test:frontend` | NFT success card links, no "minted" text for pending/failed, retry, rejection states, Explorer, Profile collection, Feed badge → modal, skeletons, wallet crypto + v2 → v3 upgrade |
| Guards | `npm run check:legacy`, `npm run check:secrets` | no legacy chain references; no committed env files or key-like values |
| Live | `npm run smoke:sepolia`, `npm run e2e:sepolia` | read-only Sepolia status; real mint + `ownerOf` / `tokenURI` / metadata checks |

`npm test` runs the guards, backend and frontend suites. Live results are recorded in [`docs/VERIFICATION_REPORT.md`](docs/VERIFICATION_REPORT.md).

## Demo flow

1. Create or import a wallet → the header shows a `0x…` address (identity only, no gas).
2. Upload a civic photo (pothole, garbage, streetlight, water leak, flood) + city + landmark.
3. Watch the 8-step pipeline: AI → fraud → duplicate → IPFS evidence → NFT metadata → **Minting Civic NFT on Ethereum Sepolia…** (live tx link) → confirmed → contribution recorded.
4. The success card shows token ID, contract, transaction, owner and IPFS evidence, with buttons to Sepolia Etherscan, the NFT page, the metadata and the image.
5. Profile → Civic NFT Collection · Explorer → latest NFTs + mint transactions · Analytics → NFT charts.
6. Governance: an Authority verifies, the Municipal team starts and resolves — the current status changes, the NFT history stays intact.
7. Negative demo: a selfie / indoor photo or the same pothole again → **no transaction is created**.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `INSUFFICIENT_FUNDS` | The minter wallet is out of test ETH — top up from a faucet; the report is saved and **Retry mint** works afterwards |
| `NONCE_ERROR` | Two txs raced from the same key elsewhere — retry; do not use the minter key in MetaMask at the same time |
| `CHAIN_MISMATCH` / `MAINNET REFUSED` | `SEPOLIA_RPC_URL` points at the wrong network |
| `MINTER_NOT_AUTHORIZED` | The backend key is not the contract minter — the owner calls `setMinter(<backend address>)` or redeploys |
| RPC 429 / rate limited | Free tier throttling — the reconciler finishes pending mints later |
| `eth_getLogs` range too large | Lower `LOG_CHUNK_SIZE`; the cache stays the primary source for the Explorer |
| `IPFS_AUTH_FAILED` / `IPFS_QUOTA` | Wrong/expired `PINATA_JWT` or free quota used — no mint happens without IPFS |
| `AI_FAILED` | Gemini key / quota / timeout — nothing is stored; resubmit |
| Login fails after upgrade | Clear old tokens and reload — the one-time wallet upgrade runs once |
| NFT image not showing | Gateway warming up — wait a minute or use a dedicated Pinata gateway |

## Security

* Private keys, `PINATA_JWT`, `GEMINI_API_KEY`, `JWT_SECRET` and the RPC URL exist only in the backend `.env` — never in code, logs, API responses or `VITE_*` variables. `.env` is git-ignored and `.env.example` has empty placeholders. **The private key that appeared in the old `.env.example` is treated as compromised and must never be funded.**
* Only the authorised minter can mint (`NotMinter`); mainnet is refused in the backend and the deploy script.
* Helmet with a CSP, a CORS allow-list, global + per-route rate limits, 24 h JWTs, role checks, server-side city jurisdiction, and input validation on every route.
* Uploads: a single file, JPEG/PNG/WebP verified by magic bytes, size limit.
* Fraud and duplicate detection run before any IPFS upload or transaction.
* A central error handler hides stack traces; `redact()` masks secrets in logs; the Admin page and `/api/chain/status` warn when the minter balance is low.

## Repository map

See [`PROJECT_DOCUMENTATION.md`](PROJECT_DOCUMENTATION.md) for the complete v3.0.0 documentation (contract, services, API reference, data stores), [`CHANGELOG.md`](CHANGELOG.md) for the history, and [`docs/MIGRATION_AUDIT.md`](docs/MIGRATION_AUDIT.md) for the migration record.

## License

Apache-2.0 — see [LICENSE](LICENSE).
