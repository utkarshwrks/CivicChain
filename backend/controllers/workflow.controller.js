/**
 * workflow.controller.js — CivicChain Workflow Controller  (Phase 13)
 *
 * POST /api/workflow/:reportId/verify   → OPEN → VERIFIED
 * POST /api/workflow/:reportId/start    → VERIFIED → IN_PROGRESS
 * POST /api/workflow/:reportId/resolve  → IN_PROGRESS → RESOLVED
 */

import { transitionStatus } from '../services/workflow.service.js';

export async function verifyController(req, res) {
  try {
    const { reportId } = req.params;
    const { note }     = req.body || {};

    const result = await transitionStatus(reportId, 'VERIFIED', note);

    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.status(200).json(result);
  } catch (e) {
    console.error('[WORKFLOW] verify error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}

export async function startController(req, res) {
  try {
    const { reportId } = req.params;
    const { note }     = req.body || {};

    const result = await transitionStatus(reportId, 'IN_PROGRESS', note);

    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.status(200).json(result);
  } catch (e) {
    console.error('[WORKFLOW] start error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}

export async function resolveController(req, res) {
  try {
    const { reportId } = req.params;
    const { note }     = req.body || {};

    const result = await transitionStatus(reportId, 'RESOLVED', note);

    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.status(200).json(result);
  } catch (e) {
    console.error('[WORKFLOW] resolve error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
