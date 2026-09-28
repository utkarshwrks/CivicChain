import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Wallet, Key, Plus, Eye, EyeOff, AlertCircle, CheckCircle2, Copy, Globe, ShieldAlert } from 'lucide-react';
import { useWallet } from '../hooks/useWallet.jsx';
import { hasBrowserWallet } from '../utils/crypto.js';

const PK_RE = /^(0x)?[0-9a-fA-F]{64}$/;

export default function WalletModal({ onClose }) {
  const { connect, loading, error } = useWallet();
  const [mode, setMode] = useState('new'); // 'new' | 'import' | 'browser'
  const [pk, setPk] = useState('');
  const [show, setShow] = useState(false);
  const [done, setDone] = useState(null);
  const [copied, setCopied] = useState(false);
  const browserAvailable = hasBrowserWallet();

  async function handleConnect() {
    try {
      const w = await connect(mode, pk);
      if (mode === 'new') setDone(w);
      else onClose();
    } catch { /* error is shown from context */ }
  }

  function copyPk() {
    navigator.clipboard?.writeText(done.privateKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const importValid = PK_RE.test(pk);

  return (
    <motion.div
      className="modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        className="modal-panel"
        role="dialog"
        aria-label="Connect wallet"
        initial={{ scale: 0.92, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.92, opacity: 0, y: 20 }}
        transition={{ type: 'spring', damping: 20, stiffness: 300 }}
      >
        <div className="modal-header">
          <div className="modal-title">
            <Wallet size={20} />
            <span>Connect Wallet</span>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        {!done ? (
          <>
            <div className="tab-row">
              <button className={`tab ${mode === 'new' ? 'active' : ''}`} onClick={() => setMode('new')}>
                <Plus size={14} /> New Wallet
              </button>
              <button className={`tab ${mode === 'import' ? 'active' : ''}`} onClick={() => setMode('import')}>
                <Key size={14} /> Import Key
              </button>
              {browserAvailable && (
                <button className={`tab ${mode === 'browser' ? 'active' : ''}`} onClick={() => setMode('browser')}>
                  <Globe size={14} /> Browser Wallet
                </button>
              )}
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={mode}
                initial={{ opacity: 0, x: mode === 'new' ? -10 : 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                {mode === 'new' && (
                  <p className="modal-hint">
                    A fresh Ethereum identity wallet (0x address) is generated in your browser. Your private key never leaves your device.
                  </p>
                )}
                {mode === 'import' && (
                  <div className="input-group">
                    <label>Private Key (hex)</label>
                    <div className="input-wrap">
                      <input
                        type={show ? 'text' : 'password'}
                        placeholder="0x… 64-character hex private key"
                        value={pk}
                        onChange={e => setPk(e.target.value.trim())}
                      />
                      <button className="icon-btn small" onClick={() => setShow(v => !v)} aria-label="Toggle key visibility">
                        {show ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>
                )}
                {mode === 'browser' && (
                  <p className="modal-hint">
                    Sign in with MetaMask or another injected wallet. You will be asked to sign a login message — no transaction and no gas.
                  </p>
                )}
              </motion.div>
            </AnimatePresence>

            <div className="alert warn" style={{ marginBottom: '0.9rem' }}>
              <ShieldAlert size={14} />
              <span>This is a CivicChain identity wallet for the Sepolia testnet demo. Never store real funds in it. Citizens do not need ETH.</span>
            </div>

            {error && (
              <div className="alert error">
                <AlertCircle size={14} /> {error}
              </div>
            )}

            <button
              className="btn-primary full"
              onClick={handleConnect}
              disabled={loading || (mode === 'import' && !importValid)}
            >
              {loading ? <span className="spinner" /> : (mode === 'new' ? 'Generate Wallet' : mode === 'import' ? 'Import Wallet' : 'Connect Browser Wallet')}
            </button>
          </>
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="success-icon"><CheckCircle2 size={40} /></div>
            <h3 className="success-title">Wallet Created!</h3>
            <p className="modal-hint" style={{ color: 'var(--warn)' }}>
              ⚠ Save your private key now. It cannot be recovered.
            </p>
            <div className="key-box">
              <span className="key-label">Ethereum Address</span>
              <code>{done.address}</code>
            </div>
            <div className="key-box secret">
              <span className="key-label">Private Key</span>
              <code>{show ? done.privateKey : '•'.repeat(32)}</code>
              <div className="key-actions">
                <button className="icon-btn small" onClick={() => setShow(v => !v)} aria-label="Toggle key visibility">
                  {show ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                <button className="icon-btn small" onClick={copyPk} aria-label="Copy private key">
                  {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                </button>
              </div>
            </div>
            {error && (
              <div className="alert error">
                <AlertCircle size={14} /> Wallet saved, but sign-in failed: {error}
              </div>
            )}
            <button className="btn-primary full" onClick={onClose}>
              Enter CivicChain
            </button>
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  );
}
