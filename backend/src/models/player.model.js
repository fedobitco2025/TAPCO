const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema({
  playerId: { type: String, required: true, unique: true, index: true },
  telegramUserId: { type: String, default: '', index: true },
  referralCode: { type: String, unique: true, sparse: true, index: true },
  referrerId: { type: String, default: '', index: true },
  referralActivated: { type: Boolean, default: false },
  refLevel1: { type: Number, default: 0 },
  refLevel2: { type: Number, default: 0 },
  refLevel3: { type: Number, default: 0 },
  address: { type: String, default: '', index: true },
  gameBalance: { type: Number, default: 0 },
  earnPoints: { type: Number, default: 0 },
  walletBalance: { type: Number, default: 0 },
  points: { type: Number, default: 0 },
  evidenceScore: { type: Number, default: 0 },
  botStatus: { type: String, default: 'none', index: true },
  clientBotTier: { type: String, default: '' },
  lastReportTimestamp: { type: Date, default: null },
  lastWithdrawTimestamp: { type: Date, default: null },
  tapcoBalance: { type: Number, default: 0 },
  refundedWithdrawalIds: { type: [String], default: [] },
  weeklyWithdrawPoints: { type: Number, default: 0 },
  weeklyWithdrawReset: { type: Number, default: 0 },
  level: { type: Number, default: 1 },
  score: { type: Number, default: 0 },
  xp: { type: Number, default: 0 },
  xpToNextLevel: { type: Number, default: 100 },
  dailyStreak: { type: Number, default: 0 },
  lastLoginDate: { type: String, default: '' },
  tapPowerLevel: { type: Number, default: 0 },
  maxEnergyLevel: { type: Number, default: 0 },
  energyRegenLevel: { type: Number, default: 0 },
  autoTapLevel: { type: Number, default: 0 },
  dailyClicks: { type: Number, default: 0 },
  dailyPoints: { type: Number, default: 0 },
  sessionTime: { type: Number, default: 0 },
  consecutiveDays: { type: Number, default: 0 },
  totalPointsEarned: { type: Number, default: 0 },
  energySpentTotal: { type: Number, default: 0 },
  totalBoostsUsed: { type: Number, default: 0 },
  completedAchievements: { type: [String], default: [] },
  midAchievementsState: {
    type: mongoose.Schema.Types.Mixed,
    default: {
      completed: {},
      progress: { tap: 0, energy: 0, auto: 0, research: 0, fusion: 0, boss: 0, weekly: 0, passive: 0 },
      unlocked: false
    }
  },
  unlockedAchievementsCount: { type: Number, default: 0 },
  unlockedSecretAchievementsCount: { type: Number, default: 0 },
  achievementUnlockTimestamps: { type: mongoose.Schema.Types.Mixed, default: {} },
  activeDailyMissions: { type: mongoose.Schema.Types.Mixed, default: [] },
  dailyMissionCompletedCount: { type: Number, default: 0 },
  lastDailyResetTimestamp: { type: Number, default: 0 },
  dailyBonusClaimed: { type: Boolean, default: false },
  gameState: { type: mongoose.Schema.Types.Mixed, default: {} },
  gameStateUpdatedAt: { type: Number, default: 0 },
  clientState: { type: mongoose.Schema.Types.Mixed, default: {} },
  clientStateUpdatedAt: { type: Number, default: 0 },
  ipHash: { type: String, default: '', index: true },
  deviceFingerprint: { type: String, default: '', index: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

playerSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Player', playerSchema);
