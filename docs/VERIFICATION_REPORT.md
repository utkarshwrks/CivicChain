# CivicChain v3.0.0 — Verification Report

Date: 2026-09-29 (UTC 2026-09-28T23:06Z) · Branch `main` · Only real, observed values are recorded here. Anything not run is marked **NOT RUN** with the reason.

## 1. Live Ethereum Sepolia

| Item | Value |
|---|---|
| Sepolia RPC reachable (read-only, public endpoint) | ✅ yes — `eth_chainId` = **11155111**, latest block **11,803,698** at the time of the check |
| Backend minter / deployer address | `0x775c93d2335C638933a36850F08EcC9220E9e783` (fresh Sepolia-only key, stored only in the local git-ignored `.env`) |
| Minter balance | **0.0 Sepolia ETH** |
| Contract deployment (`npm run deploy:sepolia`) | **NOT RUN** — the deployer wallet has no Sepolia test ETH. Free faucets need a browser session and, for some, a mainnet balance; they could not be used unattended. |
| Contract address / deployment tx / Etherscan link | **NOT RUN** (see above) — `deployments/sepolia.json` is created by the deploy script |
| Mint tx hashes, token IDs, owners | **NOT RUN** — needs the deployed contract, `GEMINI_API_KEY` and `PINATA_JWT` (none configured on this machine) |
| Metadata CID / image CID + gateway links | **NOT RUN** (needs `PINATA_JWT`) |
| `npm run smoke:sepolia` | ✅ ran — reports chain 11155111, RPC reachable, latest block, minter address, balance 0.0 and "NOT ready: NFT_CONTRACT_ADDRESS is not set" (correct) |
| `npm run e2e:sepolia` | ✅ ran — correctly reports `NOT RUN — Sepolia is not ready on the backend` |

### To finish the live proof (≈ 10 minutes)

1. Fund `0x775c93d2335C638933a36850F08EcC9220E9e783` with ~0.05 Sepolia ETH from a faucet (or put your own new Sepolia-only key in `.env`).
2. Put `GEMINI_API_KEY` and `PINATA_JWT` in `.env` (a dedicated RPC URL in `SEPOLIA_RPC_URL` is recommended for the demo).
3. `npm run deploy:sepolia` → copy `NFT_CONTRACT_ADDRESS` and `NFT_DEPLOYMENT_BLOCK` into `.env`.
4. `npm run smoke:sepolia` → must print "✅ Sepolia configuration is ready".
5. `npm run dev` and `npm run e2e:sepolia` → prints the real tx hash, token ID, Etherscan and IPFS links. Record them in this file.

## 2. Automated tests (all green)

| Suite | Command | Result |
|---|---|---|
| Legacy reference guard | `npm run check:legacy` | ✅ 0 references in 156 files |
| Secrets guard | `npm run check:secrets` | ✅ no committed env files or key-like values (195 files) |
| Contract tests (Hardhat) | `npx hardhat test` | ✅ **18 passing** |
| Backend (Vitest + supertest) | `npm run test:backend` | ✅ **64 passed** (5 files) |
| Frontend (Vitest + Testing Library) | `npm run test:frontend` | ✅ **22 passed** (3 files) |
| Frontend build | `npm run build` | ✅ built; `dist/` contains no `PRIVATE`, `PINATA_JWT`, `GEMINI` or `DEPLOYER` strings |
| Live RBAC audit (`node audit.js`) against a running backend | ✅ 9 passed, 0 failed |

The backend suite includes a **real-ethers integration test** (`backend/tests/ethereum.local.test.js`) against a local Hardhat node: `ethereum.service` deploys-and-mints for real, parses the token ID from the receipt, the chain agrees (`ownerOf`, `tokenURI`), a non-minter key is detected, chain 31337 is refused unless explicitly allowed, and **three concurrent mints from one wallet get sequential IDs with no nonce collision**.

## 3. Local full-stack rehearsal (Hardhat chain 31337 — NOT Sepolia)

`npm run rehearsal:local` + `npm run rehearsal:ui`: the real backend and built frontend against a real local Hardhat chain, with Gemini and Pinata swapped for local fakes (test harness only).

| Check | Result |
|---|---|
| Wallet creation → EIP-191 login | ✅ `0x` address in the header, CITIZEN role |
| Civic photo → 8-step pipeline → NFT success card | ✅ token #1 minted on the local chain to the citizen's address; all 8 stages done; every button present |
| Same photo again | ✅ `DUPLICATE`, links the original report, **no transaction** |
| Indoor floor-tiles photo | ✅ `NOT_CIVIC_ISSUE`, **no transaction** |
| Profile → Civic NFT Collection | ✅ 2 NFT cards, "First Civic NFT" badge unlocked, NFT count in the header |
| Explorer | ✅ network strip, latest NFTs grid, mint transactions table |
| Feed → "NFT Minted ✓" → NFT details | ✅ modal shows "Verified on … (ownerOf + tokenURI match)" |
| Analytics | ✅ Total Civic NFTs, NFT Minting Success Rate, NFTs by category / severity / city |
| Mobile (390 px) | ✅ header with APK button + burger menu |
| Browser console | ✅ no JavaScript errors (only the expected 409 / 422 responses of the negative demo) |

Bugs found and fixed during the rehearsal: a page transition that stuck after switching Explorer tabs; the NFT modal image not loading when details arrived after mount; a hidden label on the active Explorer tab; a missing APK URL returning the SPA page instead of 404; legacy identities in the leaderboard.

## 4. Deployment + Android

| Check | Result |
|---|---|
| Production mode (`NODE_ENV=production npm start`) | ✅ serves the UI, CSP header present, CORS rejects unknown origins and allows `CORS_ORIGINS`, unknown API → 404 JSON |
| Docker (`docker build` + `docker run`) | ✅ image builds; container serves `/health` (reaches real Sepolia), `/api/cities` and the APK |
| Android APK (`npm run build:apk`) | ✅ `frontend/public/downloads/CivicChain.apk` — 2.9 MB, package `app.civicchain.android`, version 3.0.0 (code 3), minSdk 24 / targetSdk 34, signed with the CivicChain release certificate (`apksigner verify`) |
| APK download from the website | ✅ `GET /downloads/CivicChain.apk` → 200, `application/vnd.android.package-archive`, attachment |
| APK on a real device / emulator | **NOT RUN** — no Android emulator or device is available on the build machine |

## 5. Final success criteria

| Criterion | Status |
|---|---|
| Real Ethereum Sepolia transaction | ⏳ NOT RUN — deployer unfunded (steps above) |
| Real ERC-721 NFT | ✅ contract implemented + tested (18 tests, real local mints); ⏳ Sepolia deploy pending funding |
| Image on IPFS / metadata on IPFS | ✅ implemented + tested with mocks; ⏳ live needs `PINATA_JWT` |
| NFT owned by the reporting citizen | ✅ tested (JWT address, never the body) |
| AI civic verification · fraud detection · duplicate detection | ✅ tested; live AI needs `GEMINI_API_KEY` |
| Civic workflow · reputation system · analytics · role-based governance | ✅ tested |
| Sepolia explorer integration | ✅ links + Explorer page |
| No legacy chain dependency | ✅ `check:legacy` green |
| No real-money requirement · no simulated blockchain · no paid infrastructure | ✅ |
