const crypto = require('crypto');
const Session = require('../models/session.model');

const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS || 24 * 60 * 60 * 1000);
const REPLAY_WINDOW_MS = Number(process.env.SESSION_REPLAY_WINDOW_MS || 10 * 1000);
const RECENT_REQUEST_LIMIT = Number(process.env.SESSION_RECENT_REQUEST_LIMIT || 20);

const makeSessionId = () => crypto.randomBytes(8).toString('hex');

const stableStringify = (value) => {
	if (value === null || value === undefined) {
		return String(value);
	}

	if (Array.isArray(value)) {
		return `[${value.map((item) => stableStringify(item)).join(',')}]`;
	}

	if (typeof value === 'object') {
		const keys = Object.keys(value).sort();
		return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
	}

	return JSON.stringify(value);
};

const buildRequestFingerprint = ({ action, payload }) => {
	const sanitizedPayload = { ...(payload || {}) };
	delete sanitizedPayload.sessionId;

	const normalized = `${action || 'unknown'}|${stableStringify(sanitizedPayload)}`;
	return crypto.createHash('sha256').update(normalized).digest('hex');
};

module.exports.createSession = async ({ playerId, deviceFingerprint = '' }) => {
	const now = new Date();
	const sessionId = makeSessionId();
	const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

	await Session.create({
		sessionId,
		playerId,
		deviceFingerprint,
		createdAt: now,
		lastSeenAt: now,
		expiresAt,
		recentRequests: []
	});

	return {
		sessionId,
		expiresAt
	};
};

module.exports.validateSession = async ({
	playerId,
	sessionId,
	deviceFingerprint,
	action,
	payload,
	enforceReplayProtection = false
}) => {
	if (!sessionId) {
		return { valid: false, reason: 'missing_session' };
	}

	const session = await Session.findOne({ sessionId, playerId });
	if (!session) {
		return { valid: false, reason: 'invalid_session' };
	}

	const now = new Date();
	if (session.expiresAt <= now) {
		return { valid: false, reason: 'session_expired' };
	}

	if (deviceFingerprint && session.deviceFingerprint && session.deviceFingerprint !== deviceFingerprint) {
		return { valid: false, reason: 'session_device_mismatch' };
	}

	if (enforceReplayProtection) {
		const fingerprint = buildRequestFingerprint({ action, payload });
		const threshold = new Date(now.getTime() - REPLAY_WINDOW_MS);
		const recentRequests = (session.recentRequests || []).filter((item) => item.at > threshold);

		if (recentRequests.some((item) => item.fingerprint === fingerprint)) {
			return { valid: false, reason: 'replay_detected' };
		}

		recentRequests.push({ fingerprint, at: now });
		session.recentRequests = recentRequests.slice(-RECENT_REQUEST_LIMIT);
	}

	session.lastSeenAt = now;
	await session.save();

	return { valid: true, session };
};
