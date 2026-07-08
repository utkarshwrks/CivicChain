import { blockchainConfig } from '../config/blockchain.config.js';

const DEFAULT_NODES = [
  'https://sayman.up.railway.app',
  'https://sayman.onrender.com',
  'http://localhost:10000'
];

let rpcNodes = [];
let activeIndex = 0;

// Initialize the node list
function initNodes() {
  const envRpc = process.env.SAYMAN_RPC;
  let list = [];
  if (envRpc) {
    list = envRpc.split(',').map(s => s.trim()).filter(Boolean);
  }
  // Include blockchainConfig.rpcUrl if not in list
  if (blockchainConfig.rpcUrl && !list.includes(blockchainConfig.rpcUrl)) {
    list.push(blockchainConfig.rpcUrl);
  }
  // Include default fallbacks
  for (const fallback of DEFAULT_NODES) {
    if (!list.includes(fallback)) {
      list.push(fallback);
    }
  }
  rpcNodes = list;
}

// Convert P2P socket URL to HTTP API URL
function p2pUrlToHttp(p2pUrl) {
  if (!p2pUrl) return null;
  try {
    let httpUrl = p2pUrl.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:');
    httpUrl = httpUrl.replace(/\/p2p\/?$/i, '');
    const urlObj = new URL(httpUrl);
    if (urlObj.port) {
      const portInt = parseInt(urlObj.port);
      if (portInt >= 6000 && portInt <= 7000) {
        urlObj.port = portInt === 6001 ? 3000 : portInt - 3001;
      }
    }
    return urlObj.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

// Fetch active peers in real-time and append to rpcNodes
async function discoverPeers(workingUrl) {
  try {
    const res = await fetch(`${workingUrl}/api/network/peers`);
    if (!res.ok) return;
    const data = await res.json();
    const peers = data.peers || [];
    for (const p of peers) {
      const peerHttp = p2pUrlToHttp(p.url);
      if (peerHttp && !rpcNodes.includes(peerHttp)) {
        console.log(`[RPC-DISCOVERY] Discovered new RPC node: ${peerHttp}`);
        rpcNodes.push(peerHttp);
      }
    }
  } catch (e) {
    // Ignore discovery errors
  }
}

/**
 * Execute an RPC request with failover support.
 * Cycles through the rpcNodes list until it finds an active one.
 */
export async function rpc(endpoint, method = 'GET', body = null, retries = 1) {
  if (rpcNodes.length === 0) {
    initNodes();
  }

  // Attempt the request starting from the last active index
  const startIdx = activeIndex;
  let lastError = null;

  for (let offset = 0; offset < rpcNodes.length; offset++) {
    const idx = (startIdx + offset) % rpcNodes.length;
    const baseUrl = rpcNodes[idx];
    const url = `${baseUrl}${endpoint}`;

    for (let attempt = 0; attempt <= retries; attempt++) {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 10_000); // 10s timeout per RPC call

      try {
        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: body ? JSON.stringify(body) : undefined,
          signal: ctrl.signal,
        });

        const text = await res.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          throw new Error(`SAYMAN non-JSON at ${url}: ${text.slice(0, 120)}`);
        }

        if (!res.ok) {
          throw new Error(data.error || data.message || `RPC ${res.status}`);
        }

        // Successfully got a response! Update active index & start peer discovery
        activeIndex = idx;
        clearTimeout(timeout);

        // Sticky updates to the blockchain config to make sure the rest of the backend aligns
        blockchainConfig.rpcUrl = baseUrl;

        // Async peer discovery to keep list fresh
        discoverPeers(baseUrl).catch(() => {});

        return data;
      } catch (e) {
        lastError = e;
        clearTimeout(timeout);
        // If it's a validation error or something contract-thrown (rather than connection failure), don't failover
        if (e.message.includes('failed —') || e.message.includes('Requirement failed') || e.message.includes('not found')) {
          throw e;
        }
        // Otherwise, retry or move to the next node
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
        }
      }
    }
  }

  throw new Error(`All SAYMAN RPC nodes failed. Last error: ${lastError?.message}`);
}

export function getActiveRpcUrl() {
  if (rpcNodes.length === 0) initNodes();
  return rpcNodes[activeIndex] || blockchainConfig.rpcUrl;
}

export function getRpcNodes() {
  if (rpcNodes.length === 0) initNodes();
  return [...rpcNodes];
}
