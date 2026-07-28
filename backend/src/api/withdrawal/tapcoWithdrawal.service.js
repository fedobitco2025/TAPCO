const crypto = require('crypto');
const envConfig = require('../../config/env');
const Player = require('../../models/player.model');
const WithdrawRequest = require('../../models/withdrawRequest.model');

const ACTIVE_STATUSES = ['pending', 'processing', 'refunding'];
const CHARGEABLE_STATUSES = ['pending', 'processing', 'completed'];

function result(statusCode, body, headers = {}) {
  return { statusCode, headers, body };
}

function buildRequestFingerprint({ playerId, tapcoAmount, walletAddress, timestamp }) {
  return crypto.createHash('sha256').update([
    playerId,
    String(tapcoAmount),
    walletAddress,
    String(timestamp)
  ].join('|')).digest('hex');
}

async function submitTapcoWithdrawal({ playerId, tapcoAmount, walletAddress, timestamp, chainId }) {
  const player = await Player.findOne({ playerId }).lean();
  if (player?.botStatus === 'smart_ban') {
    return result(403, { ok: false, message: 'حسابك محظور - لا يمكن إجراء هذه العملية' });
  }
  if (player?.botStatus === 'shadow_ban') {
    return result(200, {
      ok: true,
      requestId: crypto.randomUUID(),
      status: 'pending',
      message: 'تم تسجيل طلب السحب بنجاح',
      _shadowBanned: true
    });
  }

  const requestFingerprint = buildRequestFingerprint({ playerId, tapcoAmount, walletAddress, timestamp });
  const existing = await WithdrawRequest.findOne({ clientSignature: requestFingerprint }).lean();
  if (existing) {
    return result(200, {
      ok: true,
      requestId: String(existing._id),
      status: existing.status,
      message: 'تم استلام الطلب مسبقاً (idempotent)'
    });
  }

  const activeRequest = await WithdrawRequest.findOne({
    playerId,
    status: { $in: ACTIVE_STATUSES }
  }).lean();
  if (activeRequest) {
    return result(409, {
      ok: false,
      code: 'ACTIVE_WITHDRAWAL_EXISTS',
      requestId: String(activeRequest._id),
      status: activeRequest.status,
      message: 'يوجد طلب سحب قيد المعالجة بالفعل'
    });
  }

  const now = Date.now();
  const windowStart = new Date(now - envConfig.WITHDRAW_PLAYER_WINDOW_MS);
  const recentCount = await WithdrawRequest.countDocuments({ playerId, createdAt: { $gte: windowStart } });
  if (recentCount >= envConfig.WITHDRAW_PLAYER_MAX_REQUESTS) {
    const retryAfterSeconds = Math.ceil(envConfig.WITHDRAW_PLAYER_WINDOW_MS / 1000);
    return result(429, {
      ok: false,
      code: 'RATE_LIMITED',
      scope: 'player',
      retryAfterSeconds,
      retryAt: new Date(now + envConfig.WITHDRAW_PLAYER_WINDOW_MS).toISOString(),
      limit: {
        max: envConfig.WITHDRAW_PLAYER_MAX_REQUESTS,
        windowMs: envConfig.WITHDRAW_PLAYER_WINDOW_MS,
        currentCount: recentCount
      },
      message: 'لقد تجاوزت الحد المسموح لطلبات السحب، حاول لاحقاً'
    }, { 'Retry-After': String(retryAfterSeconds) });
  }

  const dayAgo = new Date(now - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const [dailyAgg, weeklyAgg] = await Promise.all([
    WithdrawRequest.aggregate([
      { $match: { playerId, status: { $in: CHARGEABLE_STATUSES }, createdAt: { $gte: dayAgo } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]),
    WithdrawRequest.aggregate([
      { $match: { playerId, status: { $in: CHARGEABLE_STATUSES }, createdAt: { $gte: weekAgo } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ])
  ]);
  const dailyUsed = dailyAgg[0]?.total || 0;
  const weeklyUsed = weeklyAgg[0]?.total || 0;
  if (dailyUsed + tapcoAmount > envConfig.DAILY_WITHDRAW_LIMIT) {
    return result(400, { ok: false, message: 'تم تجاوز الحد اليومي للسحب' });
  }
  if (weeklyUsed + tapcoAmount > envConfig.WEEKLY_WITHDRAW_LIMIT) {
    return result(400, { ok: false, message: 'تم تجاوز الحد الأسبوعي للسحب' });
  }

  const activeRequestKey = playerId;
  const reservationId = crypto.randomUUID();
  const reservedPlayer = await Player.findOneAndUpdate(
    { playerId, tapcoBalance: { $gte: tapcoAmount } },
    { $inc: { tapcoBalance: -tapcoAmount }, $set: { updatedAt: new Date() } },
    { new: true }
  );
  if (!reservedPlayer) {
    return result(400, { ok: false, code: 'INSUFFICIENT_BALANCE', message: 'رصيد غير كافٍ' });
  }

  try {
    const request = await WithdrawRequest.create({
      playerId,
      amount: tapcoAmount,
      walletAddress,
      chainId,
      status: 'pending',
      clientSignature: requestFingerprint,
      activeRequestKey,
      reservationId,
      requestedAt: timestamp
    });
    return result(200, {
      ok: true,
      requestId: String(request._id),
      status: 'pending',
      message: 'تم تسجيل طلب السحب بنجاح'
    });
  } catch (createError) {
    let committedRequest;
    let competingRequest;
    try {
      [committedRequest, competingRequest] = await Promise.all([
        WithdrawRequest.findOne({ reservationId }).lean(),
        WithdrawRequest.findOne({
          $or: [{ clientSignature: requestFingerprint }, { activeRequestKey }]
        }).lean()
      ]);
    } catch (reconciliationError) {
      console.error('[withdrawal-service] request reconciliation failed; reservation retained', reconciliationError);
      return result(503, {
        ok: false,
        code: 'WITHDRAWAL_RECONCILIATION_REQUIRED',
        message: 'تعذر تأكيد حالة طلب السحب مؤقتاً، يرجى المحاولة لاحقاً'
      });
    }

    if (committedRequest) {
      return result(200, {
        ok: true,
        requestId: String(committedRequest._id),
        status: committedRequest.status,
        message: 'تم تسجيل طلب السحب بنجاح'
      });
    }

    await Player.updateOne(
      { playerId },
      { $inc: { tapcoBalance: tapcoAmount }, $set: { updatedAt: new Date() } }
    );

    if (competingRequest) {
      if (competingRequest.clientSignature === requestFingerprint) {
        return result(200, {
          ok: true,
          requestId: String(competingRequest._id),
          status: competingRequest.status,
          message: 'تم استلام الطلب مسبقاً (idempotent)'
        });
      }
      return result(409, {
        ok: false,
        code: 'ACTIVE_WITHDRAWAL_EXISTS',
        requestId: String(competingRequest._id),
        status: competingRequest.status,
        message: 'يوجد طلب سحب قيد المعالجة بالفعل'
      });
    }
    throw createError;
  }
}

module.exports = {
  buildRequestFingerprint,
  submitTapcoWithdrawal
};