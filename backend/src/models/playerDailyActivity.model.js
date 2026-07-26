const mongoose = require('mongoose');

const playerDailyActivitySchema = new mongoose.Schema({
  playerId: { type: String, required: true, index: true },
  day: { type: String, required: true, index: true },
  firstSeenAt: { type: Date, required: true },
  lastSeenAt: { type: Date, required: true, index: true },
  points: { type: Number, default: 0 },
  clicks: { type: Number, default: 0 },
  sessionTime: { type: Number, default: 0 },
  level: { type: Number, default: 1 },
  source: { type: String, default: 'player_progress' }
}, {
  versionKey: false
});

playerDailyActivitySchema.index({ playerId: 1, day: 1 }, { unique: true });
playerDailyActivitySchema.index({ day: 1, points: -1 });

module.exports = mongoose.model('PlayerDailyActivity', playerDailyActivitySchema);