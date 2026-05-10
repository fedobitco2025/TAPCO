/**
 * Evidence Engine — calculates a numeric score from behavioral signals.
 *
 * Scoring table:
 *   suspicionScore  0-4   → +0
 *   suspicionScore  5-7   → +4
 *   suspicionScore  8-10  → +8
 *   suspicionScore  >10   → +12
 *
 *   tps  <=20  → +0
 *   tps  21-24 → +2
 *   tps  >=25  → +4
 *
 *   patternStdDev  >=5   → +0  (human variance)
 *   patternStdDev  2-4   → +2
 *   patternStdDev  <2    → +4  (too regular = bot)
 *
 * Max = 20 → smart_ban threshold at 16
 */
module.exports.calculateEvidence = ({ suspicionScore, tps, patternStdDev }) => {
  let score = 0;

  // Suspicion score weight
  if (suspicionScore > 10) score += 12;
  else if (suspicionScore >= 8) score += 8;
  else if (suspicionScore >= 5) score += 4;

  // TPS (taps per second) weight
  if (tps >= 25) score += 4;
  else if (tps >= 21) score += 2;

  // Pattern regularity weight (lower stdDev = more bot-like)
  if (patternStdDev < 2) score += 4;
  else if (patternStdDev < 5) score += 2;

  return score;
};
