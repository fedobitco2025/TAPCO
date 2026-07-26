const express = require('express');

const Player = require('../../models/player.model');
const PlayerDailyActivity = require('../../models/playerDailyActivity.model');
const WithdrawRequest = require('../../models/withdrawRequest.model');
const WalletTx = require('../../models/walletTx.model');
const SecurityLog = require('../../models/securityLog.model');

const router = express.Router();

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getPagination(query, defaultLimit = 25) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}

function getDays(query) {
  return Math.min(90, Math.max(7, Number.parseInt(query.days, 10) || 14));
}

function maskAddress(value) {
  const address = String(value || '');
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function maskHash(value) {
  const hash = String(value || '');
  if (hash.length < 18) return hash;
  return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}

function serializePlayer(player) {
  return {
    playerId: player.playerId,
    telegramUserId: player.telegramUserId || '',
    address: maskAddress(player.address),
    level: Number(player.level || 1),
    score: Number(player.score || 0),
    gameBalance: Number(player.gameBalance || 0),
    walletBalance: Number(player.walletBalance || 0),
    tapcoBalance: Number(player.tapcoBalance || 0),
    dailyPoints: Number(player.dailyPoints || 0),
    dailyClicks: Number(player.dailyClicks || 0),
    totalPointsEarned: Number(player.totalPointsEarned || 0),
    sessionTime: Number(player.sessionTime || 0),
    dailyStreak: Number(player.dailyStreak || 0),
    botStatus: player.botStatus || 'none',
    evidenceScore: Number(player.evidenceScore || 0),
    referrals: Number(player.refLevel1 || 0) + Number(player.refLevel2 || 0) + Number(player.refLevel3 || 0),
    achievements: Array.isArray(player.completedAchievements) ? player.completedAchievements.length : 0,
    lastLoginDate: player.lastLoginDate || '',
    lastWithdrawTimestamp: player.lastWithdrawTimestamp || null,
    createdAt: player.createdAt,
    updatedAt: player.updatedAt
  };
}

router.get('/overview', async (req, res) => {
  try {
    const days = getDays(req.query);
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const start = new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
    const startDay = start.toISOString().slice(0, 10);
    const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const startOfToday = new Date(`${today}T00:00:00.000Z`);

    const [
      playerTotals,
      activity,
      activeToday,
      newToday,
      withdrawalTotals,
      walletTotals,
      securityTotals,
      topPlayers
    ] = await Promise.all([
      Player.aggregate([{
        $group: {
          _id: null,
          count: { $sum: 1 },
          totalPoints: { $sum: { $max: ['$totalPointsEarned', 0] } },
          gameBalance: { $sum: { $max: ['$gameBalance', 0] } },
          tapcoBalance: { $sum: { $max: ['$tapcoBalance', 0] } },
          flagged: { $sum: { $cond: [{ $ne: ['$botStatus', 'none'] }, 1, 0] } }
        }
      }]),
      PlayerDailyActivity.aggregate([
        { $match: { day: { $gte: startDay } } },
        { $group: {
          _id: '$day',
          activePlayers: { $sum: 1 },
          points: { $sum: '$points' },
          clicks: { $sum: '$clicks' },
          sessionTime: { $sum: '$sessionTime' }
        } },
        { $sort: { _id: 1 } }
      ]),
      PlayerDailyActivity.countDocuments({ day: today }),
      Player.countDocuments({ createdAt: { $gte: startOfToday } }),
      WithdrawRequest.aggregate([
        { $match: { createdAt: { $gte: start } } },
        { $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: '$amount' } } }
      ]),
      WalletTx.aggregate([
        { $match: { createdAt: { $gte: start } } },
        { $group: { _id: { type: '$txType', status: '$status' }, count: { $sum: 1 }, amount: { $sum: '$amount' } } }
      ]),
      SecurityLog.aggregate([
        { $match: { timestamp: { $gte: since24h } } },
        { $group: { _id: '$action', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 8 }
      ]),
      Player.find({}).sort({ dailyPoints: -1 }).limit(8).lean()
    ]);

    const totals = playerTotals[0] || {};
    return res.json({
      ok: true,
      generatedAt: now.toISOString(),
      historyStartsAt: activity[0]?._id || null,
      rangeDays: days,
      players: {
        total: Number(totals.count || 0),
        activeToday,
        newToday,
        flagged: Number(totals.flagged || 0)
      },
      economy: {
        totalPointsEarned: Number(totals.totalPoints || 0),
        gameBalance: Number(totals.gameBalance || 0),
        tapcoBalance: Number(totals.tapcoBalance || 0)
      },
      activity: activity.map((row) => ({
        day: row._id,
        activePlayers: Number(row.activePlayers || 0),
        points: Number(row.points || 0),
        clicks: Number(row.clicks || 0),
        sessionTime: Number(row.sessionTime || 0)
      })),
      withdrawals: withdrawalTotals,
      walletActivity: walletTotals,
      securityActions24h: securityTotals,
      topPlayers: topPlayers.map(serializePlayer)
    });
  } catch (error) {
    console.error('[admin-overview]', error);
    return res.status(500).json({ ok: false, code: 'ADMIN_OVERVIEW_FAILED' });
  }
});

router.get('/players', async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const search = String(req.query.search || '').trim();
    const status = String(req.query.status || '').trim();
    const filter = {};
    if (search) {
      const matcher = new RegExp(escapeRegex(search), 'i');
      filter.$or = [
        { playerId: matcher },
        { telegramUserId: matcher },
        { address: matcher },
        { referralCode: matcher }
      ];
    }
    if (status && ['none', 'soft_flag', 'shadow_ban', 'smart_ban'].includes(status)) {
      filter.botStatus = status;
    }

    const [players, total] = await Promise.all([
      Player.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
      Player.countDocuments(filter)
    ]);
    return res.json({ ok: true, page, limit, total, pages: Math.max(1, Math.ceil(total / limit)), players: players.map(serializePlayer) });
  } catch (error) {
    console.error('[admin-players]', error);
    return res.status(500).json({ ok: false, code: 'ADMIN_PLAYERS_FAILED' });
  }
});

router.get('/players/:playerId', async (req, res) => {
  try {
    const playerId = String(req.params.playerId || '').trim();
    const player = await Player.findOne({ playerId }).lean();
    if (!player) return res.status(404).json({ ok: false, code: 'PLAYER_NOT_FOUND' });

    const [activity, withdrawals, walletTransactions, securityEvents] = await Promise.all([
      PlayerDailyActivity.find({ playerId }).sort({ day: -1 }).limit(30).lean(),
      WithdrawRequest.find({ playerId }).sort({ createdAt: -1 }).limit(20).lean(),
      WalletTx.find({ $or: [{ playerId }, { fromPlayer: playerId }, { toPlayer: playerId }] }).sort({ createdAt: -1 }).limit(20).lean(),
      SecurityLog.find({ playerId }).sort({ timestamp: -1 }).limit(30).lean()
    ]);

    return res.json({
      ok: true,
      player: serializePlayer(player),
      activity,
      withdrawals: withdrawals.map((item) => ({
        id: String(item._id),
        amount: item.amount,
        walletAddress: maskAddress(item.walletAddress),
        status: item.status,
        txHash: item.txHash || '',
        failureReason: item.failureReason || '',
        broadcastAttempts: Number(item.broadcastAttempts || 0),
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        refundedAt: item.refundedAt
      })),
      walletTransactions: walletTransactions.map((item) => ({
        id: String(item._id),
        type: item.txType,
        status: item.status,
        fromPlayer: item.fromPlayer || item.playerId || '',
        toPlayer: item.toPlayer || '',
        amount: item.amount,
        walletAddress: maskAddress(item.walletAddress),
        reason: item.reason,
        flags: item.flags,
        txHash: item.txHash || '',
        createdAt: item.createdAt
      })),
      securityEvents: securityEvents.map((item) => ({
        action: item.action,
        timestamp: item.timestamp,
        reason: item.reason,
        statusCode: item.statusCode,
        flags: item.flags,
        path: item.path
      }))
    });
  } catch (error) {
    console.error('[admin-player-detail]', error);
    return res.status(500).json({ ok: false, code: 'ADMIN_PLAYER_DETAIL_FAILED' });
  }
});

router.get('/withdrawals', async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const status = String(req.query.status || '').trim();
    const filter = status ? { status } : {};
    const [items, total] = await Promise.all([
      WithdrawRequest.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      WithdrawRequest.countDocuments(filter)
    ]);
    return res.json({
      ok: true, page, limit, total,
      items: items.map((item) => ({
        id: String(item._id), playerId: item.playerId, amount: item.amount,
        walletAddress: maskAddress(item.walletAddress), chainId: item.chainId,
        status: item.status, txHash: item.txHash || '', txHashShort: maskHash(item.txHash),
        failureReason: item.failureReason || '', broadcastAttempts: Number(item.broadcastAttempts || 0),
        createdAt: item.createdAt, updatedAt: item.updatedAt, refundedAt: item.refundedAt
      }))
    });
  } catch (error) {
    console.error('[admin-withdrawals]', error);
    return res.status(500).json({ ok: false, code: 'ADMIN_WITHDRAWALS_FAILED' });
  }
});

router.get('/wallet-transactions', async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const type = String(req.query.type || '').trim();
    const status = String(req.query.status || '').trim();
    const filter = {};
    if (type) filter.txType = type;
    if (status) filter.status = status;
    const [items, total] = await Promise.all([
      WalletTx.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      WalletTx.countDocuments(filter)
    ]);
    return res.json({
      ok: true, page, limit, total,
      items: items.map((item) => ({
        id: String(item._id), type: item.txType, status: item.status,
        playerId: item.playerId || item.fromPlayer || '', toPlayer: item.toPlayer || '',
        amount: item.amount, walletAddress: maskAddress(item.walletAddress),
        reason: item.reason, flags: item.flags, txHash: item.txHash || '',
        txHashShort: maskHash(item.txHash), createdAt: item.createdAt
      }))
    });
  } catch (error) {
    console.error('[admin-wallet-transactions]', error);
    return res.status(500).json({ ok: false, code: 'ADMIN_WALLET_TX_FAILED' });
  }
});

router.get('/security-events', async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const action = String(req.query.action || '').trim();
    const playerId = String(req.query.playerId || '').trim();
    const filter = {};
    if (action) filter.action = new RegExp(escapeRegex(action), 'i');
    if (playerId) filter.playerId = new RegExp(escapeRegex(playerId), 'i');
    const [items, total] = await Promise.all([
      SecurityLog.find(filter).sort({ timestamp: -1 }).skip(skip).limit(limit).lean(),
      SecurityLog.countDocuments(filter)
    ]);
    return res.json({
      ok: true, page, limit, total,
      items: items.map((item) => ({
        id: String(item._id), action: item.action, playerId: item.playerId,
        reason: item.reason, statusCode: item.statusCode, path: item.path,
        flags: item.flags, evidenceScore: item.evidenceScore, banStatus: item.banStatus,
        timestamp: item.timestamp
      }))
    });
  } catch (error) {
    console.error('[admin-security-events]', error);
    return res.status(500).json({ ok: false, code: 'ADMIN_SECURITY_EVENTS_FAILED' });
  }
});

module.exports = router;