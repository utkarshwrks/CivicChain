import 'dotenv/config';
import app from './app.js';
import { ethereumService } from './services/ethereum.service.js';

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║   CivicChain Backend  v3 (Sepolia)   ║');
  console.log('╚══════════════════════════════════════╝');
  console.log(`  API     → http://localhost:${PORT}`);
  console.log('  Chain   → Ethereum Sepolia (chain 11155111)\n');
  ethereumService.init();
});
