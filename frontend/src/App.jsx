import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Info, X } from 'lucide-react';
import { WalletProvider, useWallet } from './hooks/useWallet.jsx';
import Header, { ROLE_TABS } from './components/Header.jsx';
import WalletModal from './components/WalletModal.jsx';
import NftDetailModal from './components/NftDetailModal.jsx';
import ServerSetup from './components/ServerSetup.jsx';
import HomePage from './pages/HomePage.jsx';
import FeedPage from './pages/FeedPage.jsx';
import SubmitPage from './pages/SubmitPage.jsx';
import AnalyticsPage from './pages/AnalyticsPage.jsx';
import ExplorerPage from './pages/ExplorerPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import AuthorityPage from './pages/AuthorityPage.jsx';
import MunicipalPage from './pages/MunicipalPage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import { api } from './utils/api.js';
import { getApiBase, isNativeApp } from './utils/platform.js';

const PAGE_MAP = {
  Home: HomePage,
  Feed: FeedPage,
  Submit: SubmitPage,
  Analytics: AnalyticsPage,
  Explorer: ExplorerPage,
  Profile: ProfilePage,
  Authority: AuthorityPage,
  Municipal: MunicipalPage,
  Admin: AdminPage,
};

/** ?report=<id> deep link (the NFT metadata external_url) → token id to show. */
function useReportDeepLink() {
  const [tokenId, setTokenId] = useState(null);
  useEffect(() => {
    let id = null;
    try { id = new URLSearchParams(window.location.search).get('report'); } catch { id = null; }
    if (!id || !/^[A-Za-z0-9_-]{1,80}$/.test(id)) return;
    api.reportNft(id).then((d) => { if (d?.nft?.tokenId) setTokenId(d.nft.tokenId); }).catch(() => {});
  }, []);
  return [tokenId, () => {
    setTokenId(null);
    try { window.history.replaceState({}, '', window.location.pathname); } catch { /* ignore */ }
  }];
}

function AppInner() {
  const [tab, setTab] = useState('Home');
  const [walletModal, setWalletModal] = useState(false);
  const [needsServer, setNeedsServer] = useState(() => isNativeApp() && !getApiBase());
  const { role, upgradeNotice, dismissUpgradeNotice } = useWallet();
  const [deepToken, closeDeep] = useReportDeepLink();

  // Reset to Home if the current tab is no longer in the role's allowed tabs
  useEffect(() => {
    if (role && ROLE_TABS[role] && !ROLE_TABS[role].includes(tab)) setTab('Home');
  }, [role]); // eslint-disable-line react-hooks/exhaustive-deps

  if (needsServer) return <ServerSetup onDone={() => { setNeedsServer(false); window.location.reload(); }} />;

  const Page = PAGE_MAP[tab] || HomePage;
  const isFull = tab === 'Home';

  return (
    <div className="app">
      <div className="bg-grid" aria-hidden />
      <div className="bg-glow" aria-hidden />

      <Header tab={tab} setTab={setTab} />

      <AnimatePresence>
        {upgradeNotice && (
          <motion.div className="upgrade-toast" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} role="status">
            <Info size={14} /><span>{upgradeNotice}</span>
            <button className="icon-btn small" onClick={dismissUpgradeNotice} aria-label="Dismiss"><X size={13} /></button>
          </motion.div>
        )}
      </AnimatePresence>

      <main className={isFull ? 'main-full' : 'main'}>
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            style={{ width: '100%' }}
          >
            <Page setTab={setTab} onConnect={() => setWalletModal(true)} />
          </motion.div>
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {walletModal && <WalletModal onClose={() => setWalletModal(false)} />}
        {deepToken && <NftDetailModal tokenId={deepToken} onClose={closeDeep} />}
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  return (
    <WalletProvider>
      <AppInner />
    </WalletProvider>
  );
}
