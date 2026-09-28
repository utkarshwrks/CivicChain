# CivicChain — SAYMAN → Ethereum Sepolia Migration Audit

Phase 1 read-only audit of every SAYMAN dependency in the repository (v2.1.0),
the replacement for each, and the migration phase that removes it. Later phases
tick rows off. This file and `CHANGELOG.md` are the only places where the legacy
chain may still be named after Phase 5.

## Repository facts

| Item | Finding |
|---|---|
| Root package | ESM (`"type": "module"`). Hardhat config is therefore `hardhat.config.cjs`. |
| Backend | Node + Express, ESM, entry `backend/index.js`, port 3001. |
| Frontend | React 18 + Vite 7, ESM, built with `vite build` into `frontend/dist`, served by the backend in single-deploy mode. |
| Existing tests | No test framework. Only ad-hoc live scripts (`tc14a/b/c.test.js`, `audit.js`, `test-ipfs.js`) that need a running server + SAYMAN node. |
| Chosen test stack | Hardhat + chai (contracts), Vitest + supertest (backend — native ESM; Jest's ESM mocking is experimental), Vitest + Testing Library + jsdom (frontend). |
| Security findings | `.env.example` shipped a real-looking `DEPLOYER_PRIVATE_KEY`; `audit.js` hard-codes a private key; CORS open (`*`); helmet CSP disabled; `/api/broadcast` relays arbitrary client transactions. All treated as compromised / removed. |
| Other bugs found | Vite dev proxy pointed at `:3002` (backend runs on `:3001`); analytics controller fetched its own server over HTTP; AI categories `WATER_LEAKAGE`, `SEWAGE`, `PUBLIC_SAFETY` fell through to GENERAL; Feed/Authority cards printed the raw location JSON string; workflow endpoints did not enforce the city jurisdiction server-side. |

## Dependency inventory

| File | Area / function | What it does today (SAYMAN) | Replacement | Phase |
|---|---|---|---|---|
| `contracts/ReportRegistry.js`, `ReputationManager.js`, `RewardManager.js` | JS-VM contracts | Report ledger, reputation + reward points on the SAYMAN JS VM | `contracts/CivicIssueNFT.sol` (ERC-721). Reputation/points stay off-chain. Moved to `legacy/sayman-contracts/` in Phase 1 | 1 / 5 ✅ |
| `scripts/deploy.js` | Deployment | `CONTRACT_DEPLOY` txs, faucet top-up, writes `deployed.json` | `scripts/deploy-sepolia.js` + `deployments/sepolia.json` + `backend/abi/CivicIssueNFT.json` | 1 / 5 ✅ |
| `deployed.json` | Manifest | SAYMAN contract addresses + RPC URL | `deployments/sepolia.json` | 5 ⬜ |
| `package.json` scripts | `deploy:local/testnet/mainnet`, `backend:dev`, `dev:local` | Point at SAYMAN RPC / old deploy script | `compile`, `test:contracts`, `chain:local`, `deploy:local`, `deploy:sepolia`, `smoke:sepolia`, `e2e:sepolia`, `migrate:data`, `check:legacy`, `test` | 1 / 5 ✅ |
| `frontend/src/utils/crypto.js` | Wallet | elliptic secp256k1 keygen, `SHA256(pubKey)[0:40]` address, `{r,s}` signatures, SAYMAN tx builders | `ethers.Wallet`, EIP-55 `0x` address, EIP-191 `signMessage` | 2 ⬜ |
| `frontend/src/hooks/useWallet.jsx` | Wallet state | `cp_wallet_v2`, SAYMAN balance polling | `cp_wallet_v3` + one-time upgrade from v2, NFT count, no balance | 2 / 4 ⬜ |
| `frontend/src/components/WalletModal.jsx`, `Header.jsx` | Wallet UI | 40-char address, SAYMAN balance | Checksummed `0x` address, testnet identity warning, NFT count, Etherscan link | 2 / 4 ⬜ |
| `backend/services/auth.service.js` | Login | Verifies secp256k1 `{r,s}` + derives SHA-256 address | `ethers.verifyMessage` (EIP-191) + address normalisation | 2 ⬜ |
| `backend/controllers/auth.controller.js`, `rbac.controller.js`, `profile.controller.js` | Address validation | `address.length === 40` | `utils/address.js` (`isValidAddress`, `normalizeAddress`, `toChecksum`) → 400 `INVALID_WALLET` | 2 ⬜ |
| `backend/services/rbac.service.js` | Admin seeding | Seeds SAYMAN deployer address as ADMIN | `ADMIN_ADDRESSES` env; fallback deployer `0x` address from `ethers.Wallet` | 2 ⬜ |
| `backend/data/*.json` | Data stores | Keys are 40-char SAYMAN addresses; reports carry SAYMAN tx/block data | `scripts/migrate-data-to-ethereum.js` (backup, `0x` keys, `legacy` flag, `NOT_ELIGIBLE_LEGACY`) | 2 ⬜ |
| `backend/config/blockchain.config.js` | Config | Hot-reloads `deployed.json`, SAYMAN gas constants | `backend/config/ethereum.config.js` (env + deployments file) | 2 / 3 ⬜ |
| `backend/services/rpc.service.js` | RPC client | SAYMAN REST RPC with node failover + peer discovery | ethers `JsonRpcProvider` inside `ethereum.service.js` | 3 ⬜ |
| `backend/services/blockchain.service.js` | Chain writes | Builds/signs/broadcasts `CONTRACT_CALL createReport` with custom nonces | `backend/services/ethereum.service.js` (serialised mint queue, receipts, typed error codes) | 2 / 3 ⬜ |
| `backend/services/report.service.js` | Pipeline | AI → fraud → dup → IPFS → SAYMAN → rewards; `prepareReport`/`finalizeReport` user-signed split flow | AI → fraud → dup → IPFS image → metadata JSON → store `NFT_MINT_PENDING` → mint → statuses | 3 ⬜ |
| `backend/controllers/report.controller.js`, `routes/report.routes.js` | Report API | `/create` returns SAYMAN `blockchain`; `/prepare` + `/finalize` for client-signed SAYMAN txs | `/create` (JWT) returns `nft` + `pipeline[]`; `/prepare`/`/finalize` removed | 3 ⬜ |
| `backend/services/reward.service.js`, `reputation.service.js` | Gamification | Off-chain maths + best-effort `CONTRACT_CALL` to RewardManager / ReputationManager | Pure off-chain maths + NFT badges | 3 ⬜ |
| `backend/services/workflow.service.js` | Governance | Mirrors transitions as `CONTRACT_CALL verifyReport/resolveReport` | Off-chain only; the NFT is never touched | 3 ⬜ |
| `backend/controllers/analytics.controller.js` | Analytics | HTTP self-calls, falls back to a SAYMAN address scan | Reads `reportCache` directly; adds NFT metrics | 3 ⬜ |
| `backend/index.js` | Built-ins | `scanReports()` block poller, `/api/broadcast`, `/api/nonce`, `/api/blocks`, `/api/events`, `/api/contracts`, `/api/stats`, `/api/balance` via SAYMAN | Poller + broadcast + nonce removed; `/api/blocks` → 410; stats/contracts/events/balance re-pointed at Sepolia + NFT cache | 3 ⬜ |
| `frontend/src/pages/SubmitPage.jsx` | Submit | Client-signed SAYMAN `CONTRACT_CALL`, 6-step pipeline | 8-step server-driven NFT pipeline + `NftRewardCard` | 4 ⬜ |
| `frontend/src/pages/ExplorerPage.jsx` | Explorer | SAYMAN blocks, validators, stake, mempool, contracts grid | Ethereum Sepolia Explorer: contract strip, latest NFTs, mint transactions | 4 ⬜ |
| `frontend/src/pages/HomePage.jsx` | Home | "LIVE ON SAYMAN TESTNET": blocks, validators, mempool | Latest Sepolia block, reports, resolved, NFTs minted, contract link | 4 ⬜ |
| `frontend/src/pages/FeedPage.jsx`, `ProfilePage.jsx`, `AnalyticsPage.jsx`, `AdminPage.jsx`, `AuthorityPage.jsx`, `MunicipalPage.jsx` | UI copy + data | "immutable block on the SAYMAN chain", SAYMAN balance tile, 40-char address input | NFT badges, NFT collection, NFT analytics, minter-balance warning, `0x` inputs | 4 ⬜ |
| `frontend/src/utils/api.js` | Client API | `nonce`, `balance`, `blocks`, `broadcast`, `prepareReport`, `finalizeReport` | Typed helpers for every NFT/chain endpoint | 4 ⬜ |
| `frontend/package.json`, root `package.json` | Dependencies | `elliptic` | `ethers` v6 | 2 / 5 ⬜ |
| `blockchain-probe.js` | Diagnostics | Probes SAYMAN tx types | Deleted | 5 ⬜ |
| `audit.js` | RBAC audit | SAYMAN signing with a hard-coded private key | ethers wallets, nonce → sign → login, `ADMIN_ADDRESSES` rule | 2 ⬜ |
| `tc14a/b/c.test.js`, `test-ipfs.js`, `test-real-ipfs.js`, `testing/*.json`, `backend-debug.log` | Ad-hoc live scripts | SAYMAN-era manual scripts | Replaced by the automated suites; deleted | 5 ⬜ |
| `scripts/gen-city-keys.js` | Demo wallets | Generates secp256k1/SHA-256 city wallets | Generates ethers `0x` wallets | 2 ⬜ |
| `README.md`, `PROJECT_DOCUMENTATION.md`, `.env.example` | Docs | SAYMAN branding, `SAYMAN_RPC`, real-looking key | Sepolia docs, new env vars, empty placeholders | 1 / 5 ⬜ |
