const mongoose = require('mongoose');

const workerHeartbeatSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  state: {
    type: String,
    enum: ['starting', 'running', 'idle', 'error', 'stopped'],
    default: 'starting'
  },
  heartbeatAt: { type: Date, required: true, index: true },
  lastCycleStartedAt: { type: Date, default: null },
  lastCycleCompletedAt: { type: Date, default: null },
  lastError: { type: String, default: '' },
  instanceId: { type: String, default: '' },
  updatedAt: { type: Date, default: Date.now }
}, {
  versionKey: false
});

module.exports = mongoose.models.WorkerHeartbeat || mongoose.model('WorkerHeartbeat', workerHeartbeatSchema);