/**
 * ipfs.routes.js — POST /api/ipfs/upload (multipart "image") → Pinata CID
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { imageUpload } from '../middleware/upload.js';
import { uploadImageController } from '../controllers/ipfs.controller.js';

const router = Router();
const limiter = rateLimit({
  windowMs: 10 * 60_000, max: 10, standardHeaders: true, legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: { error: 'Too many uploads. Try again later.', code: 'RATE_LIMITED' },
});

router.post('/upload', limiter, imageUpload, uploadImageController);

export default router;
