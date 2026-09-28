/**
 * deploy-sepolia.js — Deploy CivicIssueNFT to Ethereum Sepolia.
 *
 *   npm run deploy:sepolia   → hardhat run scripts/deploy-sepolia.js --network sepolia
 *   npm run deploy:local     → rehearsal on a local Hardhat node (chain 31337)
 *
 * Writes deployments/sepolia.json (or deployments/localhost.json for a
 * rehearsal) and exports the ABI to backend/abi/CivicIssueNFT.json.
 * Refuses to run on Ethereum mainnet (chain 1) or any unexpected chain.
 */
import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import hre  from 'hardhat';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.join(__dirname, '..');

const SEPOLIA_CHAIN_ID = 11155111n;
const LOCAL_CHAIN_ID   = 31337n;
const MIN_BALANCE      = hre.ethers.parseEther('0.01');
const CONFIRMATIONS    = 2;

function fail(msg) {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}

async function main() {
  const { ethers, network } = hre;
  const { chainId } = await ethers.provider.getNetwork();

  if (chainId === 1n) fail('MAINNET REFUSED — CivicChain deploys to Ethereum Sepolia only.');
  const isLocal = chainId === LOCAL_CHAIN_ID && ['localhost', 'hardhat'].includes(network.name);
  if (chainId !== SEPOLIA_CHAIN_ID && !isLocal) {
    fail(`Unexpected chain ID ${chainId}. Expected ${SEPOLIA_CHAIN_ID} (Sepolia); 31337 is allowed only with --network localhost.`);
  }

  const signers = await ethers.getSigners();
  if (signers.length === 0) {
    fail('No deployer account. Set DEPLOYER_PRIVATE_KEY (a NEW Sepolia-only key) and SEPOLIA_RPC_URL in .env.');
  }
  const deployer = signers[0];
  const deployerAddress = await deployer.getAddress();
  console.log(`Network:   ${network.name} (chain ${chainId})`);
  console.log(`Deployer:  ${deployerAddress}`);

  const balance = await ethers.provider.getBalance(deployerAddress);
  console.log(`Balance:   ${ethers.formatEther(balance)} ETH`);
  if (!isLocal && balance < MIN_BALANCE) {
    fail(
      `Deployer balance is below 0.01 Sepolia ETH.\n` +
      `   Get free test ETH for ${deployerAddress} from a Sepolia faucet\n` +
      `   (Google Cloud Web3 faucet, Alchemy or Infura faucet, or a proof-of-work faucet), then re-run.`
    );
  }

  const minter = process.env.MINTER_ADDRESS && ethers.isAddress(process.env.MINTER_ADDRESS)
    ? ethers.getAddress(process.env.MINTER_ADDRESS)
    : deployerAddress;
  const owner = deployerAddress;
  console.log(`Owner:     ${owner}`);
  console.log(`Minter:    ${minter}`);

  const Factory  = await ethers.getContractFactory('CivicIssueNFT');
  const contract = await Factory.deploy(owner, minter);
  await contract.waitForDeployment();
  const deployTx = contract.deploymentTransaction();
  console.log(`Tx sent:   ${deployTx.hash} — waiting for ${isLocal ? 1 : CONFIRMATIONS} confirmation(s)…`);
  const receipt = await deployTx.wait(isLocal ? 1 : CONFIRMATIONS);

  const contractAddress = await contract.getAddress();
  const explorerUrl = `https://sepolia.etherscan.io/address/${contractAddress}`;

  const record = {
    network:         isLocal ? 'localhost' : 'sepolia',
    chainId:         Number(chainId),
    contractName:    'CivicIssueNFT',
    contractAddress,
    deployer:        deployerAddress,
    owner,
    minter,
    transactionHash: deployTx.hash,
    blockNumber:     receipt.blockNumber,
    deployedAt:      new Date().toISOString(),
    explorerUrl:     isLocal ? null : explorerUrl,
  };

  const deploymentsDir = path.join(ROOT, 'deployments');
  fs.mkdirSync(deploymentsDir, { recursive: true });
  const outFile = path.join(deploymentsDir, isLocal ? 'localhost.json' : 'sepolia.json');
  fs.writeFileSync(outFile, JSON.stringify(record, null, 2) + '\n');

  const artifact = await hre.artifacts.readArtifact('CivicIssueNFT');
  const abiDir = path.join(ROOT, 'backend', 'abi');
  fs.mkdirSync(abiDir, { recursive: true });
  fs.writeFileSync(path.join(abiDir, 'CivicIssueNFT.json'), JSON.stringify(artifact.abi, null, 2) + '\n');

  console.log('\n✅ CivicIssueNFT deployed');
  console.log(`   Contract:  ${contractAddress}`);
  console.log(`   Network:   ${record.network} (chain ${record.chainId})`);
  console.log(`   Tx hash:   ${record.transactionHash}`);
  console.log(`   Block:     ${record.blockNumber}`);
  if (!isLocal) console.log(`   Explorer:  ${explorerUrl}`);
  console.log(`   Record:    ${path.relative(ROOT, outFile)}`);
  console.log(`   ABI:       backend/abi/CivicIssueNFT.json`);
  console.log('\nNext steps:');
  console.log(`   1. In .env set NFT_CONTRACT_ADDRESS=${contractAddress}`);
  console.log(`   2. In .env set NFT_DEPLOYMENT_BLOCK=${record.blockNumber}`);
  if (!isLocal) {
    console.log(`   3. (optional) npx hardhat verify --network sepolia ${contractAddress} ${owner} ${minter}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
