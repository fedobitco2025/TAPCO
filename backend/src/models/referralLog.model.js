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

referralLogSchema.index({ ipHash: 1, activated: 1, timestamp: -1 });
referralLogSchema.index({ deviceFingerprint: 1, activated: 1, timestamp: -1 });
referralLogSchema.index({ referrerId: 1, timestamp: -1 });

module.exports = mongoose.model('ReferralLog', referralLogSchema);
