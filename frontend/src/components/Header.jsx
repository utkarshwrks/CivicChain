import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Wallet, LogOut, ChevronDown, Copy, CheckCircle2, ShieldCheck, Hammer, Crown,
  ExternalLink, Gem, Star, Download, Menu, X,
} from 'lucide-react';
import { useWallet } from '../hooks/useWallet.jsx';
import WalletModal from './WalletModal.jsx';
import { shortAddress, addressUrl } from '../utils/format.js';
import { APK_URL, isNativeApp } from '../utils/platform.js';

// Tabs per role
export const ROLE_TABS = {
  CITIZEN:        ['Home', 'Feed', 'Submit', 'Analytics', 'Explorer', 'Profile'],
  AUTHORITY:      ['Home', 'Feed', 'Authority', 'Analytics', 'Explorer', 'Profile'],
  MUNICIPAL_TEAM: ['Home', 'Feed', 'Municipal', 'Analytics', 'Explorer', 'Profile'],
  ADMIN:          ['Home', 'Feed', 'Submit', 'Analytics', 'Explorer', 'Profile', 'Authority', 'Municipal', 'Admin'],
};
export const DEFAULT_TABS = ['Home', 'Feed', 'Submit', 'Analytics', 'Explorer', 'Profile'];

const ROLE_META = {
  CITIZEN:        { label: 'Citizen',    cls: 'citizen',   icon: null },
  AUTHORITY:      { label: 'Authority',  cls: 'authority', icon: ShieldCheck },
  MUNICIPAL_TEAM: { label: 'Municipal',  cls: 'municipal', icon: Hammer },
  ADMIN:          { label: 'Admin',      cls: 'admin',     icon: Crown },
};

export function DownloadApkButton({ className = '', compact = false }) {
  if (isNativeApp()) return null;
  return (
    <a className={`btn-apk ${className}`} href={APK_URL} download="CivicChain.apk" title="Download the CivicChain Android app (APK)">
      <Download size={14} strokeWidth={2.6} />
      <span>{compact ? 'APK' : 'Download APK'}</span>
    </a>
  );
}

export default function Header({ tab, setTab }) {
  const { wallet, reputation, nftCount, role, disconnect } = useWallet();
  const [showModal, setShowModal] = useState(false);
  const [showMenu,  setShowMenu]  = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [copied,    setCopied]    = useState(false);

  const tabs     = role ? (ROLE_TABS[role] || DEFAULT_TABS) : DEFAULT_TABS;
  const roleMeta = role ? ROLE_META[role] : null;
  const RoleIcon = roleMeta?.icon;

  function copyAddr() {
    navigator.clipboard?.writeText(wallet.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function handleTabChange(t) {
    setTab(t);
    setShowMenu(false);
    setMobileNav(false);
  }

  return (
    <>
      <header className="header">
        <div className="header-inner">
          {/* Logo */}
          <button className="logo" onClick={() => handleTabChange('Home')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>
            <span className="logo-diamond"><span /></span>
            <span>Civic<span className="brand-2">Chain</span></span>
          </button>

          {/* Role-based Tabs */}
          <nav className={`nav-tabs ${mobileNav ? 'open' : ''}`}>
            {tabs.map(t => (
              <button
                key={t}
                className={`nav-tab ${tab === t ? 'active' : ''}`}
                onClick={() => handleTabChange(t)}
              >
                {t}
                {tab === t && (
                  <motion.div className="tab-underline" layoutId="underline" />
                )}
              </button>
            ))}
          </nav>

          <div className="header-actions">
            <DownloadApkButton className="header-apk" />

            {/* Wallet + Role */}
            {wallet ? (
              <div className="wallet-chip-wrap">
                <button className="wallet-chip" onClick={() => setShowMenu(v => !v)} aria-label="Wallet menu">
                  <span className="wallet-dot" />
                  <span className="mono">{shortAddress(wallet.address)}</span>
                  {roleMeta && (
                    <span className={`role-badge ${roleMeta.cls}`}>
                      {RoleIcon && <RoleIcon size={9} />}
                      {roleMeta.label}
                    </span>
                  )}
                  <span className="chip-stat" title="Reputation"><Star size={10} />{reputation}</span>
                  <span className="chip-stat nft" title="Civic Issue NFTs"><Gem size={10} />{nftCount}</span>
                  <ChevronDown size={12} />
                </button>
                <AnimatePresence>
                  {showMenu && (
                    <motion.div
                      className="wallet-menu"
                      initial={{ opacity: 0, y: -8, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.95 }}
                      transition={{ duration: 0.12 }}
                    >
                      <div className="wallet-menu-addr">
                        <code>{wallet.address}</code>
                      </div>
                      {roleMeta && (
                        <div className="wallet-menu-role">
                          <span className={`role-badge ${roleMeta.cls}`} style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem' }}>
                            {RoleIcon && <RoleIcon size={11} />}
                            {roleMeta.label}
                          </span>
                        </div>
                      )}
                      <div className="wallet-menu-stats">
                        <span>Reputation <b>{reputation}</b></span>
                        <span>Civic NFTs <b>{nftCount}</b></span>
                      </div>
                      <button className="wallet-menu-item" onClick={copyAddr}>
                        {copied ? <CheckCircle2 size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy address'}
                      </button>
                      <a className="wallet-menu-item" href={addressUrl(wallet.address)} target="_blank" rel="noopener noreferrer">
                        <ExternalLink size={13} /> View on Etherscan
                      </a>
                      <button className="wallet-menu-item danger" onClick={() => { setShowMenu(false); disconnect(); }}>
                        <LogOut size={13} /> Disconnect
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <button className="btn-connect" onClick={() => setShowModal(true)}>
                <Wallet size={14} /> Connect Wallet
              </button>
            )}

            <button className="icon-btn nav-burger" onClick={() => setMobileNav(v => !v)} aria-label="Toggle navigation">
              {mobileNav ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {showModal && <WalletModal onClose={() => setShowModal(false)} />}
      </AnimatePresence>
    </>
  );
}
