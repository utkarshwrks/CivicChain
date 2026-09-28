/**
 * ai.routes.js — POST /api/ai/analyze (multipart "image") → Gemini Vision JSON
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { imageUpload } from '../middleware/upload.js';
import { analyzeImageController } from '../controllers/ai.controller.js';

const router = Router();
const limiter = rateLimit({
  windowMs: 10 * 60_000, max: 20, standardHeaders: true, legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: { error: 'Too many analysis requests. Try again later.', code: 'RATE_LIMITED' },
});

router.post('/analyze', limiter, imageUpload, analyzeImageController);

export default router;
