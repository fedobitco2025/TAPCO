require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');

const { db } = require('./db');
const {
  isValidEthAddress,
  normalizePlayerId,
  normalizeWalletAddress,
  toSafeInt,
  computeClientSignature,
  isTimestampFresh
} = require('./security');
const {
  analyzeBotReport,
  checkBanStatus,
  getPlayerBotTier,
  getServerBotState,
  applyPointPenalty,
  applyEnergyPenalty,
  canPlayerActivateReferral,
  canPlayerPerformWalletOp,
  logAntiBotAction
} = require('./anti-bot');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const WITHDRAW_MIN_AMOUNT = Number(process.env.WITHDRAW_MIN_AMOUNT || 100);
const TIMESTAMP_WINDOW_MS = Number(process.env.TIMESTAMP_WINDOW_MS || 5 * 60 * 1000);
const DAILY_WITHDRAW_LIMIT = Number(process.env.DAILY_WITHDRAW_LIMIT || 5000);
const WEEKLY_WITHDRAW_LIMIT = Number(process.env.WEEKLY_WITHDRAW_LIMIT || 20000);
const INITIAL_PLAYER_BALANCE = Number(process.env.INITIAL_PLAYER_BALANCE || 30000);
const WITHDRAW_IP_WINDOW_MS = Number(process.env.WITHDRAW_IP_WINDOW_MS || 60_000);
const WITHDRAW_IP_MAX_REQUESTS = Number(process.env.WITHDRAW_IP_MAX_REQUESTS || 10);
const WITHDRAW_PLAYER_WINDOW_MS = Number(process.env.WITHDRAW_PLAYER_WINDOW_MS || 10 * 60 * 1000);
const WITHDRAW_PLAYER_MAX_REQUESTS = Number(process.env.WITHDRAW_PLAYER_MAX_REQUESTS || 3);

app.use(cors({ origin: true }));
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.resolve(__dirname, '..')));
app.set('trust proxy', 1);

const findPlayerStmt = db.prepare('SELECT id, tapcoBalance, createdAt, updatedAt FROM players WHERE id = ?');
const createPlayerStmt = db.prepare('INSERT INTO players (id, tapcoBalance, createdAt, updatedAt) VALUES (?, ?, ?, ?)');
const updatePlayerBalanceStmt = db.prepare('UPDATE players SET tapcoBalance = ?, updatedAt = ? WHERE id = ?');

const sumWithdrawByPlayerStmt = db.prepare(`
  SELECT COALESCE(SUM(amount), 0) AS total
  FROM withdraw_requests
  WHERE playerId = ?
    AND status IN ('pending', 'processing', 'completed')
    AND createdAt >= ?
`);

const insertWithdrawRequestStmt = db.prepare(`
  INSERT INTO withdraw_requests (
    playerId, amount, walletAddress, chainId, status, txHash,
    clientSignature, requestedAt, createdAt, updatedAt, failureReason
  ) VALUES (
    @playerId, @amount, @walletAddress, @chainId, @status, @txHash,
    @clientSignature, @requestedAt, @createdAt, @updatedAt, @failureReason
  )
`);

const withdrawBySignatureStmt = db.prepare(`
  SELECT id, status, playerId, amount, walletAddress, chainId, txHash, createdAt, updatedAt
  FROM withdraw_requests
  WHERE clientSignature = ?
`);

const listWithdrawByPlayerStmt = db.prepare(`
  SELECT id, amount, walletAddress, chainId, status, txHash, createdAt, updatedAt, failureReason
  FROM withdraw_requests
  WHERE playerId = ?
  ORDER BY id DESC
  LIMIT ?
`);

const countRecentWithdrawRequestsByPlayerStmt = db.prepare(`
  SELECT COUNT(*) AS total
  FROM withdraw_requests
  WHERE playerId = ?
    AND createdAt >= ?
`);

const selectRateLimitAnchorRequestStmt = db.prepare(`
  SELECT createdAt
  FROM withdraw_requests
  WHERE playerId = ?
    AND createdAt >= ?
  ORDER BY createdAt ASC
  LIMIT 1 OFFSET ?
`);

const ipWithdrawLimiter = rateLimit({
  windowMs: WITHDRAW_IP_WINDOW_MS,
  max: WITHDRAW_IP_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const now = Date.now();
    const resetTime = req.rateLimit?.resetTime instanceof Date
      ? req.rateLimit.resetTime.getTime()
      : now + WITHDRAW_IP_WINDOW_MS;
    const retryAfterSeconds = Math.max(1, Math.ceil((resetTime - now) / 1000));
    res.setHeader('Retry-After', String(retryAfterSeconds));

    return res.status(429).json({
      ok: false,
      code: 'RATE_LIMITED',
      scope: 'ip',
      retryAfterSeconds,
      retryAt: new Date(now + (retryAfterSeconds * 1000)).toISOString(),
      limit: {
        max: WITHDRAW_IP_MAX_REQUESTS,
        windowMs: WITHDRAW_IP_WINDOW_MS
      },
      message: 'عدد كبير من الطلبات من نفس IP، حاول بعد قليل'
    });
  }
});

function ensurePlayer(playerId) {
  const existing = findPlayerStmt.get(playerId);
  if (existing) return existing;

  const now = Date.now();
  createPlayerStmt.run(playerId, INITIAL_PLAYER_BALANCE, now, now);
  return findPlayerStmt.get(playerId);
}

function getPeriodStartMs(days) {
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

function validateWithdrawRequestBody(body) {
  const playerId = normalizePlayerId(body.playerId);
  const tapcoAmount = toSafeInt(body.tapcoAmount);
  const walletAddress = normalizeWalletAddress(body.walletAddress);
  const timestamp = toSafeInt(body.timestamp);
  const chainId = body.chainId ? String(body.chainId).trim() : '';
  const clientSignature = String(body.clientSignature || '').trim();

  if (!playerId) {
    return { ok: false, message: 'playerId مطلوب' };
  }

  if (tapcoAmount === null) {
    return { ok: false, message: 'tapcoAmount يجب أن يكون رقمًا صحيحًا' };
  }

  if (tapcoAmount < WITHDRAW_MIN_AMOUNT) {
    return { ok: false, message: `الحد الأدنى للسحب هو ${WITHDRAW_MIN_AMOUNT} TAPCO` };
  }

  if (!isValidEthAddress(walletAddress)) {
    return { ok: false, message: 'عنوان المحفظة غير صالح' };
  }

  if (!isTimestampFresh(timestamp, TIMESTAMP_WINDOW_MS)) {
    return { ok: false, message: 'الطلب منتهي الصلاحية أو غير متزامن زمنياً' };
  }

  const expectedSignature = computeClientSignature({
    playerId,
    tapcoAmount,
    walletAddress,
    timestamp
  });

  if (!clientSignature || clientSignature !== expectedSignature) {
    return { ok: false, message: 'clientSignature غير صحيحة' };
  }

  return {
    ok: true,
    data: {
      playerId,
      tapcoAmount,
      walletAddress,
      timestamp,
      chainId,
      clientSignature
    }
  };
}

const createWithdrawTransaction = db.transaction((payload) => {
  const player = ensurePlayer(payload.playerId);

  if (!player) {
    return { ok: false, message: 'اللاعب غير موجود' };
  }

  if (player.tapcoBalance < payload.tapcoAmount) {
    return { ok: false, message: 'رصيد غير كافٍ' };
  }

  const dailyUsed = sumWithdrawByPlayerStmt.get(payload.playerId, getPeriodStartMs(1)).total;
  if (dailyUsed + payload.tapcoAmount > DAILY_WITHDRAW_LIMIT) {
    return { ok: false, message: 'تم تجاوز الحد اليومي للسحب' };
  }

  const weeklyUsed = sumWithdrawByPlayerStmt.get(payload.playerId, getPeriodStartMs(7)).total;
  if (weeklyUsed + payload.tapcoAmount > WEEKLY_WITHDRAW_LIMIT) {
    return { ok: false, message: 'تم تجاوز الحد الأسبوعي للسحب' };
  }

  const now = Date.now();
  const newBalance = player.tapcoBalance - payload.tapcoAmount;

  updatePlayerBalanceStmt.run(newBalance, now, player.id);

  const result = insertWithdrawRequestStmt.run({
    playerId: payload.playerId,
    amount: payload.tapcoAmount,
    walletAddress: payload.walletAddress,
    chainId: payload.chainId || null,
    status: 'pending',
    txHash: null,
    clientSignature: payload.clientSignature,
    requestedAt: payload.timestamp,
    createdAt: now,
    updatedAt: now,
    failureReason: null
  });

  return {
    ok: true,
    requestId: result.lastInsertRowid,
    status: 'pending',
    message: 'تم تسجيل طلب السحب بنجاح'
  };
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, message: 'TAPCO API healthy' });
});

app.post('/api/report-bot', (req, res) => {
  try {
    const playerId = normalizePlayerId(req.body?.playerId);
    const sessionId = String(req.body?.sessionId || '').trim();
    const botTier = String(req.body?.botTier || '').trim();
    const suspicionScore = toSafeInt(req.body?.suspicionScore);
    const tps = toSafeInt(req.body?.tps);
    const patternStdDev = Number(req.body?.patternStdDev) || 0;
    const deviceFingerprint = String(req.body?.deviceFingerprint || '').trim();
    const ipHash = String(req.body?.ipHash || '').trim();
    const timestamp = toSafeInt(req.body?.timestamp);

    // Validate required fields
    if (!playerId || !deviceFingerprint || !ipHash) {
      return res.status(400).json({
        ok: false,
        message: 'playerId, deviceFingerprint, and ipHash are required'
      });
    }

    // Validate timestamp freshness
    if (!isTimestampFresh(timestamp, TIMESTAMP_WINDOW_MS)) {
      return res.status(400).json({
        ok: false,
        message: 'الطلب منتهي الصلاحية أو غير متزامن زمنياً'
      });
    }

    // Check if player is already banned
    const banStatus = checkBanStatus(playerId, deviceFingerprint, ipHash);
    if (banStatus.isBanned && banStatus.banStatus === 'smart_ban') {
      return res.status(403).json({
        ok: false,
        message: 'هذا الحساب محظور نهائياً'
      });
    }

    // Analyze the report
    const result = analyzeBotReport(playerId, {
      sessionId,
      botTier,
      suspicionScore,
      tps,
      patternStdDev,
      deviceFingerprint,
      ipHash,
      timestamp
    });

    if (!result.ok) {
      return res.status(400).json(result);
    }

    return res.json({
      ok: true,
      playerId,
      banStatus: result.banStatus,
      evidenceScore: result.evidenceScore,
      action: result.action,
      message: result.message
    });
  } catch (error) {
    console.error('[report-bot]', error);
    return res.status(500).json({ ok: false, message: 'خطأ داخلي في السيرفر' });
  }
});

app.get('/api/player-ban-status', (req, res) => {
  try {
    const playerId = normalizePlayerId(req.query.playerId);
    const deviceFingerprint = String(req.query.deviceFingerprint || '').trim();
    const ipHash = String(req.query.ipHash || '').trim();

    if (!playerId) {
      return res.status(400).json({ ok: false, message: 'playerId مطلوب' });
    }

    const banStatus = checkBanStatus(playerId, deviceFingerprint, ipHash);

    return res.json({
      ok: true,
      playerId,
      banStatus: banStatus.banStatus,
      isBanned: banStatus.isBanned,
      canWithdraw: banStatus.canWithdraw,
      canReceiveRewards: banStatus.canReceiveRewards,
      message: banStatus.reason
    });
  } catch (error) {
    console.error('[player-ban-status]', error);
    return res.status(500).json({ ok: false, message: 'خطأ داخلي في السيرفر' });
  }
});

app.get('/api/player-bot-state', (req, res) => {
  try {
    const playerId = normalizePlayerId(req.query.playerId);

    if (!playerId) {
      return res.status(400).json({ ok: false, message: 'playerId مطلوب' });
    }

    const botState = getServerBotState(playerId);

    return res.json({
      ok: true,
      ...botState
    });
  } catch (error) {
    console.error('[player-bot-state]', error);
    return res.status(500).json({ ok: false, message: 'خطأ داخلي في السيرفر' });
  }
});

app.post('/api/verify-points', (req, res) => {
  try {
    const playerId = normalizePlayerId(req.body?.playerId);
    const basePoints = toSafeInt(req.body?.basePoints);
    const operation = String(req.body?.operation || '').trim();

    if (!playerId || basePoints === null || basePoints <= 0) {
      return res.status(400).json({ ok: false, message: 'بيانات غير صحيحة' });
    }

    const botState = getServerBotState(playerId);
    const penaltyResult = applyPointPenalty(basePoints, botState.botTier);

    logAntiBotAction(playerId, 'points-penalty', {
      operation,
      basePoints,
      finalPoints: penaltyResult.finalPoints,
      penaltyPercent: penaltyResult.penaltyPercent,
      tier: botState.botTier
    });

    return res.json({
      ok: true,
      playerId,
      ...penaltyResult,
      botState: {
        tier: botState.botTier,
        banStatus: botState.banStatus
      }
    });
  } catch (error) {
    console.error('[verify-points]', error);
    return res.status(500).json({ ok: false, message: 'خطأ داخلي في السيرفر' });
  }
});

app.post('/api/verify-energy', (req, res) => {
  try {
    const playerId = normalizePlayerId(req.body?.playerId);
    const baseCost = toSafeInt(req.body?.baseCost);
    const operation = String(req.body?.operation || '').trim();

    if (!playerId || baseCost === null || baseCost <= 0) {
      return res.status(400).json({ ok: false, message: 'بيانات غير صحيحة' });
    }

    const botState = getServerBotState(playerId);
    const penaltyResult = applyEnergyPenalty(baseCost, botState.botTier);

    logAntiBotAction(playerId, 'energy-penalty', {
      operation,
      baseCost,
      finalCost: penaltyResult.finalCost,
      bonusPercent: penaltyResult.bonusPercent,
      tier: botState.botTier
    });

    return res.json({
      ok: true,
      playerId,
      ...penaltyResult,
      botState: {
        tier: botState.botTier,
        banStatus: botState.banStatus
      }
    });
  } catch (error) {
    console.error('[verify-energy]', error);
    return res.status(500).json({ ok: false, message: 'خطأ داخلي في السيرفر' });
  }
});

app.post('/api/verify-referral', (req, res) => {
  try {
    const playerId = normalizePlayerId(req.body?.playerId);

    if (!playerId) {
      return res.status(400).json({ ok: false, message: 'playerId مطلوب' });
    }

    const botState = getServerBotState(playerId);
    const canActivate = canPlayerActivateReferral(botState.botTier, botState.banStatus);

    logAntiBotAction(playerId, 'referral-check', {
      allowed: canActivate.allowed,
      tier: botState.botTier,
      banStatus: botState.banStatus
    });

    if (!canActivate.allowed) {
      return res.status(403).json({
        ok: false,
        message: canActivate.reason,
        canActivate: false
      });
    }

    return res.json({
      ok: true,
      playerId,
      canActivate: true,
      message: 'OK',
      botState: {
        tier: botState.botTier,
        banStatus: botState.banStatus
      }
    });
  } catch (error) {
    console.error('[verify-referral]', error);
    return res.status(500).json({ ok: false, message: 'خطأ داخلي في السيرفر' });
  }
});

app.post('/api/verify-wallet-op', (req, res) => {
  try {
    const playerId = normalizePlayerId(req.body?.playerId);
    const operation = String(req.body?.operation || 'withdraw').trim();

    if (!playerId) {
      return res.status(400).json({ ok: false, message: 'playerId مطلوب' });
    }

    const botState = getServerBotState(playerId);
    const canProceed = canPlayerPerformWalletOp(botState.botTier, botState.banStatus, operation);

    logAntiBotAction(playerId, 'wallet-op-check', {
      operation,
      allowed: canProceed.allowed,
      silent: canProceed.silent,
      tier: botState.botTier,
      banStatus: botState.banStatus
    });

    if (!canProceed.allowed) {
      return res.status(403).json({
        ok: false,
        message: canProceed.reason,
        allowed: false,
        silent: false
      });
    }

    return res.json({
      ok: true,
      playerId,
      allowed: true,
      silent: canProceed.silent,
      message: canProceed.reason,
      botState: {
        tier: botState.botTier,
        banStatus: botState.banStatus
      }
    });
  } catch (error) {
    console.error('[verify-wallet-op]', error);
    return res.status(500).json({ ok: false, message: 'خطأ داخلي في السيرفر' });
  }
});

app.get('/api/anti-bot-logs', (req, res) => {
  try {
    const playerId = normalizePlayerId(req.query.playerId);
    const limit = Math.min(toSafeInt(req.query.limit) || 100, 1000);

    if (!global.antiBotLogs) {
      return res.json({ ok: true, logs: [] });
    }

    let logs = global.antiBotLogs;
    if (playerId) {
      logs = logs.filter(log => log.playerId === playerId);
    }

    const result = logs.slice(-limit);

    return res.json({
      ok: true,
      count: result.length,
      logs: result
    });
  } catch (error) {
    console.error('[anti-bot-logs]', error);
    return res.status(500).json({ ok: false, message: 'خطأ داخلي في السيرفر' });
  }
});

function hashIpAddress(ip) {
  return crypto.createHash('sha256').update(ip).digest('hex').substring(0, 12);
}

app.post('/api/withdraw-tapco', ipWithdrawLimiter, (req, res) => {
  try {
    const validation = validateWithdrawRequestBody(req.body || {});
    if (!validation.ok) {
      return res.status(400).json({ ok: false, message: validation.message });
    }

    const playerId = validation.data.playerId;
    const deviceFingerprint = String(req.body?.deviceFingerprint || '').trim();
    const ipHash = req.body?.ipHash || hashIpAddress(req.ip || '');

    // Check ban status
    const botState = getServerBotState(playerId);
    const walletOpResult = canPlayerPerformWalletOp(botState.botTier, botState.banStatus, 'withdraw');

    logAntiBotAction(playerId, 'withdraw-attempt', {
      amount: validation.data.tapcoAmount,
      allowed: walletOpResult.allowed,
      silent: walletOpResult.silent,
      tier: botState.botTier,
      banStatus: botState.banStatus
    });

    if (!walletOpResult.allowed) {
      return res.status(403).json({
        ok: false,
        message: walletOpResult.reason
      });
    }

    // Shadow ban: pretend success but don't execute
    if (walletOpResult.silent) {
      return res.json({
        ok: true,
        requestId: Math.floor(Math.random() * 1000000),
        status: 'pending',
        message: 'تم تسجيل طلب السحب بنجاح',
        _shadowBanned: true
      });
    }

    const existing = withdrawBySignatureStmt.get(validation.data.clientSignature);
    if (existing) {
      return res.json({
        ok: true,
        requestId: existing.id,
        status: existing.status,
        message: 'تم استلام الطلب مسبقاً (idempotent)'
      });
    }

    const windowStartMs = Date.now() - WITHDRAW_PLAYER_WINDOW_MS;
    const now = Date.now();
    const recentCount = Number(countRecentWithdrawRequestsByPlayerStmt.get(playerId, windowStartMs).total || 0);
    if (recentCount >= WITHDRAW_PLAYER_MAX_REQUESTS) {
      const anchorOffset = Math.max(0, recentCount - WITHDRAW_PLAYER_MAX_REQUESTS);
      const anchor = selectRateLimitAnchorRequestStmt.get(playerId, windowStartMs, anchorOffset);
      const anchorCreatedAt = Number(anchor?.createdAt || now);
      const retryAfterMs = Math.max(1_000, (anchorCreatedAt + WITHDRAW_PLAYER_WINDOW_MS) - now);
      const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));

      return res.status(429).json({
        ok: false,
        code: 'RATE_LIMITED',
        scope: 'player',
        retryAfterSeconds,
        retryAt: new Date(now + (retryAfterSeconds * 1000)).toISOString(),
        limit: {
          max: WITHDRAW_PLAYER_MAX_REQUESTS,
          windowMs: WITHDRAW_PLAYER_WINDOW_MS,
          currentCount: recentCount
        },
        message: 'لقد تجاوزت الحد المسموح لطلبات السحب، حاول لاحقاً'
      });
    }

    const result = createWithdrawTransaction(validation.data);

    if (!result.ok) {
      return res.status(400).json(result);
    }

    return res.json(result);
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'خطأ داخلي في السيرفر' });
  }
});

app.get('/api/withdraw-status', (req, res) => {
  try {
    const playerId = normalizePlayerId(req.query.playerId);
    const limitValue = toSafeInt(req.query.limit);
    const limit = Math.min(Math.max(limitValue || 50, 1), 200);

    if (!playerId) {
      return res.status(400).json({ ok: false, message: 'playerId مطلوب' });
    }

    const requests = listWithdrawByPlayerStmt.all(playerId, limit);
    const formatted = requests.map((request) => ({
      id: request.id,
      amount: request.amount,
      type: 'TAPCO',
      walletAddress: request.walletAddress,
      status: request.status,
      txHash: request.txHash,
      chainId: request.chainId,
      failureReason: request.failureReason,
      createdAt: new Date(request.createdAt).toISOString(),
      updatedAt: new Date(request.updatedAt).toISOString()
    }));

    return res.json({ ok: true, playerId, requests: formatted });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'خطأ داخلي في السيرفر' });
  }
});

app.get('/api/player-balance', (req, res) => {
  try {
    const playerId = normalizePlayerId(req.query.playerId);
    const deviceFingerprint = String(req.query.deviceFingerprint || '').trim();
    const ipHash = req.query.ipHash || hashIpAddress(req.ip || '');

    if (!playerId) {
      return res.status(400).json({ ok: false, message: 'playerId مطلوب' });
    }

    // Check ban status
    const banStatus = checkBanStatus(playerId, deviceFingerprint, ipHash);
    if (banStatus.isBanned) {
      if (banStatus.banStatus === 'shadow_ban') {
        // Shadow banned players see 0 balance
        return res.json({
          ok: true,
          playerId: playerId,
          tapcoBalance: 0,
          shadowBanned: true
        });
      }
      if (banStatus.banStatus === 'smart_ban' || banStatus.banStatus === 'device_locked') {
        return res.status(403).json({
          ok: false,
          message: banStatus.reason
        });
      }
    }

    const player = ensurePlayer(playerId);
    return res.json({ ok: true, playerId: player.id, tapcoBalance: player.tapcoBalance });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'خطأ داخلي في السيرفر' });
  }
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`TAPCO API running on http://localhost:${PORT}`);
});
