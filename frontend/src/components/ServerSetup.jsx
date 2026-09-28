import { useState } from 'react';
import { Server, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { setApiBase } from '../utils/platform.js';

/**
 * First-run screen in the Android app when no backend URL was built in
 * (VITE_API_URL). The URL is saved on the device and can be changed later.
 */
export default function ServerSetup({ onDone }) {
  const [url, setUrl] = useState('https://');
  const [state, setState] = useState(null); // null | checking | ok | error
  const [msg, setMsg] = useState('');

  async function save(e) {
    e.preventDefault();
    const clean = url.trim().replace(/\/+$/, '');
    if (!/^https?:\/\/[^\s/]+/.test(clean)) { setState('error'); setMsg('Enter the full server address, e.g. https://civicchain.example.com'); return; }
    setState('checking'); setMsg('');
    try {
      const res = await fetch(`${clean}/health`);
      const body = await res.json();
      if (body?.status !== 'ok') throw new Error('not a CivicChain server');
      setApiBase(clean);
      setState('ok');
      setTimeout(onDone, 400);
    } catch {
      setState('error');
      setMsg('Could not reach a CivicChain server at that address.');
    }
  }

  return (
    <div className="server-setup">
      <form className="modal-panel" onSubmit={save}>
        <div className="modal-title" style={{ marginBottom: 12 }}><Server size={20} /><span>Connect to CivicChain</span></div>
        <p className="modal-hint">Enter the address of your CivicChain server (the website where the app was downloaded).</p>
        <div className="input-group">
          <label htmlFor="server-url">Server URL</label>
          <div className="input-wrap">
            <input id="server-url" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://your-civicchain-server" autoCapitalize="off" autoCorrect="off" />
          </div>
        </div>
        {state === 'error' && <div className="alert error"><AlertCircle size={14} /> {msg}</div>}
        {state === 'ok' && <div className="alert success"><CheckCircle2 size={14} /> Connected</div>}
        <button className="btn-primary full" type="submit" disabled={state === 'checking'}>
          {state === 'checking' ? <Loader2 size={14} className="spin" /> : 'Save & continue'}
        </button>
      </form>
    </div>
  );
}
