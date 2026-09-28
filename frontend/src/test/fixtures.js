export const CONTRACT = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
export const OWNER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
export const TX = `0x${'ab'.repeat(32)}`;

export const mintedResult = {
  success: true,
  status: 'NFT_MINTED',
  reportId: 'RP-1790000000000',
  analysis: { isCivicIssue: true, category: 'ROAD_DAMAGE', severity: 'HIGH', confidence: 96, reason: 'Large pothole' },
  fraud: { score: 0, warning: false },
  evidence: {
    imageCid: 'bafkimage1234567890abcdefghij', imageUrl: 'https://gateway.pinata.cloud/ipfs/bafkimage1234567890abcdefghij',
    metadataCid: 'bafkmeta1234567890abcdefghijk', metadataUrl: 'https://gateway.pinata.cloud/ipfs/bafkmeta1234567890abcdefghijk',
    imageSha256: 'f'.repeat(64),
  },
  nft: {
    status: 'NFT_MINTED', tokenId: '7', transactionHash: TX, contractAddress: CONTRACT, recipient: OWNER,
    metadataCid: 'bafkmeta1234567890abcdefghijk', imageCid: 'bafkimage1234567890abcdefghij',
    tokenURI: 'ipfs://bafkmeta1234567890abcdefghijk',
    explorerUrl: `https://sepolia.etherscan.io/tx/${TX}`, tokenExplorerUrl: `https://sepolia.etherscan.io/nft/${CONTRACT}/7`,
  },
  points: { earned: 15 }, reputation: { earned: 5 },
  pipeline: [],
};

export const nftItem = {
  tokenId: '7', reportId: 'RP-1790000000000', owner: OWNER, contractAddress: CONTRACT,
  tokenURI: 'ipfs://bafkmeta1234567890abcdefghijk', imageCid: 'bafkimage1234567890abcdefghij',
  imageUrl: 'https://gateway.pinata.cloud/ipfs/bafkimage1234567890abcdefghij',
  metadataUrl: 'https://gateway.pinata.cloud/ipfs/bafkmeta1234567890abcdefghijk',
  transactionHash: TX, blockNumber: 123, mintedAt: '2026-09-29T00:00:00.000Z',
  category: 'GARBAGE', severity: 'MEDIUM', confidence: 91, city: 'JABALPUR', cityName: 'Jabalpur',
  statusAtMint: 'OPEN', currentStatus: 'VERIFIED',
  explorerUrl: `https://sepolia.etherscan.io/tx/${TX}`, tokenExplorerUrl: `https://sepolia.etherscan.io/nft/${CONTRACT}/7`,
};
