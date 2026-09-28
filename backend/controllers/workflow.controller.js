/**
 * workflow.controller.js — CivicChain Workflow Controller
 *
 * POST /api/workflow/:reportId/verify   → OPEN → VERIFIED          (AUTHORITY | ADMIN)
 * POST /api/workflow/:reportId/start    → VERIFIED → IN_PROGRESS   (MUNICIPAL_TEAM | ADMIN)
 * POST /api/workflow/:reportId/resolve  → IN_PROGRESS → RESOLVED   (MUNICIPAL_TEAM | ADMIN)
 *
 * Jurisdiction: AUTHORITY / MUNICIPAL_TEAM may only act on reports in their
 * assigned city (the same city-wide scope as /api/departments/me/reports).
 * The Civic Issue NFT is never touched by a status change.
 */

import { transitionStatus, MAX_NOTE_LENGTH } from '../services/workflow.service.js';
import { getReportById } from '../services/reportCache.js';
import { enrichReports } from '../services/assignment.service.js';
import { getUserJurisdiction } from '../services/jurisdiction.service.js';

const REPORT_ID_RE = /^[A-Za-z0-9_-]{1,80}$/;

function makeController(target) {
  return async function workflowController(req, res) {
    try {
      const { reportId } = req.params;
      if (!REPORT_ID_RE.test(reportId || '')) return res.status(400).json({ error: 'Invalid report id.' });

      const note = req.body?.note;
      if (note !== undefined && (typeof note !== 'string' || note.length > MAX_NOTE_LENGTH)) {
        return res.status(400).json({ error: `note must be a string of at most ${MAX_NOTE_LENGTH} characters.` });
      }

      const stored = getReportById(reportId);
      if (!stored) return res.status(404).json({ error: 'Report not found.' });

      if (req.user.role !== 'ADMIN') {
        const [report] = enrichReports([stored]);
        const juris = getUserJurisdiction(req.user.address);
        if (!juris?.city) {
          return res.status(403).json({ error: 'No city jurisdiction is assigned to your account. Contact your administrator.' });
        }
        if (report.city !== juris.city) {
          return res.status(403).json({ error: 'This report is outside your jurisdiction.' });
        }
      }

      const result = await transitionStatus(reportId, target, note || '', req.user.address);
      return res.status(result.success ? 200 : 400).json(result);
    } catch (e) {
      console.error('[WORKFLOW] error:', e.message);
      return res.status(500).json({ error: 'Workflow update failed.' });
    }
  };
}

export const verifyController  = makeController('VERIFIED');
export const startController   = makeController('IN_PROGRESS');
export const resolveController = makeController('RESOLVED');
