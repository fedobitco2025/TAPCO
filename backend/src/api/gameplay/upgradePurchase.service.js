const Player = require('../../models/player.model');

const MAX_PROCESSED_PURCHASE_IDS = 256;
const UPGRADE_CONFIG = Object.freeze({
  tapPower: Object.freeze({ field: 'authoritativeTapPowerLevel', maxLevel: 100, baseCost: 500, growth: 1.48 }),
  maxEnergy: Object.freeze({ field: 'authoritativeMaxEnergyLevel', maxLevel: 5, baseCost: 15000, growth: 1 }),
  energyRegen: Object.freeze({ field: 'authoritativeEnergyRegenLevel', maxLevel: 100, baseCost: 950, growth: 1.45 })
});

function normalizePurchaseId(value) {
  const purchaseId = String(value || '').trim();
  return /^[A-Za-z0-9_-]{12,80}$/.test(purchaseId) ? purchaseId : '';
}

function getUpgradeCost(upgradeType, currentLevel) {
  const config = UPGRADE_CONFIG[upgradeType];
  if (!config) return null;
  const safeLevel = Math.max(0, Math.min(config.maxLevel, Number(currentLevel) || 0));
  if (safeLevel >= config.maxLevel) return null;
  const cost = Math.floor(config.baseCost * Math.pow(config.growth, safeLevel));
  return Number.isSafeInteger(cost) && cost > 0 ? cost : null;
}

function buildUpgradeResponse(player, extra = {}) {
  return {
    ok: true,
    score: Math.max(0, Number(player.authoritativeScore || 0)),
    levels: {
      tapPower: Math.max(0, Number(player.authoritativeTapPowerLevel || 0)),
      maxEnergy: Math.max(0, Number(player.authoritativeMaxEnergyLevel || 0)),
      energyRegen: Math.max(0, Number(player.authoritativeEnergyRegenLevel || 0))
    },
    ...extra
  };
}

async function purchaseUpgrade({ playerId, purchaseId, upgradeType }) {
  const normalizedPurchaseId = normalizePurchaseId(purchaseId);
  const config = UPGRADE_CONFIG[upgradeType];
  if (!normalizedPurchaseId || !config) {
    return { statusCode: 400, body: { ok: false, code: 'INVALID_UPGRADE_PURCHASE' } };
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const player = await Player.findOne({ playerId }).lean();
    if (!player) return { statusCode: 404, body: { ok: false, code: 'PLAYER_NOT_FOUND' } };

    if ((player.processedUpgradePurchaseIds || []).includes(normalizedPurchaseId)) {
      return { statusCode: 200, body: buildUpgradeResponse(player, { duplicate: true }) };
    }

    const currentLevel = Math.max(0, Number(player[config.field] || 0));
    const cost = getUpgradeCost(upgradeType, currentLevel);
    if (cost === null) {
      return { statusCode: 409, body: { ok: false, code: 'UPGRADE_MAX_LEVEL', level: currentLevel } };
    }
    if (Number(player.authoritativeScore || 0) < cost) {
      return {
        statusCode: 409,
        body: {
          ok: false,
          code: 'INSUFFICIENT_AUTHORITATIVE_SCORE',
          score: Math.max(0, Number(player.authoritativeScore || 0)),
          cost
        }
      };
    }

    const revision = Number(player.upgradePurchaseRevision || 0);
    const updateResult = await Player.updateOne(
      {
        playerId,
        [config.field]: currentLevel === 0 ? { $in: [0, null] } : currentLevel,
        authoritativeScore: { $gte: cost },
        upgradePurchaseRevision: revision === 0 ? { $in: [0, null] } : revision,
        processedUpgradePurchaseIds: { $ne: normalizedPurchaseId }
      },
      {
        $inc: {
          authoritativeScore: -cost,
          [config.field]: 1,
          upgradePurchaseRevision: 1
        },
        $set: { updatedAt: new Date() },
        $push: {
          processedUpgradePurchaseIds: {
            $each: [normalizedPurchaseId],
            $slice: -MAX_PROCESSED_PURCHASE_IDS
          }
        }
      }
    );

    if (updateResult.modifiedCount === 1) {
      const updatedPlayer = {
        ...player,
        authoritativeScore: Number(player.authoritativeScore || 0) - cost,
        [config.field]: currentLevel + 1
      };
      return {
        statusCode: 200,
        body: buildUpgradeResponse(updatedPlayer, {
          duplicate: false,
          upgradeType,
          level: currentLevel + 1,
          cost
        })
      };
    }
  }

  console.warn('[upgrade-purchase] optimistic update conflict', { playerId, purchaseId: normalizedPurchaseId, upgradeType });
  return { statusCode: 409, body: { ok: false, code: 'UPGRADE_PURCHASE_CONFLICT' } };
}

module.exports = { getUpgradeCost, purchaseUpgrade };