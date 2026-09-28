/**
 * profile.controller.js — CivicChain profile (off-chain gamification + NFT collection)
 *
 * GET /api/profile/:address/points      → { points, nftCount }
 * GET /api/profile/:address/reputation  → { score, level, nftCount }
 * GET /api/profile/:address/badges      → [{ name, nft? }]  (includes the NFT badges)
 * GET /api/profile/:address/nfts        → { address, nftCount, total, nfts[], pending[] }
 */
import { getPoints } from '../services/reward.service.js';
import { getReputation, getBadges, mintedCount } from '../services/reputation.service.js';
import { getReportsForAddress } from '../services/reportCache.js';
import { ownerNftsData } from './nft.controller.js';
import { isValidAddress, invalidWallet } from '../utils/address.js';

const nftCountFor = (address) => mintedCount(getReportsForAddress(address));

function guard(handler) {
  return async (req, res) => {
    const { address } = req.params;
    if (!isValidAddress(address)) return invalidWallet(res);
    try {
      return await handler(address, req, res);
    } catch (err) {
      console.error('[Profile] error:', err.message);
      return res.status(500).json({ error: 'Profile lookup failed.' });
    }
  };
}

export const getPointsController = guard(async (address, _req, res) =>
  res.json({ ...(await getPoints(address)), nftCount: nftCountFor(address) }));

export const getReputationController = guard(async (address, _req, res) =>
  res.json({ ...(await getReputation(address)), nftCount: nftCountFor(address) }));

export const getBadgesController = guard(async (address, _req, res) =>
  res.json(await getBadges(address)));

export const getNftsController = guard(async (address, _req, res) =>
  res.json(await ownerNftsData(address)));
