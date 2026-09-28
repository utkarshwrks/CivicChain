import { describe, it, expect } from 'vitest';
import { createEthereumService, classifyError } from '../services/ethereum.service.js';
import { makeFakeChain, SIGNER, CONTRACT, randomAddress } from './helpers/fakeChain.js';

const CFG = { rpcTimeoutMs: 1000, mintTimeoutMs: 1000, mintConfirmations: 1, contractAddress: CONTRACT, deploymentBlock: 100 };

function svc(chainOpts = {}, cfg = {}) {
  const chain = makeFakeChain(chainOpts);
  const service = createEthereumService({
    provider: chain.provider, signer: chain.signer, contract: chain.contract,
    config: { ...CFG, ...cfg, issues: [] },
  });
  return { service, chain };
}

describe('ethereum.service — init / chain guard', () => {
  it('ready on Sepolia with an authorised minter', async () => {
    const { service } = svc();
    const r = await service.init();
    expect(r.ready).toBe(true);
    expect(service.isReady()).toBe(true);
  });

  it('refuses Ethereum mainnet (chain 1) permanently', async () => {
    const { service } = svc({ chainId: 1 });
    const r = await service.init();
    expect(r.ready).toBe(false);
    expect(r.blocking).toContain('CHAIN_MISMATCH');
    expect(r.issues.join(' ')).toMatch(/MAINNET REFUSED/);
    expect(service._state.permanentlyDisabled).toBe(true);
    const m = await service.mintCivicIssueNFT(randomAddress(), 'ipfs://bafyx');
    expect(m).toMatchObject({ success: false, code: 'CHAIN_MISMATCH' });
  });

  it('chain mismatch (e.g. Holesky 17000) disables minting', async () => {
    const { service } = svc({ chainId: 17000 });
    const r = await service.init();
    expect(r.blocking).toEqual(['CHAIN_MISMATCH']);
  });

  it('allows 31337 only when allowLocalChain is set', async () => {
    const a = svc({ chainId: 31337 }, { allowLocalChain: false });
    expect((await a.service.init()).blocking).toContain('CHAIN_MISMATCH');
    const b = svc({ chainId: 31337 }, { allowLocalChain: true });
    expect((await b.service.init()).ready).toBe(true);
  });

  it('missing config → configured false with issues (never throws)', async () => {
    const service = createEthereumService({ config: { rpcUrl: null, privateKey: null, contractAddress: null } });
    const st = await service.getStatus();
    expect(st.configured).toBe(false);
    expect(st.issues.length).toBeGreaterThan(0);
    expect(st.blocking).toContain('CONTRACT_NOT_CONFIGURED');
  });

  it('no contract code at the address → CONTRACT_NOT_DEPLOYED', async () => {
    const { service } = svc({ code: '0x' });
    const r = await service.init();
    expect(r.blocking).toContain('CONTRACT_NOT_CONFIGURED');
    expect(r.issues.join(' ')).toMatch(/CONTRACT_NOT_DEPLOYED/);
  });

  it('backend signer is not the minter → MINTER_NOT_AUTHORIZED', async () => {
    const { service } = svc({ minter: randomAddress() });
    const r = await service.init();
    expect(r.blocking).toContain('MINTER_NOT_AUTHORIZED');
  });

  it('RPC down → RPC_UNAVAILABLE, reported not thrown', async () => {
    const { service } = svc({ rpcDown: true });
    const r = await service.init();
    expect(r.blocking).toContain('RPC_UNAVAILABLE');
  });
});

describe('ethereum.service — status', () => {
  it('getStatus never includes the RPC URL or a key', async () => {
    const { service } = svc({}, { rpcUrl: 'https://eth-sepolia.g.alchemy.com/v2/SECRETKEY123456789', privateKey: `0x${'ab'.repeat(32)}` });
    const st = await service.getStatus();
    const text = JSON.stringify(st);
    expect(text).not.toMatch(/alchemy|SECRETKEY/);
    expect(text).not.toMatch(/abababab/);
    expect(st).toMatchObject({
      network: 'Ethereum Sepolia', chainId: 11155111, rpcReachable: true, latestBlock: 5_000_000,
      contractAddress: CONTRACT, name: 'CivicChain Civic Issue', symbol: 'CIVIC', minter: SIGNER,
      backendMinterAddress: SIGNER, minterAuthorized: true, minterBalanceEth: '1.0', lowBalance: false, totalMinted: 0,
    });
  });

  it('flags a low minter balance (< 0.02 ETH)', async () => {
    const { service } = svc({ balance: 10n ** 16n });
    const st = await service.getStatus();
    expect(st.lowBalance).toBe(true);
    expect(st.issues.join(' ')).toMatch(/low/);
  });
});

describe('ethereum.service — mint', () => {
  it('successful mint parses tokenId from the CivicIssueNFTMinted event', async () => {
    const { service } = svc();
    const to = randomAddress();
    const hashes = [];
    const r = await service.mintCivicIssueNFT(to, 'ipfs://bafymeta', { reportId: 'CC-1', onSubmitted: (h) => hashes.push(h) });
    expect(r.success).toBe(true);
    expect(r.tokenId).toBe('1');
    expect(r.recipient).toBe(to);
    expect(r.contractAddress).toBe(CONTRACT);
    expect(r.transactionHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(hashes).toEqual([r.transactionHash]);
    expect(r.explorerUrl).toBe(`https://sepolia.etherscan.io/tx/${r.transactionHash}`);
    expect(r.tokenExplorerUrl).toBe(`https://sepolia.etherscan.io/nft/${CONTRACT}/1`);
  });

  it('rejects an invalid recipient and a non-ipfs tokenURI without sending', async () => {
    const { service, chain } = svc();
    expect(await service.mintCivicIssueNFT('0xabc', 'ipfs://x')).toMatchObject({ success: false, code: 'INVALID_RECIPIENT' });
    expect(await service.mintCivicIssueNFT(`0x${'0'.repeat(40)}`, 'ipfs://x')).toMatchObject({ code: 'INVALID_RECIPIENT' });
    expect((await service.mintCivicIssueNFT(randomAddress(), 'https://x')).success).toBe(false);
    expect(chain.sendLog).toEqual([]);
  });

  it('INSUFFICIENT_FUNDS preflight stops before sending', async () => {
    const { service, chain } = svc({ balance: 1000n });
    const r = await service.mintCivicIssueNFT(randomAddress(), 'ipfs://bafymeta');
    expect(r).toMatchObject({ success: false, code: 'INSUFFICIENT_FUNDS' });
    expect(r.transactionHash).toBeUndefined();
    expect(chain.sendLog).toEqual([]);
  });

  it('timeout keeps the tx hash (TX_TIMEOUT)', async () => {
    const err = new Error('timeout'); err.code = 'TIMEOUT';
    const { service } = svc({ waitError: err });
    const r = await service.mintCivicIssueNFT(randomAddress(), 'ipfs://bafymeta');
    expect(r.success).toBe(false);
    expect(r.code).toBe('TX_TIMEOUT');
    expect(r.transactionHash).toMatch(/^0x/);
  });

  it('receipt status 0 → TX_REVERTED with hash', async () => {
    const { service } = svc({ receiptStatus: 0 });
    const r = await service.mintCivicIssueNFT(randomAddress(), 'ipfs://bafymeta');
    expect(r).toMatchObject({ success: false, code: 'TX_REVERTED' });
    expect(r.transactionHash).toBeTruthy();
  });

  it('maps send errors: nonce (resets NonceManager), insufficient funds, revert, rpc', async () => {
    const nonce = new Error('nonce too low'); nonce.code = 'NONCE_EXPIRED';
    const a = svc({ sendError: nonce });
    expect((await a.service.mintCivicIssueNFT(randomAddress(), 'ipfs://m')).code).toBe('NONCE_ERROR');
    expect(a.chain.signer.resets).toBe(1);

    const funds = new Error('insufficient funds for gas'); funds.code = 'INSUFFICIENT_FUNDS';
    expect((await svc({ sendError: funds }).service.mintCivicIssueNFT(randomAddress(), 'ipfs://m')).code).toBe('INSUFFICIENT_FUNDS');

    const revert = new Error('execution reverted'); revert.code = 'CALL_EXCEPTION';
    expect((await svc({ sendError: revert }).service.mintCivicIssueNFT(randomAddress(), 'ipfs://m')).code).toBe('TX_REVERTED');

    const rpc = new Error('fetch failed'); rpc.code = 'NETWORK_ERROR';
    expect((await svc({ sendError: rpc }).service.mintCivicIssueNFT(randomAddress(), 'ipfs://m')).code).toBe('RPC_UNAVAILABLE');
  });

  it('two concurrent mints are serialised (second sends after the first resolves)', async () => {
    const { service, chain } = svc({ waitDelayMs: 40 });
    const [a, b] = await Promise.all([
      service.mintCivicIssueNFT(randomAddress(), 'ipfs://one'),
      service.mintCivicIssueNFT(randomAddress(), 'ipfs://two'),
    ]);
    expect(a.tokenId).toBe('1');
    expect(b.tokenId).toBe('2');
    const kinds = chain.sendLog.map((s) => s.split(':')[0]);
    expect(kinds).toEqual(['send', 'wait', 'send', 'wait']);
  });

  it('a failing mint does not break the queue', async () => {
    const { service, chain } = svc();
    chain.opts.sendError = new Error('boom');
    const first = await service.mintCivicIssueNFT(randomAddress(), 'ipfs://one');
    expect(first.success).toBe(false);
    chain.opts.sendError = null;
    const second = await service.mintCivicIssueNFT(randomAddress(), 'ipfs://two');
    expect(second.success).toBe(true);
  });
});

describe('ethereum.service — reconciliation + reads', () => {
  it('getTransactionOutcome: CONFIRMED / REVERTED / PENDING / NOT_FOUND', async () => {
    const ok = svc();
    const m = await ok.service.mintCivicIssueNFT(randomAddress(), 'ipfs://m');
    expect(await ok.service.getTransactionOutcome(m.transactionHash)).toMatchObject({ state: 'CONFIRMED', tokenId: '1' });

    const rev = svc({ receiptStatus: 0 });
    const r = await rev.service.mintCivicIssueNFT(randomAddress(), 'ipfs://m');
    expect((await rev.service.getTransactionOutcome(r.transactionHash)).state).toBe('REVERTED');

    const pendingHash = `0x${'e'.repeat(64)}`;
    const pend = svc({ pendingHashes: [pendingHash] });
    expect((await pend.service.getTransactionOutcome(pendingHash)).state).toBe('PENDING');
    expect((await pend.service.getTransactionOutcome(`0x${'f'.repeat(64)}`)).state).toBe('NOT_FOUND');
    expect((await pend.service.getTransactionOutcome('garbage')).state).toBe('NOT_FOUND');
  });

  it('getOnChainToken returns owner + tokenURI, or null for a missing token', async () => {
    const { service } = svc();
    const to = randomAddress();
    await service.mintCivicIssueNFT(to, 'ipfs://meta1');
    expect(await service.getOnChainToken(1)).toEqual({ owner: to, tokenURI: 'ipfs://meta1' });
    expect(await service.getOnChainToken(99)).toBeNull();
    expect(await service.balanceOf(to)).toBe(1);
  });

  it('getRecentMintEvents chunks and auto-halves on "range too large"', async () => {
    const { service, chain } = svc({ maxLogRange: 300, latestBlock: 1000 }, { logChunkSize: 1000 });
    await service.mintCivicIssueNFT(randomAddress(), 'ipfs://a');
    const events = await service.getRecentMintEvents({ fromBlock: 0, toBlock: 1001 });
    expect(events).toHaveLength(1);
    expect(events[0].tokenId).toBe('1');
    expect(chain.opts.queryCalls).toBeGreaterThan(1);
  });

  it('classifyError decodes the NotMinter custom error', async () => {
    const { iface } = await import('./helpers/fakeChain.js');
    const data = iface.encodeErrorResult('NotMinter', [SIGNER]);
    expect(classifyError({ data }, iface)).toBe('MINTER_NOT_AUTHORIZED');
  });
});
