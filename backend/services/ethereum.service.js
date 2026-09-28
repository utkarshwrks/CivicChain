/**
 * ethereum.service.js — CivicChain ↔ Ethereum Sepolia  (CivicIssueNFT)
 *
 * • Provider: ethers JsonRpcProvider pinned to chain 11155111 (staticNetwork)
 * • Signer:   backend minter wallet wrapped in an ethers NonceManager
 * • init():   chain guard (chain 1 → MAINNET REFUSED, other chains →
 *             CHAIN_MISMATCH; 31337 only in tests / ALLOW_LOCAL_CHAIN),
 *             contract code present, contract.minter() == backend signer.
 *             Failures are reported, never thrown — the server keeps running.
 * • mintCivicIssueNFT(): validated, pre-flighted (gas + balance), run through
 *   a SERIALISED in-process queue (one tx at a time — no nonce collisions),
 *   reports the tx hash as soon as it is sent, waits for the receipt and
 *   parses the token id from the CivicIssueNFTMinted event.
 * • Never returns or logs the RPC URL or any key (see utils/redact.js).
 *
 * createEthereumService(deps) builds an isolated instance (tests inject a fake
 * provider/signer/contract); the default export helpers use a singleton.
 */

import { Contract, Interface, JsonRpcProvider, Network, NonceManager, Wallet, formatEther } from 'ethers';
import { loadEthereumConfig, SEPOLIA_CHAIN_ID, LOCAL_CHAIN_ID, MAINNET_CHAIN_ID } from '../config/ethereum.config.js';
import { isValidAddress, toChecksum } from '../utils/address.js';
import { redactSecrets } from '../utils/redact.js';

const LOG = '[ETH]';
const LOW_BALANCE_ETH = 0.02;

export const MINT_ERROR_CODES = [
  'CONTRACT_NOT_CONFIGURED', 'CHAIN_MISMATCH', 'MINTER_NOT_AUTHORIZED', 'INVALID_RECIPIENT',
  'INSUFFICIENT_FUNDS', 'RPC_UNAVAILABLE', 'NONCE_ERROR', 'TX_REVERTED', 'TX_TIMEOUT', 'UNKNOWN',
];

/** Errors worth retrying automatically (with backoff). */
export const TRANSIENT_MINT_ERRORS = ['RPC_UNAVAILABLE', 'NONCE_ERROR', 'TX_TIMEOUT'];

function log(...args) {
  if (process.env.NODE_ENV === 'test') return;
  console.log(LOG, ...args.map((a) => redactSecrets(typeof a === 'string' ? a : a)));
}

function withTimeout(promise, ms, code = 'RPC_UNAVAILABLE') {
  let t;
  return Promise.race([
    Promise.resolve(promise).finally(() => clearTimeout(t)),
    new Promise((_, reject) => {
      t = setTimeout(() => {
        const e = new Error(`Timed out after ${ms} ms`);
        e.code = code;
        reject(e);
      }, ms);
    }),
  ]);
}

function errText(e) {
  return [e?.shortMessage, e?.message, e?.info?.error?.message, e?.error?.message].filter(Boolean).join(' | ');
}

/** Map an ethers / RPC error to a CivicChain mint error code. */
export function classifyError(e, iface) {
  const text = errText(e).toLowerCase();
  // Custom-error revert data (NotMinter etc.)
  const data = e?.data || e?.info?.error?.data || e?.error?.data;
  if (data && iface) {
    try {
      const parsed = iface.parseError(data);
      if (parsed?.name === 'NotMinter') return 'MINTER_NOT_AUTHORIZED';
      if (parsed?.name === 'ZeroAddress') return 'INVALID_RECIPIENT';
    } catch { /* not ours */ }
  }
  if (e?.revert?.name === 'NotMinter' || text.includes('notminter')) return 'MINTER_NOT_AUTHORIZED';
  if (e?.code === 'INSUFFICIENT_FUNDS' || text.includes('insufficient funds')) return 'INSUFFICIENT_FUNDS';
  if (e?.code === 'NONCE_EXPIRED' || e?.code === 'REPLACEMENT_UNDERPRICED'
      || text.includes('nonce too low') || text.includes('nonce has already been used')
      || text.includes('replacement transaction underpriced') || text.includes('already known')) return 'NONCE_ERROR';
  if (e?.code === 'TIMEOUT' || e?.code === 'TX_TIMEOUT') return 'TX_TIMEOUT';
  if (e?.code === 'CALL_EXCEPTION' || text.includes('execution reverted')) return 'TX_REVERTED';
  if (['NETWORK_ERROR', 'SERVER_ERROR', 'RPC_UNAVAILABLE', 'ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET'].includes(e?.code)
      || text.includes('failed to detect network') || text.includes('fetch failed')
      || text.includes('429') || text.includes('rate limit') || text.includes('timed out')) return 'RPC_UNAVAILABLE';
  return 'UNKNOWN';
}

const MESSAGES = {
  CONTRACT_NOT_CONFIGURED: 'The Civic Issue NFT contract is not configured on the server.',
  CHAIN_MISMATCH:          'The backend RPC is not connected to Ethereum Sepolia.',
  MINTER_NOT_AUTHORIZED:   'The backend wallet is not the authorised minter of the contract.',
  INVALID_RECIPIENT:       'The recipient is not a valid Ethereum address.',
  INSUFFICIENT_FUNDS:      'The minter wallet is out of Sepolia test ETH. Top it up from a faucet and retry.',
  RPC_UNAVAILABLE:         'The Sepolia RPC endpoint is unavailable or rate-limited. Please retry shortly.',
  NONCE_ERROR:             'A transaction nonce conflict occurred. Please retry.',
  TX_REVERTED:             'The mint transaction reverted on-chain.',
  TX_TIMEOUT:              'The mint transaction was sent but not confirmed in time. It may still confirm.',
  UNKNOWN:                 'The mint failed for an unknown reason.',
};

function fail(code, extra = {}) {
  return { success: false, code, message: extra.message || MESSAGES[code] || MESSAGES.UNKNOWN, ...extra };
}

/**
 * Build an Ethereum service instance.
 * @param {object} [deps]
 * @param {object} [deps.config]    overrides for loadEthereumConfig()
 * @param {object} [deps.provider]  ethers-compatible provider
 * @param {object} [deps.signer]    ethers-compatible signer (has getAddress, reset?)
 * @param {object} [deps.contract]  contract connected to the signer
 */
export function createEthereumService(deps = {}) {
  const state = {
    cfg: null,
    provider: null,
    signer: null,
    contract: null,
    iface: null,
    signerAddress: null,
    chainId: null,
    initialized: false,
    initPromise: null,
    lastInitAt: 0,
    blocking: [],     // codes that prevent minting
    issues: [],       // human-readable
    permanentlyDisabled: false,
  };

  let queue = Promise.resolve();

  function setup() {
    state.cfg = { ...loadEthereumConfig(), ...(deps.config || {}) };
    const cfg = state.cfg;
    state.iface = cfg.abi ? new Interface(cfg.abi) : null;

    if (deps.provider) state.provider = deps.provider;
    else if (cfg.rpcUrl) {
      const network = Network.from(cfg.expectedChainId || SEPOLIA_CHAIN_ID);
      state.provider = new JsonRpcProvider(cfg.rpcUrl, network, { staticNetwork: network });
    }

    if (deps.signer) state.signer = deps.signer;
    else if (cfg.privateKey && state.provider) {
      state.signer = new NonceManager(new Wallet(cfg.privateKey, state.provider));
    }

    if (deps.contract) state.contract = deps.contract;
    else if (cfg.contractAddress && cfg.abi && (state.signer || state.provider)) {
      state.contract = new Contract(cfg.contractAddress, cfg.abi, state.signer || state.provider);
    }
  }

  async function doInit() {
    setup();
    const cfg = state.cfg;
    const blocking = [];
    const issues = [...cfg.issues];

    if (!state.provider) {
      blocking.push('CONTRACT_NOT_CONFIGURED');
    } else {
      try {
        // staticNetwork trusts the configured id, so ask the node directly.
        const actual = typeof state.provider.send === 'function'
          ? Number(await withTimeout(state.provider.send('eth_chainId', []), cfg.rpcTimeoutMs))
          : Number((await withTimeout(state.provider.getNetwork(), cfg.rpcTimeoutMs)).chainId);
        state.chainId = actual;
        if (actual === MAINNET_CHAIN_ID) {
          state.permanentlyDisabled = true;
          blocking.push('CHAIN_MISMATCH');
          issues.push('MAINNET REFUSED — the RPC points at Ethereum mainnet (chain 1)');
          console.error(`${LOG} MAINNET REFUSED — CivicChain only runs on Sepolia (chain ${SEPOLIA_CHAIN_ID}).`);
        } else if (actual !== cfg.expectedChainId && !(actual === LOCAL_CHAIN_ID && cfg.allowLocalChain)) {
          blocking.push('CHAIN_MISMATCH');
          issues.push(`Connected to chain ${actual}, expected ${cfg.expectedChainId}`);
        }
      } catch (e) {
        blocking.push('RPC_UNAVAILABLE');
        issues.push(`RPC unreachable: ${redactSecrets(errText(e)).slice(0, 160)}`);
      }
    }

    if (!state.contract) {
      if (!blocking.includes('CONTRACT_NOT_CONFIGURED')) blocking.push('CONTRACT_NOT_CONFIGURED');
    } else if (!blocking.includes('RPC_UNAVAILABLE') && !blocking.includes('CHAIN_MISMATCH')) {
      try {
        const address = await state.contract.getAddress();
        const code = await withTimeout(state.provider.getCode(address), cfg.rpcTimeoutMs);
        if (!code || code === '0x') {
          blocking.push('CONTRACT_NOT_CONFIGURED');
          issues.push('CONTRACT_NOT_DEPLOYED — no contract code at NFT_CONTRACT_ADDRESS on this chain');
        } else if (state.signer) {
          state.signerAddress = toChecksum(await state.signer.getAddress());
          const minter = toChecksum(await withTimeout(state.contract.minter(), cfg.rpcTimeoutMs));
          if (minter !== state.signerAddress) {
            blocking.push('MINTER_NOT_AUTHORIZED');
            issues.push(`MINTER_NOT_AUTHORIZED — contract minter is ${minter}, backend signer is ${state.signerAddress}`);
          }
        }
      } catch (e) {
        blocking.push('RPC_UNAVAILABLE');
        issues.push(`Contract check failed: ${redactSecrets(errText(e)).slice(0, 160)}`);
      }
    }

    if (state.signer && !state.signerAddress) {
      try { state.signerAddress = toChecksum(await state.signer.getAddress()); } catch { /* ignore */ }
    }
    if (!state.signer && !blocking.includes('CONTRACT_NOT_CONFIGURED')) blocking.push('CONTRACT_NOT_CONFIGURED');

    state.blocking = [...new Set(blocking)];
    state.issues = [...new Set(issues)];
    state.initialized = true;
    state.lastInitAt = Date.now();

    if (state.blocking.length === 0) log(`Ready — Sepolia minter ${state.signerAddress}`);
    else log(`Not ready: ${state.blocking.join(', ')} — ${state.issues.join('; ')}`);
    return { ready: state.blocking.length === 0, blocking: state.blocking, issues: state.issues };
  }

  /** Initialise (or re-initialise). Never throws. */
  function init() {
    state.initPromise = doInit().catch((e) => {
      state.initialized = true;
      state.blocking = ['UNKNOWN'];
      state.issues = [`init failed: ${redactSecrets(errText(e))}`];
      return { ready: false, blocking: state.blocking, issues: state.issues };
    });
    return state.initPromise;
  }

  /** Init once; retry every 30 s while the RPC was unreachable. */
  async function ensureInit() {
    if (!state.initPromise) return init();
    await state.initPromise;
    if (!state.permanentlyDisabled && state.blocking.includes('RPC_UNAVAILABLE') && Date.now() - state.lastInitAt > 30_000) {
      return init();
    }
    return { ready: state.blocking.length === 0, blocking: state.blocking, issues: state.issues };
  }

  const explorer = () => (state.cfg?.explorerBaseUrl || 'https://sepolia.etherscan.io');
  const txUrl      = (hash) => `${explorer()}/tx/${hash}`;
  const addressUrl = (addr) => `${explorer()}/address/${addr}`;
  const tokenUrl   = (contract, tokenId) => `${explorer()}/nft/${contract}/${tokenId}`;

  async function contractAddress() {
    if (!state.contract) return state.cfg?.contractAddress || null;
    try { return toChecksum(await state.contract.getAddress()); } catch { return state.cfg?.contractAddress || null; }
  }

  function parseMintedEvent(receipt, address) {
    if (!state.iface || !receipt?.logs) return null;
    for (const l of receipt.logs) {
      if (address && l.address && l.address.toLowerCase() !== address.toLowerCase()) continue;
      try {
        const parsed = state.iface.parseLog(l);
        if (parsed?.name === 'CivicIssueNFTMinted') {
          return {
            tokenId:   parsed.args.tokenId.toString(),
            recipient: toChecksum(parsed.args.recipient),
            tokenURI:  parsed.args.tokenURI,
          };
        }
      } catch { /* not ours */ }
    }
    return null;
  }

  async function getLatestBlock() {
    await ensureInit();
    if (!state.provider) return null;
    try { return await withTimeout(state.provider.getBlockNumber(), state.cfg.rpcTimeoutMs); } catch { return null; }
  }

  async function getBalanceEth(address) {
    await ensureInit();
    if (!state.provider || !isValidAddress(address)) return null;
    const wei = await withTimeout(state.provider.getBalance(address), state.cfg.rpcTimeoutMs);
    return formatEther(wei);
  }

  async function getContractInfo() {
    await ensureInit();
    const address = await contractAddress();
    const info = {
      network: 'Ethereum Sepolia',
      chainId: SEPOLIA_CHAIN_ID,
      contractAddress: address,
      contractName: 'CivicIssueNFT',
      name: null, symbol: null, owner: null, minter: null, totalMinted: null,
      explorerUrl: address ? addressUrl(address) : null,
    };
    if (!state.contract || state.blocking.includes('RPC_UNAVAILABLE') || state.blocking.includes('CHAIN_MISMATCH')) return info;
    const t = state.cfg.rpcTimeoutMs;
    const [name, symbol, owner, minter, total] = await Promise.allSettled([
      withTimeout(state.contract.name(), t), withTimeout(state.contract.symbol(), t),
      withTimeout(state.contract.owner(), t), withTimeout(state.contract.minter(), t),
      withTimeout(state.contract.totalMinted(), t),
    ]);
    if (name.status === 'fulfilled')   info.name = name.value;
    if (symbol.status === 'fulfilled') info.symbol = symbol.value;
    if (owner.status === 'fulfilled')  info.owner = toChecksum(owner.value);
    if (minter.status === 'fulfilled') info.minter = toChecksum(minter.value);
    if (total.status === 'fulfilled')  info.totalMinted = Number(total.value);
    return info;
  }

  /** Public chain status. Never includes the RPC URL or any key. */
  async function getStatus() {
    await ensureInit();
    const info = await getContractInfo();
    const latestBlock = await getLatestBlock();
    let minterBalanceEth = null;
    if (state.signerAddress && latestBlock !== null) {
      try { minterBalanceEth = await getBalanceEth(state.signerAddress); } catch { minterBalanceEth = null; }
    }
    const lowBalance = minterBalanceEth !== null ? Number(minterBalanceEth) < LOW_BALANCE_ETH : null;
    const issues = [...state.issues];
    if (lowBalance) issues.push(`Minter balance is low (${minterBalanceEth} ETH < ${LOW_BALANCE_ETH}) — top up from a Sepolia faucet`);
    return {
      configured: state.blocking.length === 0,
      ready: state.blocking.length === 0,
      network: state.chainId === LOCAL_CHAIN_ID ? 'Hardhat Local (rehearsal)' : 'Ethereum Sepolia',
      chainId: state.chainId ?? SEPOLIA_CHAIN_ID,
      expectedChainId: state.cfg.expectedChainId,
      rpcReachable: latestBlock !== null,
      latestBlock,
      contractAddress: info.contractAddress,
      contractName: info.contractName,
      name: info.name,
      symbol: info.symbol,
      owner: info.owner,
      minter: info.minter,
      backendMinterAddress: state.signerAddress,
      minterAuthorized: !!(info.minter && state.signerAddress && info.minter === state.signerAddress),
      minterBalanceEth,
      lowBalance,
      totalMinted: info.totalMinted,
      deploymentBlock: state.cfg.deploymentBlock || null,
      explorerUrl: info.explorerUrl,
      blocking: state.blocking,
      issues,
    };
  }

  /**
   * Mint a Civic Issue NFT. Resolves (never rejects) with
   *   { success: true, tokenId, transactionHash, contractAddress, recipient, blockNumber, explorerUrl, tokenExplorerUrl }
   *   or { success: false, code, message, transactionHash? }
   */
  function mintCivicIssueNFT(recipient, tokenURI, { reportId, onSubmitted } = {}) {
    if (!isValidAddress(recipient) || /^0x0{40}$/i.test(recipient)) return Promise.resolve(fail('INVALID_RECIPIENT'));
    if (typeof tokenURI !== 'string' || !tokenURI.startsWith('ipfs://') || tokenURI.length <= 'ipfs://'.length) {
      return Promise.resolve(fail('UNKNOWN', { message: 'tokenURI must be an ipfs:// URI.' }));
    }
    const job = queue.then(() => runMint(toChecksum(recipient), tokenURI, { reportId, onSubmitted }));
    queue = job.catch(() => {}); // keep the queue alive
    return job;
  }

  async function runMint(recipient, tokenURI, { reportId, onSubmitted }) {
    const st = await ensureInit();
    if (!st.ready) return fail(state.blocking[0] || 'CONTRACT_NOT_CONFIGURED', { message: state.issues.join('; ') || undefined });

    const cfg = state.cfg;
    const address = await contractAddress();
    let hash = null;

    try {
      // ── Pre-flight: gas estimate × fee vs. balance ────────────────────────
      const gas = await withTimeout(state.contract.mintCivicIssueNFT.estimateGas(recipient, tokenURI), cfg.rpcTimeoutMs);
      const fee = await withTimeout(state.provider.getFeeData(), cfg.rpcTimeoutMs);
      const price = fee.maxFeePerGas ?? fee.gasPrice ?? 0n;
      const gasLimit = (BigInt(gas) * 120n) / 100n;
      const cost = gasLimit * BigInt(price);
      const balance = await withTimeout(state.provider.getBalance(state.signerAddress), cfg.rpcTimeoutMs);
      if (BigInt(balance) < cost) {
        return fail('INSUFFICIENT_FUNDS', {
          message: `Minter balance ${formatEther(balance)} ETH is below the estimated cost ${formatEther(cost)} ETH.`,
        });
      }

      // ── Send ─────────────────────────────────────────────────────────────
      const tx = await state.contract.mintCivicIssueNFT(recipient, tokenURI, { gasLimit });
      hash = tx.hash;
      log(`Mint sent for ${reportId || 'report'} → ${recipient.slice(0, 10)}…`);
      if (typeof onSubmitted === 'function') {
        try { await onSubmitted(hash); } catch (e) { log(`onSubmitted hook failed: ${e.message}`); }
      }

      // ── Wait for the receipt ─────────────────────────────────────────────
      const receipt = await withTimeout(
        state.provider.waitForTransaction(hash, cfg.mintConfirmations, cfg.mintTimeoutMs),
        cfg.mintTimeoutMs + 5_000,
        'TX_TIMEOUT',
      );
      if (!receipt) return fail('TX_TIMEOUT', { transactionHash: hash });
      if (receipt.status !== 1) return fail('TX_REVERTED', { transactionHash: hash, blockNumber: receipt.blockNumber });

      const ev = parseMintedEvent(receipt, address);
      if (!ev) return fail('UNKNOWN', { transactionHash: hash, message: 'Mint confirmed but the CivicIssueNFTMinted event was not found.' });

      return {
        success: true,
        tokenId: ev.tokenId,
        transactionHash: hash,
        contractAddress: address,
        recipient: ev.recipient,
        tokenURI: ev.tokenURI,
        blockNumber: receipt.blockNumber,
        explorerUrl: txUrl(hash),
        tokenExplorerUrl: tokenUrl(address, ev.tokenId),
      };
    } catch (e) {
      const code = classifyError(e, state.iface);
      if (code === 'NONCE_ERROR' && typeof state.signer?.reset === 'function') state.signer.reset();
      log(`Mint failed (${code}) for ${reportId || 'report'}: ${redactSecrets(errText(e)).slice(0, 200)}`);
      return fail(code, hash ? { transactionHash: hash } : {});
    }
  }

  /** Reconciliation: what happened to a previously sent tx? */
  async function getTransactionOutcome(txHash) {
    await ensureInit();
    if (!state.provider || !/^0x[0-9a-fA-F]{64}$/.test(txHash || '')) return { state: 'NOT_FOUND' };
    const t = state.cfg.rpcTimeoutMs;
    const receipt = await withTimeout(state.provider.getTransactionReceipt(txHash), t);
    if (receipt) {
      if (receipt.status === 1) {
        const ev = parseMintedEvent(receipt, await contractAddress());
        return { state: 'CONFIRMED', tokenId: ev?.tokenId ?? null, recipient: ev?.recipient ?? null, blockNumber: receipt.blockNumber };
      }
      return { state: 'REVERTED', blockNumber: receipt.blockNumber };
    }
    const tx = await withTimeout(state.provider.getTransaction(txHash), t);
    return tx ? { state: 'PENDING' } : { state: 'NOT_FOUND' };
  }

  /** { owner, tokenURI } straight from the chain, or null if the token does not exist. */
  async function getOnChainToken(tokenId) {
    await ensureInit();
    if (!state.contract) return null;
    const t = state.cfg.rpcTimeoutMs;
    try {
      const [owner, uri] = await Promise.all([
        withTimeout(state.contract.ownerOf(tokenId), t),
        withTimeout(state.contract.tokenURI(tokenId), t),
      ]);
      return { owner: toChecksum(owner), tokenURI: uri };
    } catch (e) {
      if (classifyError(e) === 'RPC_UNAVAILABLE') throw e;
      return null; // ERC721NonexistentToken
    }
  }

  async function balanceOf(address) {
    await ensureInit();
    if (!state.contract || !isValidAddress(address)) return null;
    return Number(await withTimeout(state.contract.balanceOf(address), state.cfg.rpcTimeoutMs));
  }

  /** CivicIssueNFTMinted events in [fromBlock, toBlock], chunked (auto-halves on range errors). */
  async function getRecentMintEvents({ fromBlock, toBlock } = {}) {
    await ensureInit();
    if (!state.contract || !state.provider) return [];
    const latest = toBlock ?? await getLatestBlock();
    if (latest === null || latest === undefined) return [];
    let start = fromBlock ?? state.cfg.deploymentBlock ?? 0;
    let chunk = state.cfg.logChunkSize;
    const out = [];
    const filter = state.contract.filters.CivicIssueNFTMinted();
    while (start <= latest) {
      const end = Math.min(latest, start + chunk - 1);
      try {
        const logs = await withTimeout(state.contract.queryFilter(filter, start, end), state.cfg.rpcTimeoutMs);
        for (const l of logs) {
          out.push({
            tokenId: l.args.tokenId.toString(),
            recipient: toChecksum(l.args.recipient),
            tokenURI: l.args.tokenURI,
            transactionHash: l.transactionHash,
            blockNumber: l.blockNumber,
          });
        }
        start = end + 1;
      } catch (e) {
        const text = errText(e).toLowerCase();
        const rangeErr = text.includes('range') || text.includes('too large') || text.includes('limit') || text.includes('-32005') || text.includes('10000');
        if (rangeErr && chunk > 1) { chunk = Math.max(1, Math.floor(chunk / 2)); continue; }
        throw e;
      }
    }
    return out;
  }

  function isReady() {
    return state.initialized && state.blocking.length === 0;
  }

  return {
    init, ensureInit, isReady, getStatus, getContractInfo, getLatestBlock, getBalanceEth,
    mintCivicIssueNFT, getTransactionOutcome, getOnChainToken, balanceOf, getRecentMintEvents,
    txUrl, addressUrl, tokenUrl,
    get explorerBaseUrl() { return explorer(); },
    _state: state,
  };
}

// ─── Singleton used by the app ────────────────────────────────────────────────

let instance = null;

export function getEthereumService() {
  if (!instance) instance = createEthereumService();
  return instance;
}

/** Tests: replace the singleton (pass null to reset). */
export function setEthereumService(svc) {
  instance = svc;
}

export const ethereumService = {
  init:                  (...a) => getEthereumService().init(...a),
  ensureInit:            (...a) => getEthereumService().ensureInit(...a),
  isReady:               (...a) => getEthereumService().isReady(...a),
  getStatus:             (...a) => getEthereumService().getStatus(...a),
  getContractInfo:       (...a) => getEthereumService().getContractInfo(...a),
  getLatestBlock:        (...a) => getEthereumService().getLatestBlock(...a),
  getBalanceEth:         (...a) => getEthereumService().getBalanceEth(...a),
  mintCivicIssueNFT:     (...a) => getEthereumService().mintCivicIssueNFT(...a),
  getTransactionOutcome: (...a) => getEthereumService().getTransactionOutcome(...a),
  getOnChainToken:       (...a) => getEthereumService().getOnChainToken(...a),
  balanceOf:             (...a) => getEthereumService().balanceOf(...a),
  getRecentMintEvents:   (...a) => getEthereumService().getRecentMintEvents(...a),
  txUrl:                 (...a) => getEthereumService().txUrl(...a),
  addressUrl:            (...a) => getEthereumService().addressUrl(...a),
  tokenUrl:              (...a) => getEthereumService().tokenUrl(...a),
};
