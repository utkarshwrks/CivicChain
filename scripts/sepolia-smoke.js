/**
 * sepolia-smoke.js — read-only live check of the Sepolia configuration.
 *   npm run smoke:sepolia
 * Prints chain ID, latest block, contract, owner, minter authorisation,
 * minter test-ETH balance and totalMinted. Sends no transaction.
 */
import 'dotenv/config';
import { createEthereumService } from '../backend/services/ethereum.service.js';

const svc = createEthereumService();
const st = await svc.getStatus();

const row = (k, v) => console.log(`  ${k.padEnd(22)} ${v ?? '—'}`);
console.log('\nCivicChain — Ethereum Sepolia smoke test (read-only)\n');
row('Network', st.network);
row('Chain ID', st.chainId);
row('RPC reachable', st.rpcReachable ? 'yes' : 'NO');
row('Latest block', st.latestBlock);
row('NFT contract', st.contractAddress);
row('Name / symbol', st.name ? `${st.name} / ${st.symbol}` : null);
row('Owner', st.owner);
row('Contract minter', st.minter);
row('Backend minter', st.backendMinterAddress);
row('Minter authorised', st.minterAuthorized ? 'yes' : 'NO');
row('Minter balance', st.minterBalanceEth !== null ? `${st.minterBalanceEth} ETH${st.lowBalance ? '  (LOW — top up from a faucet)' : ''}` : null);
row('Total minted', st.totalMinted);
row('Explorer', st.explorerUrl);
if (st.issues.length) {
  console.log('\n  Issues:');
  for (const i of st.issues) console.log(`   • ${i}`);
}
const ok = st.ready && st.chainId === 11155111 && st.minterAuthorized;
console.log(`\n${ok ? '✅ Sepolia configuration is ready' : '⚠  Sepolia configuration is NOT ready'}\n`);
process.exit(ok ? 0 : 1);
