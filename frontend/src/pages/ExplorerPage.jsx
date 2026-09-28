import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, Loader2, ExternalLink, Gem, Table2, LayoutGrid, AlertTriangle } from 'lucide-react';
import { api } from '../utils/api.js';
import { CountUp, CopyButton, LiveBadge, Skeleton } from '../components/ui.jsx';
import NftCard from '../components/NftCard.jsx';
import NftDetailModal from '../components/NftDetailModal.jsx';
import { shortAddress, shortHash, humanize, formatDate, txUrl, addressUrl, nftUrl } from '../utils/format.js';

const CATEGORIES = ['ROAD_DAMAGE', 'GARBAGE', 'FLOOD', 'STREETLIGHT', 'WATER_LEAKAGE', 'SEWAGE', 'PUBLIC_SAFETY', 'FIRE', 'OTHER'];
const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const PAGE_SIZE = 12;

export default function ExplorerPage() {
  const [chain, setChain]       = useState(null);
  const [nfts, setNfts]         = useState([]);
  const [total, setTotal]       = useState(0);
  const [pages, setPages]       = useState(0);
  const [page, setPage]         = useState(1);
  const [filters, setFilters]   = useState({ category: '', city: '', severity: '' });
  const [cities, setCities]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView]         = useState('grid');
  const [selected, setSelected] = useState(null);

  const load = useCallback(async (silent = false) => {
    silent ? setRefreshing(true) : setLoading(true);
    try {
      const [c, n] = await Promise.allSettled([
        api.chainStatus(),
        api.nfts({ page, pageSize: PAGE_SIZE, ...filters }),
      ]);
      if (c.status === 'fulfilled') setChain(c.value);
      if (n.status === 'fulfilled') { setNfts(n.value.nfts || []); setTotal(n.value.total || 0); setPages(n.value.pages || 0); }
    } finally { setLoading(false); setRefreshing(false); }
  }, [page, filters]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const id = setInterval(() => load(true), 15_000); return () => clearInterval(id); }, [load]);
  useEffect(() => { api.cities().then((d) => setCities(d.cities || [])).catch(() => {}); }, []);

  const setFilter = (k, v) => { setPage(1); setFilters((f) => ({ ...f, [k]: v })); };

  const strip = [
    { l: 'Network',        v: chain?.network || 'Ethereum Sepolia', mono: true },
    { l: 'Chain ID',       v: chain?.chainId ?? 11155111, mono: true },
    { l: 'Latest block',   v: chain?.latestBlock ?? '—', count: typeof chain?.latestBlock === 'number' },
    { l: 'NFT contract',   v: chain?.contractAddress ? shortAddress(chain.contractAddress) : 'not deployed', href: chain?.contractAddress ? addressUrl(chain.contractAddress) : null, copy: chain?.contractAddress, mono: true },
    { l: 'Contract owner', v: chain?.owner ? shortAddress(chain.owner) : '—', href: chain?.owner ? addressUrl(chain.owner) : null, mono: true },
    { l: 'Minter',         v: chain?.minter ? shortAddress(chain.minter) : '—', href: chain?.minter ? addressUrl(chain.minter) : null, mono: true },
    { l: 'Total NFTs minted', v: chain?.totalMinted ?? total, count: true },
  ];

  return (
    <div className="page">
      <div className="cc-dash-head">
        <div>
          <div className="cc-dash-eyebrow">Ethereum Sepolia · Civic Issue NFTs</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 className="cc-dash-title">Ethereum Sepolia Explorer</h1><LiveBadge />
          </div>
          <p className="cc-dash-sub">Every Civic Issue NFT is a real ERC-721 on Sepolia — verify any token on Etherscan.</p>
        </div>
        <button className="cc-refresh" onClick={() => load(true)} disabled={refreshing}>
          <RefreshCw size={13} className={refreshing ? 'spin' : ''} /> {refreshing ? 'Syncing' : 'Refresh'}
        </button>
      </div>

      {chain && !chain.ready && (
        <div className="alert warn" style={{ marginBottom: '1rem' }}>
          <AlertTriangle size={14} />
          <span>Sepolia minting is not ready yet{chain.issues?.length ? ` — ${chain.issues[0]}` : ''}.</span>
        </div>
      )}

      <div className="net-strip" data-testid="network-strip">
        {strip.map((n, i) => (
          <motion.div key={n.l} className="net-cell" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <span className={`v ${n.mono ? 'mono' : ''}`} style={{ color: n.mono ? 'var(--text)' : 'var(--accent)' }}>
              {loading && !chain ? <Skeleton w={80} h={16} /> : n.href ? <a href={n.href} target="_blank" rel="noopener noreferrer">{n.v}</a> : n.count ? <CountUp value={n.v} /> : n.v}
              {n.copy && <CopyButton text={n.copy} />}
            </span>
            <span className="l">{n.l}</span>
          </motion.div>
        ))}
      </div>

      <div className="explorer-toolbar">
        <div className="seg-tabs" style={{ marginBottom: 0 }}>
          {[['grid', 'Latest Civic NFTs', LayoutGrid], ['table', 'Mint transactions', Table2]].map(([key, label, Ic]) => (
            <button key={key} className={`seg-tab ${view === key ? 'active' : ''}`} onClick={() => setView(key)}>
              {view === key && <span className="seg-tab-bg" />}
              <span><Ic size={13} /> {label}</span>
            </button>
          ))}
        </div>
        <div className="explorer-filters">
          <select className="field-select small" value={filters.category} onChange={(e) => setFilter('category', e.target.value)} aria-label="Category filter">
            <option value="">All categories</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{humanize(c)}</option>)}
          </select>
          <select className="field-select small" value={filters.city} onChange={(e) => setFilter('city', e.target.value)} aria-label="City filter">
            <option value="">All cities</option>
            {cities.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
          <select className="field-select small" value={filters.severity} onChange={(e) => setFilter('severity', e.target.value)} aria-label="Severity filter">
            <option value="">All severities</option>
            {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="nft-grid">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="nft-card skel"><Skeleton w="100%" h={150} r={0} /><div className="nft-card-body"><Skeleton w="60%" /><Skeleton w="80%" style={{ marginTop: 8 }} /></div></div>)}</div>
      ) : nfts.length === 0 ? (
        <div className="empty-state"><Gem size={40} /><p>No Civic Issue NFTs {filters.category || filters.city || filters.severity ? 'match these filters' : 'minted yet'}.</p></div>
      ) : view === 'grid' ? (
        <div className="nft-grid" data-testid="nft-grid">
          {nfts.map((n, i) => <NftCard key={`${n.contractAddress}-${n.tokenId}`} nft={n} index={i} onOpen={setSelected} />)}
        </div>
      ) : (
        <div className="mint-table-wrap">
          <table className="mint-table" data-testid="mint-table">
            <thead><tr><th>Tx hash</th><th>Token</th><th>Recipient</th><th>Block</th><th>Time</th><th /></tr></thead>
            <tbody>
              {nfts.map((n) => (
                <tr key={`${n.contractAddress}-${n.tokenId}`} onClick={() => setSelected(n)}>
                  <td className="mono"><a href={txUrl(n.transactionHash)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>{shortHash(n.transactionHash)}</a></td>
                  <td>#{n.tokenId}</td>
                  <td className="mono"><a href={addressUrl(n.owner)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>{shortAddress(n.owner)}</a></td>
                  <td className="mono">{n.blockNumber ?? '—'}</td>
                  <td>{formatDate(n.mintedAt)}</td>
                  <td><a href={nftUrl(n.contractAddress, n.tokenId)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}><ExternalLink size={12} /> Etherscan</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="pager">
          <button className="btn-ghost small" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Prev</button>
          <span className="mono small">Page {page} / {pages}</span>
          <button className="btn-ghost small" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next →</button>
        </div>
      )}
      {refreshing && <div className="muted small" style={{ marginTop: 8 }}><Loader2 size={11} className="spin" /> syncing…</div>}

      <AnimatePresence>
        {selected && <NftDetailModal nft={selected} onClose={() => setSelected(null)} />}
      </AnimatePresence>
    </div>
  );
}
