/**
 * hardhat.config.cjs — CivicChain smart-contract tooling (Hardhat 2, CommonJS
 * because the root package is ESM). Ethereum Sepolia only; no mainnet network
 * is defined on purpose.
 */
require('dotenv').config();
require('@nomicfoundation/hardhat-toolbox');

function normaliseKey(key) {
  if (!key) return null;
  const k = key.trim();
  const hex = k.startsWith('0x') ? k : `0x${k}`;
  return /^0x[0-9a-fA-F]{64}$/.test(hex) ? hex : null;
}

const deployerKey = normaliseKey(process.env.DEPLOYER_PRIVATE_KEY);

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: '0.8.24',
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'cancun' },
  },
  paths: {
    tests: './test/contracts',
  },
  networks: {
    hardhat: {},
    localhost: { url: 'http://127.0.0.1:8545' },
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com',
      chainId: 11155111,
      accounts: deployerKey ? [deployerKey] : [],
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY || '',
  },
  sourcify: { enabled: false },
};
