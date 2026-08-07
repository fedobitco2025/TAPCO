const crypto = require('crypto');
const Player = require('../../models/player.model');

const MAX_PENDING_GRANTS = 100;
const MAX_PROCESSED_CLAIM_IDS = 200;
const GRANT_ID_REGEX = /^grant_[A-Za-z0-9_-]{20,100}$/;
const CLAIM_ID_REGEX = /^claim_[A-Za-z0-9_-]{20,100}$/;
const GRANT_TYPE_REGEX = /^[a-z][a-z0-9_]{2,48}$/;

function normalizeId(value, pattern) {
  const normalized = String(value || '').trim();
  return pattern.test(normalized) ? normalized : '';
}

function normalizePoints(value) {
  const points = Number(value);
  if (!Number.isSafeInteger(points) || points < 1 || points > 1_000_000) return 0;
  return points;
}

function createGrantId() {
  return `grant_${crypto.randomUUID().replace(/-/g, '')}`;
}

function createClaimId() {
  return `claim_${crypto.randomUUID().replace(/-/g, '')}`;
}

function normalizeGrantType(value) {
  const grantType = String(value || '').trim();
  return GRANT_TYPE_REGEX.test(grantType) ? grantType : '';
}

async function issueRewardGrant({ playerId, grantType, points, sourceId = '', expiresAt = null }) {
  const normalizedType = normalizeGrantType(grantType);
  const normalizedPoints = normalizePoints(points);
  if (!playerId || !normalizedType || !normalizedPoints) {
    throw new Error('invalid_reward_grant');
  }

  const now = new Date();
  const grant = {
    grantId: createGrantId(),
    grantType: normalizedType,
    points: normalizedPoints,
    sourceId: String(sourceId || '').trim().slice(0, 120),
    createdAt: now,
    expiresAt: expiresAt ? new Date(expiresAt) : null
  };

  const updateResult = await Player.updateOne(
    { playerId },
    {
      $push: {
        pendingRewardGrants: {
          $each: [grant],
          $slice: -MAX_PENDING_GRANTS
        }
      },
      $set: { updatedAt: now }
    }
  );

  if (updateResult.matchedCount !== 1) {
    throw new Error('player_not_found');
  }

  return grant;
}

async function claimRewardGrant({ playerId, grantId, claimId = createClaimId(), now = new Date() }) {
  const normalizedGrantId = normalizeId(grantId, GRANT_ID_REGEX);
  const normalizedClaimId = normalizeId(claimId, CLAIM_ID_REGEX);
  if (!normalizedGrantId || !normalizedClaimId) {
    return { statusCode: 400, body: { ok: false, code: 'INVALID_REWARD_CLAIM' } };
  }

  const nowDate = new Date(now);
  const player = await Player.findOne({ playerId }).lean();
  if (!player) {
    return { statusCode: 404, body: { ok: false, code: 'PLAYER_NOT_FOUND' } };
  }

  if ((player.processedRewardClaimIds || []).includes(normalizedClaimId)) {
    return {
      statusCode: 200,
      body: {
        ok: true,
        duplicate: true,
        score: Math.max(0, Number(player.authoritativeScore || 0)),
        totalPointsEarned: Math.max(0, Number(player.authoritativeTotalPointsEarned || 0)),
        dailyPoints: Math.max(0, Number(player.authoritativeDailyPoints || 0))
      }
    };
  }

  const grant = (player.pendingRewardGrants || []).find((item) => String(item?.grantId || '') === normalizedGrantId);
  if (!grant) {
    return { statusCode: 404, body: { ok: false, code: 'REWARD_GRANT_NOT_FOUND' } };
  }

  const points = normalizePoints(grant.points);
  if (!points || (grant.expiresAt && new Date(grant.expiresAt).getTime() <= nowDate.getTime())) {
    return { statusCode: 410, body: { ok: false, code: 'REWARD_GRANT_EXPIRED' } };
  }

  const dayKey = nowDate.toISOString().slice(0, 10);
  const sameProgressDay = String(player.authoritativeProgressDay || '') === dayKey;
  const dailyPoints = sameProgressDay ? Math.max(0, Number(player.authoritativeDailyPoints || 0)) : 0;
  const revision = Number(player.rewardLedgerRevision || 0);

  const updateResult = await Player.updateOne(
    {
      playerId,
      rewardLedgerRevision: revision === 0 ? { $in: [0, null] } : revision,
      processedRewardClaimIds: { $ne: normalizedClaimId },
      'pendingRewardGrants.grantId': normalizedGrantId
    },
    {
      $inc: {
        rewardLedgerRevision: 1,
        authoritativeScore: points,
        authoritativeTotalPointsEarned: points
      },
      $set: {
        authoritativeProgressDay: dayKey,
        authoritativeDailyPoints: dailyPoints + points,
        updatedAt: nowDate
      },
      $pull: { pendingRewardGrants: { grantId: normalizedGrantId } },
      $push: {
        processedRewardClaimIds: {
          $each: [normalizedClaimId],
          $slice: -MAX_PROCESSED_CLAIM_IDS
        }
      }
    }
  );

  if (updateResult.modifiedCount !== 1) {
    return { statusCode: 409, body: { ok: false, code: 'REWARD_CLAIM_CONFLICT' } };
  }

  return {
    statusCode: 200,
    body: {
      ok: true,
      duplicate: false,
      grantType: String(grant.grantType || ''),
      pointsAwarded: points,
      score: Math.max(0, Number(player.authoritativeScore || 0)) + points,
      totalPointsEarned: Math.max(0, Number(player.authoritativeTotalPointsEarned || 0)) + points,
      dailyPoints: dailyPoints + points
    }
  };
}

module.exports = {
  createClaimId,
  issueRewardGrant,
  claimRewardGrant
};
