const Player = require('../../models/player.model');

const DAILY_MISSIONS = Object.freeze([
  { id: 'tap_50', type: 'taps', target: 50, rewardPoints: 250 },
  { id: 'points_500', type: 'points', target: 500, rewardPoints: 500 },
  { id: 'tap_200', type: 'taps', target: 200, rewardPoints: 1000 }
]);

function getDayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function getMissionProgress(mission, player) {
  if (mission.type === 'taps') return Math.max(0, Number(player.authoritativeDailyClicks || 0));
  if (mission.type === 'points') return Math.max(0, Number(player.authoritativeDailyPoints || 0));
  return 0;
}

function buildMissionState(player, dayKey) {
  const claimed = new Set(String(player.serverDailyMissionDay || '') === dayKey
    ? (player.serverClaimedDailyMissionIds || [])
    : []);
  return DAILY_MISSIONS.map((mission) => {
    const progress = Math.min(mission.target, getMissionProgress(mission, player));
    return {
      id: mission.id,
      type: mission.type,
      target: mission.target,
      progress,
      rewardPoints: mission.rewardPoints,
      completed: progress >= mission.target,
      claimed: claimed.has(mission.id)
    };
  });
}

async function getDailyMissionState({ playerId, now = new Date() }) {
  const player = await Player.findOne({ playerId }).lean();
  if (!player) return { statusCode: 404, body: { ok: false, code: 'PLAYER_NOT_FOUND' } };
  const dayKey = getDayKey(now);
  return {
    statusCode: 200,
    body: {
      ok: true,
      day: dayKey,
      missions: buildMissionState(player, dayKey),
      bonusClaimed: String(player.serverDailyMissionDay || '') === dayKey && !!player.serverDailyMissionBonusClaimed
    }
  };
}

async function claimDailyMission({ playerId, missionId, now = new Date() }) {
  const mission = DAILY_MISSIONS.find((item) => item.id === String(missionId || '').trim());
  if (!mission) return { statusCode: 400, body: { ok: false, code: 'INVALID_DAILY_MISSION' } };

  const nowDate = new Date(now);
  const dayKey = getDayKey(nowDate);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const player = await Player.findOne({ playerId }).lean();
    if (!player) return { statusCode: 404, body: { ok: false, code: 'PLAYER_NOT_FOUND' } };
    if (player.botStatus === 'smart_ban') return { statusCode: 403, body: { ok: false, code: 'BOT_BLOCKED' } };

    const sameDay = String(player.serverDailyMissionDay || '') === dayKey;
    const claimedIds = sameDay ? (player.serverClaimedDailyMissionIds || []) : [];
    if (claimedIds.includes(mission.id)) {
      return { statusCode: 200, body: { ok: true, duplicate: true, missionId: mission.id, pointsAwarded: 0 } };
    }

    const progress = getMissionProgress(mission, player);
    if (progress < mission.target) {
      return { statusCode: 409, body: { ok: false, code: 'DAILY_MISSION_NOT_COMPLETE', missionId: mission.id, progress, target: mission.target } };
    }

    const dailyPoints = sameDay ? Math.max(0, Number(player.authoritativeDailyPoints || 0)) : 0;
    const revision = Number(player.dailyMissionRevision || 0);
    const updateResult = await Player.updateOne(
      {
        playerId,
        dailyMissionRevision: revision === 0 ? { $in: [0, null] } : revision,
        serverDailyMissionDay: sameDay ? dayKey : { $ne: dayKey },
        serverClaimedDailyMissionIds: { $ne: mission.id }
      },
      {
        $inc: {
          dailyMissionRevision: 1,
          authoritativeScore: mission.rewardPoints,
          authoritativeTotalPointsEarned: mission.rewardPoints
        },
        $set: {
          authoritativeProgressDay: dayKey,
          authoritativeDailyPoints: dailyPoints + mission.rewardPoints,
          serverDailyMissionDay: dayKey,
          updatedAt: nowDate
        },
        $addToSet: { serverClaimedDailyMissionIds: mission.id }
      }
    );

    if (updateResult.modifiedCount === 1) {
      return {
        statusCode: 200,
        body: {
          ok: true,
          duplicate: false,
          missionId: mission.id,
          pointsAwarded: mission.rewardPoints,
          score: Math.max(0, Number(player.authoritativeScore || 0)) + mission.rewardPoints,
          totalPointsEarned: Math.max(0, Number(player.authoritativeTotalPointsEarned || 0)) + mission.rewardPoints,
          dailyPoints: dailyPoints + mission.rewardPoints
        }
      };
    }
  }

  return { statusCode: 409, body: { ok: false, code: 'DAILY_MISSION_CONFLICT' } };
}

module.exports = {
  getDailyMissionState,
  claimDailyMission
};
