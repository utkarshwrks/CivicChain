import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User, Star, Trophy, FileText, TrendingUp, Shield, Zap, Gem, Layers, CheckCircle2, ExternalLink,
  Loader2, RefreshCw, AlertTriangle, Send,
} from 'lucide-react';
import { useWallet } from '../hooks/useWallet.jsx';
import { api } from '../utils/api.js';
import NftCard from '../components/NftCard.jsx';
import NftDetailModal from '../components/NftDetailModal.jsx';
import NftStatusBadge from '../components/NftStatusBadge.jsx';
import { Skeleton, CopyButton } from '../components/ui.jsx';
import { addressUrl, humanize, formatDate, shortAddress } from '../utils/format.js';

const BADGES = [
  { id: 'first_report', icon: <FileText size={16} />,   label: 'First Report',    test: (s) => s.reports >= 1 },
  { id: 'reporter_5',   icon: <TrendingUp size={16} />, label: '5 Reports',       test: (s) => s.reports >= 5 },
  { id: 'trusted',      icon: <Shield size={16} />,     label: 'Trusted',         test: (s) => s.rep >= 50 },
  { id: 'power_user',   icon: <Zap size={16} />,        label: 'Power User',      test: (s) => s.reports >= 10 },
  { id: 'elite',        icon: <Star size={16} />,       label: 'Elite Reporter',  test: (s) => s.rep >= 100 },
  { id: 'champion',     icon: <Trophy size={16} />,     label: 'Champion',        test: (s) => s.rep >= 200 },
  { id: 'first_nft',    icon: <Gem size={16} />,        label: 'First Civic NFT', test: (s) => s.nfts >= 1, nft: true },
  { id: 'collector',    icon: <Layers size={16} />,     label: 'Civic Collector', test: (s) => s.nfts >= 5, nft: true },
];

function trustLevel(rep) {
  if (rep >= 200) return { label: 'Champion', color: '#f59e0b' };
  if (rep >= 100) return { label: 'Elite',    color: '#a855f7' };
  if (rep >= 50)  return { label: 'Trusted',  color: '#3b82f6' };
  if (rep >= 10)  return { label: 'Rising',   color: '#22c55e' };
  return            { label: 'Newcomer', color: '#6b7280' };
}

function PendingCard({ item, onRetry }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  async function retry() {
    setBusy(true); setMsg(null);
    try { await onRetry(item.reportId); } catch (e) { setMsg(e.message); } finally { setBusy(false); }
  }
  return (
    <div className="nft-card pending-card" data-testid="pending-card">
      <div className="nft-card-body">
        <div className="nft-card-top">
          <span className="nft-token">{item.reportId}</span>
          <NftStatusBadge status={item.nft?.status} />
        </div>
        <div className="nft-card-cat">{humanize(item.category)} <span className="nft-sev">· {item.severity}</span></div>
        <div className="nft-card-meta"><span>{item.cityName || item.city}</span><span>{formatDate(item.createdAt)}</span></div>
        {item.nft?.status === 'NFT_MINT_FAILED' && (
          <>
            <p className="muted small">{item.nft.errorMessage || humanize(item.nft.errorCode)}</p>
            <button className="btn-ghost small" onClick={retry} disabled={busy}>
              {busy ? <Loader2 size={12} className="spin" /> : <RefreshCw size={12} />} Retry mint
            </button>
          </>
        )}
        {msg && <p className="small" style={{ color: 'var(--danger)' }}>{msg}</p>}
      </div>
    </div>
  );
}

export default function ProfilePage({ onConnect, setTab }) {
  const { wallet, reputation, rewards, refresh } = useWallet();
  const [myReports, setMyReports]     = useState([]);
  const [collection, setCollection]   = useState({ nfts: [], pending: [] });
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [selected, setSelected]       = useState(null);

  const load = useCallback(async () => {
    if (!wallet) return;
    const [r, c, l] = await Promise.allSettled([
      api.reports({ reporter: wallet.address, pageSize: 200 }),
      api.nftsByOwner(wallet.address),
      api.leaderboard(),
    ]);
    if (r.status === 'fulfilled') setMyReports(r.value.reports || []);
    if (c.status === 'fulfilled') setCollection({ nfts: c.value.nfts || [], pending: c.value.pending || [] });
    if (l.status === 'fulfilled') setLeaderboard(l.value.leaderboard || []);
    setLoading(false);
  }, [wallet]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  async function retry(reportId) {
    await api.retryMint(reportId);
    await load();
    refresh?.(wallet.address);
  }

  if (!wallet) return (
    <div className="page center-page">
      <motion.div className="connect-prompt" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <User size={48} />
        <h2>Connect your wallet</h2>
        <p>View your reputation, badges and your Civic NFT collection.</p>
        <button className="btn-primary" onClick={onConnect}>Connect Wallet</button>
      </motion.div>
    </div>
  );

  const trust = trustLevel(reputation);
  const resolved = myReports.filter((r) => r.status === 'RESOLVED').length;
  const stats = { reports: myReports.length, rep: reputation, nfts: collection.nfts.length };

  return (
    <div className="page">
      <motion.div className="profile-card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="profile-avatar"><User size={32} /></div>
        <div className="profile-info">
          <code className="profile-addr">{wallet.address} <CopyButton text={wallet.address} /></code>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="trust-badge" style={{ color: trust.color, borderColor: trust.color + '44', background: trust.color + '11' }}>{trust.label}</span>
            <a className="small" href={addressUrl(wallet.address)} target="_blank" rel="noopener noreferrer"><ExternalLink size={11} /> View on Etherscan</a>
          </div>
        </div>
      </motion.div>

      <div className="profile-stats">
        {[
          { icon: <Star size={18} />,         label: 'Civic Reputation',  val: reputation },
          { icon: <Gem size={18} />,          label: 'Civic NFTs',        val: collection.nfts.length },
          { icon: <FileText size={18} />,     label: 'Reports Submitted', val: myReports.length },
          { icon: <CheckCircle2 size={18} />, label: 'Reports Resolved',  val: resolved },
        ].map(({ icon, label, val }, i) => (
          <motion.div key={label} className="profile-stat" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.07 }}>
            {icon}
            <span className="ps-val">{loading ? <Skeleton w={30} h={20} /> : val}</span>
            <span className="ps-label">{label}</span>
          </motion.div>
        ))}
      </div>
      <p className="muted small" style={{ marginTop: -8, marginBottom: 18 }}>Civic points (off-chain): <b>{rewards}</b></p>

      <div className="section">
        <h3><Gem size={16} style={{ verticalAlign: '-2px', marginRight: 6, color: 'var(--accent)' }} />Civic NFT Collection</h3>
        {loading ? (
          <div className="nft-grid">{[0, 1, 2].map((i) => <div key={i} className="nft-card skel"><Skeleton w="100%" h={150} r={0} /></div>)}</div>
        ) : collection.nfts.length === 0 && collection.pending.length === 0 ? (
          <div className="empty-state" data-testid="collection-empty">
            <Gem size={36} />
            <p>No Civic Issue NFTs yet. Report a civic issue to earn your first one.</p>
            {setTab && <button className="btn-primary" onClick={() => setTab('Submit')}><Send size={14} /> Submit a report</button>}
          </div>
        ) : (
          <div className="nft-grid" data-testid="collection-grid">
            {collection.pending.map((p) => <PendingCard key={p.reportId} item={p} onRetry={retry} />)}
            {collection.nfts.map((n, i) => <NftCard key={`${n.contractAddress}-${n.tokenId}`} nft={n} index={i} onOpen={setSelected} />)}
          </div>
        )}
      </div>

      <div className="section">
        <h3>Badges</h3>
        <div className="badge-grid">
          {BADGES.map((b) => {
            const unlocked = b.test(stats);
            return (
              <motion.div key={b.id} className={`badge-item ${unlocked ? 'unlocked' : 'locked'} ${b.nft ? 'nft' : ''}`} whileHover={{ scale: 1.05 }}>
                {b.icon}<span>{b.label}</span>
              </motion.div>
            );
          })}
        </div>
      </div>

      <div className="section">
        <h3>Leaderboard</h3>
        <div className="leaderboard">
          {leaderboard.slice(0, 10).map((entry, i) => (
            <div key={entry.address} className={`lb-row ${entry.address?.toLowerCase() === wallet.address.toLowerCase() ? 'mine' : ''}`}>
              <span className="lb-rank">#{i + 1}</span>
              <code className="lb-addr">{shortAddress(entry.address, 8, 4)}</code>
              <span className="lb-nft" title="Civic NFTs"><Gem size={11} /> {entry.nftCount ?? 0}</span>
              <span className="lb-score">{entry.score}</span>
            </div>
          ))}
          {leaderboard.length === 0 && <p className="muted">No data yet.</p>}
        </div>
      </div>

      {collection.pending.some((p) => p.nft?.status === 'NFT_MINT_FAILED') && (
        <p className="muted small"><AlertTriangle size={11} /> Failed mints keep your report and evidence — only the NFT is retried.</p>
      )}

      <AnimatePresence>
        {selected && <NftDetailModal nft={selected} onClose={() => setSelected(null)} />}
      </AnimatePresence>
    </div>
  );
}
