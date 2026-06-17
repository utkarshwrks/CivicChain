/**
 * workflow.routes.js — CrowdPulse Workflow Routes  (Phase 13)
 *
 * POST /api/workflow/:reportId/verify   → OPEN → VERIFIED
 * POST /api/workflow/:reportId/start    → VERIFIED → IN_PROGRESS
 * POST /api/workflow/:reportId/resolve  → IN_PROGRESS → RESOLVED
 */

import { Router } from 'express';
import {
  verifyController,
  startController,
  resolveController,
} from '../controllers/workflow.controller.js';

const router = Router();

router.post('/:reportId/verify',  verifyController);
router.post('/:reportId/start',   startController);
router.post('/:reportId/resolve', resolveController);

export default router;
