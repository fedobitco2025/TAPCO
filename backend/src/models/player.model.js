const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema({
  playerId: { type: String, required: true, unique: true, index: true },
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
  weeklyWithdrawPoints: { type: Number, default: 0 },
  weeklyWithdrawReset: { type: Number, default: 0 },
  level: { type: Number, default: 1 },
  score: { type: Number, default: 0 },
  ipHash: { type: String, default: '' },
  deviceFingerprint: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

playerSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Player', playerSchema);
