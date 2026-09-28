/**
 * profile.routes.js — GET /api/profile/:address/{points,reputation,badges,nfts}
 */
import { Router } from 'express';
import {
  getPointsController, getReputationController, getBadgesController, getNftsController,
} from '../controllers/profile.controller.js';

const router = Router();

router.get('/:address/points',     getPointsController);
router.get('/:address/reputation', getReputationController);
router.get('/:address/badges',     getBadgesController);
router.get('/:address/nfts',       getNftsController);

export default router;
