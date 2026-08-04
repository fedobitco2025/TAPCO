const Player = require('../../models/player.model');
const envConfig = require('../../config/env');

const MAX_PROCESSED_CLAIM_IDS = 100;
const CLAIM_ID_REGEX = /^[A-Za-z0-9_-]{16,100}$/;

const COUNTER_FIELDS = [
  'adRewardedEnergyToday',
  'adRewardedPointsBoostToday',
  'adRewardedChestToday',
  'adRewardedOfferwallToday'
];

const REWARD_TYPES = Object.freeze({
  rewarded_energy: {
    counterField: 'adRewardedEnergyToday',
    lastAtField: 'adLastRewardedEnergyAt',
    points: Math.max(1, Number(envConfig.AD_REWARD_ENERGY_POINTS) || 350),
    dailyCap: Math.max(1, Number(envConfig.AD_REWARD_ENERGY_DAILY_CAP) || 8),
    cooldownMs: Math.max(0, Number(envConfig.AD_REWARD_ENERGY_COOLDOWN_SEC) || 600) * 1000
  },
  rewarded_points_boost: {
    counterField: 'adRewardedPointsBoostToday',
    lastAtField: 'adLastRewardedPointsBoostAt',
    points: Math.max(1, Number(envConfig.AD_REWARD_POINTS_BOOST_POINTS) || 650),
    dailyCap: Math.max(1, Number(envConfig.AD_REWARD_POINTS_BOOST_DAILY_CAP) || 5),
    cooldownMs: Math.max(0, Number(envConfig.AD_REWARD_POINTS_BOOST_COOLDOWN_SEC) || 900) * 1000
  },
  rewarded_daily_chest: {
    counterField: 'adRewardedChestToday',
    lastAtField: 'adLastRewardedChestAt',
    points: Math.max(1, Number(envConfig.AD_REWARD_DAILY_CHEST_POINTS) || 2200),
    dailyCap: Math.max(1, Number(envConfig.AD_REWARD_DAILY_CHEST_DAILY_CAP) || 1),
    cooldownMs: Math.max(0, Number(envConfig.AD_REWARD_DAILY_CHEST_COOLDOWN_SEC) || 0) * 1000
  },
  offerwall_task_complete: {
    counterField: 'adRewardedOfferwallToday',
    lastAtField: 'adLastRewardedOfferwallAt',
    points: Math.max(1, Number(envConfig.AD_REWARD_OFFERWALL_POINTS) || 3200),
    dailyCap: Math.max(1, Number(envConfig.AD_REWARD_OFFERWALL_DAILY_CAP) || 3),
    cooldownMs: Math.max(0, Number(envConfig.AD_REWARD_OFFERWALL_COOLDOWN_SEC) || 1800) * 1000
  }
});

function getUtcDayKey(now) {
  return now.toISOString().slice(0, 10);
}

function normalizeClaimId(value) {
  const claimId = String(value || '').trim();
  return CLAIM_ID_REGEX.test(claimId) ? claimId : '';
}

function getDayEndIso(nowMs) {
  const dayEnd = new Date(nowMs);
  dayEnd.setUTCHours(23, 59, 59, 999);
  return dayEnd.toISOString();
}

function buildSuccessBody(player, rewardType, pointsAwarded, extra = {}) {
  return {
    ok: true,
    rewardType,
    pointsAwarded,
    score: Math.max(0, Number(player.authoritativeScore || 0)),
    totalPointsEarned: Math.max(0, Number(player.authoritativeTotalPointsEarned || 0)),
    dailyPoints: Math.max(0, Number(player.authoritativeDailyPoints || 0)),
    ...extra
  };
}

async function claimAdReward({ playerId, rewardType, claimId, now = new Date() }) {
  const config = REWARD_TYPES[String(rewardType || '').trim()];
  const normalizedClaimId = normalizeClaimId(claimId);

  if (!config || !normalizedClaimId) {
    return { statusCode: 400, body: { ok: false, code: 'INVALID_AD_REWARD_CLAIM' } };
  }

  const nowDate = new Date(now);
  const nowMs = nowDate.getTime();
  const dayKey = getUtcDayKey(nowDate);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const player = await Player.findOne({ playerId }).lean();
    if (!player) {
      return { statusCode: 404, body: { ok: false, code: 'PLAYER_NOT_FOUND' } };
    }

    if ((player.processedAdRewardClaimIds || []).includes(normalizedClaimId)) {
      return {
        statusCode: 200,
        body: buildSuccessBody(player, rewardType, 0, { duplicate: true })
      };
    }

    if (player.botStatus === 'smart_ban') {
      return { statusCode: 403, body: { ok: false, code: 'BOT_BLOCKED' } };
    }

    const sameRewardDay = String(player.adRewardDailyKey || '') === dayKey;
    const currentClaims = sameRewardDay ? Math.max(0, Number(player[config.counterField] || 0)) : 0;
    if (currentClaims >= config.dailyCap) {
      return {
        statusCode: 429,
        body: {
          ok: false,
          code: 'AD_REWARD_DAILY_CAP_REACHED',
          rewardType,
          retryAt: getDayEndIso(nowMs)
        }
      };
    }

    const lastClaimAtMs = Math.max(0, Number(player[config.lastAtField] || 0));
    const remainingMs = Math.max(0, (lastClaimAtMs + config.cooldownMs) - nowMs);
    if (remainingMs > 0) {
      return {
        statusCode: 429,
        body: {
          ok: false,
          code: 'AD_REWARD_COOLDOWN_ACTIVE',
          rewardType,
          remainingMs,
          nextAvailableAt: new Date(nowMs + remainingMs).toISOString()
        }
      };
    }

    const sameProgressDay = String(player.authoritativeProgressDay || '') === dayKey;
    const currentDailyPoints = sameProgressDay ? Math.max(0, Number(player.authoritativeDailyPoints || 0)) : 0;
    const pointsAwarded = player.botStatus === 'shadow_ban' ? 0 : config.points;

    const revision = Number(player.adRewardRevision || 0);
    const setDoc = {
      updatedAt: nowDate,
      adRewardDailyKey: dayKey,
      authoritativeProgressDay: dayKey,
      authoritativeDailyPoints: currentDailyPoints + pointsAwarded,
      [config.lastAtField]: nowMs,
      [config.counterField]: currentClaims + 1
    };

    if (!sameRewardDay) {
      COUNTER_FIELDS.forEach((field) => {
        setDoc[field] = 0;
      });
      setDoc[config.counterField] = 1;
    }

    const updateResult = await Player.updateOne(
      {
        playerId,
        adRewardRevision: revision === 0 ? { $in: [0, null] } : revision,
        processedAdRewardClaimIds: { $ne: normalizedClaimId }
      },
      {
        $inc: {
          adRewardRevision: 1,
          authoritativeScore: pointsAwarded,
          authoritativeTotalPointsEarned: pointsAwarded
        },
        $set: setDoc,
        $push: {
          processedAdRewardClaimIds: {
            $each: [normalizedClaimId],
            $slice: -MAX_PROCESSED_CLAIM_IDS
          }
        }
      }
    );

    if (updateResult.modifiedCount === 1) {
      const nextClaims = currentClaims + 1;
      return {
        statusCode: 200,
        body: buildSuccessBody(
          {
            authoritativeScore: Math.max(0, Number(player.authoritativeScore || 0)) + pointsAwarded,
            authoritativeTotalPointsEarned: Math.max(0, Number(player.authoritativeTotalPointsEarned || 0)) + pointsAwarded,
            authoritativeDailyPoints: currentDailyPoints + pointsAwarded
          },
          rewardType,
          pointsAwarded,
          {
            duplicate: false,
            shadow: player.botStatus === 'shadow_ban',
            dailyClaimsUsed: nextClaims,
            dailyClaimsRemaining: Math.max(0, config.dailyCap - nextClaims)
          }
        )
      };
    }
  }

  console.warn('[ad-reward] optimistic update conflict', { playerId, rewardType, claimId: normalizedClaimId });
  return { statusCode: 409, body: { ok: false, code: 'AD_REWARD_CONFLICT' } };
}

module.exports = {
  claimAdReward
};
