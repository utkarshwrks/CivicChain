/**
 * fakeChain.js — in-memory stand-ins for an ethers provider, signer and the
 * CivicIssueNFT contract. Unit tests never touch a real network.
 */
import fs   from 'fs';
import path from 'path';
import { Interface, Wallet, getAddress } from 'ethers';

export const ABI = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'backend', 'abi', 'CivicIssueNFT.json'), 'utf8'));
export const iface = new Interface(ABI);

export const SIGNER   = getAddress('0x1111111111111111111111111111111111111111');
export const CONTRACT = getAddress('0x2222222222222222222222222222222222222222');
export const OWNER    = getAddress('0x3333333333333333333333333333333333333333');

let hashCounter = 0;
export const fakeHash = () => `0x${(++hashCounter).toString(16).padStart(64, '0')}`;

export function mintedLog(tokenId, recipient, uri, address = CONTRACT) {
  const ev = iface.getEvent('CivicIssueNFTMinted');
  const { data, topics } = iface.encodeEventLog(ev, [tokenId, recipient, uri]);
  return { address, data, topics };
}

/**
 * Build a fake chain. Options let each test break one thing.
 */
export function makeFakeChain(opts = {}) {
  const o = {
    chainId: 11155111,
    code: '0x6080',
    minter: SIGNER,
    balance: 10n ** 18n,
    maxFeePerGas: 2_000_000_000n,
    gas: 150_000n,
    latestBlock: 5_000_000,
    sendError: null,           // error thrown by contract.mintCivicIssueNFT(...)
    waitError: null,           // error thrown by provider.waitForTransaction
    receiptStatus: 1,
    waitDelayMs: 0,
    ...opts,
  };

  const txs = new Map();     // hash → { recipient, uri, tokenId, status }
  const events = [];         // minted events (for queryFilter)
  let nextId = 1;
  const sendLog = [];        // order of sends/waits for serialisation tests

  const provider = {
    send: async (method) => {
      if (method === 'eth_chainId') {
        if (o.rpcDown) { const e = new Error('fetch failed'); e.code = 'NETWORK_ERROR'; throw e; }
        return `0x${o.chainId.toString(16)}`;
      }
      throw new Error(`unsupported ${method}`);
    },
    getNetwork: async () => ({ chainId: BigInt(o.chainId) }),
    getCode: async () => o.code,
    getBlockNumber: async () => {
      if (o.rpcDown) { const e = new Error('fetch failed'); e.code = 'NETWORK_ERROR'; throw e; }
      return o.latestBlock;
    },
    getBalance: async () => o.balance,
    getFeeData: async () => ({ maxFeePerGas: o.maxFeePerGas, gasPrice: o.maxFeePerGas }),
    waitForTransaction: async (hash) => {
      sendLog.push(`wait:${hash}`);
      if (o.waitDelayMs) await new Promise((r) => setTimeout(r, o.waitDelayMs));
      if (o.waitError) throw o.waitError;
      return receiptFor(hash);
    },
    getTransactionReceipt: async (hash) => (o.receiptsVisible === false ? null : receiptFor(hash)),
    getTransaction: async (hash) => (txs.has(hash) || o.pendingHashes?.includes(hash) ? { hash } : null),
  };

  function receiptFor(hash) {
    const t = txs.get(hash);
    if (!t) return null;
    return {
      status: t.status,
      blockNumber: o.latestBlock + 1,
      logs: t.status === 1 ? [mintedLog(t.tokenId, t.recipient, t.uri)] : [],
    };
  }

  const signer = { getAddress: async () => SIGNER, reset: () => { signer.resets = (signer.resets || 0) + 1; }, resets: 0 };

  const mint = async (recipient, uri) => {
    if (o.sendError) throw o.sendError;
    const hash = fakeHash();
    sendLog.push(`send:${hash}`);
    const tokenId = BigInt(nextId++);
    txs.set(hash, { recipient, uri, tokenId, status: o.receiptStatus });
    if (o.receiptStatus === 1) {
      events.push({ args: { tokenId, recipient, tokenURI: uri }, transactionHash: hash, blockNumber: o.latestBlock + 1 });
    }
    return { hash };
  };
  mint.estimateGas = async () => {
    if (o.estimateError) throw o.estimateError;
    return o.gas;
  };

  const contract = {
    getAddress: async () => CONTRACT,
    minter: async () => o.minter,
    name: async () => 'CivicChain Civic Issue',
    symbol: async () => 'CIVIC',
    owner: async () => OWNER,
    totalMinted: async () => BigInt(nextId - 1),
    mintCivicIssueNFT: mint,
    ownerOf: async (id) => {
      const t = [...txs.values()].find((x) => x.tokenId === BigInt(id) && x.status === 1);
      if (!t) { const e = new Error('ERC721NonexistentToken'); e.code = 'CALL_EXCEPTION'; throw e; }
      return t.recipient;
    },
    tokenURI: async (id) => {
      const t = [...txs.values()].find((x) => x.tokenId === BigInt(id) && x.status === 1);
      if (!t) { const e = new Error('ERC721NonexistentToken'); e.code = 'CALL_EXCEPTION'; throw e; }
      return t.uri;
    },
    balanceOf: async (a) => BigInt([...txs.values()].filter((x) => x.status === 1 && x.recipient.toLowerCase() === a.toLowerCase()).length),
    filters: { CivicIssueNFTMinted: () => ({}) },
    queryFilter: async (_f, from, to) => {
      if (o.maxLogRange && to - from + 1 > o.maxLogRange) {
        const e = new Error('query returned more than 10000 results; block range too large');
        throw e;
      }
      o.queryCalls = (o.queryCalls || 0) + 1;
      return events.filter((e) => e.blockNumber >= from && e.blockNumber <= to);
    },
  };

  return { provider, signer, contract, opts: o, txs, sendLog, events };
}

export const randomAddress = () => Wallet.createRandom().address;
