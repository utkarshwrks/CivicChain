import { motion } from 'framer-motion';
import { ExternalLink, MapPin, Calendar } from 'lucide-react';
import NftImage from './NftImage.jsx';
import { shortAddress, shortHash, humanize, formatDate, nftUrl, txUrl, ipfsToGateway } from '../utils/format.js';

/**
 * Card for one Civic Issue NFT (Explorer grid + Profile collection).
 * nft: item from /api/nfts or /api/nft/owner/:address
 */
export default function NftCard({ nft, onOpen, index = 0 }) {
  const image = nft.imageUrl || ipfsToGateway(nft.imageCid ? `ipfs://${nft.imageCid}` : null);
  const tokenLink = nftUrl(nft.contractAddress, nft.tokenId);
  return (
    <motion.div
      className="nft-card"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.05, 0.4) }}
      whileHover={{ y: -4 }}
      onClick={() => onOpen?.(nft)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen?.(nft); }}
    >
      <NftImage src={image} alt={`Civic Issue NFT #${nft.tokenId}`} />
      <div className="nft-card-body">
        <div className="nft-card-top">
          <span className="nft-token">Token #{nft.tokenId}</span>
          {nft.currentStatus && <span className={`nft-cur status-${String(nft.currentStatus).toLowerCase()}`}>{humanize(nft.currentStatus)}</span>}
        </div>
        <div className="nft-card-cat">{humanize(nft.category)} <span className="nft-sev">· {nft.severity || '—'}</span></div>
        <div className="nft-card-meta">
          <span><MapPin size={11} /> {nft.cityName || nft.city || '—'}</span>
          <span><Calendar size={11} /> {formatDate(nft.mintedAt)}</span>
        </div>
        <div className="nft-card-meta mono">
          <span>Owner {shortAddress(nft.owner)}</span>
          {nft.transactionHash && <span>Tx {shortHash(nft.transactionHash, 6, 4)}</span>}
        </div>
        <div className="nft-card-links" onClick={(e) => e.stopPropagation()}>
          {tokenLink && <a href={tokenLink} target="_blank" rel="noopener noreferrer"><ExternalLink size={11} /> View on Etherscan</a>}
          {nft.transactionHash && <a href={txUrl(nft.transactionHash)} target="_blank" rel="noopener noreferrer"><ExternalLink size={11} /> Tx</a>}
        </div>
      </div>
    </motion.div>
  );
}
