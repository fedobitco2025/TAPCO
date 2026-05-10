const mongoose = require('mongoose');

const recentRequestSchema = new mongoose.Schema({
  fingerprint: { type: String, required: true },
  at: { type: Date, required: true }
}, { _id: false });

const sessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true, index: true },
  playerId: { type: String, required: true, index: true },
  deviceFingerprint: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  lastSeenAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  recentRequests: { type: [recentRequestSchema], default: [] }
}, {
  versionKey: false
});

// TTL index: remove expired sessions automatically.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Session', sessionSchema);