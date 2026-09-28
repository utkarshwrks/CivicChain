/**
 * chain.routes.js — Ethereum Sepolia status
 *
 * GET /api/chain/status → network, chain ID, latest block, contract, owner,
 *                         minter, backend minter balance + low-balance flag,
 *                         totalMinted, issues[]. Never includes the RPC URL or keys.
 */
import { Router } from 'express';
import { ethereumService } from '../services/ethereum.service.js';

const router = Router();

router.get('/status', async (_req, res) => {
  try {
    res.json(await ethereumService.getStatus());
  } catch {
    res.status(503).json({ network: 'Ethereum Sepolia', ready: false, error: 'CHAIN_STATUS_UNAVAILABLE' });
  }
});

export default router;
