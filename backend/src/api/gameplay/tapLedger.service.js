const Player = require('../../models/player.model');

const BASE_ENERGY = 20;
const BASE_ENERGY_REGEN_PER_SECOND = 0.5;
const MIN_ENERGY_TO_TAP = 3;
const TAP_ENERGY_COST = 1;
const MIN_TAP_INTERVAL_MS = 55;
const MAX_BATCH_TAPS = 20;
const MAX_REGEN_ELAPSED_MS = 6 * 60 * 60 * 1000;
const MAX_PROCESSED_BATCH_IDS = 50;

function normalizeBatchId(value) {
  const batchId = String(value || '').trim();
  return /^[A-Za-z0-9_-]{12,80}$/.test(batchId) ? batchId : '';
}

function calculateTapCredit(player, requestedTaps, nowMs) {
  const maxEnergyLevel = Math.max(0, Math.min(5, Number(player.authoritativeMaxEnergyLevel || 0)));
  const energyRegenLevel = Math.max(0, Math.min(100, Number(player.authoritativeEnergyRegenLevel || 0)));
  const tapPowerLevel = Math.max(0, Math.min(100, Number(player.authoritativeTapPowerLevel || 0)));
  const maxEnergy = BASE_ENERGY + maxEnergyLevel;
  const regenPerSecond = BASE_ENERGY_REGEN_PER_SECOND + (energyRegenLevel * 0.04);
  const energyUpdatedAtMs = Number(new Date(player.authoritativeEnergyUpdatedAt || nowMs));
  const regenElapsedMs = Math.max(0, Math.min(MAX_REGEN_ELAPSED_MS, nowMs - energyUpdatedAtMs));
  const storedEnergy = Math.max(0, Math.min(maxEnergy, Number(player.authoritativeEnergy ?? maxEnergy)));
  const availableEnergy = Math.min(maxEnergy, storedEnergy + ((regenElapsedMs / 1000) * regenPerSecond));

  const lastTapAtMs = player.lastAuthoritativeTapAt
    ? Number(new Date(player.lastAuthoritativeTapAt))
    : 0;
  const paceCapacity = lastTapAtMs > 0
    ? Math.max(0, Math.floor((nowMs - lastTapAtMs) / MIN_TAP_INTERVAL_MS) + 2)
    : MAX_BATCH_TAPS;
  const energyCapacity = Math.max(0, Math.floor((availableEnergy - (MIN_ENERGY_TO_TAP - TAP_ENERGY_COST)) / TAP_ENERGY_COST));
  const acceptedTaps = Math.max(0, Math.min(requestedTaps, paceCapacity, energyCapacity));
  const tapPower = Number(Math.pow(1.1, tapPowerLevel).toFixed(4));
  const pointsAwarded = Number((acceptedTaps * tapPower).toFixed(4));

  return {
    acceptedTaps,
    rejectedTaps: requestedTaps - acceptedTaps,
    pointsAwarded,
    energy: Number(Math.max(0, availableEnergy - (acceptedTaps * TAP_ENERGY_COST)).toFixed(4)),
    tapPower,
    maxEnergy
  };
}

async function creditTapBatch({ playerId, batchId, tapCount, now = new Date() }) {
  const normalizedBatchId = normalizeBatchId(batchId);
  const requestedTaps = Number(tapCount);
  if (!normalizedBatchId || !Number.isInteger(requestedTaps) || requestedTaps < 1 || requestedTaps > MAX_BATCH_TAPS) {
    return { statusCode: 400, body: { ok: false, code: 'INVALID_TAP_BATCH' } };
  }

  const nowDate = new Date(now);
  const nowMs = nowDate.getTime();
  const progressDay = nowDate.toISOString().slice(0, 10);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const player = await Player.findOne({ playerId }).lean();
    if (!player) {
      return { statusCode: 404, body: { ok: false, code: 'PLAYER_NOT_FOUND' } };
    }

    if ((player.processedTapBatchIds || []).includes(normalizedBatchId)) {
      return {
        statusCode: 200,
        body: {
          ok: true,
          duplicate: true,
          score: Number(player.authoritativeScore || 0),
          totalPointsEarned: Number(player.authoritativeTotalPointsEarned || 0),
          energy: Number(player.authoritativeEnergy ?? BASE_ENERGY)
        }
      };
    }

    if (player.botStatus === 'smart_ban') {
      return { statusCode: 403, body: { ok: false, code: 'BOT_BLOCKED' } };
    }
    if (player.botStatus === 'shadow_ban') {
      return {
        statusCode: 200,
        body: {
          ok: true,
          shadow: true,
          acceptedTaps: requestedTaps,
          rejectedTaps: 0,
          pointsAwarded: requestedTaps,
          score: Number(player.authoritativeScore || 0),
          energy: Number(player.authoritativeEnergy ?? BASE_ENERGY)
        }
      };
    }

    const credit = calculateTapCredit(player, requestedTaps, nowMs);
    const sameProgressDay = player.authoritativeProgressDay === progressDay;
    const dailyClicks = sameProgressDay ? Number(player.authoritativeDailyClicks || 0) : 0;
    const dailyPoints = sameProgressDay ? Number(player.authoritativeDailyPoints || 0) : 0;
    const revision = Number(player.tapCreditRevision || 0);
    const updateResult = await Player.updateOne(
      {
        playerId,
        tapCreditRevision: revision === 0 ? { $in: [0, null] } : revision,
        processedTapBatchIds: { $ne: normalizedBatchId }
      },
      {
        $inc: {
          authoritativeScore: credit.pointsAwarded,
          authoritativeTotalPointsEarned: credit.pointsAwarded,
          tapCreditRevision: 1
        },
        $set: {
          authoritativeDailyClicks: dailyClicks + credit.acceptedTaps,
          authoritativeDailyPoints: dailyPoints + credit.pointsAwarded,
          authoritativeProgressDay: progressDay,
          authoritativeEnergy: credit.energy,
          authoritativeEnergyUpdatedAt: nowDate,
          lastAuthoritativeTapAt: credit.acceptedTaps > 0
            ? nowDate
            : (player.lastAuthoritativeTapAt || null),
          updatedAt: nowDate
        },
        $push: {
          processedTapBatchIds: {
            $each: [normalizedBatchId],
            $slice: -MAX_PROCESSED_BATCH_IDS
          }
        }
      }
    );

    if (updateResult.modifiedCount === 1) {
      return {
        statusCode: 200,
        body: {
          ok: true,
          duplicate: false,
          ...credit,
          score: Number(player.authoritativeScore || 0) + credit.pointsAwarded,
          totalPointsEarned: Number(player.authoritativeTotalPointsEarned || 0) + credit.pointsAwarded,
          dailyClicks: dailyClicks + credit.acceptedTaps,
          dailyPoints: dailyPoints + credit.pointsAwarded
        }
      };
    }
  }

  console.warn('[tap-ledger] optimistic update conflict', { playerId, batchId: normalizedBatchId });
  return { statusCode: 409, body: { ok: false, code: 'TAP_LEDGER_CONFLICT' } };
}

module.exports = {
  calculateTapCredit,
  creditTapBatch
};