const mongoose = require('mongoose');

const securityLogSchema = new mongoose.Schema({
	action: { type: String, required: true, index: true },
	timestamp: { type: Date, default: Date.now, index: true },
	playerId: { type: String, default: '', index: true },
	referrerId: { type: String, default: '' },
	fromPlayer: { type: String, default: '' },
	toPlayer: { type: String, default: '' },
	sessionId: { type: String, default: '', index: true },
	amount: { type: Number, default: 0 },
	walletAddress: { type: String, default: '' },
	routeAction: { type: String, default: '' },
	ipHash: { type: String, default: '', index: true },
	deviceFingerprint: { type: String, default: '' },
	flags: { type: [String], default: [] },
	reason: { type: String, default: '' },
	statusCode: { type: Number, default: 0 },
	method: { type: String, default: '' },
	path: { type: String, default: '' },
	evidenceScore: { type: Number, default: 0 },
	banStatus: { type: String, default: '' },
	details: { type: mongoose.Schema.Types.Mixed, default: {} }
}, {
	versionKey: false
});

module.exports = mongoose.model('SecurityLog', securityLogSchema);
