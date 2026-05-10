const mongoose = require('mongoose');

const withdrawRequestSchema = new mongoose.Schema({
  playerId: { type: String, required: true, index: true },
  amount: { type: Number, required: true },
  walletAddress: { type: String, required: true },
  chainId: { type: String, default: '' },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending',
    required: true,
    index: true
  },
  txHash: { type: String, default: null },
  clientSignature: { type: String, default: '' },
  requestedAt: { type: Number, default: 0 },
  failureReason: { type: String, default: null },
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now }
}, {
  versionKey: false
});

withdrawRequestSchema.index(
  { clientSignature: 1 },
  {
    unique: true,
    partialFilterExpression: { clientSignature: { $type: 'string', $ne: '' } }
  }
);

withdrawRequestSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('WithdrawRequest', withdrawRequestSchema);
