const crypto = require('crypto');
const evidenceEngine = require('./antibot.evidence');
const { securityLog } = require('../../core/logger');
const Player = require('../../models/player.model');
const sessionManager = require('../../core/session');

const resolveRawIp = (context = {}) => {
  const forwarded = context.headers?.['x-forwarded-for'];

  if (Array.isArray(forwarded) && forwarded[0]) {
    return String(forwarded[0]).trim();
  }

  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }

  return context.socket?.remoteAddress || '0.0.0.0';
};

module.exports.processReport = async (payload = {}, context = {}) => {
  const {
    playerId,
    sessionId,
    clientBotTier,
    suspicionScore,
    tps,
    patternStdDev,
    deviceFingerprint
  } = payload;

  if (!playerId) {
    return { success: false, reason: 'missing_fields' };
  }

  if (!sessionId) {
    return { success: false, reason: 'missing_session' };
  }

  const sessionCheck = await sessionManager.validateSession({
    playerId,
    sessionId,
    deviceFingerprint,
    action: 'antibot_report',
    payload,
    enforceReplayProtection: false
  });

  if (!sessionCheck.valid) {
    securityLog('antibot_rejected', {
      playerId,
      sessionId,
      deviceFingerprint: deviceFingerprint || '',
      reason: sessionCheck.reason
    });
    return { success: false, reason: sessionCheck.reason };
  }

  // Server extracts real IP
  const rawIP = resolveRawIp(context);
  const ipHash = crypto.createHash('sha256').update(rawIP).digest('hex');

  // Calculate evidence score
  const evidenceScore = evidenceEngine.calculateEvidence({
    suspicionScore: Number(suspicionScore) || 0,
    tps: Number(tps) || 0,
    patternStdDev: Number(patternStdDev) || 0
  });

  // Determine ban status
  let banStatus = 'none';
  if (evidenceScore >= 16) banStatus = 'smart_ban';
  else if (evidenceScore >= 11) banStatus = 'shadow_ban';
  else if (evidenceScore >= 6) banStatus = 'soft_flag';

  await Player.updateOne(
    { playerId },
    {
      $set: {
        evidenceScore,
        botStatus: banStatus,
        lastReportTimestamp: new Date(),
        deviceFingerprint: deviceFingerprint || '',
        ipHash,
        clientBotTier: clientBotTier || ''
      },
      $setOnInsert: {
        playerId
      }
    },
    { upsert: true }
  );

  securityLog('antibot_report', {
    playerId,
    sessionId,
    evidenceScore,
    banStatus,
    ipHash,
    deviceFingerprint: deviceFingerprint || ''
  });

  return {
    success: true,
    playerId,
    evidenceScore,
    banStatus
  };
};

module.exports.handleBotReport = async (req) => {
  return module.exports.processReport(req.body, {
    headers: req.headers,
    socket: req.socket
  });
};
