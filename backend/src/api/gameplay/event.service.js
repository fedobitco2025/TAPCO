const Player = require('../../models/player.model');

const SERVER_EVENTS = Object.freeze([
  { id: 'daily_tap_500', type: 'taps', target: 500, rewardPoints: 1000 },
  { id: 'daily_points_5000', type: 'points', target: 5000, rewardPoints: 1500 },
  { id: 'daily_tap_2000', type: 'taps', target: 2000, rewardPoints: 3000 }
]);

function getDayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function getProgress(event, player) {
  if (event.type === 'taps') return Math.max(0, Number(player.authoritativeDailyClicks || 0));
  if (event.type === 'points') return Math.max(0, Number(player.authoritativeDailyPoints || 0));
  return 0;
}

function buildEventState(player, dayKey) {
  const claimed = new Set(String(player.serverEventDay || '') === dayKey
    ? (player.serverClaimedEventIds || [])
    : []);
  return SERVER_EVENTS.map((event) => {
    const progress = Math.min(event.target, getProgress(event, player));
    return {
      id: event.id,
      type: event.type,
      target: event.target,
      progress,
      rewardPoints: event.rewardPoints,
      completed: progress >= event.target,
      claimed: claimed.has(event.id)
    };
  });
}

async function getEventState({ playerId, now = new Date() }) {
  const player = await Player.findOne({ playerId }).lean();
  if (!player) return { statusCode: 404, body: { ok: false, code: 'PLAYER_NOT_FOUND' } };
  const dayKey = getDayKey(now);
  return { statusCode: 200, body: { ok: true, day: dayKey, events: buildEventState(player, dayKey) } };
}

async function claimEvent({ playerId, eventId, now = new Date() }) {
  const event = SERVER_EVENTS.find((item) => item.id === String(eventId || '').trim());
  if (!event) return { statusCode: 400, body: { ok: false, code: 'INVALID_SERVER_EVENT' } };

  const nowDate = new Date(now);
  const dayKey = getDayKey(nowDate);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const player = await Player.findOne({ playerId }).lean();
    if (!player) return { statusCode: 404, body: { ok: false, code: 'PLAYER_NOT_FOUND' } };
    if (player.botStatus === 'smart_ban') return { statusCode: 403, body: { ok: false, code: 'BOT_BLOCKED' } };

    const sameDay = String(player.serverEventDay || '') === dayKey;
    const claimedIds = sameDay ? (player.serverClaimedEventIds || []) : [];
    if (claimedIds.includes(event.id)) {
      return { statusCode: 200, body: { ok: true, duplicate: true, eventId: event.id, pointsAwarded: 0 } };
    }

    const progress = getProgress(event, player);
    if (progress < event.target) {
      return { statusCode: 409, body: { ok: false, code: 'SERVER_EVENT_NOT_COMPLETE', eventId: event.id, progress, target: event.target } };
    }

    const dailyPoints = sameDay ? Math.max(0, Number(player.authoritativeDailyPoints || 0)) : 0;
    const revision = Number(player.eventLedgerRevision || 0);
    const updateResult = await Player.updateOne(
      {
        playerId,
        eventLedgerRevision: revision === 0 ? { $in: [0, null] } : revision,
        serverEventDay: sameDay ? dayKey : { $ne: dayKey },
        serverClaimedEventIds: { $ne: event.id }
      },
      {
        $inc: {
          eventLedgerRevision: 1,
          authoritativeScore: event.rewardPoints,
          authoritativeTotalPointsEarned: event.rewardPoints
        },
        $set: {
          authoritativeProgressDay: dayKey,
          authoritativeDailyPoints: dailyPoints + event.rewardPoints,
          serverEventDay: dayKey,
          updatedAt: nowDate
        },
        $addToSet: { serverClaimedEventIds: event.id }
      }
    );

    if (updateResult.modifiedCount === 1) {
      return {
        statusCode: 200,
        body: {
          ok: true,
          duplicate: false,
          eventId: event.id,
          pointsAwarded: event.rewardPoints,
          score: Math.max(0, Number(player.authoritativeScore || 0)) + event.rewardPoints,
          totalPointsEarned: Math.max(0, Number(player.authoritativeTotalPointsEarned || 0)) + event.rewardPoints,
          dailyPoints: dailyPoints + event.rewardPoints
        }
      };
    }
  }

  return { statusCode: 409, body: { ok: false, code: 'SERVER_EVENT_CONFLICT' } };
}

module.exports = { getEventState, claimEvent };
