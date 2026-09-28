# Changelog

## 3.0.0 — Ethereum Sepolia + Civic Issue NFTs (2026-09-29)

CivicChain moved from the custom SAYMAN JavaScript-VM chain to **Ethereum Sepolia**
and replaced on-chain report records with an **ERC-721 Civic Issue NFT** minted to the
citizen for every accepted report. Sepolia is a test network — the NFTs have no
monetary value.

### Added
- `contracts/CivicIssueNFT.sol` (OpenZeppelin v5 ERC721URIStorage + Ownable, authorised
  minter, `CivicIssueNFTMinted` / `MinterUpdated`, custom errors), Hardhat 2 tooling,
  18 contract tests, `scripts/deploy-sepolia.js` with a mainnet refusal and balance check.
- EIP-191 wallet login with standard `0x` addresses (ethers v6) in the browser and backend;
  one-time browser upgrade of `cp_wallet_v2` wallets (same key → Ethereum address);
  optional MetaMask sign-in; `ADMIN_ADDRESSES` seeding.
- `ethereum.service` (Sepolia provider, NonceManager signer, chain guard, serialised mint
  queue, receipt parsing, typed mint error codes, reconciliation), `nftMetadata.service`,
  `nftCache`, `nftMint.service` (idempotent retry, background reconciler).
- Report pipeline: AI → fraud → duplicate → IPFS image → NFT metadata → store → mint,
  with honest statuses (`NFT_MINTED`, `NFT_MINT_PENDING`, `NFT_MINT_FAILED`, …) and a
  `pipeline[]` stage log.
- NFT API (`/api/nft/*`, `/api/nfts`, `/api/profile/:address/nfts`, `/api/analytics/nfts`,
  `/api/chain/status`) and NFT badges.
- Frontend: 8-step Submit pipeline, NFT success / pending / failed cards, Ethereum Sepolia
  Explorer, Civic NFT Collection, Feed NFT badges, NFT analytics, Admin NFT metrics with a
  low minter-balance warning.
- **Android app** (Capacitor 6) and **Download APK** buttons on the website.
- Deployment: `render.yaml`, `Dockerfile`, first-boot seeding of `CIVICCHAIN_DATA_DIR`.
- Tooling: `migrate:data`, `smoke:sepolia`, `e2e:sepolia`, `check:legacy`,
  `check:secrets`, local rehearsal harness, Vitest suites for backend and frontend.

### Changed
- Reputation, civic points and badges are pure off-chain gamification.
- The governance workflow is off-chain only and now enforces the city jurisdiction
  server-side; it never touches the NFT.
- `backend/index.js` split into `app.js` (testable) and `index.js`.
- Analytics read the report store directly; hotspots show readable locations.

### Removed
- SAYMAN JS-VM contracts (`ReportRegistry`, `ReputationManager`, `RewardManager`),
  `scripts/deploy.js`, `deployed.json`, `blockchain-probe.js`, the SAYMAN RPC client,
  `blockchain.service.js`, `blockchain.config.js`, the block-scanning poller,
  `POST /api/broadcast`, `GET /api/nonce/:address`, `POST /api/report/prepare|finalize`,
  `/api/blocks` (410), the `elliptic` dependency and the SAYMAN_RPC variables.

### Security
- The real-looking `DEPLOYER_PRIVATE_KEY` that shipped in the old `.env.example` and the key
  hard-coded in the old `audit.js` are treated as compromised; never fund them. Both files
  are clean now, but the values remain in git history.
- Helmet CSP, CORS allow-list, per-route rate limits, JWT secret enforcement, magic-byte
  upload checks, central error handler, secret redaction in logs, and no Pinata JWT
  fragments in logs.

### Fixed
- Vite dev proxy pointed at port 3002 instead of 3001.
- Gemini categories `WATER_LEAKAGE`, `SEWAGE`, `PUBLIC_SAFETY` fell through to the
  General department.
- Feed and dashboards printed raw location JSON.

## 2.1.0 and earlier
Phases 1–15 on the SAYMAN chain: Gemini Vision, IPFS evidence, fraud gate, rewards and
reputation, duplicate detection, analytics, authority workflow, wallet auth + RBAC,
departments and cities. See `docs/MIGRATION_AUDIT.md` for the migration record.
