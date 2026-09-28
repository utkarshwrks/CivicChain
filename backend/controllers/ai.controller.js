/**
 * ai.controller.js — POST /api/ai/analyze (Gemini Vision classification)
 * The upload is validated by middleware/upload.js (type by magic bytes, size).
 */
import { analyzeImage } from '../services/ai.service.js';
import { redact } from '../utils/redact.js';

export async function analyzeImageController(req, res) {
  try {
    const { buffer, mimetype, originalname, size } = req.file;
    const analysis = await analyzeImage(buffer, mimetype);
    return res.json({ success: true, filename: originalname, sizeKb: Math.round(size / 1024), ...analysis });
  } catch (err) {
    const msg = String(err.message || '');
    console.error('[AI] analyze failed:', redact(msg));
    if (msg.includes('GEMINI_API_KEY') || msg.includes('API_KEY_INVALID')) {
      return res.status(503).json({ error: 'Gemini is not configured on the server (GEMINI_API_KEY).', code: 'AI_FAILED' });
    }
    if (msg.includes('SAFETY')) return res.status(422).json({ error: 'Image was blocked by Gemini safety filters.', code: 'AI_FAILED' });
    if (/quota|429|rate/i.test(msg)) return res.status(503).json({ error: 'The free Gemini quota is exhausted. Try again later.', code: 'AI_FAILED' });
    return res.status(502).json({ error: 'Image analysis failed. Please try again.', code: 'AI_FAILED' });
  }
}
