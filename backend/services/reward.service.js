/**
 * reward.service.js — CivicChain civic points (off-chain gamification)
 *
 * Points are recomputed from the reporter's stored reports:
 *   +10 per accepted report · +5 if severity HIGH
 *   +5 once VERIFIED / IN_PROGRESS / RESOLVED · +20 when RESOLVED
 * Points are NOT a token and never touch the chain. The Civic Issue NFT is
 * the only on-chain reward.
 */

import { getReportsForAddress } from './reportCache.js';

export const REWARD_RULES = [
  { name: 'REPORT_ACCEPTED', points: 10, condition: () => true },
  { name: 'HIGH_SEVERITY',  points: 5,  condition: (analysis) => analysis?.severity === 'HIGH' },
];

/** Points earned by a newly accepted report (returned to the submitter). */
export async function awardForReport(_address, analysis) {
  let earned = 0;
  const reason = [];
  for (const rule of REWARD_RULES) {
    if (rule.condition(analysis)) {
      earned += rule.points;
      reason.push(rule.name);
    }
  }
  return { earned, reason };
}

export function pointsForReport(r) {
  let points = 10;
  if (r.severity === 'HIGH') points += 5;
  if (['VERIFIED', 'IN_PROGRESS', 'RESOLVED'].includes(r.status)) points += 5;
  if (r.status === 'RESOLVED') points += 20;
  return points;
}

/** Total civic points for an address. */
export async function getPoints(address) {
  const points = getReportsForAddress(address).reduce((s, r) => s + pointsForReport(r), 0);
  return { points };
}
