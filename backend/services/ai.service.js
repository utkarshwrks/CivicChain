/**
 * ai.service.js — CivicChain AI Vision Service
 *
 * Sends an uploaded image to Gemini Flash Vision and returns a
 * structured JSON object classifying whether the image depicts a civic
 * issue, what category it falls into, severity, confidence, and a
 * human-readable reason.
 *
 * Model: GEMINI_MODEL (default gemini-flash-latest), falling back through
 * GEMINI_FALLBACK_MODELS when a model is retired, overloaded or rate-limited.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { redactSecrets } from '../utils/redact.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_MODEL = 'gemini-flash-latest';
const DEFAULT_FALLBACK_MODELS = 'gemini-flash-lite-latest';

const VALID_CATEGORIES = [
  'ROAD_DAMAGE',
  'FLOOD',
  'GARBAGE',
  'STREETLIGHT',
  'WATER_LEAKAGE',
  'SEWAGE',
  'PUBLIC_SAFETY',
  'OTHER',
];

const VALID_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

/** Strict prompt instructing Gemini to output only parseable JSON. */
const SYSTEM_PROMPT = `You are an AI assistant integrated into CivicChain, a civic issue reporting platform.

Analyze the provided image and determine if it depicts a civic issue or public infrastructure problem.

Respond ONLY with a valid JSON object — no markdown, no code fences, no explanation outside JSON.

The JSON must follow this exact schema:
{
  "isCivicIssue": <boolean>,
  "category": "<one of: ROAD_DAMAGE | FLOOD | GARBAGE | STREETLIGHT | WATER_LEAKAGE | SEWAGE | PUBLIC_SAFETY | OTHER>",
  "severity": "<one of: LOW | MEDIUM | HIGH | CRITICAL>",
  "confidence": <integer 0-100>,
  "reason": "<concise one-sentence explanation of the visible issue>"
}

Rules:
- If the image does NOT show a civic issue (e.g. a person, food, animal, landscape), set isCivicIssue to false, category to "OTHER", severity to "LOW", confidence to a low value, and reason to explain why it is not a civic issue.
- severity must reflect actual danger or urgency: CRITICAL = immediate safety risk, HIGH = significant damage/risk, MEDIUM = moderate issue, LOW = minor cosmetic.
- confidence should reflect how certain you are (0–100).
- Only output the JSON object. No extra text.`;

// ─── Service ──────────────────────────────────────────────────────────────────

let _genAI = null;

function getClient() {
  if (!_genAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is not set in environment variables.');
    _genAI = new GoogleGenerativeAI(apiKey);
  }
  return _genAI;
}

/**
 * Analyze an image buffer using Gemini Vision.
 *
 * @param {Buffer} imageBuffer  - Raw image bytes
 * @param {string} mimeType     - MIME type, e.g. "image/jpeg"
 * @returns {Promise<{isCivicIssue:boolean, category:string, severity:string, confidence:number, reason:string}>}
 */
export async function analyzeImage(imageBuffer, mimeType) {
  const genAI = getClient();

  // Convert buffer to base64 inline part
  const imagePart = {
    inlineData: {
      data: imageBuffer.toString('base64'),
      mimeType,
    },
  };

  const timeoutMs = Number(process.env.AI_TIMEOUT_MS) || 45_000;
  const models = getModelChain();
  let lastError;

  for (const [i, name] of models.entries()) {
    const model = genAI.getGenerativeModel({ model: name });
    let timer;
    try {
      const result = await Promise.race([
        model.generateContent([SYSTEM_PROMPT, imagePart]),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(`Gemini timed out after ${timeoutMs} ms`)), timeoutMs);
        }),
      ]).finally(() => clearTimeout(timer));
      const rawText = result.response.text().trim();
      return parseGeminiResponse(rawText);
    } catch (err) {
      lastError = err;
      // Only fall back when the model itself is unavailable (retired, overloaded,
      // rate-limited). Bad keys and bad output fail immediately.
      if (i === models.length - 1 || !isModelUnavailable(err)) throw err;
      console.warn(`[AI] ${name} unavailable (${redactSecrets(err.message).slice(0, 160)}) — trying ${models[i + 1]}`);
    }
  }
  throw lastError;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Primary model from GEMINI_MODEL, then GEMINI_FALLBACK_MODELS (comma-separated).
 * The "-latest" aliases follow Google's current Flash models, so a model
 * retirement never needs a code change.
 */
function getModelChain() {
  const primary   = (process.env.GEMINI_MODEL || DEFAULT_MODEL).trim();
  const fallbacks = (process.env.GEMINI_FALLBACK_MODELS ?? DEFAULT_FALLBACK_MODELS)
    .split(',').map((s) => s.trim()).filter(Boolean);
  return [...new Set([primary, ...fallbacks])];
}

/** 404 (model retired), 429 (quota/rate), 500/503 (overloaded) or a timeout. */
function isModelUnavailable(err) {
  const msg = String(err?.message || '');
  const status = err?.status ?? Number(msg.match(/\[(\d{3})\s/)?.[1]);
  return [404, 429, 500, 503].includes(status) || /timed out/i.test(msg);
}

/**
 * Strip markdown fences if Gemini wraps output despite instructions,
 * then parse and validate the JSON structure.
 */
function parseGeminiResponse(raw) {
  // Strip ```json ... ``` or ``` ... ``` wrappers
  let cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Gemini returned non-JSON output: ${raw.slice(0, 200)}`);
  }

  // Coerce & validate fields
  const isCivicIssue = Boolean(parsed.isCivicIssue);
  const category     = VALID_CATEGORIES.includes(parsed.category) ? parsed.category : 'OTHER';
  const severity     = VALID_SEVERITIES.includes(parsed.severity) ? parsed.severity : 'MEDIUM';
  const confidence   = typeof parsed.confidence === 'number'
    ? Math.min(100, Math.max(0, Math.round(parsed.confidence)))
    : 50;
  const reason       = typeof parsed.reason === 'string' ? parsed.reason.slice(0, 500) : 'No reason provided.';

  return { isCivicIssue, category, severity, confidence, reason };
}
