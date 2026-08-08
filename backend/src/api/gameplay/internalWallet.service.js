const crypto = require('crypto');
const Player = require('../../models/player.model');
const WalletTx = require('../../models/walletTx.model');

const MIN_INTERNAL_TRANSFER_POINTS = 100;
const MAX_PROCESSED_TRANSFER_IDS = 200;
const TRANSFER_ID_REGEX = /^internal_[A-Za-z0-9_-]{16,100}$/;

function normalizeTransferId(value) {
  const transferId = String(value || '').trim();
  return TRANSFER_ID_REGEX.test(transferId) ? transferId : '';
}

function createTransferId() {
  return `internal_${crypto.randomUUID().replace(/-/g, '')}`;
}

async function transferPointsToInternalWallet({ playerId, amount, transferId = createTransferId(), now = new Date() }) {
  const normalizedAmount = Number(amount);
  const normalizedTransferId = normalizeTransferId(transferId);
  if (!Number.isSafeInteger(normalizedAmount) || normalizedAmount < MIN_INTERNAL_TRANSFER_POINTS || !normalizedTransferId) {
    return { statusCode: 400, body: { ok: false, code: 'INVALID_INTERNAL_TRANSFER' } };
  }

  const nowDate = new Date(now);
  const existingPlayer = await Player.findOne({ playerId }).lean();
  if (!existingPlayer) return { statusCode: 404, body: { ok: false, code: 'PLAYER_NOT_FOUND' } };
  if (existingPlayer.botStatus === 'smart_ban') return { statusCode: 403, body: { ok: false, code: 'BOT_BLOCKED' } };
  if ((existingPlayer.processedInternalTransferIds || []).includes(normalizedTransferId)) {
    return {
      statusCode: 200,
      body: {
        ok: true,
        duplicate: true,
        transferId: normalizedTransferId,
        score: Math.max(0, Number(existingPlayer.authoritativeScore || 0)),
        walletBalance: Math.max(0, Number(existingPlayer.walletBalance || 0))
      }
    };
  }

  const revision = Number(existingPlayer.internalTransferRevision || 0);
  const updateResult = await Player.updateOne(
    {
      playerId,
      internalTransferRevision: revision === 0 ? { $in: [0, null] } : revision,
      authoritativeScore: { $gte: normalizedAmount },
      processedInternalTransferIds: { $ne: normalizedTransferId }
    },
    {
      $inc: {
        internalTransferRevision: 1,
        authoritativeScore: -normalizedAmount,
        walletBalance: normalizedAmount
      },
      $set: { updatedAt: nowDate },
      $push: {
        processedInternalTransferIds: {
          $each: [normalizedTransferId],
          $slice: -MAX_PROCESSED_TRANSFER_IDS
        }
      }
    }
  );

  if (updateResult.modifiedCount !== 1) {
    const current = await Player.findOne({ playerId }).lean();
    if (current && (current.processedInternalTransferIds || []).includes(normalizedTransferId)) {
      return {
        statusCode: 200,
        body: {
          ok: true,
          duplicate: true,
          transferId: normalizedTransferId,
          score: Math.max(0, Number(current.authoritativeScore || 0)),
          walletBalance: Math.max(0, Number(current.walletBalance || 0))
        }
      };
    }
    const authoritativeScore = Math.max(0, Number(current?.authoritativeScore || 0));
    return {
      statusCode: 400,
      body: {
        ok: false,
        code: authoritativeScore < normalizedAmount ? 'INSUFFICIENT_SCORE' : 'INTERNAL_TRANSFER_CONFLICT',
        authoritativeScore
      }
    };
  }

  const updated = await Player.findOne({ playerId }).lean();
  try {
    await WalletTx.create({
      txType: 'withdraw_game',
      playerId,
      amount: normalizedAmount,
      status: 'success',
      reason: 'internal_wallet_transfer',
      txHash: normalizedTransferId
    });
  } catch (error) {
    console.error('[internal-wallet] transaction log failed', error);
  }

  return {
    statusCode: 200,
    body: {
      ok: true,
      duplicate: false,
      transferId: normalizedTransferId,
      pointsTransferred: normalizedAmount,
      score: Math.max(0, Number(updated.authoritativeScore || 0)),
      walletBalance: Math.max(0, Number(updated.walletBalance || 0))
    }
  };
}

module.exports = { createTransferId, transferPointsToInternalWallet, MIN_INTERNAL_TRANSFER_POINTS };
