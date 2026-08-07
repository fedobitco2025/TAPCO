module.exports = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  IS_PRODUCTION: process.env.NODE_ENV === 'production',
  PORT: Number(process.env.PORT) || 4000,
  MONGODB_URI: process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/tapco',
  REQUEST_SECRET: process.env.REQUEST_SECRET || process.env.CLIENT_SECRET || '',
  TAPCO_BLOCKCHAIN_KIND: String(process.env.TAPCO_BLOCKCHAIN_KIND || process.env.BLOCKCHAIN_KIND || 'evm').trim().toLowerCase(),
  TAPCO_NETWORK_ID: process.env.TAPCO_NETWORK_ID || '',
  TAPCO_EXPLORER_TX_BASE: process.env.TAPCO_EXPLORER_TX_BASE || '',
  TAPCO_TON_API_BASE: process.env.TAPCO_TON_API_BASE || 'https://tonapi.io',
  TAPCO_TON_API_KEY: process.env.TAPCO_TON_API_KEY || '',
  TAPCO_TON_RPC_URL: process.env.TAPCO_TON_RPC_URL || 'https://toncenter.com/api/v2/jsonRPC',
  TAPCO_TON_RPC_API_KEY: process.env.TAPCO_TON_RPC_API_KEY || '',
  TAPCO_JETTON_MASTER: process.env.TAPCO_JETTON_MASTER || '',
  TAPCO_TON_DEPOSIT_WALLET: process.env.TAPCO_TON_DEPOSIT_WALLET || '',
  TAPCO_TON_HOT_WALLET_MNEMONIC: process.env.TAPCO_TON_HOT_WALLET_MNEMONIC || '',
  TAPCO_TON_HOT_WALLET_WORKCHAIN: Number(process.env.TAPCO_TON_HOT_WALLET_WORKCHAIN) || 0,
  TAPCO_TON_SEND_VALUE: process.env.TAPCO_TON_SEND_VALUE || '0.08',
  TAPCO_TON_FORWARD_VALUE: process.env.TAPCO_TON_FORWARD_VALUE || '0.02',
  TAPCO_TON_SEND_TIMEOUT_MS: Number(process.env.TAPCO_TON_SEND_TIMEOUT_MS) || 45000,
  TON_WITHDRAW_SEND_ENABLED: String(process.env.TON_WITHDRAW_SEND_ENABLED || '').trim().toLowerCase() === 'true',
  TOKEN_DECIMALS: Number(process.env.TOKEN_DECIMALS) || 9,
  RPC_URL: process.env.RPC_URL || '',
  PRIVATE_KEY: process.env.PRIVATE_KEY || '',
  CONTRACT_ADDRESS: process.env.CONTRACT_ADDRESS || process.env.TAPCO_CONTRACT || '',
  CORS_ORIGINS: (process.env.CORS_ORIGINS || '').split(',').map((v) => v.trim()).filter(Boolean),
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
  TELEGRAM_INIT_DATA_MAX_AGE_MS: Number(process.env.TELEGRAM_INIT_DATA_MAX_AGE_MS) || 5 * 60 * 1000,
  TELEGRAM_SESSION_TTL_MS: Number(process.env.TELEGRAM_SESSION_TTL_MS) || 12 * 60 * 60 * 1000,
  TIMESTAMP_WINDOW_MS: Number(process.env.TIMESTAMP_WINDOW_MS) || 5 * 60 * 1000,
  WITHDRAW_MIN_AMOUNT: Number(process.env.WITHDRAW_MIN_AMOUNT) || 25,
  DAILY_WITHDRAW_LIMIT: Number(process.env.DAILY_WITHDRAW_LIMIT) || 5000,
  WEEKLY_WITHDRAW_LIMIT: Number(process.env.WEEKLY_WITHDRAW_LIMIT) || 20000,
  WORKER_INTERVAL_MS: Number(process.env.WORKER_INTERVAL_MS) || 15000,
  WORKER_BATCH_SIZE: Number(process.env.WORKER_BATCH_SIZE) || 5,
  WORKER_HEARTBEAT_STALE_MS: Number(process.env.WORKER_HEARTBEAT_STALE_MS) || 90_000,
  WITHDRAW_IP_WINDOW_MS: Number(process.env.WITHDRAW_IP_WINDOW_MS) || 60_000,
  WITHDRAW_IP_MAX_REQUESTS: Number(process.env.WITHDRAW_IP_MAX_REQUESTS) || 10,
  WITHDRAW_PLAYER_WINDOW_MS: Number(process.env.WITHDRAW_PLAYER_WINDOW_MS) || 10 * 60 * 1000,
  WITHDRAW_PLAYER_MAX_REQUESTS: Number(process.env.WITHDRAW_PLAYER_MAX_REQUESTS) || 3,
  INITIAL_PLAYER_BALANCE: Number(process.env.INITIAL_PLAYER_BALANCE) || 0,
  WITHDRAWALS_ENABLED: process.env.WITHDRAWALS_ENABLED !== 'false',
  WITHDRAWAL_WORKER_ENABLED: process.env.WITHDRAWAL_WORKER_ENABLED !== 'false',
  ECONOMY_ADMIN_KEY: process.env.ECONOMY_ADMIN_KEY || '',
  ECONOMY_MIN_COVERAGE_RATIO: Number(process.env.ECONOMY_MIN_COVERAGE_RATIO) || 1.1,
  ECONOMY_FAILED_WITHDRAW_ALERT_COUNT: Number(process.env.ECONOMY_FAILED_WITHDRAW_ALERT_COUNT) || 5,
  ECONOMY_DAILY_POINTS_ALERT: Number(process.env.ECONOMY_DAILY_POINTS_ALERT) || 10_000_000,
  ADSENSE_PUBLISHER_ID: String(process.env.ADSENSE_PUBLISHER_ID || '').trim(),
  AD_REWARD_ENERGY_POINTS: Number(process.env.AD_REWARD_ENERGY_POINTS) || 350,
  AD_REWARD_ENERGY_DAILY_CAP: Number(process.env.AD_REWARD_ENERGY_DAILY_CAP) || 8,
  AD_REWARD_ENERGY_COOLDOWN_SEC: Number(process.env.AD_REWARD_ENERGY_COOLDOWN_SEC) || 600,
  AD_REWARD_POINTS_BOOST_POINTS: Number(process.env.AD_REWARD_POINTS_BOOST_POINTS) || 650,
  AD_REWARD_POINTS_BOOST_DAILY_CAP: Number(process.env.AD_REWARD_POINTS_BOOST_DAILY_CAP) || 5,
  AD_REWARD_POINTS_BOOST_COOLDOWN_SEC: Number(process.env.AD_REWARD_POINTS_BOOST_COOLDOWN_SEC) || 900,
  AD_REWARD_DAILY_CHEST_POINTS: Number(process.env.AD_REWARD_DAILY_CHEST_POINTS) || 2200,
  AD_REWARD_DAILY_CHEST_DAILY_CAP: Number(process.env.AD_REWARD_DAILY_CHEST_DAILY_CAP) || 1,
  AD_REWARD_DAILY_CHEST_COOLDOWN_SEC: Number(process.env.AD_REWARD_DAILY_CHEST_COOLDOWN_SEC) || 0,
  AD_REWARD_OFFERWALL_POINTS: Number(process.env.AD_REWARD_OFFERWALL_POINTS) || 3200,
  AD_REWARD_OFFERWALL_DAILY_CAP: Number(process.env.AD_REWARD_OFFERWALL_DAILY_CAP) || 3,
  AD_REWARD_OFFERWALL_COOLDOWN_SEC: Number(process.env.AD_REWARD_OFFERWALL_COOLDOWN_SEC) || 1800,
  LOOTABLY_POSTBACK_ENABLED: process.env.LOOTABLY_POSTBACK_ENABLED !== 'false',
  LOOTABLY_POSTBACK_TOKEN: String(process.env.LOOTABLY_POSTBACK_TOKEN || '').trim(),
  
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
  TELEGRAM_BETA_GATE_ENABLED: String(process.env.TELEGRAM_BETA_GATE_ENABLED || '').trim().toLowerCase() === 'true',
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
