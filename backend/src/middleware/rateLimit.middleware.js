const crypto = require('crypto');
const { securityLog } = require('../core/logger');

const ONE_SECOND_MS = 1000;
const USER_WINDOW_MS = Number(process.env.USER_RATE_WINDOW_MS || ONE_SECOND_MS);
const USER_LIMIT = Number(process.env.USER_RATE_LIMIT || 5);
const IP_WINDOW_MS = Number(process.env.IP_THROTTLE_WINDOW_MS || ONE_SECOND_MS);
const IP_LIMIT = Number(process.env.IP_THROTTLE_LIMIT || 20);

const userBuckets = new Map();
const ipBuckets = new Map();

const pruneWindow = (arr, now, windowMs) => arr.filter((t) => now - t < windowMs);

const resolveIp = (req) => {
	const forwarded = req.headers['x-forwarded-for'];
	if (Array.isArray(forwarded) && forwarded[0]) return String(forwarded[0]).trim();
	if (typeof forwarded === 'string' && forwarded.length > 0) return forwarded.split(',')[0].trim();
	return req.socket?.remoteAddress || req.connection?.remoteAddress || '0.0.0.0';
};

module.exports.userRateLimit = (req, res, next) => {
	const now = Date.now();
	const key = String(req.body?.playerId || req.body?.fromPlayer || req.body?.sessionId || resolveIp(req));
	const bucket = pruneWindow(userBuckets.get(key) || [], now, USER_WINDOW_MS);

	if (bucket.length >= USER_LIMIT) {
		securityLog('rate_limit', {
			reason: 'rate_limit',
			statusCode: 429,
			method: req.method,
			path: req.originalUrl,
			playerId: req.body?.playerId || req.body?.fromPlayer || '',
			sessionId: req.body?.sessionId || ''
		});
		return res.status(429).json({ success: false, reason: 'rate_limit' });
	}

	bucket.push(now);
	userBuckets.set(key, bucket);
	return next();
};

module.exports.ipThrottle = (req, res, next) => {
	const now = Date.now();
	const rawIp = resolveIp(req);
	const ipHash = crypto.createHash('sha256').update(String(rawIp)).digest('hex');
	const bucket = pruneWindow(ipBuckets.get(ipHash) || [], now, IP_WINDOW_MS);

	if (bucket.length >= IP_LIMIT) {
		securityLog('ip_throttle', {
			reason: 'ip_throttle',
			statusCode: 429,
			method: req.method,
			path: req.originalUrl,
			ipHash,
			playerId: req.body?.playerId || req.body?.fromPlayer || '',
			sessionId: req.body?.sessionId || ''
		});
		return res.status(429).json({ success: false, reason: 'ip_throttle' });
	}

	bucket.push(now);
	ipBuckets.set(ipHash, bucket);
	return next();
};

