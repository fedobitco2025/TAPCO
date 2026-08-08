const Player = require('../../models/player.model');

const COOLDOWN_MS = 24 * 60 * 60 * 1000;

function calculateReward(level, streak) {
  const base = 140 + Math.floor(Math.max(1, Number(level || 1)) * 4.5);
  const streakReward = Math.min(300, Math.max(1, Number(streak || 1)) * 20);
  return Math.max(120, Math.min(1800, base + streakReward));
}

async function claimDailyLogin({ playerId, now = new Date() }) {
  const nowDate = new Date(now);
  const nowMs = nowDate.getTime();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const player = await Player.findOne({ playerId }).lean();
    if (!player) return { statusCode: 404, body: { ok: false, code: 'PLAYER_NOT_FOUND' } };
    if (player.botStatus === 'smart_ban') return { statusCode: 403, body: { ok: false, code: 'BOT_BLOCKED' } };

    const lastAt = Math.max(0, Number(player.serverDailyLoginAt || 0));
    const remainingMs = Math.max(0, lastAt + COOLDOWN_MS - nowMs);
    if (remainingMs > 0) {
      return { statusCode: 200, body: { ok: true, claimed: false, cooldownMs: remainingMs, streak: Math.max(0, Number(player.dailyStreak || 0)), pointsAwarded: 0 } };
    }

    const previousAt = lastAt > 0 ? new Date(lastAt) : null;
    const consecutive = previousAt && (nowMs - lastAt) < (48 * 60 * 60 * 1000);
    const streak = consecutive ? Math.max(0, Number(player.dailyStreak || 0)) + 1 : 1;
    const pointsAwarded = calculateReward(player.level, streak);
    const dayKey = nowDate.toISOString().slice(0, 10);
    const revision = Number(player.serverDailyLoginRevision || 0);
    const sameProgressDay = String(player.authoritativeProgressDay || '') === dayKey;
    const dailyPoints = sameProgressDay ? Math.max(0, Number(player.authoritativeDailyPoints || 0)) : 0;
    const updateResult = await Player.updateOne(
      { playerId, serverDailyLoginRevision: revision === 0 ? { $in: [0, null] } : revision, serverDailyLoginAt: lastAt },
      {
        $inc: {
          serverDailyLoginRevision: 1,
          authoritativeScore: pointsAwarded,
          authoritativeTotalPointsEarned: pointsAwarded
        },
        $set: {
          dailyStreak: streak,
          lastLoginDate: dayKey,
          serverDailyLoginAt: nowMs,
          authoritativeProgressDay: dayKey,
          authoritativeDailyPoints: dailyPoints + pointsAwarded,
          updatedAt: nowDate
        }
      }
    );
    if (updateResult.modifiedCount === 1) {
      return { statusCode: 200, body: { ok: true, claimed: true, streak, pointsAwarded, cooldownMs: COOLDOWN_MS, score: Math.max(0, Number(player.authoritativeScore || 0)) + pointsAwarded, dailyPoints: dailyPoints + pointsAwarded } };
    }
  }
  return { statusCode: 409, body: { ok: false, code: 'DAILY_LOGIN_CONFLICT' } };
}

module.exports = { claimDailyLogin, COOLDOWN_MS };
