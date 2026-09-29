# CivicChain v3.0.0 — Verification Report

Date: 2026-09-29 (UTC 2026-09-28T23:06Z) · Branch `main` · Only real, observed values are recorded here. Anything not run is marked **NOT RUN** with the reason.

## 1. Live Ethereum Sepolia

Live run: 2026-09-29.

| Item | Value |
|---|---|
| Sepolia RPC | ✅ `eth_chainId` = **11155111** |
| Backend minter / deployer / owner | `0x775c93d2335C638933a36850F08EcC9220E9e783` (fresh Sepolia-only key, stored only in the local git-ignored `.env`) |
| Faucet funding | 0.05 Sepolia ETH from the Google Cloud Web3 faucet |
| **Contract (CivicIssueNFT)** | `0x329e4AD49f460fFE730Dc6E5E5688A7a75378C62` — https://sepolia.etherscan.io/address/0x329e4AD49f460fFE730Dc6E5E5688A7a75378C62 |
| Deployment tx | `0xe272d92f2738b05577f11b5b33dba297b748d6a1fc38e10d4991d1deb97d4944` (block **11805526**) — https://sepolia.etherscan.io/tx/0xe272d92f2738b05577f11b5b33dba297b748d6a1fc38e10d4991d1deb97d4944 |
| Name / symbol | CivicChain Civic Issue / CIVIC |
| `npm run smoke:sepolia` | ✅ "Sepolia configuration is ready" — minter authorised, balance 0.0484 ETH after deployment |
| `npm run e2e:sepolia` | ✅ **PASSED** — fresh wallet, EIP-191 login, `flood.png` upload, Gemini → fraud → duplicate → IPFS → mint; on-chain `ownerOf` / `tokenURI` and gateway metadata checked independently |

### First real Civic Issue NFT

| Item | Value |
|---|---|
| Report ID | `RP-1790659249234` (FLOOD · HIGH · AI confidence 95 · Jabalpur · DRAINAGE_DEPARTMENT) |
| **Token ID** | **1** |
| **Owner (citizen)** | `0xa40FEDCFAa63a5AD0f0eDF17A2DD1A64Ba7a5325` — not the minter |
| **Mint tx** | `0xcf280e5fe61c8163c7beac6b89f8142e6f678f3294af37c2378c7e771ff011ff` — https://sepolia.etherscan.io/tx/0xcf280e5fe61c8163c7beac6b89f8142e6f678f3294af37c2378c7e771ff011ff |
| NFT on Etherscan | https://sepolia.etherscan.io/nft/0x329e4AD49f460fFE730Dc6E5E5688A7a75378C62/1 |
| Metadata CID | `bafkreiaba3lmy4gayqvypo7e5xjso2r7noblbiouzjkqzxya36hwzgwuge` — https://gateway.pinata.cloud/ipfs/bafkreiaba3lmy4gayqvypo7e5xjso2r7noblbiouzjkqzxya36hwzgwuge |
| Image CID | `bafkreiaz2mf26k6udw64dn6fvmchqbzfhdl5qduotae4bwj5gn2qm76quy` — https://gateway.pinata.cloud/ipfs/bafkreiaz2mf26k6udw64dn6fvmchqbzfhdl5qduotae4bwj5gn2qm76quy |
| Metadata check | name uses the report ID, `image` = `ipfs://<image CID>`, "Status at Mint" = OPEN, no reporter address / GPS / landmark |
| Duplicate gate (live) | `pothole.png` and `garbage.png` were rejected as `DUPLICATE` of existing reports — **no IPFS upload, no transaction** |

Note: Google no longer serves `gemini-2.5-flash` to new API keys. `ai.service.js` now reads `GEMINI_MODEL` (default `gemini-flash-latest`) and falls back to `GEMINI_FALLBACK_MODELS` (default `gemini-flash-lite-latest`) on 404 / 429 / 5xx / timeout. During this run the primary model returned 503 (high demand) and the fallback classified the image.

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
| Real Ethereum Sepolia transaction | ✅ mint tx `0xcf280e5f…11ff` (token #1) |
| Real ERC-721 NFT | ✅ CivicIssueNFT `0x329e4AD4…8C62` on Sepolia, token #1 |
| Image on IPFS / metadata on IPFS | ✅ live on Pinata (CIDs above) |
| NFT owned by the reporting citizen | ✅ token #1 owned by `0xa40FEDCF…5325` (verified on-chain) |
| AI civic verification · fraud detection · duplicate detection | ✅ tested; live Gemini classification + live duplicate rejection |
| Civic workflow · reputation system · analytics · role-based governance | ✅ tested |
| Sepolia explorer integration | ✅ links + Explorer page |
| No legacy chain dependency | ✅ `check:legacy` green |
| No real-money requirement · no simulated blockchain · no paid infrastructure | ✅ |
