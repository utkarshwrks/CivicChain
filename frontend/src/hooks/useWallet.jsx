import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  generateWallet, importWallet, signAuthMessage, upgradeLegacyWallet,
  connectBrowserWallet, signWithBrowserWallet,
} from '../utils/crypto.js';
import { getAddress } from 'ethers';
import { api, setAuthToken, clearAuthToken } from '../utils/api.js';

const WalletCtx = createContext(null);

export const STORAGE_KEY        = 'cp_wallet_v3';
export const TOKEN_KEY          = 'cp_token_v3';
const LEGACY_STORAGE_KEY        = 'cp_wallet_v2';
const LEGACY_TOKEN_KEY          = 'cp_token_v1';

function safeGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* storage unavailable */ }
}
function safeRemove(key) {
  try { localStorage.removeItem(key); } catch { /* storage unavailable */ }
}

/**
 * Load the saved wallet. Upgrades a cp_wallet_v2 (legacy 40-char address)
 * wallet once: the same private key now yields a standard 0x address.
 * Returns { wallet, upgraded }.
 */
export function loadStoredWallet() {
  const saved = safeGet(STORAGE_KEY);
  if (saved) {
    try {
      const w = JSON.parse(saved);
      if (w?.type === 'browser' && w?.address) return { wallet: { address: getAddress(w.address), type: 'browser' }, upgraded: false };
      if (w?.privateKey && w?.address) return { wallet: importWallet(w.privateKey), upgraded: false };
    } catch { /* fall through */ }
    safeRemove(STORAGE_KEY);
  }
  const legacyRaw = safeGet(LEGACY_STORAGE_KEY);
  if (legacyRaw) {
    let upgradedWallet = null;
    try { upgradedWallet = upgradeLegacyWallet(JSON.parse(legacyRaw)); } catch { upgradedWallet = null; }
    safeRemove(LEGACY_STORAGE_KEY);
    safeRemove(LEGACY_TOKEN_KEY);
    if (upgradedWallet) {
      safeSet(STORAGE_KEY, JSON.stringify(upgradedWallet));
      return { wallet: upgradedWallet, upgraded: true };
    }
  }
  return { wallet: null, upgraded: false };
}

export function WalletProvider({ children }) {
  const [wallet,          setWallet]          = useState(null);
  const [reputation,      setReputation]      = useState(0);
  const [rewards,         setRewards]         = useState(0);
  const [nftCount,        setNftCount]        = useState(0);
  const [role,            setRole]            = useState(null);
  const [department,      setDepartment]      = useState(null);
  const [city,            setCity]            = useState(null);
  const [token,           setToken]           = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading,         setLoading]         = useState(false);
  const [authLoading,     setAuthLoading]     = useState(false);
  const [error,           setError]           = useState(null);
  const [upgradeNotice,   setUpgradeNotice]   = useState(null);

  // ── Reload off-chain profile data + NFT count ──────────────────────────────
  const refresh = useCallback(async (addr) => {
    if (!addr) return;
    const [r, rw, n] = await Promise.allSettled([
      api.profileReputation(addr),
      api.profilePoints(addr),
      api.profileNfts(addr),
    ]);
    if (r.status  === 'fulfilled') setReputation(r.value.score ?? 0);
    if (rw.status === 'fulfilled') setRewards(rw.value.points ?? 0);
    if (n.status  === 'fulfilled') setNftCount(n.value.nftCount ?? n.value.total ?? 0);
  }, []);

  const loadJurisdiction = useCallback(async () => {
    try {
      const me = await api.myDepartment();
      setDepartment(me.department || null);
      setCity(me.city || null);
    } catch { /* no jurisdiction assigned yet */ }
  }, []);

  // ── Full auth flow: nonce → EIP-191 sign → login ──────────────────────────
  const authFlow = useCallback(async (w) => {
    if (!w?.address || (!w.privateKey && w.type !== 'browser')) return null;
    setAuthLoading(true);
    try {
      const { nonce } = await api.authNonce(w.address);
      const signature = w.type === 'browser'
        ? await signWithBrowserWallet(w.address, nonce)
        : await signAuthMessage(w.privateKey, w.address, nonce);
      const result    = await api.authLogin({ address: w.address, nonce, signature });

      safeSet(TOKEN_KEY, result.token);
      setAuthToken(result.token);
      setToken(result.token);
      setRole(result.role);
      setIsAuthenticated(true);
      await loadJurisdiction();
      return result;
    } catch (e) {
      console.error('[useWallet] authFlow failed:', e.message);
      setError(e.message);
      return null;
    } finally {
      setAuthLoading(false);
    }
  }, [loadJurisdiction]);

  // ── Validate an existing token with /api/auth/me, else sign in again ───────
  const validateToken = useCallback(async (savedToken, w) => {
    if (savedToken) {
      setAuthToken(savedToken);
      try {
        const me = await api.authMe();
        if (w && me.address?.toLowerCase() !== w.address.toLowerCase()) throw new Error('token/wallet mismatch');
        setToken(savedToken);
        setRole(me.role);
        setIsAuthenticated(true);
        await loadJurisdiction();
        return true;
      } catch {
        safeRemove(TOKEN_KEY);
        clearAuthToken();
      }
    }
    if (w) return !!(await authFlow(w));
    return false;
  }, [authFlow, loadJurisdiction]);

  // ── Restore from localStorage on mount ────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { wallet: w, upgraded } = loadStoredWallet();
      if (!w) return;
      if (upgraded) {
        setUpgradeNotice(`Your wallet was upgraded to a standard Ethereum address (${w.address.slice(0, 6)}…${w.address.slice(-4)}).`);
      }
      setWallet(w);
      refresh(w.address);
      await validateToken(upgraded ? null : safeGet(TOKEN_KEY), w);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-refresh reputation / points / NFTs every 15 s ────────────────────
  useEffect(() => {
    if (!wallet) return;
    const id = setInterval(() => refresh(wallet.address), 15_000);
    return () => clearInterval(id);
  }, [wallet, refresh]);

  // ── Connect ────────────────────────────────────────────────────────────────
  const connect = useCallback(async (mode, privateKey) => {
    setLoading(true);
    setError(null);
    try {
      const w = mode === 'browser'
        ? await connectBrowserWallet()
        : mode === 'import' ? importWallet(privateKey) : generateWallet();
      safeSet(STORAGE_KEY, JSON.stringify(w));
      safeRemove(TOKEN_KEY);
      clearAuthToken();
      setWallet(w);
      // A failed sign-in keeps the wallet (a new key must still be shown to the
      // user); authFlow stores the error and sign-in is retried on next load.
      await authFlow(w);
      await refresh(w.address);
      return w;
    } catch (e) {
      setError(e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [refresh, authFlow]);

  // ── Disconnect ────────────────────────────────────────────────────────────
  const disconnect = useCallback(() => {
    safeRemove(STORAGE_KEY);
    safeRemove(TOKEN_KEY);
    clearAuthToken();
    setWallet(null);
    setToken(null);
    setRole(null);
    setDepartment(null);
    setCity(null);
    setIsAuthenticated(false);
    setReputation(0);
    setRewards(0);
    setNftCount(0);
  }, []);

  return (
    <WalletCtx.Provider value={{
      wallet, reputation, rewards, nftCount,
      role, department, city, token, isAuthenticated,
      loading, authLoading, error, upgradeNotice,
      dismissUpgradeNotice: () => setUpgradeNotice(null),
      connect, disconnect, refresh, authFlow,
    }}>
      {children}
    </WalletCtx.Provider>
  );
}

export const useWallet = () => useContext(WalletCtx);
