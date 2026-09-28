import { motion } from 'framer-motion';
import {
  CheckCircle2, ExternalLink, Loader2, AlertTriangle, RefreshCw, XCircle, Gem, Star, Coins, ShieldCheck,
} from 'lucide-react';
import NftImage from './NftImage.jsx';
import { CopyButton } from './ui.jsx';
import { shortAddress, shortHash, humanize, txUrl, nftUrl, addressUrl, ipfsToGateway } from '../utils/format.js';

const CONFETTI = ['#FF9A3A', '#19c37d', '#3b82f6', '#f4f1ea', '#a855f7'];

const REJECTIONS = {
  NOT_CIVIC_ISSUE: { title: 'Not a civic issue', text: 'Our AI could not find a civic problem in this photo. Try another photo of the issue.' },
  FRAUD_BLOCKED:   { title: 'Report blocked', text: 'This photo did not pass the fraud checks. Try another photo that clearly shows the civic issue.' },
  DUPLICATE:       { title: 'Already reported', text: 'This exact photo was already reported, so it was not submitted again.' },
  AI_FAILED:       { title: 'AI verification unavailable', text: 'The AI service did not respond. Nothing was stored — please try again in a moment.' },
  IPFS_FAILED:     { title: 'Evidence storage failed', text: 'The evidence could not be pinned to IPFS. Nothing was stored — please try again.' },
};

function Field({ label, value, copy, href }) {
  return (
    <div className="nrc-field">
      <span className="k">{label}</span>
      <span className="v">
        {href ? <a href={href} target="_blank" rel="noopener noreferrer">{value}</a> : value}
        {copy && <CopyButton text={copy} />}
      </span>
    </div>
  );
}

/**
 * Submit outcome card.
 * @param {object} result   POST /api/report/create body (with nft possibly refreshed by polling)
 * @param {function} onRetry   POST /api/nft/retry/:reportId
 * @param {function} onCheck   re-poll GET /api/report/:id/nft
 */
export default function NftRewardCard({ result, onRetry, onCheck, busy = false, onTryAnother }) {
  const status = result?.nft?.status || result?.status;
  const nft = result?.nft || {};
  const evidence = result?.evidence || {};

  // ── Rejections: no blockchain claims ────────────────────────────────────────
  if (REJECTIONS[status]) {
    const r = REJECTIONS[status];
    return (
      <motion.div className="nrc nrc-reject" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} data-testid="nrc-reject">
        <div className="nrc-head"><XCircle size={20} /> {r.title}</div>
        <p>{r.text}</p>
        {status === 'DUPLICATE' && result.existingReportId && (
          <p className="mono small">Original report: <code>{result.existingReportId}</code></p>
        )}
        {result.error && status !== 'DUPLICATE' && <p className="muted small">{result.error}</p>}
        {onTryAnother && <button className="btn-ghost" onClick={onTryAnother}>Try another photo</button>}
      </motion.div>
    );
  }

  // ── Pending ────────────────────────────────────────────────────────────────
  if (status === 'NFT_MINT_PENDING') {
    return (
      <motion.div className="nrc nrc-pending" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} data-testid="nrc-pending">
        <div className="nrc-head"><Loader2 size={20} className="spin" /> Minting Civic NFT on Ethereum Sepolia…</div>
        <p>Your report <code>{result.reportId}</code> and its evidence are saved. The NFT transaction is being confirmed.</p>
        {nft.transactionHash && (
          <a className="btn-ghost" href={txUrl(nft.transactionHash)} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={13} /> Live transaction {shortHash(nft.transactionHash)}
          </a>
        )}
        {onCheck && <button className="btn-ghost" onClick={onCheck} disabled={busy}>{busy ? <Loader2 size={13} className="spin" /> : <RefreshCw size={13} />} Check again</button>}
      </motion.div>
    );
  }

  // ── Failed ─────────────────────────────────────────────────────────────────
  if (status === 'NFT_MINT_FAILED') {
    return (
      <motion.div className="nrc nrc-failed" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} data-testid="nrc-failed">
        <div className="nrc-head"><AlertTriangle size={20} /> Report saved — NFT mint failed</div>
        <p>Your civic report <code>{result.reportId}</code> and its IPFS evidence are stored. Only the NFT needs another try.</p>
        <p className="muted small">Reason: {nft.errorMessage || humanize(nft.errorCode) || 'Unknown'}</p>
        {onRetry && <button className="btn-primary" onClick={onRetry} disabled={busy}>{busy ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />} Retry mint</button>}
      </motion.div>
    );
  }

  if (status !== 'NFT_MINTED') return null;

  // ── Success ────────────────────────────────────────────────────────────────
  const a = result.analysis || {};
  const imageUrl = evidence.imageUrl || ipfsToGateway(evidence.imageCid ? `ipfs://${evidence.imageCid}` : null);
  const metadataUrl = evidence.metadataUrl || ipfsToGateway(nft.tokenURI);
  const tokenLink = nft.tokenExplorerUrl || nftUrl(nft.contractAddress, nft.tokenId);
  const txLink = nft.explorerUrl || txUrl(nft.transactionHash);

  return (
    <motion.div className="nrc nrc-success" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} data-testid="nrc-success">
      <div className="confetti-layer" aria-hidden>
        {Array.from({ length: 18 }).map((_, i) => (
          <i key={i} style={{ left: `${(i * 5.5 + 4)}%`, background: CONFETTI[i % CONFETTI.length], animationDelay: `${(i % 6) * 0.05}s` }} />
        ))}
      </div>
      <div className="nrc-head"><CheckCircle2 size={20} /> Civic Issue Verified</div>
      <div className="nrc-title"><Gem size={16} /> NFT Reward — Civic Issue {result.reportId}</div>

      <div className="nrc-grid">
        <NftImage src={imageUrl} alt={`Civic Issue NFT ${nft.tokenId}`} className="nrc-img" />
        <div className="nrc-fields">
          <Field label="Token ID" value={`#${nft.tokenId}`} />
          <Field label="Category" value={humanize(a.category)} />
          <Field label="Severity" value={a.severity || '—'} />
          <Field label="AI Confidence" value={`${a.confidence ?? 0}%`} />
          <Field label="Network" value="Ethereum Sepolia" />
          <Field label="Contract" value={shortAddress(nft.contractAddress)} copy={nft.contractAddress} href={addressUrl(nft.contractAddress)} />
          <Field label="Transaction" value={shortHash(nft.transactionHash)} copy={nft.transactionHash} href={txLink} />
          <Field label="Owner" value={shortAddress(nft.recipient)} copy={nft.recipient} />
          <Field label="IPFS Evidence" value={nft.tokenURI ? shortHash(nft.tokenURI, 14, 6) : '—'} copy={nft.tokenURI} href={metadataUrl} />
        </div>
      </div>

      <div className="nrc-actions">
        <a className="btn-ghost" href={txLink} target="_blank" rel="noopener noreferrer"><ExternalLink size={13} /> View on Sepolia Etherscan</a>
        <a className="btn-ghost" href={tokenLink} target="_blank" rel="noopener noreferrer"><ExternalLink size={13} /> View NFT on Etherscan</a>
        {metadataUrl && <a className="btn-ghost" href={metadataUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={13} /> View NFT Metadata</a>}
        {imageUrl && <a className="btn-ghost" href={imageUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={13} /> View Evidence</a>}
      </div>

      <ul className="nrc-checklist">
        <li><ShieldCheck size={13} /> Civic Issue Verified</li>
        <li><CheckCircle2 size={13} /> Evidence Stored on IPFS</li>
        <li><Gem size={13} /> Civic NFT Minted</li>
        <li><CheckCircle2 size={13} /> Contribution Recorded</li>
      </ul>

      <div className="nrc-offchain">
        <span>Also earned (off-chain):</span>
        <span><Star size={12} /> +{result.reputation?.earned ?? 0} reputation</span>
        <span><Coins size={12} /> +{result.points?.earned ?? result.rewards?.earned ?? 0} civic points</span>
        <span>badges</span>
      </div>
      <p className="nft-footnote">Ethereum Sepolia is a test network. This NFT is a testnet asset with no monetary value.</p>
    </motion.div>
  );
}
