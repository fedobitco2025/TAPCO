const mongoose = require('mongoose');

const referralLogSchema = new mongoose.Schema({
  playerId: String,
  referrerId: String,
  ipHash: String,
  deviceFingerprint: String,
  activated: Boolean,
  reason: String,
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ReferralLog', referralLogSchema);
