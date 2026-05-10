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

module.exports.handleReferral = async (req) => {
  const {
    playerId,
    referrerCode,
    playTime,
    level,
    score,
    deviceFingerprint,
    sessionId
  } = req.body;

  // السيرفر يستخرج IP
  const realIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const ipHash = crypto.createHash('sha256').update(String(realIP)).digest('hex');

  // 1) التحقق من وجود اللاعب والمرسل
  const newPlayer = await Player.findOne({ playerId });
  const referrer = await Player.findOne({ referralCode: referrerCode });

  if (!referrer) {
    securityLog('referral_rejected', {
      playerId,
      ipHash,
      deviceFingerprint,
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
    deviceFingerprint,
    action: 'referral_pending_notify',
    payload: req.body,
    enforceReplayProtection: true
  });

  if (!sessionCheck.valid) {
    securityLog('referral_rejected', {
      playerId,
      sessionId,
      ipHash,
      deviceFingerprint,
      reason: sessionCheck.reason
    });
    return { success: false, reason: sessionCheck.reason };
  }

  // 2) شروط التفعيل الأساسية
  if (playTime < 600 || level < 5 || score < 2000) {
    securityLog('referral_rejected', {
      playerId,
      referrerId: referrer.playerId,
      ipHash,
      deviceFingerprint,
      reason: 'requirements_not_met'
    });
    return { success: false, reason: 'requirements_not_met' };
  }

  // 3) التحقق من IP / Device Limits
  const ipCount = await Player.countDocuments({ ipHash });
  if (ipCount > 3) {
    securityLog('referral_rejected', {
      playerId,
      referrerId: referrer.playerId,
      ipHash,
      deviceFingerprint,
      reason: 'ip_limit_exceeded'
    });
    return { success: false, reason: 'ip_limit_exceeded' };
  }

  const deviceCount = await Player.countDocuments({ deviceFingerprint });
  if (deviceCount > 1) {
    securityLog('referral_rejected', {
      playerId,
      referrerId: referrer.playerId,
      ipHash,
      deviceFingerprint,
      reason: 'device_limit_exceeded'
    });
    return { success: false, reason: 'device_limit_exceeded' };
  }

  // 4) منع الإحالة الذاتية
  if (newPlayer && newPlayer.playerId === referrer.playerId) {
    securityLog('referral_rejected', {
      playerId,
      referrerId: referrer.playerId,
      ipHash,
      deviceFingerprint,
      reason: 'self_referral_blocked',
      flags: ['self_referral_attempt']
    });
    return { success: false, reason: 'self_referral_blocked' };
  }

  // 5) تفعيل الإحالة
  if (newPlayer) {
    newPlayer.referralActivated = true;
    newPlayer.ipHash = ipHash;
    newPlayer.deviceFingerprint = deviceFingerprint;
    await newPlayer.save();
  }

  referrer.refLevel1 += 1;
  referrer.points += 50;
  await referrer.save();

  // 6) تسجيل Log
  await ReferralLog.create({
    playerId,
    referrerId: referrer.playerId,
    ipHash,
    deviceFingerprint,
    activated: true,
    reason: 'ok'
  });

  const flags = abuse.detectAbuse({
    action: 'referral_activation',
    ipHash,
    deviceFingerprint,
    playerId,
    referrerId: referrer.playerId
  });

  securityLog('referral_activation', {
    playerId,
    referrerId: referrer.playerId,
    ipHash,
    deviceFingerprint,
    flags
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

  const sessionCheck = await sessionManager.validateSession({
    playerId,
    sessionId,
    deviceFingerprint,
    action: 'referral_activation',
    payload,
    enforceReplayProtection: true
  });

  if (!sessionCheck.valid) {
    securityLog('referral_rejected', {
      playerId,
      sessionId,
      deviceFingerprint,
      reason: sessionCheck.reason
    });
    return { success: false, reason: sessionCheck.reason };
  }

  const ipHash = buildIpHash(context);

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
      deviceFingerprint,
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
      deviceFingerprint,
      reason: 'self_referral_blocked',
      flags: ['self_referral_attempt']
    });
    return { success: false, reason: 'self_referral_blocked' };
  }

  let player = await Player.findOne({ playerId });

  if (player?.referrerId) {
    return { success: false, reason: 'referral_already_activated' };
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
  player.deviceFingerprint = deviceFingerprint;
  await player.save();

  referrer.refLevel1 += 1;
  referrer.points += 50;
  await referrer.save();

  await ReferralLog.create({
    playerId,
    referrerId: referrer.playerId,
    ipHash,
    deviceFingerprint,
    activated: true,
    reason: 'activate'
  });

  const flags = abuse.detectAbuse({
    action: 'referral_activation',
    ipHash,
    deviceFingerprint,
    playerId,
    referrerId: referrer.playerId
  });

  securityLog('referral_activation', {
    playerId,
    sessionId,
    referrerId: referrer.playerId,
    ipHash,
    deviceFingerprint,
    flags
  });

  return {
    success: true,
    playerId,
    referrerId: referrer.playerId,
    rewardGiven: true
  };
};
