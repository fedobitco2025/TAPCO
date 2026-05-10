/**
 * ============================================================
 * SENSITIVE OPERATIONS SECURITY MIDDLEWARE
 * ============================================================
 * 
 * يتحقق من:
 * - 2FA (Two-Factor Authentication)
 * - OTP (One-Time Password)
 * - Request signature validity
 * - IP reputation
 * - Brute force status
 * - Rate limits for sensitive operations
 */

const { securityLog } = require('../core/logger');
const advancedSecurity = require('../core/advancedSecurity');
const crypto = require('crypto');
const envConfig = require('../config/env');
const { computeClientSignature, isValidEthAddress } = require('../core/security');

const resolveIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (Array.isArray(forwarded) && forwarded[0]) return String(forwarded[0]).trim();
  if (typeof forwarded === 'string' && forwarded.length > 0) return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress || req.connection?.remoteAddress || '0.0.0.0';
};

const getIpHash = (ip) => crypto.createHash('sha256').update(String(ip)).digest('hex');

// ════════════════════════════════════════════════════════════
// 1. Check Brute Force Status
// ════════════════════════════════════════════════════════════

module.exports.checkBruteForce = (req, res, next) => {
  const playerId = req.body?.playerId || req.body?.fromPlayer || '';
  
  if (!playerId) {
    return next(); // Skip if no playerId
  }
  
  if (advancedSecurity.isBruteForced(playerId)) {
    securityLog('brute_force_rejection', {
      playerId,
      reason: 'Account temporarily locked due to too many failed attempts',
      statusCode: 429
    });
    
    return res.status(429).json({
      success: false,
      reason: 'account_locked',
      message: 'Your account is temporarily locked. Try again in 30 minutes.'
    });
  }
  
  next();
};

// ════════════════════════════════════════════════════════════
// 2. Check IP Reputation
// ════════════════════════════════════════════════════════════

module.exports.checkIpReputation = (req, res, next) => {
  const ip = resolveIp(req);
  const ipHash = getIpHash(ip);
  
  const reputation = advancedSecurity.getIpReputation(ipHash);
  
  // Store for later use
  req.ipHash = ipHash;
  req.ipReputation = reputation;
  
  if (advancedSecurity.isIpSuspicious(ipHash)) {
    securityLog('suspicious_ip_detected', {
      ipHash,
      reputation,
      path: req.path,
      playerId: req.body?.playerId
    });
    
    // Allow request but flag it
    req.flaggedAsHighRisk = true;
  }
  
  next();
};

// ════════════════════════════════════════════════════════════
// 3. Validate 2FA for Sensitive Operations
// ════════════════════════════════════════════════════════════

module.exports.require2FA = (req, res, next) => {
  const { playerId, otp, twoFactorToken } = req.body;
  
  if (!playerId) {
    return res.status(400).json({
      success: false,
      reason: 'missing_playerId'
    });
  }
  
  // Check if OTP is provided
  if (!otp) {
    // Generate and send OTP
    const generatedOtp = advancedSecurity.generateOtp(playerId);
    
    securityLog('2fa_otp_requested', {
      playerId,
      method: 'generated'
    });
    
    // Only expose dev OTP when explicitly enabled.
    const devMode = !!envConfig.EXPOSE_DEV_OTP;
    return res.status(200).json({
      success: false,
      reason: 'otp_required',
      message: devMode
        ? `أدخل رمز التحقق: ${generatedOtp}`
        : 'تم إرسال رمز التحقق المكون من 6 أرقام',
      requiresOtp: true,
      ...(devMode && { devOtp: generatedOtp })
    });
  }
  
  // Verify OTP
  const otpVerification = advancedSecurity.verifyOtp(playerId, otp);
  
  if (!otpVerification.valid) {
    advancedSecurity.recordFailedAttempt(playerId);
    
    securityLog('2fa_otp_failed', {
      playerId,
      reason: otpVerification.reason
    });
    
    return res.status(401).json({
      success: false,
      reason: 'otp_invalid',
      message: `رمز التحقق غير صحيح. ${3 - (req.body.otpAttempt || 1)} محاولات متبقية.`
    });
  }
  
  // OTP verified, continue
  req.authenticated2FA = true;
  next();
};

// ════════════════════════════════════════════════════════════
// 4. Location Anomaly Detection
// ════════════════════════════════════════════════════════════

module.exports.detectLocationAnomaly = (req, res, next) => {
  const playerId = req.body?.playerId || '';
  const ipHash = req.ipHash || getIpHash(resolveIp(req));
  
  if (!playerId) {
    return next();
  }
  
  const isAnomaly = advancedSecurity.detectLocationAnomaly(playerId, ipHash, req.headers['cf-ipcountry'] || 'unknown');
  
  if (isAnomaly) {
    // Flag but don't block - let 2FA handle it
    req.flaggedAsHighRisk = true;
  }
  
  next();
};

// ════════════════════════════════════════════════════════════
// 5. High-Risk Operation Verification
// ════════════════════════════════════════════════════════════

module.exports.verifyHighRiskOperation = (req, res, next) => {
  if (!req.flaggedAsHighRisk) {
    return next(); // Not high risk, proceed
  }
  
  const playerId = req.body?.playerId || '';
  
  // For high-risk operations, require additional verification
  securityLog('high_risk_operation_detected', {
    playerId,
    ipReputation: req.ipReputation,
    path: req.path,
    method: req.method
  });
  
  // Could require email confirmation, SMS code, etc.
  // For now, just log it and continue with strict rate limiting
  
  next();
};

// ════════════════════════════════════════════════════════════
// 6. Withdrawal-Specific Security
// ════════════════════════════════════════════════════════════

module.exports.validateWithdrawalSecurity = (req, res, next) => {
  const playerId = req.body?.playerId || '';
  const amount = Number(req.body?.amount ?? req.body?.tapcoAmount ?? 0);
  const walletAddress = req.body?.walletAddress || '';
  
  // Validate structure
  const validation = advancedSecurity.validateWithdrawalRequest(req);
  
  if (!validation.valid) {
    securityLog('withdrawal_validation_failed', {
      playerId,
      errors: validation.errors
    });
    
    return res.status(400).json({
      success: false,
      reason: 'invalid_request',
      errors: validation.errors
    });
  }

  if (!isValidEthAddress(walletAddress)) {
    return res.status(400).json({
      success: false,
      reason: 'invalid_wallet_address',
      message: 'عنوان المحفظة غير صالح'
    });
  }

  if (amount < envConfig.WITHDRAW_MIN_AMOUNT) {
    return res.status(400).json({
      success: false,
      reason: 'amount_below_minimum',
      message: `الحد الأدنى للسحب هو ${envConfig.WITHDRAW_MIN_AMOUNT} TAPCO`
    });
  }
  
  // Check if amount exceeds daily limit (25,000 per day)
  const DAILY_LIMIT = 25000;
  if (amount > DAILY_LIMIT) {
    securityLog('withdrawal_amount_exceeded', {
      playerId,
      amount,
      limit: DAILY_LIMIT
    });
    
    return res.status(400).json({
      success: false,
      reason: 'daily_limit_exceeded',
      message: `Maximum daily withdrawal is ${DAILY_LIMIT} points. You requested ${amount}.`
    });
  }
  
  // Audit log
  advancedSecurity.auditWithdrawal(playerId, amount, walletAddress, req.ipHash || getIpHash(resolveIp(req)), 'initiated');
  
  next();
};

// ════════════════════════════════════════════════════════════
// 7. Enhanced Signature Validation
// ════════════════════════════════════════════════════════════

module.exports.validateEnhancedSignature = (req, res, next) => {
  const { playerId, clientSignature, timestamp, tapcoAmount, amount, walletAddress } = req.body;

  const normalizedAmount = Number(amount ?? tapcoAmount ?? 0);
  
  // Check timestamp freshness (5 minutes window)
  const TIMESTAMP_WINDOW = 5 * 60 * 1000;
  if (Math.abs(Date.now() - Number(timestamp)) > TIMESTAMP_WINDOW) {
    securityLog('signature_timestamp_stale', {
      playerId,
      timeDiff: Math.abs(Date.now() - Number(timestamp))
    });
    
    return res.status(401).json({
      success: false,
      reason: 'request_expired',
      message: 'Request timestamp is too old. Please try again.'
    });
  }

  const expectedSig = computeClientSignature({
    playerId,
    tapcoAmount: normalizedAmount,
    walletAddress,
    timestamp
  });

  if (!clientSignature || String(clientSignature).trim() !== expectedSig) {
    securityLog('signature_mismatch', {
      playerId,
      reason: 'invalid_client_signature',
      statusCode: 400,
      path: req.path,
      method: req.method
    });

    return res.status(400).json({
      success: false,
      reason: 'invalid_signature',
      message: 'clientSignature غير صحيحة'
    });
  }
  
  next();
};

// ════════════════════════════════════════════════════════════
// 8. Withdrawal-Specific Rate Limiting
// ════════════════════════════════════════════════════════════

const withdrawalAttempts = new Map(); // playerId -> [{ timestamp, amount }, ...]

module.exports.withdrawalRateLimit = (req, res, next) => {
  const playerId = req.body?.playerId || '';
  const amount = Number(req.body?.amount ?? req.body?.tapcoAmount ?? 0);
  
  const now = Date.now();
  const WINDOW = 60 * 60 * 1000; // 1 hour window
  const MAX_ATTEMPTS = 10; // Max 10 withdrawals per hour
  
  let record = withdrawalAttempts.get(playerId) || [];
  
  // Clean old attempts
  record = record.filter(r => now - r.timestamp < WINDOW);
  
  if (record.length >= MAX_ATTEMPTS) {
    securityLog('withdrawal_rate_limit_exceeded', {
      playerId,
      attempts: record.length,
      limit: MAX_ATTEMPTS
    });
    
    return res.status(429).json({
      success: false,
      reason: 'withdrawal_rate_limit',
      message: 'Too many withdrawal attempts. Please try again later.'
    });
  }
  
  // Record attempt
  record.push({ timestamp: now, amount });
  withdrawalAttempts.set(playerId, record);
  
  next();
};

// ════════════════════════════════════════════════════════════
// 9. Request Logging Middleware
// ════════════════════════════════════════════════════════════

module.exports.logSensitiveRequest = (req, res, next) => {
  const playerId = req.body?.playerId || 'unknown';
  const path = req.path;
  const method = req.method;
  const ipHash = req.ipHash || getIpHash(resolveIp(req));
  
  securityLog('sensitive_request', {
    playerId,
    path,
    method,
    ipHash,
    timestamp: new Date(),
    flagged: req.flaggedAsHighRisk || false
  });
  
  next();
};
