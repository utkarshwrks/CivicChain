import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { X, ExternalLink, ChevronDown, ShieldCheck, Gem, Loader2, AlertCircle } from 'lucide-react';
import NftImage from './NftImage.jsx';
import { CopyButton } from './ui.jsx';
import { api } from '../utils/api.js';
import { shortAddress, shortHash, humanize, formatDate, nftUrl, txUrl, addressUrl, ipfsToGateway } from '../utils/format.js';

function Row({ k, v, copy, href }) {
  return (
    <div className="nft-row">
      <span className="k">{k}</span>
      <span className="v">
        {href ? <a href={href} target="_blank" rel="noopener noreferrer">{v}</a> : v}
        {copy && <CopyButton text={copy} />}
      </span>
    </div>
  );
}

/**
 * Full details of one Civic Issue NFT. Pass `nft` (list item) and/or `tokenId`;
 * the modal loads /api/nft/:tokenId for the on-chain check and report data.
 */
export default function NftDetailModal({ nft: initial, tokenId, onClose }) {
  const id = tokenId ?? initial?.tokenId;
  const [data, setData] = useState(initial || null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showRaw, setShowRaw] = useState(false);
  const [raw, setRaw] = useState(null);
  const [rawError, setRawError] = useState(null);

  useEffect(() => {
    let alive = true;
    if (!id) { setLoading(false); return undefined; }
    api.nft(id)
      .then((d) => { if (alive) setData((prev) => ({ ...(prev || {}), ...d })); })
      .catch((e) => { if (alive) setError(e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [id]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const metadataUrl = data?.metadataUrl || ipfsToGateway(data?.tokenURI);
  const imageUrl = data?.imageUrl || ipfsToGateway(data?.imageCid ? `ipfs://${data.imageCid}` : null);

  async function toggleRaw() {
    setShowRaw((v) => !v);
    if (raw || !metadataUrl) return;
    try {
      const res = await fetch(metadataUrl);
      setRaw(await res.json());
    } catch {
      setRawError('The IPFS gateway did not return the metadata yet. Try "View NFT Metadata" in a moment.');
    }
  }

  const report = data?.report;
  const currentStatus = data?.currentStatus || report?.currentStatus;

  return (
    <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <motion.div className="modal-panel nft-modal" role="dialog" aria-label={`Civic Issue NFT ${id}`}
        initial={{ scale: 0.94, opacity: 0, y: 16 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.94, opacity: 0 }}>
        <div className="modal-header">
          <div className="modal-title"><Gem size={18} /><span>Civic Issue NFT #{id}</span></div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        <div className="nft-modal-grid">
          <NftImage src={imageUrl} alt={`Evidence for token ${id}`} className="large" />
          <div>
            {loading && <div className="nft-verify"><Loader2 size={13} className="spin" /> Checking on-chain…</div>}
            {!loading && data?.verifiedOnChain && <div className="nft-verify ok"><ShieldCheck size={13} /> Verified on Ethereum Sepolia (ownerOf + tokenURI match)</div>}
            {!loading && data && !data.verifiedOnChain && !error && <div className="nft-verify warn"><AlertCircle size={13} /> On-chain check unavailable right now — verify on Etherscan</div>}
            {error && <div className="alert error"><AlertCircle size={14} /> {error}</div>}

            <Row k="Report" v={data?.reportId || '—'} copy={data?.reportId} />
            <Row k="Category" v={humanize(data?.category)} />
            <Row k="Severity" v={data?.severity || '—'} />
            <Row k="AI confidence" v={data?.confidence != null ? `${data.confidence}%` : '—'} />
            <Row k="City" v={data?.cityName || data?.city || '—'} />
            <Row k="Status at Mint" v="OPEN" />
            <Row k="Current status" v={humanize(currentStatus)} />
            <Row k="Owner" v={shortAddress(data?.owner)} copy={data?.owner} href={addressUrl(data?.owner)} />
            <Row k="Contract" v={shortAddress(data?.contractAddress)} copy={data?.contractAddress} href={addressUrl(data?.contractAddress)} />
            <Row k="Transaction" v={shortHash(data?.transactionHash)} copy={data?.transactionHash} href={txUrl(data?.transactionHash)} />
            <Row k="Minted" v={formatDate(data?.mintedAt)} />
            <Row k="Token URI" v={data?.tokenURI ? shortHash(data.tokenURI, 14, 6) : '—'} copy={data?.tokenURI} />
          </div>
        </div>

        {report?.reason && <p className="nft-reason">“{report.reason}”</p>}

        <div className="nft-actions">
          {data?.transactionHash && <a className="btn-ghost" href={txUrl(data.transactionHash)} target="_blank" rel="noopener noreferrer"><ExternalLink size={13} /> View on Sepolia Etherscan</a>}
          {data?.contractAddress && <a className="btn-ghost" href={nftUrl(data.contractAddress, id)} target="_blank" rel="noopener noreferrer"><ExternalLink size={13} /> View NFT on Etherscan</a>}
          {metadataUrl && <a className="btn-ghost" href={metadataUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={13} /> View NFT Metadata</a>}
          {imageUrl && <a className="btn-ghost" href={imageUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={13} /> View Evidence</a>}
        </div>

        <button className="blk-raw-toggle" onClick={toggleRaw} style={{ marginTop: '0.8rem' }}>
          <ChevronDown size={13} className={`chevron ${showRaw ? 'open' : ''}`} /> {showRaw ? 'Hide' : 'Show'} raw metadata JSON
        </button>
        {showRaw && (
          <pre className="blk-raw">{raw ? JSON.stringify(raw, null, 2) : rawError || 'Loading from IPFS…'}</pre>
        )}

        <p className="nft-footnote">This token certifies a civic report that passed CivicChain's AI, fraud and duplicate checks. It does not certify resolution. Ethereum Sepolia is a test network — no monetary value.</p>
      </motion.div>
    </motion.div>
  );
}
