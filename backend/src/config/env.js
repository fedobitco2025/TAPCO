module.exports = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  IS_PRODUCTION: process.env.NODE_ENV === 'production',
  PORT: Number(process.env.PORT) || 4000,
  MONGODB_URI: process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/tapco',
  REQUEST_SECRET: process.env.REQUEST_SECRET || process.env.CLIENT_SECRET || '',
  RPC_URL: process.env.RPC_URL || '',
  PRIVATE_KEY: process.env.PRIVATE_KEY || '',
  CONTRACT_ADDRESS: process.env.CONTRACT_ADDRESS || process.env.TAPCO_CONTRACT || '',
  CORS_ORIGINS: (process.env.CORS_ORIGINS || '').split(',').map((v) => v.trim()).filter(Boolean),
  EXPOSE_DEV_OTP:
    process.env.EXPOSE_DEV_OTP === 'true' ||
    (process.env.NODE_ENV !== 'production' && process.env.EXPOSE_DEV_OTP !== 'false'),
  TIMESTAMP_WINDOW_MS: Number(process.env.TIMESTAMP_WINDOW_MS) || 5 * 60 * 1000,
  WITHDRAW_MIN_AMOUNT: Number(process.env.WITHDRAW_MIN_AMOUNT) || 25,
  DAILY_WITHDRAW_LIMIT: Number(process.env.DAILY_WITHDRAW_LIMIT) || 5000,
  WEEKLY_WITHDRAW_LIMIT: Number(process.env.WEEKLY_WITHDRAW_LIMIT) || 20000,
  WORKER_INTERVAL_MS: Number(process.env.WORKER_INTERVAL_MS) || 15000,
  WORKER_BATCH_SIZE: Number(process.env.WORKER_BATCH_SIZE) || 5,
  WITHDRAW_IP_WINDOW_MS: Number(process.env.WITHDRAW_IP_WINDOW_MS) || 60_000,
  WITHDRAW_IP_MAX_REQUESTS: Number(process.env.WITHDRAW_IP_MAX_REQUESTS) || 10,
  WITHDRAW_PLAYER_WINDOW_MS: Number(process.env.WITHDRAW_PLAYER_WINDOW_MS) || 10 * 60 * 1000,
  WITHDRAW_PLAYER_MAX_REQUESTS: Number(process.env.WITHDRAW_PLAYER_MAX_REQUESTS) || 3,
  INITIAL_PLAYER_BALANCE: Number(process.env.INITIAL_PLAYER_BALANCE) || 0,
  
  // ─ ADVANCED SECURITY SETTINGS ─
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || require('crypto').randomBytes(32).toString('hex'),
  BRUTE_FORCE_THRESHOLD: Number(process.env.BRUTE_FORCE_THRESHOLD) || 5,
  BRUTE_FORCE_WINDOW_MS: Number(process.env.BRUTE_FORCE_WINDOW_MS) || 15 * 60 * 1000,
  BRUTE_FORCE_LOCKOUT_MS: Number(process.env.BRUTE_FORCE_LOCKOUT_MS) || 30 * 60 * 1000,
  
  OTP_EXPIRY_MS: Number(process.env.OTP_EXPIRY_MS) || 5 * 60 * 1000,
  OTP_MAX_ATTEMPTS: Number(process.env.OTP_MAX_ATTEMPTS) || 3,
  
  SUSPICIOUS_IP_THRESHOLD: Number(process.env.SUSPICIOUS_IP_THRESHOLD) || 100,
  IP_ACTIVITY_WINDOW_MS: Number(process.env.IP_ACTIVITY_WINDOW_MS) || 24 * 60 * 60 * 1000,
  
  // ─ 2FA Settings for Withdrawals ─
  WITHDRAWAL_2FA_THRESHOLD: Number(process.env.WITHDRAWAL_2FA_THRESHOLD) || 10000,
  LARGE_WITHDRAWAL_DAILY_LIMIT: Number(process.env.LARGE_WITHDRAWAL_DAILY_LIMIT) || 25000,
  
  // ─ IP Whitelist (comma-separated) ─
  IP_WHITELIST: (process.env.IP_WHITELIST || '').split(',').filter(ip => ip.trim()),
  
  // ─ Enable Security Features ─
  ENABLE_2FA: process.env.ENABLE_2FA !== 'false', // Default: true
  ENABLE_IP_REPUTATION: process.env.ENABLE_IP_REPUTATION !== 'false', // Default: true
  ENABLE_LOCATION_ANOMALY_DETECTION: process.env.ENABLE_LOCATION_ANOMALY_DETECTION !== 'false', // Default: true

  // ─ Telegram Closed Beta Gate ─
  TELEGRAM_BETA_GATE_ENABLED: process.env.TELEGRAM_BETA_GATE_ENABLED === 'true',
  TELEGRAM_BETA_ALLOWLIST: (process.env.TELEGRAM_BETA_ALLOWLIST || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean),
  TELEGRAM_BETA_BLOCK_MESSAGE:
    process.env.TELEGRAM_BETA_BLOCK_MESSAGE ||
    'This Telegram account is not allowed during closed beta testing.',
  
  // ─ Audit Logging ─
  ENABLE_AUDIT_LOG: process.env.ENABLE_AUDIT_LOG !== 'false', // Default: true
  AUDIT_LOG_RETENTION_DAYS: Number(process.env.AUDIT_LOG_RETENTION_DAYS) || 90,

  // ─ Runtime Security Alerts ─
  SECURITY_ALERT_WINDOW_MS: Number(process.env.SECURITY_ALERT_WINDOW_MS) || 60_000,
  RATE_LIMIT_ALERT_THRESHOLD: Number(process.env.RATE_LIMIT_ALERT_THRESHOLD) || 25,
  OTP_FAILURE_ALERT_THRESHOLD: Number(process.env.OTP_FAILURE_ALERT_THRESHOLD) || 10,
  WORKER_FAILURE_ALERT_THRESHOLD: Number(process.env.WORKER_FAILURE_ALERT_THRESHOLD) || 5
};
