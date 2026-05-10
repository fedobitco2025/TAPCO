const SecurityLog = require('../models/securityLog.model');
const envConfig = require('../config/env');

const alertState = {
	rateLimitHits: 0,
	otpFailures: 0,
	windowStartedAt: Date.now()
};

function rotateAlertWindowIfNeeded() {
	const now = Date.now();
	if (now - alertState.windowStartedAt < envConfig.SECURITY_ALERT_WINDOW_MS) {
		return;
	}

	if (alertState.rateLimitHits >= envConfig.RATE_LIMIT_ALERT_THRESHOLD) {
		console.error(
			`[SECURITY ALERT] High 429 activity: ${alertState.rateLimitHits} events in ${envConfig.SECURITY_ALERT_WINDOW_MS}ms`
		);
	}

	if (alertState.otpFailures >= envConfig.OTP_FAILURE_ALERT_THRESHOLD) {
		console.error(
			`[SECURITY ALERT] High OTP failures: ${alertState.otpFailures} events in ${envConfig.SECURITY_ALERT_WINDOW_MS}ms`
		);
	}

	alertState.rateLimitHits = 0;
	alertState.otpFailures = 0;
	alertState.windowStartedAt = now;
}

module.exports.securityLog = (action, details = {}) => {
	rotateAlertWindowIfNeeded();

	if (action === 'rate_limit' || action === 'ip_throttle') {
		alertState.rateLimitHits += 1;
	}

	if (action === '2fa_otp_failed') {
		alertState.otpFailures += 1;
	}

	const timestamp = new Date();
	const log = {
		action,
		timestamp: timestamp.toISOString(),
		...details
	};

	console.log('SECURITY LOG:', JSON.stringify(log, null, 2));

	const doc = {
		action,
		timestamp,
		playerId: details.playerId || '',
		referrerId: details.referrerId || '',
		fromPlayer: details.fromPlayer || '',
		toPlayer: details.toPlayer || '',
		sessionId: details.sessionId || '',
		amount: typeof details.amount === 'number' ? details.amount : 0,
		walletAddress: details.walletAddress || '',
		routeAction: details.routeAction || '',
		ipHash: details.ipHash || '',
		deviceFingerprint: details.deviceFingerprint || '',
		flags: Array.isArray(details.flags) ? details.flags : [],
		reason: details.reason || '',
		statusCode: typeof details.statusCode === 'number' ? details.statusCode : 0,
		method: details.method || '',
		path: details.path || '',
		evidenceScore: typeof details.evidenceScore === 'number' ? details.evidenceScore : 0,
		banStatus: details.banStatus || '',
		details
	};

	void SecurityLog.create(doc).catch((err) => {
		console.error('SECURITY LOG DB WRITE FAILED:', err.message);
	});
};
