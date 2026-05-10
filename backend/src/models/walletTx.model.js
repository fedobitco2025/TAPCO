const mongoose = require('mongoose');

const walletTxSchema = new mongoose.Schema({
	txType: { type: String, enum: ['withdraw', 'transfer', 'withdraw_game', 'deposit'], required: true, index: true },
	playerId: { type: String, default: '', index: true },
	fromPlayer: { type: String, default: '', index: true },
	toPlayer: { type: String, default: '', index: true },
	amount: { type: Number, required: true },
	walletAddress: { type: String, default: '' },
	ipHash: { type: String, default: '', index: true },
	deviceFingerprint: { type: String, default: '' },
	status: { type: String, enum: ['success', 'blocked', 'failed'], required: true, index: true },
	reason: { type: String, default: '' },
	flags: { type: [String], default: [] },
	txHash: { type: String, default: '' },
	createdAt: { type: Date, default: Date.now, index: true }
}, {
	versionKey: false
});

walletTxSchema.index(
	{ txHash: 1 },
	{
		unique: true,
		partialFilterExpression: {
			txType: 'deposit',
			txHash: { $type: 'string', $ne: '' }
		}
	}
);

module.exports = mongoose.model('WalletTx', walletTxSchema);
