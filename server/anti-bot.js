const { db } = require('./db');

// Constants
const EVIDENCE_THRESHOLDS = {
  NORMAL: 5,
  MONITORING: 10,
  HIGH_RISK: 15,
  BAN: 16
};

const EVIDENCE_POINTS = {
  TPS_OVER_20_10S: 2,
  TPS_OVER_25_5S: 3,
  REGULAR_PATTERN: 3,
  THREE_REPORTS_10M: 2,
  FIVE_REPORTS_30M: 3,
  SAME_DEVICE_3_ACCOUNTS: 4,
  SAME_IP_5_ACCOUNTS: 3,
  AUTOTAP_24_7: 4
};

// Prepared statements for bot reports
const insertBotReportStmt = db.prepare(`
  INSERT INTO bot_reports (
    playerId, sessionId, botTier, suspicionScore, tps, patternStdDev,
    deviceFingerprint, ipHash, timestamp, createdAt
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const getPlayerReportsStmt = db.prepare(`
  SELECT * FROM bot_reports
  WHERE playerId = ?
  ORDER BY timestamp DESC
`);

const getPlayerProfileStmt = db.prepare(`
  SELECT * FROM player_bot_profiles
  WHERE playerId = ?
`);

const createPlayerProfileStmt = db.prepare(`
  INSERT INTO player_bot_profiles (
    playerId, evidenceScore, reportCount, banStatus,
    firstReportTime, lastReportTime, deviceFingerprint, ipHash,
    createdAt, updatedAt
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const updatePlayerProfileStmt = db.prepare(`
  UPDATE player_bot_profiles
  SET evidenceScore = ?, reportCount = ?, banStatus = ?,
      lastReportTime = ?, deviceFingerprint = ?, ipHash = ?,
      deviceBanApplied = ?, updatedAt = ?
  WHERE playerId = ?
`);

const countDeviceAccountsStmt = db.prepare(`
  SELECT COUNT(DISTINCT playerId) as count
  FROM player_bot_profiles
  WHERE deviceFingerprint = ? AND banStatus != 'none'
`);

const countIpAccountsStmt = db.prepare(`
  SELECT COUNT(DISTINCT playerId) as count
  FROM player_bot_profiles
  WHERE ipHash = ? AND banStatus != 'none'
`);

const getReportsInTimeWindowStmt = db.prepare(`
  SELECT COUNT(*) as count
  FROM bot_reports
  WHERE playerId = ? AND timestamp >= ?
`);

const insertBannedDeviceStmt = db.prepare(`
  INSERT INTO banned_devices (deviceFingerprint, ipHash, banType, reason, createdAt, updatedAt)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const checkBannedDeviceStmt = db.prepare(`
  SELECT * FROM banned_devices
  WHERE (deviceFingerprint = ? OR ipHash = ?)
  LIMIT 1
`);

const getPlayersByDeviceStmt = db.prepare(`
  SELECT playerId FROM player_bot_profiles
  WHERE deviceFingerprint = ?
`);

const getPlayersByIpStmt = db.prepare(`
  SELECT playerId FROM player_bot_profiles
  WHERE ipHash = ?
`);

/**
 * Calculate evidence points based on reports
 */
function calculateEvidencePoints(profile, allReports) {
  let points = 0;
  const now = Date.now();

  if (!allReports || allReports.length === 0) {
    return 0;
  }

  // Recent reports (last 10 minutes)
  const recentReports = allReports.filter(r => (now - r.timestamp) <= 10 * 60 * 1000);
  const last5MinReports = allReports.filter(r => (now - r.timestamp) <= 5 * 60 * 1000);
  const last30MinReports = allReports.filter(r => (now - r.timestamp) <= 30 * 60 * 1000);

  // TPS analysis
  const avgTps = recentReports.length > 0
    ? recentReports.reduce((sum, r) => sum + (r.tps || 0), 0) / recentReports.length
    : 0;

  const tpsOver20Count = recentReports.filter(r => r.tps > 20).length;
  const tpsOver25Count = recentReports.filter(r => r.tps > 25).length;

  if (tpsOver20Count > 0 && (now - recentReports[0].timestamp) >= 10 * 1000) {
    points += EVIDENCE_POINTS.TPS_OVER_20_10S;
  }

  if (tpsOver25Count > 0 && (now - last5MinReports[0]?.timestamp || now) >= 5 * 1000) {
    points += EVIDENCE_POINTS.TPS_OVER_25_5S;
  }

  // Pattern regularity (low stdDev = very regular = suspicious)
  const avgStdDev = recentReports.length > 0
    ? recentReports.reduce((sum, r) => sum + (r.patternStdDev || 0), 0) / recentReports.length
    : 0;

  if (avgStdDev < 2 && recentReports.length >= 3) {
    points += EVIDENCE_POINTS.REGULAR_PATTERN;
  }

  // Report frequency
  if (recentReports.length >= 3) {
    points += EVIDENCE_POINTS.THREE_REPORTS_10M;
  }

  if (last30MinReports.length >= 5) {
    points += EVIDENCE_POINTS.FIVE_REPORTS_30M;
  }

  return points;
}

/**
 * Analyze a bot report and update player profile
 */
function analyzeBotReport(playerId, reportData) {
  const now = Date.now();

  // Validate required fields
  if (!playerId || !reportData.deviceFingerprint || !reportData.ipHash) {
    return { ok: false, message: 'بيانات التقرير غير مكتملة' };
  }

  // Record the report
  insertBotReportStmt.run(
    playerId,
    reportData.sessionId || '',
    reportData.botTier || '',
    reportData.suspicionScore || 0,
    reportData.tps || 0,
    reportData.patternStdDev || 0,
    reportData.deviceFingerprint,
    reportData.ipHash,
    reportData.timestamp || now,
    now
  );

  // Get or create player profile
  let profile = getPlayerProfileStmt.get(playerId);
  if (!profile) {
    createPlayerProfileStmt.run(
      playerId, 0, 1, 'none',
      now, now,
      reportData.deviceFingerprint,
      reportData.ipHash,
      now, now
    );
    profile = getPlayerProfileStmt.get(playerId);
  }

  // Get all reports for this player
  const allReports = getPlayerReportsStmt.all(playerId);

  // Calculate new evidence score
  const evidenceScore = calculateEvidencePoints(profile, allReports);

  // Check device/IP reuse
  const deviceCount = countDeviceAccountsStmt.get(reportData.deviceFingerprint).count || 0;
  const ipCount = countIpAccountsStmt.get(reportData.ipHash).count || 0;

  let extraPoints = 0;
  if (deviceCount >= 3) {
    extraPoints += EVIDENCE_POINTS.SAME_DEVICE_3_ACCOUNTS;
  }

  if (ipCount >= 5) {
    extraPoints += EVIDENCE_POINTS.SAME_IP_5_ACCOUNTS;
  }

  const totalEvidenceScore = evidenceScore + extraPoints;
  const reportCount = allReports.length;

  // Determine ban status based on evidence
  const banDecision = makeBanDecision(
    playerId,
    profile,
    totalEvidenceScore,
    reportCount,
    allReports,
    reportData
  );

  // Update profile
  updatePlayerProfileStmt.run(
    totalEvidenceScore,
    reportCount,
    banDecision.status,
    now,
    reportData.deviceFingerprint,
    reportData.ipHash,
    banDecision.deviceLockApplied ? 1 : 0,
    now,
    playerId
  );

  // Apply device lock if needed
  if (banDecision.deviceLockApplied) {
    applyBanPersistence(
      reportData.deviceFingerprint,
      reportData.ipHash,
      banDecision.status,
      playerId
    );
  }

  return {
    ok: true,
    playerId,
    banStatus: banDecision.status,
    evidenceScore: totalEvidenceScore,
    action: banDecision.action,
    message: `تم تحليل التقرير - الحالة: ${banDecision.statusAr}`
  };
}

/**
 * Make smart ban decision based on evidence
 */
function makeBanDecision(playerId, profile, evidenceScore, reportCount, allReports, reportData) {
  const now = Date.now();

  // Determine decision phase
  if (evidenceScore < EVIDENCE_THRESHOLDS.NORMAL) {
    return {
      status: 'none',
      action: 'none',
      statusAr: 'طبيعي',
      deviceLockApplied: false
    };
  }

  if (evidenceScore < EVIDENCE_THRESHOLDS.MONITORING) {
    return {
      status: 'soft_flag',
      action: 'monitor_and_reduce_rewards',
      statusAr: 'تحذير ناعم - تحت المراقبة',
      deviceLockApplied: false
    };
  }

  if (evidenceScore < EVIDENCE_THRESHOLDS.HIGH_RISK) {
    return {
      status: 'shadow_ban',
      action: 'shadow_ban_account',
      statusAr: 'حظر الظل',
      deviceLockApplied: false
    };
  }

  // Smart ban conditions
  const behaviorDuration = now - (profile?.firstReportTime || now);
  const deviceCount = countDeviceAccountsStmt.get(reportData.deviceFingerprint).count || 0;
  const ipCount = countIpAccountsStmt.get(reportData.ipHash).count || 0;
  const sixtyMinutesAgo = now - 60 * 60 * 1000;

  // Check if continues after warnings
  const recentReports = allReports.filter(r => r.timestamp >= sixtyMinutesAgo);

  const shouldApplySmartBan =
    evidenceScore >= EVIDENCE_THRESHOLDS.BAN &&
    behaviorDuration > 30 * 60 * 1000 &&
    (deviceCount >= 3 || ipCount >= 5) &&
    recentReports.length > 2;

  if (shouldApplySmartBan) {
    return {
      status: 'smart_ban',
      action: 'smart_ban_and_lock_device',
      statusAr: 'حظر ذكي - قفل الجهاز',
      deviceLockApplied: true
    };
  }

  return {
    status: 'shadow_ban',
    action: 'shadow_ban_account',
    statusAr: 'حظر الظل',
    deviceLockApplied: false
  };
}

/**
 * Apply ban persistence and device lock
 */
function applyBanPersistence(deviceFingerprint, ipHash, banStatus, playerId) {
  const now = Date.now();

  // Insert into banned_devices
  insertBannedDeviceStmt.run(
    deviceFingerprint,
    ipHash,
    'both',
    `Smart ban applied for ${banStatus}`,
    now,
    now
  );

  // Ban all accounts from this device and IP
  const devicePlayers = getPlayersByDeviceStmt.all(deviceFingerprint) || [];
  const ipPlayers = getPlayersByIpStmt.all(ipHash) || [];
  const allBannedPlayers = new Set([
    ...devicePlayers.map(p => p.playerId),
    ...ipPlayers.map(p => p.playerId)
  ]);

  allBannedPlayers.forEach(pId => {
    const existingProfile = getPlayerProfileStmt.get(pId);
    if (existingProfile && existingProfile.banStatus !== 'smart_ban') {
      updatePlayerProfileStmt.run(
        existingProfile.evidenceScore,
        existingProfile.reportCount,
        'smart_ban',
        now,
        existingProfile.deviceFingerprint,
        existingProfile.ipHash,
        1,
        now,
        pId
      );
    }
  });
}

/**
 * Check if player is banned
 */
function checkBanStatus(playerId, deviceFingerprint, ipHash) {
  // Check player ban status
  const profile = getPlayerProfileStmt.get(playerId);

  if (profile && profile.banStatus !== 'none') {
    return {
      isBanned: true,
      banStatus: profile.banStatus,
      reason: `حساب محظور - ${profile.banStatus}`,
      canWithdraw: profile.banStatus !== 'shadow_ban' && profile.banStatus !== 'smart_ban',
      canReceiveRewards: profile.banStatus !== 'shadow_ban' && profile.banStatus !== 'smart_ban'
    };
  }

  // Check device/IP ban
  if (deviceFingerprint || ipHash) {
    const bannedDevice = checkBannedDeviceStmt.get(deviceFingerprint, ipHash);
    if (bannedDevice) {
      return {
        isBanned: true,
        banStatus: 'device_locked',
        reason: 'جهازك محظور - لا يمكن الوصول للحساب',
        canWithdraw: false,
        canReceiveRewards: false
      };
    }
  }

  return {
    isBanned: false,
    banStatus: 'none',
    canWithdraw: true,
    canReceiveRewards: true
  };
}

/**
 * Get bot tier for player
 */
function getPlayerBotTier(playerId) {
  const profile = getPlayerProfileStmt.get(playerId);
  if (!profile) return 'A';

  const evidenceScore = profile.evidenceScore || 0;
  if (evidenceScore >= 16) return 'C';
  if (evidenceScore >= 11) return 'B';
  return 'A';
}

/**
 * Get server bot state for a player
 */
function getServerBotState(playerId) {
  const profile = getPlayerProfileStmt.get(playerId);
  if (!profile) {
    return {
      playerId,
      serverBotScore: 0,
      botTier: 'A',
      banStatus: 'none',
      reportCount: 0
    };
  }

  return {
    playerId,
    serverBotScore: profile.evidenceScore,
    botTier: getPlayerBotTier(playerId),
    banStatus: profile.banStatus,
    reportCount: profile.reportCount
  };
}

/**
 * Apply points penalty based on bot tier
 * Returns: { basePoints, penaltyPercent, finalPoints, tier }
 */
function applyPointPenalty(basePoints, botTier) {
  const penaltyMap = {
    'A': { percent: 0, factor: 1.0 },
    'B': { percent: 10, factor: 0.9 },
    'C': { percent: 40, factor: 0.6 }
  };

  const penalty = penaltyMap[botTier] || penaltyMap['A'];
  const finalPoints = Math.floor(basePoints * penalty.factor);

  return {
    basePoints,
    penaltyPercent: penalty.percent,
    finalPoints,
    tier: botTier,
    penaltyApplied: penalty.percent > 0
  };
}

/**
 * Apply energy penalty based on bot tier
 * Returns: { baseCost, penaltyPercent, finalCost, tier }
 */
function applyEnergyPenalty(baseCost, botTier) {
  const bonusMap = {
    'A': { percent: 0, factor: 1.0 },
    'B': { percent: 0, factor: 1.0 },
    'C': { percent: 15, factor: 1.15 }
  };

  const bonus = bonusMap[botTier] || bonusMap['A'];
  const finalCost = Math.ceil(baseCost * bonus.factor);

  return {
    baseCost,
    bonusPercent: bonus.percent,
    finalCost,
    tier: botTier,
    bonusApplied: bonus.percent > 0
  };
}

/**
 * Verify referral is allowed for player
 */
function canPlayerActivateReferral(botTier, banStatus) {
  // Cannot activate referral if shadow banned or smart banned
  if (banStatus === 'shadow_ban' || banStatus === 'smart_ban') {
    return {
      allowed: false,
      reason: 'حسابك محظور - لا يمكن تفعيل الإحالات'
    };
  }

  // Cannot activate referral if tier C
  if (botTier === 'C') {
    return {
      allowed: false,
      reason: 'حسابك تحت المراقبة - لا يمكن تفعيل الإحالات الآن'
    };
  }

  return {
    allowed: true,
    reason: 'OK'
  };
}

/**
 * Verify wallet operation is allowed
 */
function canPlayerPerformWalletOp(botTier, banStatus, operation) {
  // smart_ban: block everything
  if (banStatus === 'smart_ban') {
    return {
      allowed: false,
      silent: false,
      reason: 'حسابك محظور - لا يمكن إجراء هذه العملية'
    };
  }

  // shadow_ban: pretend success but block execution
  if (banStatus === 'shadow_ban') {
    return {
      allowed: true,
      silent: true,
      reason: 'تم معالجة الطلب (shadow)'
    };
  }

  // soft_flag: allow with logging
  if (botTier === 'C' && banStatus === 'soft_flag') {
    return {
      allowed: true,
      silent: false,
      reason: 'OK (monitored)',
      requiresLogging: true
    };
  }

  return {
    allowed: true,
    silent: false,
    reason: 'OK'
  };
}

/**
 * Log anti-bot action
 */
function logAntiBotAction(playerId, action, details = {}) {
  const now = Date.now();
  const logEntry = {
    timestamp: now,
    playerId,
    action,
    details,
    isoTime: new Date(now).toISOString()
  };

  // In production, this would write to a log file or external service
  // For now, we'll store it in a simple in-memory buffer
  if (!global.antiBotLogs) {
    global.antiBotLogs = [];
  }

  global.antiBotLogs.push(logEntry);

  // Keep only last 10000 logs in memory
  if (global.antiBotLogs.length > 10000) {
    global.antiBotLogs = global.antiBotLogs.slice(-10000);
  }

  console.log(`[AntiBot] ${action}: ${playerId} -`, details);
}

module.exports = {
  analyzeBotReport,
  makeBanDecision,
  applyBanPersistence,
  checkBanStatus,
  getPlayerBotTier,
  getServerBotState,
  applyPointPenalty,
  applyEnergyPenalty,
  canPlayerActivateReferral,
  canPlayerPerformWalletOp,
  logAntiBotAction,
  EVIDENCE_THRESHOLDS,
  EVIDENCE_POINTS
};
