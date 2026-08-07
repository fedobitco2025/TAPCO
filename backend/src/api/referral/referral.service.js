const ReferralLog = require('../../models/referralLog.model');
const Player = require('../../models/player.model');
const crypto = require('crypto');
const { securityLog } = require('../../core/logger');
const abuse = require('../../core/abuse');
const sessionManager = require('../../core/session');

const buildIpHash = (context = {}) => {
  const forwarded = context.headers?.['x-forwarded-for'];
  const rawIP = Array.isArray(forwarded)
    ? forwarded[0]
    : ((typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : '') || context.socket?.remoteAddress || '0.0.0.0');

  return crypto.createHash('sha256').update(String(rawIP)).digest('hex');
};

const REFERRAL_IP_RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const REFERRAL_IP_RECENT_SOFT_LIMIT = 2;
const REFERRAL_IP_RECENT_HARD_LIMIT = 4;
const REFERRAL_IP_LIFETIME_HARD_LIMIT = 12;

const normalizeReferralSignal = (value) => String(value || '').trim();

async function evaluateReferralRisk({ playerId, ipHash, deviceFingerprint, action, referrerId }) {
  const normalizedDevice = normalizeReferralSignal(deviceFingerprint);
  const flags = [];

  if (!normalizedDevice || normalizedDevice === 'unknown') {
    return {
      allowed: false,
      reason: 'missing_device_fingerprint',
      flags: ['unknown_device']
    };
  }

  const sameDeviceCount = await Player.countDocuments({
    deviceFingerprint: normalizedDevice,
    playerId: { $ne: playerId }
  });

  if (sameDeviceCount > 0) {
    return {
      allowed: false,
      reason: 'device_limit_exceeded',
      flags: ['device_reuse']
    };
  }

  const recentSince = new Date(Date.now() - REFERRAL_IP_RECENT_WINDOW_MS);
  const [recentActivations, lifetimeActivations] = await Promise.all([
    ReferralLog.countDocuments({
      ipHash,
      activated: true,
      timestamp: { $gte: recentSince },
      playerId: { $ne: playerId }
    }),
    ReferralLog.countDocuments({
      ipHash,
      activated: true,
      playerId: { $ne: playerId }
    })
  ]);

  if (recentActivations >= REFERRAL_IP_RECENT_SOFT_LIMIT) {
    flags.push('ip_watchlist');
  }

  if (recentActivations >= REFERRAL_IP_RECENT_HARD_LIMIT || lifetimeActivations >= REFERRAL_IP_LIFETIME_HARD_LIMIT) {
    return {
      allowed: false,
      reason: 'ip_limit_exceeded',
      flags: [...flags, 'ip_activity_high']
    };
  }

  if (recentActivations > 0) {
    flags.push('ip_reuse_detected');
  }

  if (action) {
    securityLog('referral_risk_signal', {
      playerId,
      referrerId: referrerId || '',
      ipHash,
      deviceFingerprint: normalizedDevice,
      action,
      reason: 'ip_risk_review',
      flags,
      details: {
        recentActivations,
        lifetimeActivations
      }
    });
  }

  return {
    allowed: true,
    reason: 'ok',
    flags,
    recentActivations,
    lifetimeActivations
  };
}

module.exports.handleReferral = async (req) => {
  const {
    playerId,
    referrerCode,
    deviceFingerprint,
    sessionId
  } = req.body;

  // السيرفر يستخرج IP
  const ipHash = buildIpHash({ headers: req.headers, socket: req.socket || req.connection });
  const normalizedDeviceFingerprint = normalizeReferralSignal(deviceFingerprint);

  // 1) التحقق من وجود اللاعب والمرسل
  const newPlayer = await Player.findOne({ playerId });
  const referrer = await Player.findOne({ referralCode: referrerCode });

  if (!referrer) {
    securityLog('referral_rejected', {
      playerId,
      ipHash,
      deviceFingerprint: normalizedDeviceFingerprint,
      reason: 'invalid_referrer'
    });
    return { success: false, reason: 'invalid_referrer' };
  }

  if (!sessionId) {
    return { success: false, reason: 'missing_session' };
  }

  const sessionCheck = await sessionManager.validateSession({
    playerId,
    sessionId,
    deviceFingerprint: normalizedDeviceFingerprint,
    action: 'referral_pending_notify',
    payload: req.body,
    enforceReplayProtection: true
  });

  if (!sessionCheck.valid) {
    securityLog('referral_rejected', {
      playerId,
      sessionId,
      ipHash,
      deviceFingerprint: normalizedDeviceFingerprint,
      reason: sessionCheck.reason
    });
    return { success: false, reason: sessionCheck.reason };
  }

  // 2) شروط التفعيل الأساسية
  const trustedScore = Math.max(0, Number(newPlayer?.authoritativeScore || 0));
  const accountAgeMs = newPlayer?.createdAt ? Date.now() - new Date(newPlayer.createdAt).getTime() : 0;
  if (trustedScore < 2000 || accountAgeMs < 10 * 60 * 1000) {
    securityLog('referral_rejected', {
      playerId,
      referrerId: referrer.playerId,
      ipHash,
      deviceFingerprint: normalizedDeviceFingerprint,
      reason: 'requirements_not_met'
    });
    return { success: false, reason: 'requirements_not_met' };
  }

  // 3) حماية متوازنة: نفس الجهاز = منع مباشر، نفس IP = تقييم حسب النشاط الحديث
  const risk = await evaluateReferralRisk({
    playerId,
    ipHash,
    deviceFingerprint: normalizedDeviceFingerprint,
    action: 'referral_pending_notify',
    referrerId: referrer.playerId
  });

  if (!risk.allowed) {
    securityLog('referral_rejected', {
      playerId,
      referrerId: referrer.playerId,
      ipHash,
      deviceFingerprint: normalizedDeviceFingerprint,
      reason: risk.reason,
      flags: risk.flags
    });
    return { success: false, reason: risk.reason };
  }

  // 4) منع الإحالة الذاتية
  if (newPlayer && newPlayer.playerId === referrer.playerId) {
    securityLog('referral_rejected', {
      playerId,
      referrerId: referrer.playerId,
      ipHash,
      deviceFingerprint: normalizedDeviceFingerprint,
      reason: 'self_referral_blocked',
      flags: ['self_referral_attempt']
    });
    return { success: false, reason: 'self_referral_blocked' };
  }

  // 5) تفعيل الإحالة
  if (newPlayer) {
    newPlayer.referralActivated = true;
    newPlayer.ipHash = ipHash;
    newPlayer.deviceFingerprint = normalizedDeviceFingerprint;
    await newPlayer.save();
  }

  const now = new Date();
  const progressDay = now.toISOString().slice(0, 10);
  const sameProgressDay = String(referrer.authoritativeProgressDay || '') === progressDay;
  referrer.refLevel1 = Math.max(0, Number(referrer.refLevel1 || 0)) + 1;
  referrer.authoritativeScore = Math.max(0, Number(referrer.authoritativeScore || 0)) + 50;
  referrer.authoritativeTotalPointsEarned = Math.max(0, Number(referrer.authoritativeTotalPointsEarned || 0)) + 50;
  referrer.authoritativeDailyPoints = (sameProgressDay ? Math.max(0, Number(referrer.authoritativeDailyPoints || 0)) : 0) + 50;
  referrer.authoritativeProgressDay = progressDay;
  referrer.updatedAt = now;
  await referrer.save();

  // 6) تسجيل Log
  await ReferralLog.create({
    playerId,
    referrerId: referrer.playerId,
    ipHash,
    deviceFingerprint: normalizedDeviceFingerprint,
    activated: true,
    reason: risk.flags.length ? 'ok_with_risk_signal' : 'ok'
  });

  const abuseFlags = abuse.detectAbuse({
    action: 'referral_activation',
    ipHash,
    deviceFingerprint: normalizedDeviceFingerprint,
    playerId,
    referrerId: referrer.playerId
  });

  securityLog('referral_activation', {
    playerId,
    referrerId: referrer.playerId,
    ipHash,
    deviceFingerprint: normalizedDeviceFingerprint,
    flags: [...abuseFlags, ...risk.flags]
  });

  return {
    success: true,
    reason: 'referral_activated',
    level1Reward: 50
  };
};

module.exports.activateReferral = async (payload = {}, context = {}) => {
  const {
    playerId,
    referralCode,
    sessionId,
    deviceFingerprint = 'unknown'
  } = payload;

  if (!playerId || !referralCode) {
    return { success: false, reason: 'missing_fields' };
  }

  if (!sessionId) {
    return { success: false, reason: 'missing_session' };
  }

  const normalizedDeviceFingerprint = normalizeReferralSignal(deviceFingerprint);

  const sessionCheck = await sessionManager.validateSession({
    playerId,
    sessionId,
    deviceFingerprint: normalizedDeviceFingerprint,
    action: 'referral_activation',
    payload,
    enforceReplayProtection: true
  });

  if (!sessionCheck.valid) {
    securityLog('referral_rejected', {
      playerId,
      sessionId,
      deviceFingerprint: normalizedDeviceFingerprint,
      reason: sessionCheck.reason
    });
    return { success: false, reason: sessionCheck.reason };
  }

  const ipHash = context.ipHash || buildIpHash(context);
  const referrer = await Player.findOne({
    $or: [
      { playerId: referralCode },
      { referralCode }
    ]
  });

  if (!referrer) {
    securityLog('referral_rejected', {
      playerId,
      sessionId,
      ipHash,
      deviceFingerprint: normalizedDeviceFingerprint,
      reason: 'invalid_referrer'
    });
    return { success: false, reason: 'invalid_referrer' };
  }

  if (playerId === referrer.playerId) {
    securityLog('referral_rejected', {
      playerId,
      sessionId,
      referrerId: referrer.playerId,
      ipHash,
      deviceFingerprint: normalizedDeviceFingerprint,
      reason: 'self_referral_blocked',
      flags: ['self_referral_attempt']
    });
    return { success: false, reason: 'self_referral_blocked' };
  }

  let player = await Player.findOne({ playerId });

  if (player?.referrerId) {
    return { success: false, reason: 'referral_already_activated' };
  }

  const trustedScore = Math.max(0, Number(player?.authoritativeScore || 0));
  const accountAgeMs = player?.createdAt ? Date.now() - new Date(player.createdAt).getTime() : 0;
  if (trustedScore < 2000 || accountAgeMs < 10 * 60 * 1000) {
    return { success: false, reason: 'requirements_not_met' };
  }

  const risk = await evaluateReferralRisk({
    playerId,
    ipHash,
    deviceFingerprint: normalizedDeviceFingerprint,
    action: 'referral_activation',
    referrerId: referrer.playerId
  });

  if (!risk.allowed) {
    securityLog('referral_rejected', {
      playerId,
      sessionId,
      referrerId: referrer.playerId,
      ipHash,
      deviceFingerprint: normalizedDeviceFingerprint,
      reason: risk.reason,
      flags: risk.flags
    });
    return { success: false, reason: risk.reason };
  }

  if (!player) {
    player = new Player({
      playerId,
      referralCode: `REF-${playerId}`
    });
  }

  player.referrerId = referrer.playerId;
  player.referralActivated = true;
  player.ipHash = ipHash;
  player.deviceFingerprint = normalizedDeviceFingerprint;
  await player.save();

  const now = new Date();
  const progressDay = now.toISOString().slice(0, 10);
  const sameProgressDay = String(referrer.authoritativeProgressDay || '') === progressDay;
  referrer.refLevel1 = Math.max(0, Number(referrer.refLevel1 || 0)) + 1;
  referrer.authoritativeScore = Math.max(0, Number(referrer.authoritativeScore || 0)) + 50;
  referrer.authoritativeTotalPointsEarned = Math.max(0, Number(referrer.authoritativeTotalPointsEarned || 0)) + 50;
  referrer.authoritativeDailyPoints = (sameProgressDay ? Math.max(0, Number(referrer.authoritativeDailyPoints || 0)) : 0) + 50;
  referrer.authoritativeProgressDay = progressDay;
  referrer.updatedAt = now;
  await referrer.save();

  await ReferralLog.create({
    playerId,
    referrerId: referrer.playerId,
    ipHash,
    deviceFingerprint: normalizedDeviceFingerprint,
    activated: true,
    reason: risk.flags.length ? 'activate_with_risk_signal' : 'activate'
  });

  const abuseFlags = abuse.detectAbuse({
    action: 'referral_activation',
    ipHash,
    deviceFingerprint: normalizedDeviceFingerprint,
    playerId,
    referrerId: referrer.playerId
  });

  securityLog('referral_activation', {
    playerId,
    sessionId,
    referrerId: referrer.playerId,
    ipHash,
    deviceFingerprint: normalizedDeviceFingerprint,
    flags: [...abuseFlags, ...risk.flags]
  });

  return {
    success: true,
    playerId,
    referrerId: referrer.playerId,
    rewardGiven: true
  };
};
