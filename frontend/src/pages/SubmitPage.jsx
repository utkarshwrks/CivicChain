import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send, Cpu, CheckCircle2, AlertCircle, Loader2, UploadCloud, X, ShieldCheck, MapPin, Building2,
  Sparkles, Copy as CopyIcon, FileJson, Gem, BadgeCheck, Trophy, Image as ImageIcon, MinusCircle, ExternalLink,
} from 'lucide-react';
import { api } from '../utils/api.js';
import { useWallet } from '../hooks/useWallet.jsx';
import NftRewardCard from '../components/NftRewardCard.jsx';
import { txUrl } from '../utils/format.js';

export const STEPS = [
  { key: 'AI_ANALYSIS',           label: 'AI Analysis',               desc: 'Gemini Vision classification', icon: Cpu },
  { key: 'FRAUD_CHECK',           label: 'Fraud Check',               desc: 'Fraud scoring rules',          icon: ShieldCheck },
  { key: 'DUPLICATE_CHECK',       label: 'Duplicate Check',           desc: 'SHA-256 image fingerprint',    icon: CopyIcon },
  { key: 'IPFS_IMAGE',            label: 'IPFS Evidence',             desc: 'Pinning the photo to IPFS',    icon: ImageIcon },
  { key: 'NFT_METADATA',          label: 'NFT Metadata',              desc: 'Pinning metadata JSON',        icon: FileJson },
  { key: 'NFT_MINT',              label: 'Mint Civic NFT on Sepolia', desc: 'Backend minter pays the gas',  icon: Gem },
  { key: 'NFT_CONFIRMED',         label: 'NFT Confirmed',             desc: 'Receipt + token ID',           icon: BadgeCheck },
  { key: 'CONTRIBUTION_RECORDED', label: 'Contribution Recorded',     desc: 'Reputation + civic points',    icon: Trophy },
];

const POLL_MS = 4000;
const POLL_MAX_MS = 3 * 60_000;
const REJECTED = ['NOT_CIVIC_ISSUE', 'FRAUD_BLOCKED', 'DUPLICATE', 'AI_FAILED', 'IPFS_FAILED'];

/** Merge polled nft status into the server pipeline stages. */
export function stagesWithNft(stages, nftStatus) {
  if (!stages) return null;
  if (nftStatus !== 'NFT_MINTED') return stages;
  return stages.map((s) => (s.stage === 'NFT_MINT' || s.stage === 'NFT_CONFIRMED' ? { ...s, status: 'done' } : s));
}

function Pipeline({ stages, activeIndex, loading, txHash }) {
  const byKey = Object.fromEntries((stages || []).map((s) => [s.stage, s]));
  return (
    <div className="pipe" data-testid="pipeline">
      {STEPS.map((s, i) => {
        const server = byKey[s.key];
        const st = server?.status || (loading && i === activeIndex ? 'active' : 'idle');
        const Icon = s.icon;
        const cls = st === 'done' ? 'done' : st === 'failed' ? 'failed' : st === 'active' || st === 'pending' ? 'active' : st === 'skipped' ? 'skipped' : '';
        return (
          <div key={s.key} className={`pipe-step ${cls}`} data-stage={s.key} data-status={st}>
            <div className="pipe-rail">
              <motion.div className="pipe-node" animate={cls === 'active' ? { scale: [1, 1.12, 1] } : { scale: 1 }} transition={{ repeat: cls === 'active' ? Infinity : 0, duration: 1.1 }}>
                {st === 'done' ? <CheckCircle2 size={16} />
                  : st === 'failed' ? <X size={15} />
                  : st === 'skipped' ? <MinusCircle size={14} />
                  : cls === 'active' ? <Loader2 size={15} className="spin" /> : <Icon size={15} />}
              </motion.div>
              {i < STEPS.length - 1 && <span className="pipe-line" />}
            </div>
            <div className="pipe-info">
              <div className="t">{s.label}</div>
              <div className="d">
                {s.key === 'NFT_MINT' && cls === 'active' ? 'Minting Civic NFT on Ethereum Sepolia…' : server?.detail && st === 'failed' ? server.detail : s.desc}
              </div>
              {s.key === 'NFT_MINT' && txHash && (
                <a className="pipe-link" href={txUrl(txHash)} target="_blank" rel="noopener noreferrer"><ExternalLink size={11} /> Live on Etherscan</a>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function SubmitPage({ onConnect }) {
  const [file, setFile]         = useState(null);
  const [preview, setPreview]   = useState(null);
  const [landmark, setLandmark] = useState('');
  const [city, setCity]         = useState('');
  const [cities, setCities]     = useState([]);
  const [status, setStatus]     = useState(null);   // null | loading | done | error
  const [active, setActive]     = useState(0);
  const [result, setResult]     = useState(null);
  const [errMsg, setErrMsg]     = useState('');
  const [drag, setDrag]         = useState(false);
  const [busy, setBusy]         = useState(false);
  const [pollExpired, setPollExpired] = useState(false);
  const fileRef = useRef(null);
  const pollRef = useRef(null);
  const { wallet, isAuthenticated, refresh } = useWallet();

  useEffect(() => { api.cities().then((d) => setCities(d.cities || [])).catch(() => {}); }, []);
  useEffect(() => () => { if (pollRef.current) clearTimeout(pollRef.current); if (preview) URL.revokeObjectURL(preview); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function setImage(f) {
    if (!f) return;
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { setErrMsg('Please choose a JPEG, PNG or WebP image.'); setStatus('error'); return; }
    if (preview) URL.revokeObjectURL(preview);
    setFile(f); setPreview(URL.createObjectURL(f)); setStatus(null); setResult(null); setErrMsg('');
  }
  function clearFile() {
    if (pollRef.current) clearTimeout(pollRef.current);
    if (preview) URL.revokeObjectURL(preview);
    setFile(null); setPreview(null); setStatus(null); setResult(null); setErrMsg('');
    if (fileRef.current) fileRef.current.value = '';
  }

  const applyNft = useCallback((nft) => {
    setResult((r) => (r ? { ...r, nft, status: nft?.status || r.status, pipeline: stagesWithNft(r.pipeline, nft?.status) } : r));
  }, []);

  const poll = useCallback((reportId, startedAt = Date.now()) => {
    if (pollRef.current) clearTimeout(pollRef.current);
    setPollExpired(false);
    pollRef.current = setTimeout(async () => {
      try {
        const d = await api.reportNft(reportId);
        applyNft(d.nft);
        if (d.nft?.status === 'NFT_MINTED') { refresh?.(wallet?.address); return; }
        if (d.nft?.status === 'NFT_MINT_FAILED') return;
      } catch { /* keep polling */ }
      if (Date.now() - startedAt < POLL_MAX_MS) poll(reportId, startedAt);
      else setPollExpired(true);
    }, POLL_MS);
  }, [applyNft, refresh, wallet]);

  async function submit() {
    if (!file) return;
    if (!city) { setErrMsg('Please select a city.'); setStatus('error'); return; }
    if (!wallet || !isAuthenticated) { setErrMsg('Connect and sign in with your wallet to submit a report.'); setStatus('error'); return; }

    setStatus('loading'); setErrMsg(''); setResult(null); setActive(0);
    // Progress indicator only — ticks come from the server pipeline.
    const timer = setInterval(() => setActive((s) => Math.min(s + 1, 5)), 2200);
    try {
      const body = await api.submitReport(file, city, landmark);
      clearInterval(timer);
      setResult(body);
      setStatus('done');
      if (body.status === 'NFT_MINT_PENDING' && body.reportId) poll(body.reportId);
      if (!REJECTED.includes(body.status)) refresh?.(wallet.address);
      if (!body.status) { setStatus('error'); setErrMsg(body.error || 'Submission failed — please try again.'); }
    } catch (e) {
      clearInterval(timer);
      setStatus('error');
      setErrMsg(e.message || 'Submission failed — please try again.');
    }
  }

  async function retryMint() {
    if (!result?.reportId) return;
    setBusy(true);
    try {
      const r = await api.retryMint(result.reportId);
      applyNft(r.nft);
      if (r.nft?.status === 'NFT_MINT_PENDING') poll(result.reportId);
      if (r.nft?.status === 'NFT_MINTED') refresh?.(wallet?.address);
    } catch (e) {
      setErrMsg(e.message);
    } finally { setBusy(false); }
  }

  async function checkAgain() {
    if (!result?.reportId) return;
    setBusy(true);
    try {
      const d = await api.reportNft(result.reportId);
      applyNft(d.nft);
      if (d.nft?.status === 'NFT_MINT_PENDING') poll(result.reportId);
    } catch (e) { setErrMsg(e.message); } finally { setBusy(false); }
  }

  const canSubmit = file && city && status !== 'loading';
  const loading = status === 'loading';

  return (
    <div className="page">
      <div className="cc-dash-head">
        <div>
          <div className="cc-dash-eyebrow">Proof of report</div>
          <h1 className="cc-dash-title">Submit a Civic Report</h1>
          <p className="cc-dash-sub">One photo. Eight verifiable steps. One Civic Issue NFT on Ethereum Sepolia.</p>
        </div>
      </div>

      <div className="submit-wrap">
        <motion.div className="submit-main" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
          {!wallet && (
            <div className="alert warn" style={{ marginBottom: '1rem' }}>
              <AlertCircle size={14} />
              <span>Connect a wallet to submit — your Civic Issue NFT is minted to it. No ETH needed.</span>
              {onConnect && <button className="btn-ghost small" onClick={onConnect} style={{ marginLeft: 'auto' }}>Connect</button>}
            </div>
          )}

          <div className="field">
            <label>Civic Issue Image</label>
            <AnimatePresence mode="wait">
              {!preview ? (
                <motion.div
                  key="dz"
                  className={`dropzone ${drag ? 'drag' : ''}`}
                  onClick={() => fileRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                  onDragLeave={() => setDrag(false)}
                  onDrop={(e) => { e.preventDefault(); setDrag(false); setImage(e.dataTransfer.files?.[0]); }}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                >
                  <div className="dz-icon"><UploadCloud size={26} /></div>
                  <span className="dz-main">{drag ? 'Drop it!' : 'Drag & drop, click, or take a photo'}</span>
                  <span className="dz-hint">JPEG · PNG · WebP — max 10 MB</span>
                </motion.div>
              ) : (
                <motion.div key="pv" className="preview-frame" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                  <img src={preview} alt="Preview" />
                  {loading && (
                    <motion.div className="scan-line" initial={{ top: '0%' }} animate={{ top: ['0%', '100%', '0%'] }} transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }} />
                  )}
                  {!loading && <button className="preview-x" onClick={clearFile} aria-label="Remove image"><X size={15} /></button>}
                </motion.div>
              )}
            </AnimatePresence>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setImage(e.target.files?.[0])} style={{ display: 'none' }} data-testid="file-input" />
          </div>

          <div className="field">
            <label><Building2 size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />City <span className="field-required">*</span></label>
            <select className="field-select" value={city} onChange={(e) => { setCity(e.target.value); if (status === 'error') { setStatus(null); setErrMsg(''); } }} disabled={loading}>
              <option value="">Select city…</option>
              {cities.map((c) => <option key={c.code} value={c.code}>{c.name}, {c.state}</option>)}
            </select>
          </div>

          <div className="field">
            <label><MapPin size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />Address / Landmark <span className="field-optional">(optional, never put in the NFT)</span></label>
            <input type="text" className="field-input" placeholder="e.g. MP Nagar Zone 2, Near DB Mall" maxLength={200} value={landmark} onChange={(e) => setLandmark(e.target.value)} disabled={loading} />
            <span className="field-hint">{landmark.length}/200</span>
          </div>

          <AnimatePresence>
            {status === 'error' && (
              <motion.div className="alert error" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <AlertCircle size={14} />&nbsp;{errMsg || 'Submission failed — please try again.'}
              </motion.div>
            )}
          </AnimatePresence>

          {status === 'done' && result && (
            <NftRewardCard result={result} onRetry={retryMint} onCheck={checkAgain} busy={busy} onTryAnother={clearFile} />
          )}
          {pollExpired && result?.nft?.status === 'NFT_MINT_PENDING' && (
            <p className="muted small" style={{ marginTop: 8 }}>Still confirming — Sepolia can be slow. Use “Check again” in a moment; the report is safe.</p>
          )}

          <button className="btn-primary full" onClick={submit} disabled={!canSubmit} style={{ marginTop: '1rem' }}>
            {loading ? <><Loader2 size={14} className="spin" /> Processing…</> : <><Send size={14} /> Submit Report</>}
          </button>
        </motion.div>

        <motion.aside className="submit-aside" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
          <div className="aside-title">
            {loading ? '⚡ Processing pipeline' : result?.nft?.status === 'NFT_MINTED' ? '✓ Pipeline complete' : '◇ The processing pipeline'}
          </div>
          <Pipeline stages={result?.pipeline} activeIndex={active} loading={loading} txHash={result?.nft?.transactionHash} />
          <div style={{ marginTop: '1.5rem', padding: '0.85rem 1rem', borderRadius: 12, background: 'rgba(255,154,58,.05)', border: '1px solid rgba(255,154,58,.18)', display: 'flex', gap: 10 }}>
            <Sparkles size={16} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 2 }} />
            <p style={{ fontSize: '0.78rem', color: '#cfd2d8', lineHeight: 1.5 }}>
              Citizens report. AI verifies. IPFS preserves. Ethereum records. Rejected photos never reach the blockchain — and you never pay gas.
            </p>
          </div>
        </motion.aside>
      </div>
    </div>
  );
}
