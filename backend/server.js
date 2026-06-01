const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const crypto = require('crypto');
require('dotenv').config();

const { connectDatabase } = require('./src/core/database');
const referralRoutes = require('./src/api/referral/referral.routes');
const antiBotRoutes = require('./src/api/antibot/antibot.routes');
const walletRoutes = require('./src/api/wallet/wallet.routes');
const playerRoutes = require('./src/api/player/player.routes');
const { securityGuard, unityAccessGuard } = require('./src/middleware/security.middleware');
const { userRateLimit, ipThrottle } = require('./src/middleware/rateLimit.middleware');
const { normalizeApiResponse } = require('./src/middleware/response.middleware');
const {
  checkBruteForce,
  checkIpReputation,
  require2FA,
  detectLocationAnomaly,
  verifyHighRiskOperation,
  validateWithdrawalSecurity,
  validateEnhancedSignature,
  withdrawalRateLimit,
  logSensitiveRequest
} = require('./src/middleware/sensitiveOps.middleware');
const { getBalance, sendTokens, getPlayerBalance } = require('./src/blockchain/client');
const Player = require('./src/models/player.model');
const WithdrawRequest = require('./src/models/withdrawRequest.model');
const {
  normalizePlayerId,
  isValidEthAddress,
  normalizeWalletAddress,
  toSafeInt,
  computeClientSignature,
  isTimestampFresh
} = require('./src/core/security');
const evidenceEngine = require('./src/api/antibot/antibot.evidence');
const envConfig = require('./src/config/env');

const app = express();

const corsOrigins = envConfig.CORS_ORIGINS;
const isProd = envConfig.IS_PRODUCTION;
const telegramBetaGateEnabled = !!envConfig.TELEGRAM_BETA_GATE_ENABLED;
const telegramBetaAllowlist = new Set((envConfig.TELEGRAM_BETA_ALLOWLIST || []).map((v) => String(v).trim()));
const telegramBetaBlockMessage = String(envConfig.TELEGRAM_BETA_BLOCK_MESSAGE || 'Closed beta access only').trim();

function getTelegramUserIdFromRequest(req) {
  const headerId = req.headers['x-telegram-user-id'];
  const bodyId = req.body && req.body.telegramUserId;
  const queryId = req.query && req.query.telegramUserId;
  let raw = headerId || bodyId || queryId || '';

  if (!raw) {
    const hintedPlayerId = String((req.body && req.body.playerId) || (req.query && req.query.playerId) || '').trim();
    const tgPlayerMatch = hintedPlayerId.match(/^TG_(\d{5,20})$/i);
    if (tgPlayerMatch) {
      raw = tgPlayerMatch[1];
    }
  }

  return String(raw).trim();
}

function telegramClosedBetaGuard(req, res, next) {
  if (!telegramBetaGateEnabled) return next();

  if (telegramBetaAllowlist.size === 0) {
    return res.status(503).json({
      success: false,
      reason: 'telegram_beta_misconfigured',
      message: 'Closed beta gate enabled but allowlist is empty.'
    });
  }

  const telegramUserId = getTelegramUserIdFromRequest(req);
  if (!telegramUserId) {
    return res.status(403).json({
      success: false,
      reason: 'telegram_identity_required',
      message: telegramBetaBlockMessage
    });
  }

  if (!telegramBetaAllowlist.has(telegramUserId)) {
    return res.status(403).json({
      success: false,
      reason: 'telegram_user_not_allowed',
      message: telegramBetaBlockMessage
    });
  }

  req.telegramUserId = telegramUserId;
  return next();
}

function resolveCanonicalPlayerId(req, fallbackPlayerId) {
  const telegramUserId = String((req && req.telegramUserId) || getTelegramUserIdFromRequest(req) || '').trim();
  if (telegramUserId) {
    return `TG_${telegramUserId}`;
  }
  return normalizePlayerId(fallbackPlayerId);
}

function getRequestTelegramUserId(req) {
  return String((req && req.telegramUserId) || getTelegramUserIdFromRequest(req) || '').trim();
}

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (corsOrigins.length === 0) {
      return callback(null, true);
    }
    if (corsOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('CORS origin denied'));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Telegram-User-Id', 'X-Telegram-Client'],
  credentials: false,
  maxAge: 86400
};

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '100kb' }));
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(helmet());
app.use(morgan('dev'));
app.use('/api', normalizeApiResponse);
app.use('/api', userRateLimit, ipThrottle);
app.use((err, _req, res, next) => {
  if (err && String(err.message || '').includes('CORS origin denied')) {
    return res.status(403).json({ success: false, reason: 'cors_forbidden' });
  }
  return next(err);
});

if (isProd && corsOrigins.length === 0) {
  console.warn('[CORS] CORS_ORIGINS is empty in production; allowing all origins as fallback.');
}

app.use(['/api', '/wallet', '/player'], telegramClosedBetaGuard);

const PORT = process.env.PORT || 4000;

async function handleBlockchainWithdraw(req, res) {
  try {
    const { toAddress, amount } = req.body;

    if (!toAddress) {
      return res.status(400).json({ 
        success: false, 
        reason: 'missing_address',
        message: 'toAddress is required' 
      });
    }

    if (!amount) {
      return res.status(400).json({ 
        success: false, 
        reason: 'missing_amount',
        message: 'amount is required' 
      });
    }

    const result = await sendTokens(toAddress, amount);

    if (!result.success) {
      return res.status(400).json({ 
        success: false, 
        reason: 'transaction_failed',
        message: result.error 
      });
    }

    return res.json({
      success: true,
      toAddress: result.toAddress,
      amount: result.amount,
      txHash: result.txHash,
      blockNumber: result.blockNumber
    });
  } catch (err) {
    console.error('POST withdraw error:', err);
    return res.status(500).json({ 
      success: false, 
      reason: 'server_error' 
    });
  }
}

app.get('/', (req, res) => {
  res.json({ status: 'OK', message: 'Backend is running' });
});

// SECURITY: Removed /blockchain/balance, /blockchain/withdraw, /wallet/withdraw, /wallet/player-balance
// These unauthenticated endpoints posed security risks. Use /api/verify-* endpoints with signature auth instead.

// ── Compat constants ──────────────────────────────────────────────────────────
const COMPAT_TIMESTAMP_WINDOW_MS = envConfig.TIMESTAMP_WINDOW_MS;
const COMPAT_WITHDRAW_MIN_AMOUNT = envConfig.WITHDRAW_MIN_AMOUNT;
const COMPAT_DAILY_WITHDRAW_LIMIT = envConfig.DAILY_WITHDRAW_LIMIT;
const COMPAT_WEEKLY_WITHDRAW_LIMIT = envConfig.WEEKLY_WITHDRAW_LIMIT;
const COMPAT_WITHDRAW_PLAYER_WINDOW_MS = envConfig.WITHDRAW_PLAYER_WINDOW_MS;
const COMPAT_WITHDRAW_PLAYER_MAX_REQUESTS = envConfig.WITHDRAW_PLAYER_MAX_REQUESTS;
const COMPAT_INITIAL_PLAYER_BALANCE = envConfig.INITIAL_PLAYER_BALANCE;

// ── Compat helpers ────────────────────────────────────────────────────────────
function getBotTierFromScore(evidenceScore) {
  if (evidenceScore >= 16) return 'C';
  if (evidenceScore >= 11) return 'B';
  return 'A';
}

async function getPlayerBotState(playerId) {
  const player = await Player.findOne({ playerId }).lean();
  if (!player) {
    return { playerId, serverBotScore: 0, botTier: 'A', banStatus: 'none', reportCount: 0 };
  }
  const evidenceScore = player.evidenceScore || 0;
  return {
    playerId,
    serverBotScore: evidenceScore,
    botTier: getBotTierFromScore(evidenceScore),
    banStatus: player.botStatus || 'none',
    reportCount: 0
  };
}

function applyPointPenalty(basePoints, botTier) {
  const map = { A: { percent: 0, factor: 1.0 }, B: { percent: 10, factor: 0.9 }, C: { percent: 40, factor: 0.6 } };
  const p = map[botTier] || map.A;
  return { basePoints, penaltyPercent: p.percent, finalPoints: Math.floor(basePoints * p.factor), tier: botTier };
}

function applyEnergyPenalty(baseCost, botTier) {
  const map = { A: { percent: 0, factor: 1.0 }, B: { percent: 0, factor: 1.0 }, C: { percent: 15, factor: 1.15 } };
  const b = map[botTier] || map.A;
  return { baseCost, bonusPercent: b.percent, finalCost: Math.ceil(baseCost * b.factor), tier: botTier };
}

function canPlayerActivateReferral(botTier, banStatus) {
  if (banStatus === 'shadow_ban' || banStatus === 'smart_ban') {
    return { allowed: false, reason: 'حسابك محظور - لا يمكن تفعيل الإحالات' };
  }
  if (botTier === 'C') {
    return { allowed: false, reason: 'حسابك تحت المراقبة - لا يمكن تفعيل الإحالات الآن' };
  }
  return { allowed: true, reason: 'OK' };
}

function canPlayerPerformWalletOp(botTier, banStatus) {
  if (banStatus === 'smart_ban') {
    return { allowed: false, silent: false, reason: 'حسابك محظور - لا يمكن إجراء هذه العملية' };
  }
  if (banStatus === 'shadow_ban') {
    return { allowed: true, silent: true, reason: 'تم معالجة الطلب (shadow)' };
  }
  return { allowed: true, silent: false, reason: 'OK' };
}

async function ensurePlayerInDb(playerId, telegramUserId = '') {
  const normalizedTelegramUserId = String(telegramUserId || '').trim();

  let player = await Player.findOne({ playerId });
  if (player) {
    if (normalizedTelegramUserId && String(player.telegramUserId || '').trim() !== normalizedTelegramUserId) {
      player.telegramUserId = normalizedTelegramUserId;
      await player.save();
    }
    return player;
  }

  if (normalizedTelegramUserId) {
    const playerByTelegramId = await Player.findOne({ telegramUserId: normalizedTelegramUserId });
    if (playerByTelegramId) {
      if (String(playerByTelegramId.playerId || '').trim() !== playerId) {
        playerByTelegramId.playerId = playerId;
      }
      if (String(playerByTelegramId.telegramUserId || '').trim() !== normalizedTelegramUserId) {
        playerByTelegramId.telegramUserId = normalizedTelegramUserId;
      }
      await playerByTelegramId.save();
      return playerByTelegramId;
    }
  }

  player = await Player.create({
    playerId,
    telegramUserId: normalizedTelegramUserId,
    tapcoBalance: COMPAT_INITIAL_PLAYER_BALANCE
  });
  return player;
}

const _ipWithdrawMap = new Map();
function checkIpWithdrawLimit(ip) {
  const now = Date.now();
  const windowMs = envConfig.WITHDRAW_IP_WINDOW_MS;
  const maxReq = envConfig.WITHDRAW_IP_MAX_REQUESTS;
  const entry = _ipWithdrawMap.get(ip) || { count: 0, windowStart: now };
  if (now - entry.windowStart > windowMs) {
    entry.count = 1;
    entry.windowStart = now;
  } else {
    entry.count += 1;
  }
  _ipWithdrawMap.set(ip, entry);
  const retryAfterMs = Math.max(1000, (entry.windowStart + windowMs) - now);
  return {
    allowed: entry.count <= maxReq,
    retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
    retryAt: new Date(now + retryAfterMs).toISOString(),
    max: maxReq,
    windowMs
  };
}

// ── GET /api/health ──────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, message: 'TAPCO API healthy' });
});

// ── POST /api/report-bot ─────────────────────────────────────────────────────
app.post('/api/report-bot', async (req, res) => {
  try {
    const playerId = normalizePlayerId(req.body?.playerId);
    const suspicionScore = toSafeInt(req.body?.suspicionScore) || 0;
    const tps = toSafeInt(req.body?.tps) || 0;
    const patternStdDev = Number(req.body?.patternStdDev) || 0;
    const deviceFingerprint = String(req.body?.deviceFingerprint || '').trim();
    const ipHash = String(req.body?.ipHash || '').trim();
    const timestamp = toSafeInt(req.body?.timestamp);

    if (!playerId || !deviceFingerprint || !ipHash) {
      return res.status(400).json({ ok: false, message: 'playerId, deviceFingerprint, and ipHash are required' });
    }
    if (!isTimestampFresh(timestamp, COMPAT_TIMESTAMP_WINDOW_MS)) {
      return res.status(400).json({ ok: false, message: 'الطلب منتهي الصلاحية أو غير متزامن زمنياً' });
    }

    const evidenceScore = evidenceEngine.calculateEvidence({ suspicionScore, tps, patternStdDev });
    let banStatus = 'none';
    if (evidenceScore >= 16) banStatus = 'smart_ban';
    else if (evidenceScore >= 11) banStatus = 'shadow_ban';
    else if (evidenceScore >= 6) banStatus = 'soft_flag';

    // Block if already smart_banned
    const existing = await Player.findOne({ playerId }).lean();
    if (existing && existing.botStatus === 'smart_ban') {
      return res.status(403).json({ ok: false, message: 'هذا الحساب محظور نهائياً' });
    }

    await Player.updateOne(
      { playerId },
      {
        $set: {
          evidenceScore,
          botStatus: banStatus,
          lastReportTimestamp: new Date(),
          deviceFingerprint: deviceFingerprint || '',
          ipHash,
          clientBotTier: String(req.body?.botTier || '')
        },
        $setOnInsert: { playerId }
      },
      { upsert: true }
    );

    return res.json({
      ok: true,
      playerId,
      banStatus,
      evidenceScore,
      action: banStatus === 'none' ? 'none' : `${banStatus}_account`,
      message: `تم تحليل التقرير - الحالة: ${banStatus}`
    });
  } catch (err) {
    console.error('[report-bot]', err);
    return res.status(500).json({ ok: false, message: 'خطأ داخلي في السيرفر' });
  }
});

// ── GET /api/player-bot-state ────────────────────────────────────────────────
app.get('/api/player-bot-state', async (req, res) => {
  try {
    const playerId = normalizePlayerId(req.query.playerId);
    if (!playerId) return res.status(400).json({ ok: false, message: 'playerId مطلوب' });
    const botState = await getPlayerBotState(playerId);
    return res.json({ ok: true, ...botState });
  } catch (err) {
    console.error('[player-bot-state]', err);
    return res.status(500).json({ ok: false, message: 'خطأ داخلي في السيرفر' });
  }
});

// ── GET /api/player-progress ────────────────────────────────────────────────
app.get('/api/player-progress', async (req, res) => {
  try {
    const playerId = resolveCanonicalPlayerId(req, req.query.playerId);
    if (!playerId) return res.status(400).json({ ok: false, message: 'playerId مطلوب' });
    const telegramUserId = getRequestTelegramUserId(req);

    const player = await ensurePlayerInDb(playerId, telegramUserId);
    return res.json({
      ok: true,
      playerId,
      score: Number(player.score || 0),
      xp: Number(player.xp || 0),
      level: Number(player.level || 1),
      xpToNextLevel: Number(player.xpToNextLevel || 100),
      dailyStreak: Number(player.dailyStreak || 0),
      lastLoginDate: String(player.lastLoginDate || '')
    });
  } catch (err) {
    console.error('[player-progress:get]', err);
    return res.status(500).json({ ok: false, message: 'خطأ داخلي في السيرفر' });
  }
});

// ── POST /api/player-progress ───────────────────────────────────────────────
app.post('/api/player-progress', async (req, res) => {
  try {
    const playerId = resolveCanonicalPlayerId(req, req.body?.playerId);
    if (!playerId) return res.status(400).json({ ok: false, message: 'playerId مطلوب' });
    const telegramUserId = getRequestTelegramUserId(req);

    const score = Math.max(0, toSafeInt(req.body?.score) || 0);
    const xp = Math.max(0, Number(req.body?.xp) || 0);
    const level = Math.max(1, toSafeInt(req.body?.level) || 1);
    const xpToNextLevel = Math.max(100, toSafeInt(req.body?.xpToNextLevel) || 100);
    const dailyStreak = Math.max(0, toSafeInt(req.body?.dailyStreak) || 0);
    const lastLoginDate = String(req.body?.lastLoginDate || '').trim();

    await Player.updateOne(
      { playerId },
      {
        $set: {
          ...(telegramUserId ? { telegramUserId } : {}),
          score,
          xp,
          level,
          xpToNextLevel,
          dailyStreak,
          lastLoginDate
        },
        $setOnInsert: { playerId }
      },
      { upsert: true }
    );

    return res.json({ ok: true, playerId, score, xp, level, xpToNextLevel, dailyStreak, lastLoginDate });
  } catch (err) {
    console.error('[player-progress:post]', err);
    return res.status(500).json({ ok: false, message: 'خطأ داخلي في السيرفر' });
  }
});

// ── POST /api/player-progress/migrate ───────────────────────────────────────
app.post('/api/player-progress/migrate', async (req, res) => {
  try {
    const fromPlayerId = normalizePlayerId(req.body?.fromPlayerId);
    const toPlayerId = resolveCanonicalPlayerId(req, req.body?.toPlayerId);
    const telegramUserId = getRequestTelegramUserId(req);
    if (!fromPlayerId || !toPlayerId) {
      return res.status(400).json({ ok: false, message: 'fromPlayerId و toPlayerId مطلوبان' });
    }
    if (fromPlayerId === toPlayerId) {
      return res.json({ ok: true, migrated: false, reason: 'same_player_id' });
    }

    const source = await Player.findOne({ playerId: fromPlayerId });
    if (!source) {
      return res.json({ ok: true, migrated: false, reason: 'source_not_found' });
    }

    const target = await ensurePlayerInDb(toPlayerId, telegramUserId);
    if (telegramUserId && String(target.telegramUserId || '').trim() !== telegramUserId) {
      target.telegramUserId = telegramUserId;
    }
    target.score = Math.max(Number(target.score || 0), Number(source.score || 0));
    target.xp = Math.max(Number(target.xp || 0), Number(source.xp || 0));
    target.level = Math.max(Number(target.level || 1), Number(source.level || 1));
    target.xpToNextLevel = Math.max(Number(target.xpToNextLevel || 100), Number(source.xpToNextLevel || 100));
    target.dailyStreak = Math.max(Number(target.dailyStreak || 0), Number(source.dailyStreak || 0));
    target.lastLoginDate = String(target.lastLoginDate || source.lastLoginDate || '');
    target.tapcoBalance = Math.max(Number(target.tapcoBalance || 0), Number(source.tapcoBalance || 0));

    const sourceClientStateTs = Math.max(0, Number(source.clientStateUpdatedAt || 0));
    const targetClientStateTs = Math.max(0, Number(target.clientStateUpdatedAt || 0));
    const sourceHasClientState = !!(source.clientState && typeof source.clientState === 'object' && !Array.isArray(source.clientState));
    const targetHasClientState = !!(target.clientState && typeof target.clientState === 'object' && !Array.isArray(target.clientState));
    if (sourceHasClientState && (!targetHasClientState || sourceClientStateTs > targetClientStateTs)) {
      target.clientState = source.clientState;
      target.clientStateUpdatedAt = Math.max(sourceClientStateTs, targetClientStateTs, Date.now());
    }

    const sourceGameStateTs = Math.max(0, Number(source.gameStateUpdatedAt || 0));
    const targetGameStateTs = Math.max(0, Number(target.gameStateUpdatedAt || 0));
    const sourceHasGameState = !!(source.gameState && typeof source.gameState === 'object' && !Array.isArray(source.gameState));
    const targetHasGameState = !!(target.gameState && typeof target.gameState === 'object' && !Array.isArray(target.gameState));
    if (sourceHasGameState && (!targetHasGameState || sourceGameStateTs > targetGameStateTs)) {
      target.gameState = source.gameState;
      target.gameStateUpdatedAt = Math.max(sourceGameStateTs, targetGameStateTs, Date.now());
    }

    await target.save();

    return res.json({ ok: true, migrated: true, fromPlayerId, toPlayerId });
  } catch (err) {
    console.error('[player-progress:migrate]', err);
    return res.status(500).json({ ok: false, message: 'خطأ داخلي في السيرفر' });
  }
});

// ── GET /api/player-state ───────────────────────────────────────────────────
app.get('/api/player-state', async (req, res) => {
  try {
    const playerId = resolveCanonicalPlayerId(req, req.query.playerId);
    if (!playerId) return res.status(400).json({ ok: false, message: 'playerId مطلوب' });
    const telegramUserId = getRequestTelegramUserId(req);

    const player = await ensurePlayerInDb(playerId, telegramUserId);
    return res.json({
      ok: true,
      playerId,
      state: (player.clientState && typeof player.clientState === 'object') ? player.clientState : {},
      savedAt: Number(player.clientStateUpdatedAt || 0)
    });
  } catch (err) {
    console.error('[player-state:get]', err);
    return res.status(500).json({ ok: false, message: 'خطأ داخلي في السيرفر' });
  }
});

// ── POST /api/player-state ──────────────────────────────────────────────────
app.post('/api/player-state', async (req, res) => {
  try {
    const playerId = resolveCanonicalPlayerId(req, req.body?.playerId);
    if (!playerId) return res.status(400).json({ ok: false, message: 'playerId مطلوب' });
    const telegramUserId = getRequestTelegramUserId(req);

    const state = req.body?.state;
    if (!state || typeof state !== 'object' || Array.isArray(state)) {
      return res.status(400).json({ ok: false, message: 'state غير صالح' });
    }

    const stateString = JSON.stringify(state);
    if (stateString.length > 120000) {
      return res.status(413).json({ ok: false, message: 'state كبير جدًا' });
    }

    const savedAt = Math.max(0, Number(req.body?.savedAt) || Date.now());

    await Player.updateOne(
      { playerId },
      {
        $set: {
          ...(telegramUserId ? { telegramUserId } : {}),
          clientState: state,
          clientStateUpdatedAt: savedAt
        },
        $setOnInsert: { playerId }
      },
      { upsert: true }
    );

    return res.json({ ok: true, playerId, savedAt });
  } catch (err) {
    console.error('[player-state:post]', err);
    return res.status(500).json({ ok: false, message: 'خطأ داخلي في السيرفر' });
  }
});

// ── GET /api/game-state ─────────────────────────────────────────────────────
app.get('/api/game-state', async (req, res) => {
  try {
    const playerId = resolveCanonicalPlayerId(req, req.query.playerId);
    if (!playerId) return res.status(400).json({ ok: false, message: 'playerId مطلوب' });
    const telegramUserId = getRequestTelegramUserId(req);

    const player = await ensurePlayerInDb(playerId, telegramUserId);
    return res.json({
      ok: true,
      playerId,
      state: (player.gameState && typeof player.gameState === 'object') ? player.gameState : {},
      savedAt: Number(player.gameStateUpdatedAt || 0)
    });
  } catch (err) {
    console.error('[game-state:get]', err);
    return res.status(500).json({ ok: false, message: 'خطأ داخلي في السيرفر' });
  }
});

// ── POST /api/game-state ────────────────────────────────────────────────────
app.post('/api/game-state', async (req, res) => {
  try {
    const playerId = resolveCanonicalPlayerId(req, req.body?.playerId);
    if (!playerId) return res.status(400).json({ ok: false, message: 'playerId مطلوب' });
    const telegramUserId = getRequestTelegramUserId(req);

    const state = req.body?.state;
    if (!state || typeof state !== 'object' || Array.isArray(state)) {
      return res.status(400).json({ ok: false, message: 'state غير صالح' });
    }

    const stateString = JSON.stringify(state);
    if (stateString.length > 60000) {
      return res.status(413).json({ ok: false, message: 'state كبير جدًا' });
    }

    const savedAt = Math.max(0, Number(req.body?.savedAt) || Date.now());

    await Player.updateOne(
      { playerId },
      {
        $set: {
          ...(telegramUserId ? { telegramUserId } : {}),
          gameState: state,
          gameStateUpdatedAt: savedAt
        },
        $setOnInsert: { playerId }
      },
      { upsert: true }
    );

    return res.json({ ok: true, playerId, savedAt });
  } catch (err) {
    console.error('[game-state:post]', err);
    return res.status(500).json({ ok: false, message: 'خطأ داخلي في السيرفر' });
  }
});

// ── POST /api/verify-points ──────────────────────────────────────────────────
app.post('/api/verify-points', async (req, res) => {
  try {
    const playerId = normalizePlayerId(req.body?.playerId);
    const basePoints = toSafeInt(req.body?.basePoints);
    if (!playerId || basePoints === null || basePoints <= 0) {
      return res.status(400).json({ ok: false, message: 'بيانات غير صحيحة' });
    }
    const botState = await getPlayerBotState(playerId);
    const penaltyResult = applyPointPenalty(basePoints, botState.botTier);
    return res.json({ ok: true, playerId, ...penaltyResult, botState: { tier: botState.botTier, banStatus: botState.banStatus } });
  } catch (err) {
    console.error('[verify-points]', err);
    return res.status(500).json({ ok: false, message: 'خطأ داخلي في السيرفر' });
  }
});

// ── POST /api/verify-energy ──────────────────────────────────────────────────
app.post('/api/verify-energy', async (req, res) => {
  try {
    const playerId = normalizePlayerId(req.body?.playerId);
    const baseCost = toSafeInt(req.body?.baseCost);
    if (!playerId || baseCost === null || baseCost <= 0) {
      return res.status(400).json({ ok: false, message: 'بيانات غير صحيحة' });
    }
    const botState = await getPlayerBotState(playerId);
    const penaltyResult = applyEnergyPenalty(baseCost, botState.botTier);
    return res.json({ ok: true, playerId, ...penaltyResult, botState: { tier: botState.botTier, banStatus: botState.banStatus } });
  } catch (err) {
    console.error('[verify-energy]', err);
    return res.status(500).json({ ok: false, message: 'خطأ داخلي في السيرفر' });
  }
});

// ── POST /api/verify-referral ────────────────────────────────────────────────
app.post('/api/verify-referral', async (req, res) => {
  try {
    const playerId = normalizePlayerId(req.body?.playerId);
    if (!playerId) return res.status(400).json({ ok: false, message: 'playerId مطلوب' });
    const botState = await getPlayerBotState(playerId);
    const canActivate = canPlayerActivateReferral(botState.botTier, botState.banStatus);
    if (!canActivate.allowed) {
      return res.status(403).json({ ok: false, message: canActivate.reason, canActivate: false });
    }
    return res.json({ ok: true, playerId, canActivate: true, message: 'OK', botState: { tier: botState.botTier, banStatus: botState.banStatus } });
  } catch (err) {
    console.error('[verify-referral]', err);
    return res.status(500).json({ ok: false, message: 'خطأ داخلي في السيرفر' });
  }
});

// ── POST /api/verify-wallet-op ───────────────────────────────────────────────
app.post('/api/verify-wallet-op', async (req, res) => {
  try {
    const playerId = normalizePlayerId(req.body?.playerId);
    if (!playerId) return res.status(400).json({ ok: false, message: 'playerId مطلوب' });
    const botState = await getPlayerBotState(playerId);
    const canProceed = canPlayerPerformWalletOp(botState.botTier, botState.banStatus);
    if (!canProceed.allowed) {
      return res.status(403).json({ ok: false, message: canProceed.reason, allowed: false, silent: false });
    }
    return res.json({ ok: true, playerId, allowed: true, silent: canProceed.silent, message: canProceed.reason, botState: { tier: botState.botTier, banStatus: botState.banStatus } });
  } catch (err) {
    console.error('[verify-wallet-op]', err);
    return res.status(500).json({ ok: false, message: 'خطأ داخلي في السيرفر' });
  }
});

// ── POST /api/withdraw-tapco ────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════
// 🔒 SECURITY MIDDLEWARE STACK (Military-Grade Protection):
//    1. Enhanced Signature Validation
//    2. Brute Force Detection
//    3. IP Reputation Check
//    4. Location Anomaly Detection
//    5. Withdrawal-Specific Rate Limiting
//    6. Request Security Validation
//    7. High-Risk Operation Verification
//    8. 2FA for Large Withdrawals
//    9. Sensitive Request Logging
// ════════════════════════════════════════════════════════════════════════════
app.post('/api/withdraw-tapco',
  validateEnhancedSignature,           // ✅ Validate signature timestamp
  checkBruteForce,                     // ✅ Check if player is brute-forced
  checkIpReputation,                   // ✅ Evaluate IP reputation
  detectLocationAnomaly,               // ✅ Detect suspicious location changes
  withdrawalRateLimit,                 // ✅ Rate limit withdrawals
  validateWithdrawalSecurity,          // ✅ Validate request structure & limits
  verifyHighRiskOperation,             // ✅ Extra checks for high-risk ops
  require2FA,                          // ✅ Require 2FA only after request is valid
  logSensitiveRequest,                 // ✅ Audit log all sensitive requests
  async (req, res) => {
  try {
    const rawIp = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '0.0.0.0').split(',')[0].trim();
    const ipCheck = checkIpWithdrawLimit(rawIp);
    if (!ipCheck.allowed) {
      res.setHeader('Retry-After', String(ipCheck.retryAfterSeconds));
      return res.status(429).json({
        ok: false, code: 'RATE_LIMITED', scope: 'ip',
        retryAfterSeconds: ipCheck.retryAfterSeconds,
        retryAt: ipCheck.retryAt,
        limit: { max: ipCheck.max, windowMs: ipCheck.windowMs },
        message: 'عدد كبير من الطلبات من نفس IP، حاول بعد قليل'
      });
    }

    const playerId = normalizePlayerId(req.body?.playerId);
    const tapcoAmount = toSafeInt(req.body?.tapcoAmount);
    const walletAddress = normalizeWalletAddress(req.body?.walletAddress);
    const timestamp = toSafeInt(req.body?.timestamp);
    const chainId = String(req.body?.chainId || '').trim();
    const clientSignature = String(req.body?.clientSignature || '').trim();

    if (!playerId) return res.status(400).json({ ok: false, message: 'playerId مطلوب' });
    if (tapcoAmount === null) return res.status(400).json({ ok: false, message: 'tapcoAmount يجب أن يكون رقمًا صحيحًا' });
    if (tapcoAmount < COMPAT_WITHDRAW_MIN_AMOUNT) return res.status(400).json({ ok: false, message: `الحد الأدنى للسحب هو ${COMPAT_WITHDRAW_MIN_AMOUNT} TAPCO` });
    if (!isValidEthAddress(walletAddress)) return res.status(400).json({ ok: false, message: 'عنوان المحفظة غير صالح' });
    if (!isTimestampFresh(timestamp, COMPAT_TIMESTAMP_WINDOW_MS)) return res.status(400).json({ ok: false, message: 'الطلب منتهي الصلاحية أو غير متزامن زمنياً' });

    const expectedSig = computeClientSignature({ playerId, tapcoAmount, walletAddress, timestamp });
    if (!clientSignature || clientSignature !== expectedSig) {
      return res.status(400).json({ ok: false, message: 'clientSignature غير صحيحة' });
    }

    const botState = await getPlayerBotState(playerId);
    const walletOpResult = canPlayerPerformWalletOp(botState.botTier, botState.banStatus);
    if (!walletOpResult.allowed) {
      return res.status(403).json({ ok: false, message: walletOpResult.reason });
    }
    if (walletOpResult.silent) {
      return res.json({ ok: true, requestId: String(Math.floor(Math.random() * 1000000)), status: 'pending', message: 'تم تسجيل طلب السحب بنجاح', _shadowBanned: true });
    }

    const existing = await WithdrawRequest.findOne({ clientSignature }).lean();
    if (existing) {
      return res.json({ ok: true, requestId: String(existing._id), status: existing.status, message: 'تم استلام الطلب مسبقاً (idempotent)' });
    }

    const windowStart = new Date(Date.now() - COMPAT_WITHDRAW_PLAYER_WINDOW_MS);
    const recentCount = await WithdrawRequest.countDocuments({ playerId, createdAt: { $gte: windowStart } });
    if (recentCount >= COMPAT_WITHDRAW_PLAYER_MAX_REQUESTS) {
      const retryAfterSeconds = Math.ceil(COMPAT_WITHDRAW_PLAYER_WINDOW_MS / 1000);
      res.setHeader('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({
        ok: false, code: 'RATE_LIMITED', scope: 'player',
        retryAfterSeconds,
        retryAt: new Date(Date.now() + COMPAT_WITHDRAW_PLAYER_WINDOW_MS).toISOString(),
        limit: { max: COMPAT_WITHDRAW_PLAYER_MAX_REQUESTS, windowMs: COMPAT_WITHDRAW_PLAYER_WINDOW_MS, currentCount: recentCount },
        message: 'لقد تجاوزت الحد المسموح لطلبات السحب، حاول لاحقاً'
      });
    }

    const player = await ensurePlayerInDb(playerId);
    const tapcoBalance = typeof player.tapcoBalance === 'number' ? player.tapcoBalance : 0;
    if (tapcoBalance < tapcoAmount) {
      return res.status(400).json({ ok: false, message: 'رصيد غير كافٍ' });
    }

    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [dailyAgg, weeklyAgg] = await Promise.all([
      WithdrawRequest.aggregate([
        { $match: { playerId, status: { $in: ['pending', 'processing', 'completed'] }, createdAt: { $gte: dayAgo } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      WithdrawRequest.aggregate([
        { $match: { playerId, status: { $in: ['pending', 'processing', 'completed'] }, createdAt: { $gte: weekAgo } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ])
    ]);
    const dailyUsed = dailyAgg[0]?.total || 0;
    const weeklyUsed = weeklyAgg[0]?.total || 0;
    if (dailyUsed + tapcoAmount > COMPAT_DAILY_WITHDRAW_LIMIT) {
      return res.status(400).json({ ok: false, message: 'تم تجاوز الحد اليومي للسحب' });
    }
    if (weeklyUsed + tapcoAmount > COMPAT_WEEKLY_WITHDRAW_LIMIT) {
      return res.status(400).json({ ok: false, message: 'تم تجاوز الحد الأسبوعي للسحب' });
    }

    player.tapcoBalance = tapcoBalance - tapcoAmount;
    await player.save();

    const request = await WithdrawRequest.create({
      playerId, amount: tapcoAmount, walletAddress, chainId,
      status: 'pending', clientSignature, requestedAt: timestamp
    });

    return res.json({ ok: true, requestId: String(request._id), status: 'pending', message: 'تم تسجيل طلب السحب بنجاح' });
  } catch (err) {
    console.error('[withdraw-tapco]', err);
    return res.status(500).json({ ok: false, message: 'خطأ داخلي في السيرفر' });
  }
});

// ── GET /api/withdraw-status ─────────────────────────────────────────────────
app.get('/api/withdraw-status', async (req, res) => {
  try {
    const playerId = normalizePlayerId(req.query.playerId);
    if (!playerId) return res.status(400).json({ ok: false, message: 'playerId مطلوب' });
    const limitValue = toSafeInt(req.query.limit);
    const limit = Math.min(Math.max(limitValue || 50, 1), 200);
    const requests = await WithdrawRequest.find({ playerId }).sort({ createdAt: -1 }).limit(limit).lean();
    const formatted = requests.map((r) => ({
      id: String(r._id),
      amount: r.amount,
      type: 'TAPCO',
      walletAddress: r.walletAddress,
      status: r.status,
      txHash: r.txHash || null,
      chainId: r.chainId || '',
      failureReason: r.failureReason || null,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : new Date(r.createdAt).toISOString(),
      updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : new Date(r.updatedAt).toISOString()
    }));
    return res.json({ ok: true, playerId, requests: formatted });
  } catch (err) {
    console.error('[withdraw-status]', err);
    return res.status(500).json({ ok: false, message: 'خطأ داخلي في السيرفر' });
  }
});

// ── GET /api/player-balance ──────────────────────────────────────────────────
app.get('/api/player-balance', async (req, res) => {
  try {
    const playerId = normalizePlayerId(req.query.playerId);
    if (!playerId) return res.status(400).json({ ok: false, message: 'playerId مطلوب' });
    const botState = await getPlayerBotState(playerId);
    if (botState.banStatus === 'shadow_ban') {
      return res.json({ ok: true, playerId, tapcoBalance: 0, shadowBanned: true });
    }
    if (botState.banStatus === 'smart_ban') {
      return res.status(403).json({ ok: false, message: 'حسابك محظور - لا يمكن إجراء هذه العملية' });
    }
    const player = await ensurePlayerInDb(playerId);
    return res.json({ ok: true, playerId: player.playerId, tapcoBalance: player.tapcoBalance || 0 });
  } catch (err) {
    console.error('[player-balance]', err);
    return res.status(500).json({ ok: false, message: 'خطأ داخلي في السيرفر' });
  }
});

app.use('/api/referral', securityGuard('referral_activation'), referralRoutes);
app.use('/api/antibot', securityGuard('antibot_report'), antiBotRoutes);
app.use('/api/wallet', securityGuard((req) => {
  if (req.path.startsWith('/deposit')) return 'deposit';
  if (req.path.startsWith('/withdraw')) return 'withdraw';
  if (req.path.startsWith('/transfer')) return 'transfer';
  if (req.path.startsWith('/balance')) return 'wallet_balance';
  return 'wallet_unknown';
}), walletRoutes);
app.use('/api/player', playerRoutes);
app.use('/wallet', normalizeApiResponse, userRateLimit, ipThrottle, securityGuard((req) => {
  if (req.path.startsWith('/deposit')) return 'deposit';
  if (req.path.startsWith('/withdraw')) return 'withdraw';
  if (req.path.startsWith('/transfer')) return 'transfer';
  if (req.path.startsWith('/balance')) return 'wallet_balance';
  return 'wallet_unknown';
}), walletRoutes);
app.use('/player', normalizeApiResponse, userRateLimit, ipThrottle, playerRoutes);

(async () => {
  await connectDatabase();

  app.listen(PORT, () => {
    console.log(`Server running WITH DB on port ${PORT}`);
  });
})();
