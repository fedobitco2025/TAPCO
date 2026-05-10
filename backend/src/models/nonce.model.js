const mongoose = require('mongoose');

const NONCE_TTL_SECONDS = Number(process.env.NONCE_TTL_SECONDS || 24 * 60 * 60);

const nonceSchema = new mongoose.Schema({
  nonce: { type: String, required: true, unique: true, index: true },
  createdAt: { type: Date, default: Date.now }
}, {
  versionKey: false
});

// Keep nonce records bounded in size while still blocking replay attempts.
nonceSchema.index({ createdAt: 1 }, { expireAfterSeconds: NONCE_TTL_SECONDS });

module.exports = mongoose.model('Nonce', nonceSchema);
