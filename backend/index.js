/**
 * index.js — CivicChain backend entry point (Ethereum Sepolia).
 * Validates critical config, starts the HTTP server, initialises the Sepolia
 * connection and the mint reconciler (none of which block startup).
 */
import 'dotenv/config';
import app from './app.js';
import { ethereumService } from './services/ethereum.service.js';
import { startReconciler } from './services/nftMint.service.js';

const PORT = process.env.PORT || 3001;
const isProd = process.env.NODE_ENV === 'production';

const secret = process.env.JWT_SECRET || '';
if (secret.length < 32) {
  const msg = 'JWT_SECRET must be set to at least 32 random characters.';
  if (isProd) {
    console.error(`❌ ${msg} Refusing to start in production.`);
    process.exit(1);
  }
  console.warn(`⚠  ${msg} ${secret ? 'It is too short' : 'It is missing'} — logins ${secret ? 'work but are weak' : 'will fail'} until you set it in .env.`);
}

for (const [name, what] of [['GEMINI_API_KEY', 'AI verification'], ['PINATA_JWT', 'IPFS evidence storage']]) {
  if (!process.env[name]) console.warn(`⚠  ${name} is not set — ${what} will report a clear configuration error (no paid fallback).`);
}

app.listen(PORT, () => {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║   CivicChain Backend  v3 (Sepolia)   ║');
  console.log('╚══════════════════════════════════════╝');
  console.log(`  API     → http://localhost:${PORT}`);
  console.log('  Chain   → Ethereum Sepolia (chain 11155111)\n');
  ethereumService.init();
  startReconciler();
});
