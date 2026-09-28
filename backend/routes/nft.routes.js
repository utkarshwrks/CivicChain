/**
 * nft.routes.js — Civic Issue NFT routes (mounted at /api/nft; /api/nfts is registered in app.js)
 * Specific paths are declared before /:tokenId.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, requireRole } from '../middleware/auth.middleware.js';
import {
  contractController, ownerController, tokenController, retryController, retryFailedController,
} from '../controllers/nft.controller.js';

const router = Router();
const retryLimiter = rateLimit({
  windowMs: 10 * 60_000, max: 5, standardHeaders: true, legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: { error: 'Too many retry requests. Try again in a few minutes.', code: 'RATE_LIMITED' },
});

router.get('/contract', contractController);
router.get('/owner/:address', ownerController);
router.post('/retry-failed', retryLimiter, authenticate, requireRole('ADMIN'), retryFailedController);
router.post('/retry/:reportId', retryLimiter, authenticate, retryController);
router.get('/:tokenId', tokenController);

export default router;
