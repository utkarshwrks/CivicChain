// Deterministic stand-in for Gemini (rehearsal only). Images whose SHA-256 is
// listed in HARNESS_NONCIVIC are classified as "not a civic issue".
import crypto from 'crypto';
const CATS = ['ROAD_DAMAGE', 'GARBAGE', 'FLOOD', 'STREETLIGHT', 'WATER_LEAKAGE'];
export async function analyzeImage(buffer) {
  const sha = crypto.createHash('sha256').update(buffer).digest('hex');
  if ((process.env.HARNESS_NONCIVIC || '').split(',').includes(sha)) {
    return { isCivicIssue: false, category: 'OTHER', severity: 'LOW', confidence: 12, reason: 'The image shows indoor floor tiles, not a public civic issue.' };
  }
  const category = CATS[parseInt(sha.slice(0, 2), 16) % CATS.length];
  return { isCivicIssue: true, category, severity: 'HIGH', confidence: 94, reason: `Rehearsal classifier: visible ${category.replace(/_/g, ' ').toLowerCase()} in a public area.` };
}
