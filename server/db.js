const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DB_FILE = process.env.DB_FILE || './server/data/tapco.db';
const resolvedDbPath = path.resolve(DB_FILE);

function ensureDbDirectory() {
  const dir = path.dirname(resolvedDbPath);
  fs.mkdirSync(dir, { recursive: true });
}

ensureDbDirectory();

const db = new Database(resolvedDbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    tapcoBalance INTEGER NOT NULL CHECK (tapcoBalance >= 0),
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS withdraw_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    playerId TEXT NOT NULL,
    amount INTEGER NOT NULL CHECK (amount > 0),
    walletAddress TEXT NOT NULL,
    chainId TEXT,
    status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    txHash TEXT,
    clientSignature TEXT NOT NULL,
    requestedAt INTEGER NOT NULL,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    failureReason TEXT,
    FOREIGN KEY(playerId) REFERENCES players(id)
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_withdraw_unique_signature
  ON withdraw_requests(clientSignature);

  CREATE INDEX IF NOT EXISTS idx_withdraw_status_created
  ON withdraw_requests(status, createdAt);

  CREATE INDEX IF NOT EXISTS idx_withdraw_player_created
  ON withdraw_requests(playerId, createdAt DESC);

  CREATE TABLE IF NOT EXISTS bot_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    playerId TEXT NOT NULL,
    sessionId TEXT NOT NULL,
    botTier TEXT,
    suspicionScore INTEGER,
    tps INTEGER,
    patternStdDev REAL,
    deviceFingerprint TEXT,
    ipHash TEXT,
    timestamp INTEGER NOT NULL,
    createdAt INTEGER NOT NULL,
    FOREIGN KEY(playerId) REFERENCES players(id)
  );

  CREATE INDEX IF NOT EXISTS idx_bot_reports_player_time
  ON bot_reports(playerId, timestamp DESC);

  CREATE INDEX IF NOT EXISTS idx_bot_reports_device
  ON bot_reports(deviceFingerprint);

  CREATE INDEX IF NOT EXISTS idx_bot_reports_ip
  ON bot_reports(ipHash);

  CREATE TABLE IF NOT EXISTS player_bot_profiles (
    playerId TEXT PRIMARY KEY,
    evidenceScore INTEGER NOT NULL DEFAULT 0,
    reportCount INTEGER NOT NULL DEFAULT 0,
    banStatus TEXT NOT NULL DEFAULT 'none' CHECK (banStatus IN ('none', 'soft_flag', 'shadow_ban', 'smart_ban')),
    lastReportTime INTEGER,
    firstReportTime INTEGER,
    deviceFingerprint TEXT,
    ipHash TEXT,
    deviceBanApplied INTEGER NOT NULL DEFAULT 0,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    FOREIGN KEY(playerId) REFERENCES players(id)
  );

  CREATE INDEX IF NOT EXISTS idx_player_bot_profiles_status
  ON player_bot_profiles(banStatus);

  CREATE INDEX IF NOT EXISTS idx_player_bot_profiles_device
  ON player_bot_profiles(deviceFingerprint);

  CREATE INDEX IF NOT EXISTS idx_player_bot_profiles_ip
  ON player_bot_profiles(ipHash);

  CREATE TABLE IF NOT EXISTS banned_devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deviceFingerprint TEXT,
    ipHash TEXT,
    banType TEXT NOT NULL CHECK (banType IN ('device', 'ip', 'both')),
    reason TEXT,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_banned_devices_fingerprint
  ON banned_devices(deviceFingerprint);

  CREATE INDEX IF NOT EXISTS idx_banned_devices_ip
  ON banned_devices(ipHash);
`);

module.exports = {
  db
};
