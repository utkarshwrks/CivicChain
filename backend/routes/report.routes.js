/**
 * report.routes.js — CivicChain report routes
 *
 * POST /api/report/process          AI + IPFS preview (no NFT)
 * POST /api/report/create   (JWT)   AI → fraud → duplicate → IPFS → metadata → store → mint
 * GET  /api/report/:reportId/nft    current NFT status
 */

import { Router } from 'express';
import rateLimit  from 'express-rate-limit';
import { authenticate } from '../middleware/auth.middleware.js';
import { imageUpload } from '../middleware/upload.js';
import {
  processReportController,
  createReportController,
  reportNftController,
} from '../controllers/report.controller.js';

const router = Router();
const isTest = () => process.env.NODE_ENV === 'test';

// Stricter limits for the expensive pipeline: per IP and per wallet.
const createLimiterIp = rateLimit({
  windowMs: 10 * 60_000, max: 10, standardHeaders: true, legacyHeaders: false,
  skip: isTest,
  message: { error: 'Too many reports from this network. Try again in a few minutes.', code: 'RATE_LIMITED' },
});
const createLimiterWallet = rateLimit({
  windowMs: 10 * 60_000, max: 10, standardHeaders: true, legacyHeaders: false,
  skip: isTest,
  keyGenerator: (req) => `wallet:${String(req.user?.address || '').toLowerCase()}`,
  message: { error: 'Too many reports from this wallet. Try again in a few minutes.', code: 'RATE_LIMITED' },
});
const previewLimiter = rateLimit({
  windowMs: 10 * 60_000, max: 20, standardHeaders: true, legacyHeaders: false, skip: isTest,
  message: { error: 'Too many preview requests. Try again later.', code: 'RATE_LIMITED' },
});

router.post('/process', previewLimiter, imageUpload, processReportController);
router.post('/create', createLimiterIp, authenticate, createLimiterWallet, imageUpload, createReportController);
router.get('/:reportId/nft', reportNftController);

export default router;
