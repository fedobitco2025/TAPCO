const Player = require('../../models/player.model');

const SERVER_ACHIEVEMENTS = Object.freeze([
  { id: 'server_tap_1000', type: 'dailyTaps', target: 1000, rewardPoints: 500 },
  { id: 'server_points_10000', type: 'totalPoints', target: 10000, rewardPoints: 1000 },
  { id: 'server_tap_5000', type: 'dailyTaps', target: 5000, rewardPoints: 2500 }
]);

function getProgress(achievement, player) {
  if (achievement.type === 'dailyTaps') return Math.max(0, Number(player.authoritativeDailyClicks || 0));
  if (achievement.type === 'totalPoints') return Math.max(0, Number(player.authoritativeTotalPointsEarned || 0));
  return 0;
}

function buildState(player) {
  const claimed = new Set(player.serverClaimedAchievementIds || []);
  return SERVER_ACHIEVEMENTS.map((achievement) => {
    const progress = Math.min(achievement.target, getProgress(achievement, player));
    return {
      id: achievement.id,
      type: achievement.type,
      target: achievement.target,
      progress,
      rewardPoints: achievement.rewardPoints,
      completed: progress >= achievement.target,
      claimed: claimed.has(achievement.id)
    };
  });
}

async function getAchievementState({ playerId }) {
  const player = await Player.findOne({ playerId }).lean();
  if (!player) return { statusCode: 404, body: { ok: false, code: 'PLAYER_NOT_FOUND' } };
  return { statusCode: 200, body: { ok: true, achievements: buildState(player) } };
}

async function claimAchievement({ playerId, achievementId, now = new Date() }) {
  const achievement = SERVER_ACHIEVEMENTS.find((item) => item.id === String(achievementId || '').trim());
  if (!achievement) return { statusCode: 400, body: { ok: false, code: 'INVALID_SERVER_ACHIEVEMENT' } };

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const player = await Player.findOne({ playerId }).lean();
    if (!player) return { statusCode: 404, body: { ok: false, code: 'PLAYER_NOT_FOUND' } };
    if (player.botStatus === 'smart_ban') return { statusCode: 403, body: { ok: false, code: 'BOT_BLOCKED' } };
    if ((player.serverClaimedAchievementIds || []).includes(achievement.id)) {
      return { statusCode: 200, body: { ok: true, duplicate: true, achievementId: achievement.id, pointsAwarded: 0 } };
    }

    const progress = getProgress(achievement, player);
    if (progress < achievement.target) {
      return { statusCode: 409, body: { ok: false, code: 'SERVER_ACHIEVEMENT_NOT_COMPLETE', achievementId: achievement.id, progress, target: achievement.target } };
    }

    const dayKey = new Date(now).toISOString().slice(0, 10);
    const sameDay = String(player.authoritativeProgressDay || '') === dayKey;
    const dailyPoints = sameDay ? Math.max(0, Number(player.authoritativeDailyPoints || 0)) : 0;
    const revision = Number(player.achievementLedgerRevision || 0);
    const updateResult = await Player.updateOne(
      {
        playerId,
        achievementLedgerRevision: revision === 0 ? { $in: [0, null] } : revision,
        serverClaimedAchievementIds: { $ne: achievement.id }
      },
      {
        $inc: {
          achievementLedgerRevision: 1,
          authoritativeScore: achievement.rewardPoints,
          authoritativeTotalPointsEarned: achievement.rewardPoints
        },
        $set: {
          authoritativeProgressDay: dayKey,
          authoritativeDailyPoints: dailyPoints + achievement.rewardPoints,
          updatedAt: new Date(now)
        },
        $addToSet: { serverClaimedAchievementIds: achievement.id }
      }
    );

    if (updateResult.modifiedCount === 1) {
      return {
        statusCode: 200,
        body: {
          ok: true,
          duplicate: false,
          achievementId: achievement.id,
          pointsAwarded: achievement.rewardPoints,
          score: Math.max(0, Number(player.authoritativeScore || 0)) + achievement.rewardPoints,
          totalPointsEarned: Math.max(0, Number(player.authoritativeTotalPointsEarned || 0)) + achievement.rewardPoints,
          dailyPoints: dailyPoints + achievement.rewardPoints
        }
      };
    }
  }

  return { statusCode: 409, body: { ok: false, code: 'SERVER_ACHIEVEMENT_CONFLICT' } };
}

module.exports = { getAchievementState, claimAchievement };
