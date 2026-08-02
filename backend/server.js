const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config();

const { connectDatabase } = require('./src/core/database');
const referralRoutes = require('./src/api/referral/referral.routes');
const antiBotRoutes = require('./src/api/antibot/antibot.routes');
const walletRoutes = require('./src/api/wallet/wallet.routes');
const playerRoutes = require('./src/api/player/player.routes');
const adminRoutes = require('./src/api/admin/admin.routes');
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
const { getBalance, sendTokens, getPlayerBalance, getDistributionWalletAddress } = require('./src/blockchain/client');
const Player = require('./src/models/player.model');
const WithdrawRequest = require('./src/models/withdrawRequest.model');
const PlayerDailyActivity = require('./src/models/playerDailyActivity.model');
const WorkerHeartbeat = require('./src/models/workerHeartbeat.model');
const { getWorkerHealth } = require('./src/monitoring/workerHealth');
const {
  normalizePlayerId,
  isValidTapcoAddress,
  normalizeTapcoAddress,
  toSafeInt,
  isTimestampFresh
} = require('./src/core/security');
const { createRequireVerifiedTelegramIdentity, createTelegramSessionToken } = require('./src/core/telegramAuth');
const evidenceEngine = require('./src/api/antibot/antibot.evidence');
const { submitTapcoWithdrawal } = require('./src/api/withdrawal/tapcoWithdrawal.service');
const { creditTapBatch } = require('./src/api/gameplay/tapLedger.service');
const { purchaseUpgrade } = require('./src/api/gameplay/upgradePurchase.service');
const envConfig = require('./src/config/env');

const app = express();

const corsOrigins = envConfig.CORS_ORIGINS;
const isProd = envConfig.IS_PRODUCTION;
const telegramBetaGateEnabled = !!envConfig.TELEGRAM_BETA_GATE_ENABLED;
const telegramBetaAllowlist = new Set((envConfig.TELEGRAM_BETA_ALLOWLIST || []).map((value) => String(value).trim()));
const telegramBetaBlockMessage = String(envConfig.TELEGRAM_BETA_BLOCK_MESSAGE || 'Closed beta access only').trim();
const requireVerifiedTelegramIdentity = createRequireVerifiedTelegramIdentity({
  botToken: envConfig.TELEGRAM_BOT_TOKEN,
  maxAgeMs: envConfig.TELEGRAM_INIT_DATA_MAX_AGE_MS
});
const requireVerifiedGameplayIdentity = createRequireVerifiedTelegramIdentity({
  botToken: envConfig.TELEGRAM_BOT_TOKEN,
  maxAgeMs: envConfig.TELEGRAM_INIT_DATA_MAX_AGE_MS,
  allowSessionToken: true
});

function secureStringEquals(value, expected) {
  const valueBuffer = Buffer.from(String(value || ''), 'utf8');
  const expectedBuffer = Buffer.from(String(expected || ''), 'utf8');
  return valueBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(valueBuffer, expectedBuffer);
}

function requireEconomyAdmin(req, res, next) {
  const configuredKey = String(envConfig.ECONOMY_ADMIN_KEY || '');
  if (!configuredKey) {
    return res.status(503).json({ ok: false, code: 'ECONOMY_MONITORING_DISABLED' });
  }
  if (!secureStringEquals(req.headers['x-tapco-admin-key'], configuredKey)) {
    return res.status(401).json({ ok: false, code: 'UNAUTHORIZED' });
  }
  return next();
}

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

async function recordPlayerDailyActivity(player, source = 'player_progress') {
  if (!player?.playerId) return;
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  try {
    await PlayerDailyActivity.updateOne(
      { playerId: player.playerId, day },
      {
        $setOnInsert: { firstSeenAt: now },
        $set: { lastSeenAt: now, source },
        $max: {
          points: Math.max(0, Number(player.dailyPoints || 0)),
          clicks: Math.max(0, Number(player.dailyClicks || 0)),
          sessionTime: Math.max(0, Number(player.sessionTime || 0)),
          level: Math.max(1, Number(player.level || 1))
        }
      },
      { upsert: true }
    );
  } catch (error) {
    console.error('[player-activity]', error.message);
  }
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
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Telegram-User-Id', 'X-Telegram-Client', 'X-TAPCO-Admin-Key'],
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
app.use('/admin', express.static(path.join(__dirname, 'public', 'admin'), {
  index: 'index.html',
  maxAge: isProd ? '1h' : 0
}));
app.use('/assets', express.static(path.join(__dirname, '..', 'assets'), {
  maxAge: isProd ? '7d' : 0,
  immutable: !!isProd
}));
app.use('/api', normalizeApiResponse);
app.use((err, _req, res, next) => {
  if (err && String(err.message || '').includes('CORS origin denied')) {
    return res.status(403).json({ success: false, reason: 'cors_forbidden' });
  }
  return next(err);
});

if (isProd && corsOrigins.length === 0) {
  console.warn('[CORS] CORS_ORIGINS is empty in production; allowing all origins as fallback.');
}

app.get('/api/health', async (_req, res) => {
  const databaseHealthy = Player.db.readyState === 1;
  let heartbeat = null;
  if (databaseHealthy) {
    heartbeat = await WorkerHeartbeat.findById('withdrawal-worker').lean().catch(() => null);
  }
  const worker = getWorkerHealth(heartbeat, {
    enabled: envConfig.WITHDRAWAL_WORKER_ENABLED,
    staleAfterMs: envConfig.WORKER_HEARTBEAT_STALE_MS
  });

  return res.status(databaseHealthy ? 200 : 503).json({
    ok: databaseHealthy,
    message: databaseHealthy ? 'TAPCO API healthy' : 'TAPCO API unavailable',
    components: {
      api: 'healthy',
      database: databaseHealthy ? 'healthy' : 'unavailable',
      worker: { status: worker.status, healthy: worker.healthy, heartbeatAt: worker.heartbeatAt }
    }
  });
});

app.get('/api/admin/economy', requireEconomyAdmin, async (_req, res) => {
  try {
    const distributionWalletAddress = await getDistributionWalletAddress().catch(() => '');
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [playerTotals, withdrawalTotals, recentFailures, sharedWallets, distributionBalanceResult, workerHeartbeat] = await Promise.all([
      Player.aggregate([{
        $group: {
          _id: null,
          players: { $sum: 1 },
          tapcoAvailable: { $sum: { $max: ['$tapcoBalance', 0] } },
          totalPointsEarned: { $sum: { $max: ['$totalPointsEarned', 0] } },
          dailyPoints: { $sum: { $max: ['$dailyPoints', 0] } },
          dailyClicks: { $sum: { $max: ['$dailyClicks', 0] } },
          maxPlayerDailyPoints: { $max: { $max: ['$dailyPoints', 0] } },
          walletPoints: { $sum: { $max: ['$walletBalance', 0] } },
          flaggedPlayers: {
            $sum: { $cond: [{ $in: ['$botStatus', ['soft_flag', 'shadow_ban', 'smart_ban']] }, 1, 0] }
          }
        }
      }]),
      WithdrawRequest.aggregate([{
        $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: '$amount' } }
      }]),
      WithdrawRequest.countDocuments({ status: 'failed', updatedAt: { $gte: since24h } }),
      Player.aggregate([
        { $match: { address: { $type: 'string', $ne: '' } } },
        { $group: { _id: { $toLower: '$address' }, players: { $sum: 1 } } },
        { $match: { players: { $gt: 1 } } },
        { $group: { _id: null, groups: { $sum: 1 }, players: { $sum: '$players' }, largestGroup: { $max: '$players' } } }
      ]),
      distributionWalletAddress
        ? getBalance(distributionWalletAddress)
        : Promise.resolve({ success: false, error: 'distribution_wallet_address_unavailable' }),
      WorkerHeartbeat.findById('withdrawal-worker').lean()
    ]);

    const players = playerTotals[0] || {};
    const withdrawals = Object.fromEntries(withdrawalTotals.map((row) => [row._id, {
      count: row.count,
      amount: row.amount
    }]));
    const activeLiability = ['pending', 'processing', 'refunding'].reduce(
      (sum, status) => sum + Number(withdrawals[status]?.amount || 0),
      0
    );
    const tapcoAvailable = Number(players.tapcoAvailable || 0);
    const totalLiability = tapcoAvailable + activeLiability;
    const distributionBalance = distributionBalanceResult.success
      ? Number(distributionBalanceResult.balance || 0)
      : null;
    const coverageRatio = distributionBalance === null || totalLiability <= 0
      ? null
      : distributionBalance / totalLiability;
    const alerts = [];
    const worker = getWorkerHealth(workerHeartbeat, {
      enabled: envConfig.WITHDRAWAL_WORKER_ENABLED,
      staleAfterMs: envConfig.WORKER_HEARTBEAT_STALE_MS
    });

    if (distributionBalance === null) alerts.push('DISTRIBUTION_BALANCE_UNAVAILABLE');
    if (coverageRatio !== null && coverageRatio < envConfig.ECONOMY_MIN_COVERAGE_RATIO) alerts.push('LOW_TAPCO_COVERAGE');
    if (recentFailures >= envConfig.ECONOMY_FAILED_WITHDRAW_ALERT_COUNT) alerts.push('HIGH_WITHDRAW_FAILURES_24H');
    if (Number(players.maxPlayerDailyPoints || 0) >= envConfig.ECONOMY_DAILY_POINTS_ALERT) alerts.push('DAILY_POINTS_OUTLIER');
    if (Number(sharedWallets[0]?.groups || 0) > 0) alerts.push('SHARED_WITHDRAW_WALLETS');
    if (!envConfig.WITHDRAWALS_ENABLED) alerts.push('WITHDRAWALS_DISABLED');
    if (!envConfig.WITHDRAWAL_WORKER_ENABLED) alerts.push('WITHDRAWAL_WORKER_DISABLED');
    if (envConfig.WITHDRAWAL_WORKER_ENABLED && !worker.healthy) {
      alerts.push(`WITHDRAWAL_WORKER_${worker.status.toUpperCase()}`);
    }

    return res.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      controls: {
        withdrawalsEnabled: envConfig.WITHDRAWALS_ENABLED,
        workerEnabled: envConfig.WITHDRAWAL_WORKER_ENABLED,
        worker
      },
      players: {
        count: Number(players.players || 0),
        flagged: Number(players.flaggedPlayers || 0)
      },
      points: {
        totalEarned: Number(players.totalPointsEarned || 0),
        earnedToday: Number(players.dailyPoints || 0),
        clicksToday: Number(players.dailyClicks || 0),
        maxPlayerEarnedToday: Number(players.maxPlayerDailyPoints || 0),
        internalWallet: Number(players.walletPoints || 0)
      },
      tapco: {
        availableToPlayers: tapcoAvailable,
        activeWithdrawals: activeLiability,
        totalLiability,
        distributionBalance,
        coverageRatio
      },
      withdrawals,
      sharedWallets: {
        groups: Number(sharedWallets[0]?.groups || 0),
        players: Number(sharedWallets[0]?.players || 0),
        largestGroup: Number(sharedWallets[0]?.largestGroup || 0)
      },
      recent: { failedWithdrawals24h: recentFailures },
      alerts
    });
  } catch (error) {
    console.error('[economy-monitor]', error);
    return res.status(500).json({ ok: false, code: 'ECONOMY_REPORT_FAILED' });
  }
});

app.use('/api/admin', requireEconomyAdmin, adminRoutes);

app.use('/api', userRateLimit, ipThrottle);
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

app.get('/Game.html', (req, res) => {
  return res.sendFile(path.join(__dirname, '..', 'Game.html'));
});

app.get('/tonconnect-manifest.json', (req, res) => {
  return res.sendFile(path.join(__dirname, '..', 'tonconnect-manifest.json'));
});

app.get('/', (req, res) => {
  return res.sendFile(path.join(__dirname, '..', 'Game.html'));
});

// SECURITY: Removed /blockchain/balance, /blockchain/withdraw, /wallet/withdraw, /wallet/player-balance
// These unauthenticated endpoints posed security risks. Use /api/verify-* endpoints with signature auth instead.

// ── Compat constants ──────────────────────────────────────────────────────────
const COMPAT_TIMESTAMP_WINDOW_MS = envConfig.TIMESTAMP_WINDOW_MS;
const COMPAT_WITHDRAW_MIN_AMOUNT = envConfig.WITHDRAW_MIN_AMOUNT;
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

function normalizeAchievementId(id) {
  if (typeof id === 'number' && Number.isFinite(id)) return id;
  const raw = String(id || '').trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return Number(raw);
  return raw;
}

function normalizeMidAchievementsState(rawState) {
  const defaultProgress = { tap: 0, energy: 0, auto: 0, research: 0, fusion: 0, boss: 0, weekly: 0, passive: 0 };
  const source = (rawState && typeof rawState === 'object' && !Array.isArray(rawState)) ? rawState : {};
  const sourceCompleted = (source.completed && typeof source.completed === 'object' && !Array.isArray(source.completed)) ? source.completed : {};
  const sourceProgress = (source.progress && typeof source.progress === 'object' && !Array.isArray(source.progress)) ? source.progress : {};

  const completed = {};
  Object.keys(sourceCompleted).forEach((id) => {
    const safeId = String(id || '').trim();
    if (!safeId) return;
    const ts = Number(sourceCompleted[id]);
    completed[safeId] = (Number.isFinite(ts) && ts > 0) ? ts : Date.now();
  });

  const progress = Object.assign({}, defaultProgress);
  Object.keys(defaultProgress).forEach((key) => {
    const value = Number(sourceProgress[key]);
    progress[key] = (Number.isFinite(value) && value >= 0) ? value : 0;
  });

  return {
    completed,
    progress,
    unlocked: !!source.unlocked
  };
}

function mergeMidAchievementsState(existingState, incomingState) {
  const existing = normalizeMidAchievementsState(existingState);
  const incoming = normalizeMidAchievementsState(incomingState);

  const mergedCompleted = Object.assign({}, existing.completed);
  Object.keys(incoming.completed).forEach((id) => {
    mergedCompleted[id] = Math.max(
      toNonNegativeNumber(mergedCompleted[id], 0),
      toNonNegativeNumber(incoming.completed[id], 0)
    );
  });

  const mergedProgress = Object.assign({}, existing.progress);
  Object.keys(mergedProgress).forEach((key) => {
    mergedProgress[key] = Math.max(
      toNonNegativeNumber(existing.progress[key], 0),
      toNonNegativeNumber(incoming.progress[key], 0)
    );
  });

  return {
    completed: mergedCompleted,
    progress: mergedProgress,
    unlocked: !!(existing.unlocked || incoming.unlocked)
  };
}

function toNonNegativeNumber(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function normalizeDailyMissionItem(mission) {
  if (!mission || typeof mission !== 'object') return null;
  const normalized = Object.assign({}, mission);
  normalized.progress = toNonNegativeNumber(normalized.progress, 0);
  normalized.completed = !!normalized.completed;
  normalized.claimed = !!normalized.claimed;
  if (!normalized.reward || typeof normalized.reward !== 'object') {
    normalized.reward = { type: 'points', value: 1000 };
  }
  return normalized;
}

function getDailyMissionStableKey(mission, index) {
  if (!mission || typeof mission !== 'object') return `idx:${index}`;
  if (mission.id !== undefined && mission.id !== null && String(mission.id).trim() !== '') {
    return `id:${String(mission.id).trim()}`;
  }
  const type = String(mission.type || '').trim();
  const difficulty = String(mission.difficulty || '').trim();
  const target = toNonNegativeNumber(mission.target, 0);
  return `fallback:${type}:${difficulty}:${target}:${index}`;
}

function mergeDailyMissions(existingMissions, incomingMissions) {
  const existingSafe = Array.isArray(existingMissions) ? existingMissions.map(normalizeDailyMissionItem).filter(Boolean) : [];
  const incomingSafe = Array.isArray(incomingMissions) ? incomingMissions.map(normalizeDailyMissionItem).filter(Boolean) : [];

  if (existingSafe.length === 0) return incomingSafe;
  if (incomingSafe.length === 0) return existingSafe;

  const missionScore = (mission) => {
    if (!mission || typeof mission !== 'object') return 0;
    const progress = toNonNegativeNumber(mission.progress, 0);
    const completed = mission.completed ? 120 : 0;
    const claimed = mission.claimed ? 1000 : 0;
    return progress + completed + claimed;
  };

  const resolveDifficulty = (mission, index) => {
    const raw = String((mission && mission.difficulty) || '').trim();
    if (raw) return raw;
    if (index === 0) return 'easy';
    if (index === 1) return 'medium';
    if (index === 2) return 'hard';
    return `extra_${index}`;
  };

  const pickByDifficulty = (missions) => {
    const byDifficulty = new Map();
    missions.forEach((mission, index) => {
      const diff = resolveDifficulty(mission, index);
      const existing = byDifficulty.get(diff);
      if (!existing || missionScore(mission) > missionScore(existing)) {
        byDifficulty.set(diff, mission);
      }
    });
    return byDifficulty;
  };

  const existingByDiff = pickByDifficulty(existingSafe);
  const incomingByDiff = pickByDifficulty(incomingSafe);
  const orderedDiffs = ['easy', 'medium', 'hard'];
  const mergedByDiff = [];

  orderedDiffs.forEach((diff) => {
    const oldMission = existingByDiff.get(diff);
    const newMission = incomingByDiff.get(diff);
    if (oldMission && newMission) {
      mergedByDiff.push(missionScore(newMission) > missionScore(oldMission) ? newMission : oldMission);
      return;
    }
    if (oldMission) {
      mergedByDiff.push(oldMission);
      return;
    }
    if (newMission) {
      mergedByDiff.push(newMission);
    }
  });

  if (mergedByDiff.length > 0) {
    return mergedByDiff;
  }

  const existingByKey = new Map();
  existingSafe.forEach((mission, index) => {
    existingByKey.set(getDailyMissionStableKey(mission, index), mission);
  });

  const merged = [];
  incomingSafe.forEach((incomingMission, index) => {
    const key = getDailyMissionStableKey(incomingMission, index);
    const existingMission = existingByKey.get(key);
    if (!existingMission) {
      merged.push(incomingMission);
      return;
    }

    const chosen = Object.assign({}, existingMission, incomingMission);
    chosen.progress = Math.max(
      toNonNegativeNumber(existingMission.progress, 0),
      toNonNegativeNumber(incomingMission.progress, 0)
    );
    chosen.completed = !!(existingMission.completed || incomingMission.completed);
    chosen.claimed = !!(existingMission.claimed || incomingMission.claimed);
    if (!chosen.reward || typeof chosen.reward !== 'object') {
      chosen.reward = existingMission.reward || incomingMission.reward || { type: 'points', value: 1000 };
    }
    merged.push(chosen);
    existingByKey.delete(key);
  });

  existingByKey.forEach((mission) => {
    merged.push(mission);
  });

  return merged;
}

async function ensurePlayerInDb(playerId, telegramUserId = '') {
  const normalizedTelegramUserId = String(telegramUserId || '').trim();

  const query = normalizedTelegramUserId
    ? { $or: [{ playerId }, { telegramUserId: normalizedTelegramUserId }] }
    : { playerId };

  const candidates = await Player.find(query).sort({ updatedAt: -1, createdAt: -1 });
  if (candidates.length === 0) {
    return Player.create({
      playerId,
      telegramUserId: normalizedTelegramUserId,
      tapcoBalance: COMPAT_INITIAL_PLAYER_BALANCE
    });
  }

  const computeStrength = (p) => {
    const scoreVal = Math.max(0, Number(p.score || 0));
    const xpVal = Math.max(0, Number(p.xp || 0));
    const levelVal = Math.max(1, Number(p.level || 1));
    const balanceVal = Math.max(0, Number(p.tapcoBalance || 0));
    const stateTs = Math.max(0, Number(p.clientStateUpdatedAt || 0), Number(p.gameStateUpdatedAt || 0));
    return (scoreVal * 10) + xpVal + (levelVal * 1000) + (balanceVal * 100) + stateTs;
  };

  let primary = candidates.find((p) => String(p.playerId || '').trim() === playerId) || null;
  if (!primary) {
    primary = candidates.reduce((best, current) => {
      if (!best) return current;
      return computeStrength(current) > computeStrength(best) ? current : best;
    }, null);
  }

  const mergeStateIfNewer = (target, source, stateField, tsField) => {
    const sourceState = source[stateField];
    const targetState = target[stateField];
    const sourceTs = Math.max(0, Number(source[tsField] || 0));
    const targetTs = Math.max(0, Number(target[tsField] || 0));
    const sourceHasState = !!(sourceState && typeof sourceState === 'object' && !Array.isArray(sourceState));
    const targetHasState = !!(targetState && typeof targetState === 'object' && !Array.isArray(targetState));
    if (sourceHasState && (!targetHasState || sourceTs > targetTs)) {
      target[stateField] = sourceState;
      target[tsField] = Math.max(sourceTs, targetTs, Date.now());
    }
  };

  for (const candidate of candidates) {
    if (String(candidate._id) === String(primary._id)) continue;
    primary.score = Math.max(Number(primary.score || 0), Number(candidate.score || 0));
    primary.xp = Math.max(Number(primary.xp || 0), Number(candidate.xp || 0));
    primary.level = Math.max(Number(primary.level || 1), Number(candidate.level || 1));
    primary.xpToNextLevel = Math.max(Number(primary.xpToNextLevel || 100), Number(candidate.xpToNextLevel || 100));
    primary.dailyStreak = Math.max(Number(primary.dailyStreak || 0), Number(candidate.dailyStreak || 0));
    primary.dailyClicks = Math.max(Number(primary.dailyClicks || 0), Number(candidate.dailyClicks || 0));
    primary.dailyPoints = Math.max(Number(primary.dailyPoints || 0), Number(candidate.dailyPoints || 0));
    primary.sessionTime = Math.max(Number(primary.sessionTime || 0), Number(candidate.sessionTime || 0));
    primary.consecutiveDays = Math.max(Number(primary.consecutiveDays || 0), Number(candidate.consecutiveDays || 0));
    primary.totalPointsEarned = Math.max(Number(primary.totalPointsEarned || 0), Number(candidate.totalPointsEarned || 0));
    primary.energySpentTotal = Math.max(Number(primary.energySpentTotal || 0), Number(candidate.energySpentTotal || 0));
    primary.totalBoostsUsed = Math.max(Number(primary.totalBoostsUsed || 0), Number(candidate.totalBoostsUsed || 0));
    primary.dailyMissionCompletedCount = Math.max(Number(primary.dailyMissionCompletedCount || 0), Number(candidate.dailyMissionCompletedCount || 0));
    primary.lastDailyResetTimestamp = Math.max(Number(primary.lastDailyResetTimestamp || 0), Number(candidate.lastDailyResetTimestamp || 0));
    primary.unlockedAchievementsCount = Math.max(Number(primary.unlockedAchievementsCount || 0), Number(candidate.unlockedAchievementsCount || 0));
    primary.unlockedSecretAchievementsCount = Math.max(Number(primary.unlockedSecretAchievementsCount || 0), Number(candidate.unlockedSecretAchievementsCount || 0));
    primary.dailyBonusClaimed = !!(primary.dailyBonusClaimed || candidate.dailyBonusClaimed);
    {
      const primaryCompleted = Array.isArray(primary.completedAchievements) ? primary.completedAchievements : [];
      const candidateCompleted = Array.isArray(candidate.completedAchievements) ? candidate.completedAchievements : [];
      primary.completedAchievements = Array.from(new Set(primaryCompleted.concat(candidateCompleted).map(normalizeAchievementId).filter((id) => id !== null)));
    }
    {
      const primaryMissions = Array.isArray(primary.activeDailyMissions) ? primary.activeDailyMissions : [];
      const candidateMissions = Array.isArray(candidate.activeDailyMissions) ? candidate.activeDailyMissions : [];
      primary.activeDailyMissions = primaryMissions.length >= candidateMissions.length ? primaryMissions : candidateMissions;
    }
    {
      const primaryTs = (primary.achievementUnlockTimestamps && typeof primary.achievementUnlockTimestamps === 'object') ? primary.achievementUnlockTimestamps : {};
      const candidateTs = (candidate.achievementUnlockTimestamps && typeof candidate.achievementUnlockTimestamps === 'object') ? candidate.achievementUnlockTimestamps : {};
      const mergedTs = Object.assign({}, primaryTs);
      Object.keys(candidateTs).forEach((achKey) => {
        mergedTs[achKey] = Math.max(Number(mergedTs[achKey] || 0), Number(candidateTs[achKey] || 0));
      });
      primary.achievementUnlockTimestamps = mergedTs;
    }
    primary.tapcoBalance = Math.max(Number(primary.tapcoBalance || 0), Number(candidate.tapcoBalance || 0));
    if (!String(primary.lastLoginDate || '').trim()) {
      primary.lastLoginDate = String(candidate.lastLoginDate || '').trim();
    }
    mergeStateIfNewer(primary, candidate, 'clientState', 'clientStateUpdatedAt');
    mergeStateIfNewer(primary, candidate, 'gameState', 'gameStateUpdatedAt');
  }

  if (String(primary.playerId || '').trim() !== playerId) {
    primary.playerId = playerId;
  }
  if (normalizedTelegramUserId && String(primary.telegramUserId || '').trim() !== normalizedTelegramUserId) {
    primary.telegramUserId = normalizedTelegramUserId;
  }
  await primary.save();

  for (const candidate of candidates) {
    if (String(candidate._id) === String(primary._id)) continue;
    try {
      await Player.deleteOne({ _id: candidate._id });
    } catch (_deleteErr) {
      // Non-fatal cleanup path.
    }
  }

  return primary;
}

async function ensureVerifiedPlayerInDb(playerId, telegramUserId) {
  const normalizedTelegramUserId = String(telegramUserId || '').trim();
  const canonicalPlayerId = `TG_${normalizedTelegramUserId}`;
  if (!normalizedTelegramUserId || playerId !== canonicalPlayerId) {
    const error = new Error('verified_player_identity_required');
    error.code = 'VERIFIED_PLAYER_IDENTITY_REQUIRED';
    throw error;
  }

  let player = await Player.findOne({ playerId: canonicalPlayerId });
  if (player) {
    const boundTelegramUserId = String(player.telegramUserId || '').trim();
    if (boundTelegramUserId && boundTelegramUserId !== normalizedTelegramUserId) {
      const error = new Error('player_identity_conflict');
      error.code = 'PLAYER_IDENTITY_CONFLICT';
      throw error;
    }
    if (!boundTelegramUserId) {
      player.telegramUserId = normalizedTelegramUserId;
      await player.save();
    }
    return player;
  }

  try {
    return await Player.create({
      playerId: canonicalPlayerId,
      telegramUserId: normalizedTelegramUserId,
      tapcoBalance: COMPAT_INITIAL_PLAYER_BALANCE
    });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    player = await Player.findOne({ playerId: canonicalPlayerId });
    if (!player || (player.telegramUserId && String(player.telegramUserId) !== normalizedTelegramUserId)) {
      throw error;
    }
    return player;
  }
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

// ── POST /api/auth/telegram-session ────────────────────────────────────────
app.post('/api/auth/telegram-session', requireVerifiedTelegramIdentity, (req, res) => {
  const token = createTelegramSessionToken({
    userId: req.telegramUserId,
    botToken: envConfig.TELEGRAM_BOT_TOKEN,
    ttlMs: envConfig.TELEGRAM_SESSION_TTL_MS
  });
  return res.json({
    ok: true,
    playerId: `TG_${req.telegramUserId}`,
    token,
    expiresAt: new Date(Date.now() + envConfig.TELEGRAM_SESSION_TTL_MS).toISOString()
  });
});

// ── GET /api/player-progress ────────────────────────────────────────────────
app.get('/api/player-progress', requireVerifiedGameplayIdentity, async (req, res) => {
  try {
    const playerId = resolveCanonicalPlayerId(req, req.query.playerId);
    if (!playerId) return res.status(400).json({ ok: false, message: 'playerId مطلوب' });
    const telegramUserId = getRequestTelegramUserId(req);

    const player = await ensureVerifiedPlayerInDb(playerId, telegramUserId);
    await recordPlayerDailyActivity(player, 'player_progress_read');
    return res.json({
      ok: true,
      playerId,
      score: Number(player.authoritativeScore || 0),
      xp: Number(player.xp || 0),
      level: Number(player.level || 1),
      xpToNextLevel: Number(player.xpToNextLevel || 100),
      dailyStreak: Number(player.dailyStreak || 0),
      lastLoginDate: String(player.lastLoginDate || ''),
      tapPowerLevel: Math.max(0, toSafeInt(player.authoritativeTapPowerLevel) || 0),
      maxEnergyLevel: Math.max(0, toSafeInt(player.authoritativeMaxEnergyLevel) || 0),
      energyRegenLevel: Math.max(0, toSafeInt(player.authoritativeEnergyRegenLevel) || 0),
      autoTapLevel: Math.max(0, toSafeInt(player.autoTapLevel) || 0),
      dailyClicks: Math.max(0, Number(player.authoritativeDailyClicks || 0)),
      dailyPoints: Math.max(0, Number(player.authoritativeDailyPoints || 0)),
      sessionTime: Math.max(0, Number(player.sessionTime || 0)),
      consecutiveDays: Math.max(0, Number(player.consecutiveDays || 0)),
      totalPointsEarned: Math.max(0, Number(player.authoritativeTotalPointsEarned || 0)),
      energySpentTotal: Math.max(0, Number(player.energySpentTotal || 0)),
      totalBoostsUsed: Math.max(0, Number(player.totalBoostsUsed || 0)),
      completedAchievements: Array.isArray(player.completedAchievements) ? player.completedAchievements : [],
      midAchievementsState: normalizeMidAchievementsState(player.midAchievementsState),
      unlockedAchievementsCount: Math.max(0, Number(player.unlockedAchievementsCount || 0)),
      unlockedSecretAchievementsCount: Math.max(0, Number(player.unlockedSecretAchievementsCount || 0)),
      achievementUnlockTimestamps: (player.achievementUnlockTimestamps && typeof player.achievementUnlockTimestamps === 'object') ? player.achievementUnlockTimestamps : {},
      activeDailyMissions: Array.isArray(player.activeDailyMissions) ? player.activeDailyMissions : [],
      dailyMissionCompletedCount: Math.max(0, Number(player.dailyMissionCompletedCount || 0)),
      lastDailyResetTimestamp: Math.max(0, Number(player.lastDailyResetTimestamp || 0)),
      dailyBonusClaimed: !!player.dailyBonusClaimed
    });
  } catch (err) {
    console.error('[player-progress:get]', err);
    return res.status(500).json({ ok: false, message: 'خطأ داخلي في السيرفر' });
  }
});

// ── POST /api/gameplay/taps ────────────────────────────────────────────────
app.post('/api/gameplay/taps', requireVerifiedGameplayIdentity, async (req, res) => {
  try {
    const playerId = resolveCanonicalPlayerId(req, req.body?.playerId);
    const telegramUserId = getRequestTelegramUserId(req);
    await ensureVerifiedPlayerInDb(playerId, telegramUserId);
    const result = await creditTapBatch({
      playerId,
      batchId: req.body?.batchId,
      tapCount: req.body?.tapCount
    });
    return res.status(result.statusCode).json(result.body);
  } catch (error) {
    console.error('[gameplay:taps]', error);
    return res.status(500).json({ ok: false, code: 'TAP_LEDGER_FAILED' });
  }
});

// ── POST /api/gameplay/upgrades/purchase ───────────────────────────────────
app.post('/api/gameplay/upgrades/purchase', requireVerifiedTelegramIdentity, async (req, res) => {
  try {
    const playerId = resolveCanonicalPlayerId(req, req.body?.playerId);
    const telegramUserId = getRequestTelegramUserId(req);
    await ensureVerifiedPlayerInDb(playerId, telegramUserId);
    const result = await purchaseUpgrade({
      playerId,
      purchaseId: req.body?.purchaseId,
      upgradeType: req.body?.upgradeType
    });
    return res.status(result.statusCode).json(result.body);
  } catch (error) {
    console.error('[gameplay:upgrade-purchase]', error);
    return res.status(500).json({ ok: false, code: 'UPGRADE_PURCHASE_FAILED' });
  }
});

// ── POST /api/player-progress ───────────────────────────────────────────────
app.post('/api/player-progress', requireVerifiedGameplayIdentity, async (req, res) => {
  try {
    const playerId = resolveCanonicalPlayerId(req, req.body?.playerId);
    if (!playerId) return res.status(400).json({ ok: false, message: 'playerId مطلوب' });
    const telegramUserId = getRequestTelegramUserId(req);
    await ensureVerifiedPlayerInDb(playerId, telegramUserId);

    return res.status(409).json({
      ok: false,
      code: 'CLIENT_AUTHORITATIVE_PROGRESS_REJECTED',
      message: 'تم إيقاف مزامنة النقاط من العميل لحماية رصيد اللعبة'
    });
  } catch (err) {
    console.error('[player-progress:post]', err);
    return res.status(500).json({ ok: false, message: 'خطأ داخلي في السيرفر' });
  }
});

// ── POST /api/player-progress/migrate ───────────────────────────────────────
app.post('/api/player-progress/migrate', requireVerifiedGameplayIdentity, async (req, res) => {
  try {
    return res.status(410).json({
      ok: false,
      code: 'PLAYER_PROGRESS_MIGRATION_RETIRED',
      message: 'تم إيقاف ترحيل حالة اللاعب غير الموثقة'
    });
  } catch (err) {
    console.error('[player-progress:migrate]', err);
    return res.status(500).json({ ok: false, message: 'خطأ داخلي في السيرفر' });
  }
});

// ── GET /api/player-state ───────────────────────────────────────────────────
app.get('/api/player-state', requireVerifiedGameplayIdentity, async (req, res) => {
  try {
    const playerId = resolveCanonicalPlayerId(req, req.query.playerId);
    if (!playerId) return res.status(400).json({ ok: false, message: 'playerId مطلوب' });
    const telegramUserId = getRequestTelegramUserId(req);

    const player = await ensureVerifiedPlayerInDb(playerId, telegramUserId);
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
app.post('/api/player-state', requireVerifiedGameplayIdentity, async (req, res) => {
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
    const player = await ensureVerifiedPlayerInDb(playerId, telegramUserId);
    if (telegramUserId && String(player.telegramUserId || '').trim() !== telegramUserId) {
      player.telegramUserId = telegramUserId;
    }

    const existingSavedAt = Math.max(0, Number(player.clientStateUpdatedAt || 0));
    if (savedAt < existingSavedAt) {
      return res.json({ ok: true, playerId, savedAt: existingSavedAt, ignored: 'stale_player_state' });
    }

    player.clientState = state;
    player.clientStateUpdatedAt = savedAt;
    await player.save();

    return res.json({ ok: true, playerId, savedAt, ignored: false });
  } catch (err) {
    console.error('[player-state:post]', err);
    return res.status(500).json({ ok: false, message: 'خطأ داخلي في السيرفر' });
  }
});

// ── GET /api/game-state ─────────────────────────────────────────────────────
app.get('/api/game-state', requireVerifiedGameplayIdentity, async (req, res) => {
  try {
    const playerId = resolveCanonicalPlayerId(req, req.query.playerId);
    if (!playerId) return res.status(400).json({ ok: false, message: 'playerId مطلوب' });
    const telegramUserId = getRequestTelegramUserId(req);

    const player = await ensureVerifiedPlayerInDb(playerId, telegramUserId);
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
app.post('/api/game-state', requireVerifiedGameplayIdentity, async (req, res) => {
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
    const player = await ensureVerifiedPlayerInDb(playerId, telegramUserId);
    if (telegramUserId && String(player.telegramUserId || '').trim() !== telegramUserId) {
      player.telegramUserId = telegramUserId;
    }

    const existingSavedAt = Math.max(0, Number(player.gameStateUpdatedAt || 0));
    if (savedAt < existingSavedAt) {
      return res.json({ ok: true, playerId, savedAt: existingSavedAt, ignored: 'stale_game_state' });
    }

    player.gameState = state;
    player.gameStateUpdatedAt = savedAt;
    await player.save();

    return res.json({ ok: true, playerId, savedAt, ignored: false });
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
  requireVerifiedTelegramIdentity,     // Validate Telegram initData and bind playerId
  validateEnhancedSignature,           // Reject stale requests before OTP delivery
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
    if (!envConfig.WITHDRAWALS_ENABLED) {
      return res.status(503).json({
        ok: false,
        code: 'WITHDRAWALS_DISABLED',
        message: 'طلبات السحب متوقفة مؤقتاً لحماية الأرصدة'
      });
    }
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
    const walletAddress = normalizeTapcoAddress(req.body?.walletAddress);
    const timestamp = toSafeInt(req.body?.timestamp);
    const chainId = String(req.body?.chainId || '').trim();

    if (!playerId) return res.status(400).json({ ok: false, message: 'playerId مطلوب' });
    if (tapcoAmount === null) return res.status(400).json({ ok: false, message: 'tapcoAmount يجب أن يكون رقمًا صحيحًا' });
    if (tapcoAmount < COMPAT_WITHDRAW_MIN_AMOUNT) return res.status(400).json({ ok: false, message: `الحد الأدنى للسحب هو ${COMPAT_WITHDRAW_MIN_AMOUNT} TAPCO` });
    if (!isValidTapcoAddress(walletAddress)) return res.status(400).json({ ok: false, message: 'عنوان المحفظة غير صالح' });
    if (!isTimestampFresh(timestamp, COMPAT_TIMESTAMP_WINDOW_MS)) return res.status(400).json({ ok: false, message: 'الطلب منتهي الصلاحية أو غير متزامن زمنياً' });

    await ensureVerifiedPlayerInDb(playerId, getRequestTelegramUserId(req));
    const withdrawalResult = await submitTapcoWithdrawal({
      playerId,
      tapcoAmount,
      walletAddress,
      timestamp,
      chainId
    });
    Object.entries(withdrawalResult.headers).forEach(([name, value]) => res.setHeader(name, value));
    return res.status(withdrawalResult.statusCode).json(withdrawalResult.body);
  } catch (err) {
    console.error('[withdraw-tapco]', err);
    return res.status(500).json({ ok: false, message: 'خطأ داخلي في السيرفر' });
  }
});

// ── GET /api/withdraw-status ─────────────────────────────────────────────────
app.get('/api/withdraw-status', requireVerifiedTelegramIdentity, async (req, res) => {
  try {
    const playerId = resolveCanonicalPlayerId(req, req.query.playerId);
    if (!playerId) return res.status(400).json({ ok: false, message: 'playerId مطلوب' });
    const limitValue = toSafeInt(req.query.limit);
    const limit = Math.min(Math.max(limitValue || 50, 1), 200);
    const requests = await WithdrawRequest.find({ playerId }).sort({ createdAt: -1 }).limit(limit).lean();
    const formatted = requests.map((r) => {
      const failureReason = String(r.failureReason || '');
      const failureCode = !failureReason
        ? null
        : (failureReason === 'Invalid wallet address'
            ? 'INVALID_ADDRESS'
            : (failureReason === 'Transaction receipt indicates failure'
                ? 'ONCHAIN_REJECTED'
                : 'TRANSFER_FAILED'));
      return {
              id: String(r._id),
              amount: r.amount,
              type: 'TAPCO',
              walletAddress: r.walletAddress,
              status: r.status === 'refunding' ? 'processing' : r.status,
              refundState: r.status === 'refunding' ? 'refunding' : (r.refundedAt ? 'refunded' : null),
              txHash: r.txHash || null,
              chainId: r.chainId || '',
              failureCode,
              refundedAt: r.refundedAt instanceof Date ? r.refundedAt.toISOString() : (r.refundedAt || null),
              createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : new Date(r.createdAt).toISOString(),
              updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : new Date(r.updatedAt).toISOString()
      };
    });
    return res.json({ ok: true, playerId, requests: formatted });
  } catch (err) {
    console.error('[withdraw-status]', err);
    return res.status(500).json({ ok: false, message: 'خطأ داخلي في السيرفر' });
  }
});

// ── GET /api/player-balance ──────────────────────────────────────────────────
app.get('/api/player-balance', requireVerifiedTelegramIdentity, async (req, res) => {
  try {
    const playerId = resolveCanonicalPlayerId(req, req.query.playerId);
    if (!playerId) return res.status(400).json({ ok: false, message: 'playerId مطلوب' });
    const botState = await getPlayerBotState(playerId);
    if (botState.banStatus === 'shadow_ban') {
      return res.json({ ok: true, playerId, tapcoBalance: 0, shadowBanned: true });
    }
    if (botState.banStatus === 'smart_ban') {
      return res.status(403).json({ ok: false, message: 'حسابك محظور - لا يمكن إجراء هذه العملية' });
    }
    const player = await ensureVerifiedPlayerInDb(playerId, getRequestTelegramUserId(req));
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

async function startServer() {
  await connectDatabase();

  return app.listen(PORT, () => {
    console.log(`Server running WITH DB on port ${PORT}`);
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error('[server:start]', error);
    process.exitCode = 1;
  });
}

module.exports = { app, startServer };
