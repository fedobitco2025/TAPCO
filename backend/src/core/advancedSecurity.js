/**
 * ============================================================
 * ADVANCED SECURITY MODULE - Military-Grade Protection
 * ============================================================
 * 
 * طبقات الحماية:
 * 1. Brute Force Detection - تتبع محاولات الوصول الفاشلة
 * 2. IP Reputation - قائمة IP مشبوهة
 * 3. OTP Generation & Validation - رموز مرة واحدة
 * 4. Audit Logging - تسجيل جميع العمليات الحساسة
 * 5. Request Encryption - تشفير البيانات الحساسة
 * 6. Geolocation Anomaly Detection - اكتشاف تغيير المكان المشبوه
 */

const crypto = require('crypto');
const { securityLog } = require('./logger');

// ════════════════════════════════════════════════════════════
// BRUTE FORCE DETECTION
// ════════════════════════════════════════════════════════════

const bruteForceMap = new Map(); // playerId -> { attempts, lastAttempt, locked }
const BRUTE_FORCE_THRESHOLD = 5; // 5 failed attempts
const BRUTE_FORCE_WINDOW = 15 * 60 * 1000; // 15 minutes
const BRUTE_FORCE_LOCKOUT_TIME = 30 * 60 * 1000; // 30 minutes

/**
 * Check if player is in brute force lockout
 */
function isBruteForced(playerId) {
  const record = bruteForceMap.get(playerId);
  if (!record) return false;
  
  if (record.locked) {
    const elapsedTime = Date.now() - record.lockedAt;
    if (elapsedTime < BRUTE_FORCE_LOCKOUT_TIME) {
      return true; // Still locked
    } else {
      bruteForceMap.delete(playerId); // Unlock
      return false;
    }
  }
  
  // Clean old attempts
  const now = Date.now();
  record.attempts = record.attempts.filter(t => now - t < BRUTE_FORCE_WINDOW);
  
  if (record.attempts.length >= BRUTE_FORCE_THRESHOLD) {
    record.locked = true;
    record.lockedAt = now;
    securityLog('brute_force_lockout', {
      playerId,
      attemptCount: record.attempts.length,
      lockoutUntil: new Date(now + BRUTE_FORCE_LOCKOUT_TIME)
    });
    return true;
  }
  
  return false;
}

/**
 * Record failed authentication attempt
 */
function recordFailedAttempt(playerId) {
  const record = bruteForceMap.get(playerId) || { attempts: [], locked: false };
  record.attempts.push(Date.now());
  bruteForceMap.set(playerId, record);
  
  securityLog('auth_failure', {
    playerId,
    attemptCount: record.attempts.length,
    threshold: BRUTE_FORCE_THRESHOLD
  });
}

/**
 * Clear failed attempts on success
 */
function clearFailedAttempts(playerId) {
  bruteForceMap.delete(playerId);
}

// ════════════════════════════════════════════════════════════
// IP REPUTATION SYSTEM
// ════════════════════════════════════════════════════════════

const ipReputationMap = new Map(); // ipHash -> { score, suspiciousActivities, lastSeen }
const SUSPICIOUS_IP_THRESHOLD = 100;
const IP_ACTIVITY_WINDOW = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Get IP reputation score (0-100, higher = more suspicious)
 */
function getIpReputation(ipHash) {
  const record = ipReputationMap.get(ipHash);
  if (!record) return 0;
  
  // Clean old activities
  const now = Date.now();
  record.suspiciousActivities = record.suspiciousActivities.filter(
    t => now - t < IP_ACTIVITY_WINDOW
  );
  
  // Calculate score based on suspicious activity frequency
  const score = Math.min(record.suspiciousActivities.length * 10, 100);
  record.score = score;
  
  return score;
}

/**
 * Record suspicious IP activity
 */
function recordSuspiciousIpActivity(ipHash, reason) {
  const record = ipReputationMap.get(ipHash) || { 
    suspiciousActivities: [], 
    score: 0 
  };
  
  record.suspiciousActivities.push(Date.now());
  record.lastSeen = Date.now();
  
  const score = getIpReputation(ipHash);
  
  if (score >= SUSPICIOUS_IP_THRESHOLD) {
    securityLog('suspicious_ip_blocked', {
      ipHash,
      reason,
      reputationScore: score
    });
  }
  
  ipReputationMap.set(ipHash, record);
}

/**
 * Check if IP is blacklisted
 */
function isIpSuspicious(ipHash) {
  return getIpReputation(ipHash) >= SUSPICIOUS_IP_THRESHOLD;
}

// ════════════════════════════════════════════════════════════
// OTP (One-Time Password) SYSTEM
// ════════════════════════════════════════════════════════════

const otpMap = new Map(); // playerId -> { code, expiresAt, attempts }
const OTP_EXPIRY_TIME = 5 * 60 * 1000; // 5 minutes
const OTP_MAX_ATTEMPTS = 3;

/**
 * Generate OTP for sensitive operations
 */
function generateOtp(playerId) {
  const code = crypto.randomInt(100000, 999999).toString();
  const expiresAt = Date.now() + OTP_EXPIRY_TIME;
  
  otpMap.set(playerId, {
    code,
    expiresAt,
    attempts: 0
  });
  
  securityLog('otp_generated', { playerId, expiresAt: new Date(expiresAt) });
  
  return code;
}

/**
 * Verify OTP code
 */
function verifyOtp(playerId, code) {
  const record = otpMap.get(playerId);
  
  if (!record) {
    securityLog('otp_not_found', { playerId });
    return { valid: false, reason: 'no_otp' };
  }
  
  if (Date.now() > record.expiresAt) {
    otpMap.delete(playerId);
    securityLog('otp_expired', { playerId });
    return { valid: false, reason: 'expired' };
  }
  
  if (record.attempts >= OTP_MAX_ATTEMPTS) {
    otpMap.delete(playerId);
    recordFailedAttempt(playerId);
    securityLog('otp_max_attempts', { playerId });
    return { valid: false, reason: 'max_attempts' };
  }
  
  if (String(code) !== String(record.code)) {
    record.attempts++;
    securityLog('otp_invalid', { 
      playerId, 
      attempt: record.attempts,
      maxAttempts: OTP_MAX_ATTEMPTS 
    });
    return { valid: false, reason: 'invalid_code' };
  }
  
  // OTP verified successfully
  otpMap.delete(playerId);
  clearFailedAttempts(playerId);
  securityLog('otp_verified', { playerId });
  
  return { valid: true };
}

// ════════════════════════════════════════════════════════════
// AUDIT LOGGING
// ════════════════════════════════════════════════════════════

/**
 * Log sensitive withdrawal operation
 */
function auditWithdrawal(playerId, amount, walletAddress, ipHash, status) {
  securityLog('withdrawal_audit', {
    playerId,
    amount,
    walletAddress: walletAddress.substring(0, 10) + '...', // Partially hide
    ipHash,
    status,
    timestamp: new Date(),
    userAgent: 'mobile/web' // Will be captured from req
  });
}

/**
 * Log account security event
 */
function auditSecurityEvent(playerId, eventType, details) {
  securityLog('security_event', {
    playerId,
    eventType,
    details,
    timestamp: new Date()
  });
}

// ════════════════════════════════════════════════════════════
// REQUEST ENCRYPTION for sensitive data
// ════════════════════════════════════════════════════════════

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
const ENCRYPTION_IV_LENGTH = 16;

/**
 * Encrypt sensitive string
 */
function encryptSensitiveData(data) {
  try {
    const iv = crypto.randomBytes(ENCRYPTION_IV_LENGTH);
    const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    
    let encrypted = cipher.update(String(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return iv.toString('hex') + ':' + encrypted;
  } catch (err) {
    console.error('[encryption] Error encrypting data:', err);
    return null;
  }
}

/**
 * Decrypt sensitive string
 */
function decryptSensitiveData(encryptedData) {
  try {
    const [ivHex, encrypted] = String(encryptedData).split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (err) {
    console.error('[encryption] Error decrypting data:', err);
    return null;
  }
}

// ════════════════════════════════════════════════════════════
// GEOLOCATION ANOMALY DETECTION
// ════════════════════════════════════════════════════════════

const playerLocationMap = new Map(); // playerId -> { lastIp, lastLocation, lastTime }

/**
 * Detect suspicious location change
 */
function detectLocationAnomaly(playerId, currentIpHash, currentLocation) {
  const record = playerLocationMap.get(playerId);
  
  if (!record) {
    playerLocationMap.set(playerId, {
      lastIp: currentIpHash,
      lastLocation: currentLocation || 'unknown',
      lastTime: Date.now()
    });
    return false;
  }
  
  // If IP changed, it could be suspicious
  if (record.lastIp !== currentIpHash) {
    const timeSinceLastChange = Date.now() - record.lastTime;
    
    // If location changed within 30 minutes, log as suspicious
    if (timeSinceLastChange < 30 * 60 * 1000) {
      securityLog('location_anomaly_detected', {
        playerId,
        previousIp: record.lastIp,
        currentIp: currentIpHash,
        timeElapsed: timeSinceLastChange
      });
      
      recordSuspiciousIpActivity(currentIpHash, 'rapid_location_change');
      return true;
    }
  }
  
  // Update record
  record.lastIp = currentIpHash;
  record.lastLocation = currentLocation || 'unknown';
  record.lastTime = Date.now();
  
  return false;
}

// ════════════════════════════════════════════════════════════
// REQUEST VALIDATION
// ════════════════════════════════════════════════════════════

/**
 * Validate withdrawal request structure
 */
function validateWithdrawalRequest(req) {
  const errors = [];
  
  const { playerId, amount, tapcoAmount, walletAddress, timestamp, clientSignature } = req.body;
  const normalizedAmount = Number(amount ?? tapcoAmount);
  
  if (!playerId || typeof playerId !== 'string' || playerId.length === 0) {
    errors.push('Invalid playerId');
  }
  
  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    errors.push('Invalid amount');
  }
  
  if (!walletAddress || typeof walletAddress !== 'string') {
    errors.push('Invalid walletAddress');
  }
  
  if (!timestamp || isNaN(timestamp)) {
    errors.push('Invalid timestamp');
  }
  
  if (!clientSignature || typeof clientSignature !== 'string') {
    errors.push('Missing clientSignature');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

module.exports = {
  // Brute force
  isBruteForced,
  recordFailedAttempt,
  clearFailedAttempts,
  
  // IP Reputation
  getIpReputation,
  recordSuspiciousIpActivity,
  isIpSuspicious,
  
  // OTP
  generateOtp,
  verifyOtp,
  
  // Audit
  auditWithdrawal,
  auditSecurityEvent,
  
  // Encryption
  encryptSensitiveData,
  decryptSensitiveData,
  
  // Geolocation
  detectLocationAnomaly,
  
  // Validation
  validateWithdrawalRequest
};
