/**
 * platform.js — web vs. Android (Capacitor) runtime helpers.
 */

/** True inside the CivicChain Android app (Capacitor WebView). */
export function isNativeApp() {
  try {
    return !!(typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.());
  } catch {
    return false;
  }
}

/** Where the "Download APK" buttons point. Served by the backend from frontend/public. */
export const APK_URL = import.meta.env.VITE_APK_URL || '/downloads/CivicChain.apk';

const API_OVERRIDE_KEY = 'cc_api_url';

/** Backend base URL: in-app override (APK) → VITE_API_URL → same origin. */
export function getApiBase() {
  try {
    const override = localStorage.getItem(API_OVERRIDE_KEY);
    if (override) return override.replace(/\/+$/, '');
  } catch { /* storage unavailable */ }
  return (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
}

export function setApiBase(url) {
  try {
    if (url) localStorage.setItem(API_OVERRIDE_KEY, url.trim().replace(/\/+$/, ''));
    else localStorage.removeItem(API_OVERRIDE_KEY);
  } catch { /* storage unavailable */ }
}
