/**
 * reputation.service.js — CivicChain reputation, levels and badges (off-chain)
 *
 *   +5 per valid report · +5 once VERIFIED or later · +15 when RESOLVED
 *   Levels: NEWCOMER 0 · RISING 10 · TRUSTED 50 · ELITE 100 · CHAMPION 200
 *   Badges: First Report (1) · Rising Contributor (5) · Trusted Reporter (rep ≥ 50)
 *           First Civic NFT (1 minted) · Civic Collector (5 minted)
 */

import { getReportsForAddress } from './reportCache.js';

export const LEVELS = [
  { label: 'NEWCOMER', min: 0 },
  { label: 'RISING',   min: 10 },
  { label: 'TRUSTED',  min: 50 },
  { label: 'ELITE',    min: 100 },
  { label: 'CHAMPION', min: 200 },
];

export function getLevel(score) {
  return ([...LEVELS].reverse().find((l) => score >= l.min) || LEVELS[0]).label;
}

/** Reputation earned by a newly accepted report. */
export async function increaseForReport() {
  return { earned: 5 };
}

export function reputationForReport(r) {
  let score = 5;
  if (['VERIFIED', 'IN_PROGRESS', 'RESOLVED'].includes(r.status)) score += 5;
  if (r.status === 'RESOLVED') score += 15;
  return score;
}

export async function getReputation(address) {
  const score = getReportsForAddress(address).reduce((s, r) => s + reputationForReport(r), 0);
  return { score, level: getLevel(score) };
}

export function mintedCount(reports) {
  return reports.filter((r) => r.nft?.status === 'NFT_MINTED').length;
}

export async function getBadges(address) {
  const reports = getReportsForAddress(address);
  const { score } = await getReputation(address);
  const nfts = mintedCount(reports);
  const badges = [];
  if (reports.length >= 1) badges.push({ name: 'First Report' });
  if (reports.length >= 5) badges.push({ name: 'Rising Contributor' });
  if (score >= 50)         badges.push({ name: 'Trusted Reporter' });
  if (nfts >= 1)           badges.push({ name: 'First Civic NFT', nft: true });
  if (nfts >= 5)           badges.push({ name: 'Civic Collector', nft: true });
  return badges;
}
