import { Loader2, Gem, AlertTriangle, Archive } from 'lucide-react';

/**
 * NFT status pill. NFT_MINTED is a button when onClick is given (opens details).
 * NFT_MINTED → "NFT Minted ✓" · NFT_MINT_PENDING → "Minting…" · NFT_MINT_FAILED → "Mint failed"
 * NOT_ELIGIBLE_LEGACY / none → subtle "Legacy report" (or nothing when hideLegacy)
 */
export default function NftStatusBadge({ status, onClick, hideLegacy = false }) {
  if (status === 'NFT_MINTED') {
    const Tag = onClick ? 'button' : 'span';
    return (
      <Tag className="nft-badge minted" onClick={onClick} type={onClick ? 'button' : undefined} title="Civic Issue NFT on Ethereum Sepolia">
        <Gem size={11} /> NFT Minted ✓
      </Tag>
    );
  }
  if (status === 'NFT_MINT_PENDING') {
    return <span className="nft-badge pending"><Loader2 size={11} className="spin" /> Minting…</span>;
  }
  if (status === 'NFT_MINT_FAILED') {
    return <span className="nft-badge failed"><AlertTriangle size={11} /> Mint failed</span>;
  }
  if (hideLegacy) return null;
  return <span className="nft-badge legacy" title="Submitted before the Ethereum Sepolia migration — no NFT"><Archive size={11} /> Legacy report</span>;
}
