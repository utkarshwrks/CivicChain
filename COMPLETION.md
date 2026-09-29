# CivicChain v3.0.0 — Completion Guide

All code for the Sepolia migration is written and tested (18 contract + 64 backend + 22 frontend tests green).
What is left is the **live proof on Ethereum Sepolia**. Follow the steps below in order — about 20–30 minutes in total.

> Ethereum Sepolia is a test network. Test ETH and the NFTs have **no monetary value**. Everything here is free.

---

## Current state of `.env`

| Variable | Status |
|---|---|
| `SEPOLIA_RPC_URL` | ✅ set (public endpoint — a free Alchemy/Infura URL is better for the demo) |
| `DEPLOYER_PRIVATE_KEY` | ✅ set — address `0x775c93d2335C638933a36850F08EcC9220E9e783` |
| `JWT_SECRET`, `ADMIN_ADDRESSES`, `CORS_ORIGINS` | ✅ set |
| Deployer test ETH | ❌ **0.0 ETH** → Step 1 |
| `GEMINI_API_KEY` | ❌ empty → Step 2 |
| `PINATA_JWT` | ❌ empty → Step 3 |
| `NFT_CONTRACT_ADDRESS`, `NFT_DEPLOYMENT_BLOCK` | ❌ empty → Step 6 (filled after deploy) |

**Golden rule:** all of these go in the **root `.env`** (backend only). Never put a key in a `VITE_*` variable or in `frontend/.env`, and never commit `.env`.

---

## Part A — Get the keys

### Step 1 — Sepolia test ETH for the minter wallet

Paste this address into a faucet (**only the address — never the private key**):

```
0x775c93d2335C638933a36850F08EcC9220E9e783
```

Try in this order until one works:

1. **Google Cloud Web3 Faucet** — https://cloud.google.com/application/web3/faucet/ethereum/sepolia
   Sign in with Google → select *Ethereum Sepolia* → paste address → *Receive* (≈ 0.05 ETH).
2. **Sepolia PoW Faucet** — https://sepolia-faucet.pk910.de
   No account needed. Paste address → *Start Mining* → keep the tab open 15–30 min → *Claim Rewards* at ≈ 0.05 ETH.
3. **Alchemy** — https://www.alchemy.com/faucets/ethereum-sepolia
   **Infura / MetaMask** — https://www.infura.io/faucet/sepolia
   **QuickNode** — https://faucet.quicknode.com/ethereum/sepolia
   (Free account; some require a small real-ETH balance on mainnet as anti-bot protection.)

Target: **at least 0.02 ETH** (0.05 is comfortable). Check on
https://sepolia.etherscan.io/address/0x775c93d2335C638933a36850F08EcC9220E9e783

### Step 2 — Gemini API key (AI verification)

1. Open https://aistudio.google.com/app/apikey and sign in with Google.
2. Click **Create API key** (choose or create any project).
3. Copy the key and put it in `.env`:

```env
GEMINI_API_KEY=AIza...your-key...
```

### Step 3 — Pinata JWT (IPFS storage)

1. Sign up / log in at https://app.pinata.cloud (free plan).
2. Go to **API Keys → New Key**.
3. Enable at least **pinFileToIPFS** and **pinJSONToIPFS** (or toggle *Admin* for simplicity), give it a name, click **Create**.
4. Copy the **JWT** (the long `eyJ...` value — it is shown only once).
5. Put it in `.env`:

```env
PINATA_JWT=eyJhbGciOi...your-jwt...
PINATA_GATEWAY=https://gateway.pinata.cloud/ipfs
```

> Optional: if you have a dedicated Pinata gateway (Pinata → Gateways), use `https://<your-gateway>.mypinata.cloud/ipfs` — images load faster during the demo.

### Step 4 — (Recommended) Dedicated Sepolia RPC URL

Public RPCs can be slow or rate-limited during a live demo.

1. Sign up at https://dashboard.alchemy.com (or https://app.infura.io).
2. Create an app → network **Ethereum Sepolia** → copy the **HTTPS** endpoint.
3. Replace the value in `.env`:

```env
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/<your-api-key>
```

### Step 5 — (Optional) Etherscan API key

Only needed if you want the contract source readable on Etherscan.

1. Sign up at https://etherscan.io → **API Keys → Add**.
2. Put it in `.env`:

```env
ETHERSCAN_API_KEY=your-etherscan-key
```

---

## Part B — Deploy the contract

### Step 6 — Check config, then deploy

```bash
npm run smoke:sepolia      # should show chain 11155111, RPC reachable, minter balance > 0.02
npm run deploy:sepolia     # deploys CivicIssueNFT to Sepolia
```

The deploy script prints the contract address, deployment tx hash, block number and an Etherscan link, and writes:

- `deployments/sepolia.json`
- `backend/abi/CivicIssueNFT.json`

Copy the two printed values into `.env`:

```env
NFT_CONTRACT_ADDRESS=0x...printed-contract-address...
NFT_DEPLOYMENT_BLOCK=...printed-block-number...
```

Optional — verify the source on Etherscan (owner and minter are both the deployer address unless you set `MINTER_ADDRESS`):

```bash
npx hardhat verify --network sepolia <contract> 0x775c93d2335C638933a36850F08EcC9220E9e783 0x775c93d2335C638933a36850F08EcC9220E9e783
```

### Step 7 — Confirm Sepolia is ready

```bash
npm run smoke:sepolia
```

Expected: contract name/symbol shown, **Minter authorised: yes**, balance shown, and
`✅ Sepolia configuration is ready`.

---

## Part C — Testing

### Step 8 — Automated tests (sanity check)

```bash
npm test                 # check:legacy → check:secrets → backend (64) → frontend (22)
npx hardhat test         # contract tests (18)
```

All must be green.

### Step 9 — Live end-to-end mint (real Sepolia)

Terminal 1:

```bash
npm run dev              # backend :3001 + frontend :5173
```

Terminal 2:

```bash
npm run e2e:sepolia
```

The script creates a fresh wallet, logs in, uploads a civic photo from `test/fixtures/`, waits for `NFT_MINTED`, then checks on-chain `ownerOf` and `tokenURI` and the IPFS metadata.
It prints **reportId, tokenId, tx hash, Etherscan tx + NFT links, metadata + image gateway links** — keep this output for Step 12.

Check on Etherscan:
- The tx shows a `CivicIssueNFTMinted` event.
- The NFT owner is the **citizen's** 0x address, not the minter.

### Step 10 — Browser walkthrough

Open http://localhost:5173 and go through:

1. **Create wallet** → header shows a `0x…` address, role CITIZEN.
2. **Submit** a real civic photo (pothole / garbage) + city + landmark → watch the 8-step pipeline and *"Minting Civic NFT on Ethereum Sepolia…"* with a live tx link.
3. **NFT success card** → click *View on Sepolia Etherscan*, *View NFT on Etherscan*, *View NFT Metadata*, *View Evidence* — all must open correctly.
4. **Profile** → NFT appears in *Civic NFT Collection*; "First Civic NFT" badge.
5. **Feed** → report shows *NFT Minted ✓*; clicking opens the NFT details modal.
6. **Explorer** → network strip with your contract, NFT in *Latest Civic NFTs*, mint in the transactions table.
7. **Analytics** → Total Civic NFTs and NFT charts count it.
8. **Governance** → import an AUTHORITY wallet from `city-keys.json` (same city as the report) → *Verify*; import the MUNICIPAL_TEAM wallet → *Start work* → *Resolve*. Current status changes, the NFT stays unchanged.
9. **Admin** → import the key from `demo-admin-key.json` → Admin metrics show NFT counts and minter balance.

### Step 11 — Negative checks (no transaction must be created)

| Test | Expected |
|---|---|
| Upload a non-civic photo (selfie, `test/fixtures/floortiles.png`) | `NOT_CIVIC_ISSUE`, no IPFS, no tx |
| Upload the same pothole photo again | `DUPLICATE`, links the original report, no tx |
| Forced mint failure: stop the backend, set `NFT_CONTRACT_ADDRESS` to a wrong address, restart, submit a new photo | Report saved with `NFT_MINT_FAILED` |
| Restore the correct address, restart, click **Retry mint** (or Admin → *Retry failed mints*) | Becomes `NFT_MINTED`, only one token for that report |

Confirm on Etherscan that the minter's transaction count only increased for the successful mints.

### Step 12 — Record the real results

Fill `docs/VERIFICATION_REPORT.md` with **only real values**:

- Contract address + Etherscan link, deployment tx hash
- Mint tx hash(es), token ID(s), owner address(es)
- Metadata CID + gateway link, image CID + gateway link
- Test counts, commands run, date

Replace the **NOT RUN** rows in sections 1 and 5.

### Step 13 — Commit

```bash
git add deployments/sepolia.json backend/abi/CivicIssueNFT.json docs/VERIFICATION_REPORT.md
git commit -m "Live Sepolia deployment and verification"
```

`deployments/sepolia.json` and the ABI are public and meant to be committed. **Never** `git add .env`.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `INSUFFICIENT_FUNDS` / deploy aborts on low balance | Top up the minter from a faucet (Step 1). Failed reports stay saved — use *Retry mint* afterwards. |
| `CHAIN_MISMATCH` / `MAINNET REFUSED` | `SEPOLIA_RPC_URL` points at the wrong network. Use a Sepolia endpoint (chain 11155111). |
| `MINTER_NOT_AUTHORIZED` | The `.env` key is not the contract's minter. Redeploy, or the owner calls `setMinter(<backend address>)`. |
| `AI_FAILED` | Wrong `GEMINI_API_KEY` or free quota hit. Nothing is stored; resubmit later. |
| `IPFS_AUTH_FAILED` / `IPFS_QUOTA` | Wrong/expired `PINATA_JWT` or missing pinFileToIPFS / pinJSONToIPFS permission. |
| RPC 429 / `range too large` | Free-tier limits. Use a dedicated Alchemy/Infura URL (Step 4) or lower `LOG_CHUNK_SIZE`. |
| NFT image not showing | Gateway is slow right after pinning — wait a minute, or use a dedicated Pinata gateway. |
| Login fails | Clear the site's localStorage and reload; make sure the backend restarted after editing `.env`. |

---

## After this (deployment, optional)

1. **Website:** Render → New → Blueprint → this repo; set the same secret env vars plus `ADMIN_ADDRESSES`, `CORS_ORIGINS`, `FRONTEND_PUBLIC_URL`.
2. **APK with live URL:** `APK_API_URL=https://<your-render-url> npm run build:apk`, commit the new APK.
3. **Test the APK** on a real Android phone.
