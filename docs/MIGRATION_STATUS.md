# CivicChain — Migration Status (what is done, what is left)

Last updated: 2026-09-29 · Version 3.0.0 · Tags `pre-sepolia-migration`, `phase-1-done` … `phase-5-done`

## ✅ Done

| Area | Result |
|---|---|
| Phase 1 — Smart contract | `CivicIssueNFT.sol` (ERC-721, OpenZeppelin v5), Hardhat 2, 18 passing contract tests, `deploy-sepolia.js` (mainnet refused, balance check, `deployments/sepolia.json` + ABI export), full `docs/MIGRATION_AUDIT.md` |
| Phase 2 — Identity | ethers wallets with `0x` addresses, EIP-191 login, one-time browser upgrade of old wallets, `ADMIN_ADDRESSES`, address validation everywhere, data migration script (backup, `--dry-run`, `--clean`, idempotent), `ethereum.service`, `/api/chain/status`, `smoke:sepolia` |
| Phase 3 — Pipeline | AI → fraud → duplicate → IPFS image → NFT metadata → store → mint; honest statuses; idempotent retry + reconciler; `nft-cache.json`; NFT APIs; NFT badges and analytics; `e2e:sepolia` |
| Phase 4 — Frontend | 8-step Submit pipeline, NFT success / pending / failed cards, Ethereum Sepolia Explorer, Civic NFT Collection, Feed NFT badges + details modal, NFT analytics, Admin NFT metrics + low-balance warning |
| Phase 5 — Purge + hardening | All legacy chain code, scripts, contracts and endpoints removed (`check:legacy` green); helmet CSP, CORS allow-list, rate limits, JWT secret check, upload magic-byte checks, central error handler, `check:secrets`; README, PROJECT_DOCUMENTATION, CHANGELOG, VERIFICATION_REPORT |
| Android app | Capacitor 6 app, CivicChain icon + splash, signed release APK at `frontend/public/downloads/CivicChain.apk` |
| Website APK link | Bold green **Download APK** button in the navbar + an Android section on the home page |
| Deployment ready | `render.yaml` (Render Blueprint), `Dockerfile` (tested), production-mode start tested |
| Tests | 18 contract + 64 backend + 22 frontend, all passing; local full-stack rehearsal with a headless browser walkthrough |

## ⏳ Left — needs you (cannot be done unattended)

1. **Fund the deployer / minter wallet** `0x775c93d2335C638933a36850F08EcC9220E9e783` with ~0.05 Sepolia test ETH from a faucet (its key is only in your local `.env`). Or replace `DEPLOYER_PRIVATE_KEY` in `.env` with your own new Sepolia-only key.
2. **Add the free API keys** to `.env`: `GEMINI_API_KEY` (Google AI Studio) and `PINATA_JWT` (Pinata → API Keys, with pinFileToIPFS + pinJSONToIPFS). A dedicated Alchemy / Infura `SEPOLIA_RPC_URL` is recommended for the live demo.
3. **Deploy the contract:** `npm run deploy:sepolia`, then put `NFT_CONTRACT_ADDRESS` and `NFT_DEPLOYMENT_BLOCK` into `.env` and commit `deployments/sepolia.json`.
4. **Prove it live:** `npm run smoke:sepolia` → `npm run dev` → `npm run e2e:sepolia`, then paste the real tx hash, token ID and links into `docs/VERIFICATION_REPORT.md`.
5. **Deploy the website:** Render → New → Blueprint → this repo, and fill in the secret env vars (the same ones as `.env`, plus `ADMIN_ADDRESSES`, `CORS_ORIGINS`, `FRONTEND_PUBLIC_URL`).
6. **Rebuild the APK with your live URL** so the app connects straight away: `APK_API_URL=https://<your-render-url> npm run build:apk`, then commit the new APK. The current APK asks for the server address on first launch.
7. **Test the APK on a phone** (there was no emulator on the build machine).

## Local-only files (never committed)

| File | What it is |
|---|---|
| `.env` | Fresh Sepolia deployer key, JWT secret, public RPC, `ADMIN_ADDRESSES` |
| `demo-admin-key.json` | Private key of the demo ADMIN wallet `0x89D80910f2efAb754bdc71D2329947500c535433` (import it in the wallet modal to use the Admin dashboard) |
| `city-keys.json` | AUTHORITY + MUNICIPAL_TEAM demo wallets for each of the 10 cities |
| `../civicchain-release.keystore` + `frontend/android/keystore.properties` | Android release signing key — back these up; future APK updates must be signed with the same key |

## Security note

The private key that shipped in the old `.env.example` and the key hard-coded in the old `audit.js` are still in the git history. Treat them as public forever and never fund them.
