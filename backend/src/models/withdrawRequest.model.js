const mongoose = require('mongoose');

const withdrawRequestSchema = new mongoose.Schema({
  playerId: { type: String, required: true, index: true },
  amount: { type: Number, required: true },
  walletAddress: { type: String, required: true },
  chainId: { type: String, default: '' },
  status: {
    type: String,
    enum: ['pending', 'processing', 'refunding', 'completed', 'failed'],
    default: 'pending',
    required: true,
    index: true
  },
  txHash: { type: String, default: null },
  rawTransaction: { type: String, default: '', select: false },
  processingStartedAt: { type: Date, default: null },
  broadcastAt: { type: Date, default: null },
  broadcastAttempts: { type: Number, default: 0 },
  clientSignature: { type: String, default: '' },
  activeRequestKey: { type: String, default: null },
  reservationId: { type: String, default: null },
  requestedAt: { type: Number, default: 0 },
  failureReason: { type: String, default: null },
  refundedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now }
}, {
  versionKey: false
});

withdrawRequestSchema.index(
  { clientSignature: 1 },
  {
    unique: true,
    partialFilterExpression: { clientSignature: { $type: 'string', $gt: '' } }
  }
);

withdrawRequestSchema.index(
  { activeRequestKey: 1 },
  {
    unique: true,
    partialFilterExpression: { activeRequestKey: { $type: 'string' } }
  }
);

withdrawRequestSchema.index(
  { reservationId: 1 },
  {
    unique: true,
    partialFilterExpression: { reservationId: { $type: 'string' } }
  }
);

withdrawRequestSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('WithdrawRequest', withdrawRequestSchema);
