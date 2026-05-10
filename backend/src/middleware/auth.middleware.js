const Player = require('../models/player.model');
const sessionManager = require('../core/session');
const { securityLog } = require('../core/logger');

const getPlayerIdFromRequest = (req, playerField) => {
	if (playerField && req.body?.[playerField]) {
		return String(req.body[playerField]).trim();
	}

	if (req.body?.playerId) {
		return String(req.body.playerId).trim();
	}

	if (req.body?.fromPlayer) {
		return String(req.body.fromPlayer).trim();
	}

	return '';
};

module.exports.requireSessionBinding = ({
	action,
	playerField,
	requireDeviceFingerprint = true
} = {}) => {
	return async (req, res, next) => {
		try {
			const playerId = getPlayerIdFromRequest(req, playerField);
			const sessionId = String(req.body?.sessionId || '').trim();
			const deviceFingerprint = String(req.body?.deviceFingerprint || '').trim();

			if (!playerId) {
				securityLog('request_rejected', {
					action: action || 'unknown_action',
					reason: 'missing_player_id',
					statusCode: 400,
					method: req.method,
					path: req.originalUrl,
					sessionId
				});
				return res.status(400).json({ success: false, reason: 'missing_player_id' });
			}

			if (!sessionId) {
				securityLog('request_rejected', {
					action: action || 'unknown_action',
					reason: 'missing_session',
					statusCode: 400,
					method: req.method,
					path: req.originalUrl,
					playerId
				});
				return res.status(400).json({ success: false, reason: 'missing_session' });
			}

			if (requireDeviceFingerprint && !deviceFingerprint) {
				securityLog('request_rejected', {
					action: action || 'unknown_action',
					reason: 'missing_device_fingerprint',
					statusCode: 400,
					method: req.method,
					path: req.originalUrl,
					playerId,
					sessionId
				});
				return res.status(400).json({ success: false, reason: 'missing_device_fingerprint' });
			}

			const sessionCheck = await sessionManager.validateSession({
				playerId,
				sessionId,
				deviceFingerprint,
				action: action || 'request',
				payload: req.body,
				enforceReplayProtection: false
			});

			if (!sessionCheck.valid) {
				securityLog('session_rejected', {
					action: action || 'unknown_action',
					reason: sessionCheck.reason,
					statusCode: 401,
					method: req.method,
					path: req.originalUrl,
					playerId,
					sessionId,
					deviceFingerprint
				});
				return res.status(401).json({ success: false, reason: sessionCheck.reason });
			}

			const sessionPlayerId = String(sessionCheck.session.playerId || '').trim();

			if (playerId !== sessionPlayerId) {
				securityLog('player_mismatch', {
					action: action || 'unknown_action',
					reason: 'player_mismatch',
					statusCode: 403,
					method: req.method,
					path: req.originalUrl,
					playerId,
					sessionId,
					sessionPlayerId,
					deviceFingerprint
				});
				return res.status(403).json({ success: false, reason: 'player_mismatch' });
			}

			const player = await Player.findOne({ playerId: sessionPlayerId }).lean();
			if (!player) {
				securityLog('request_rejected', {
					action: action || 'unknown_action',
					reason: 'player_not_found',
					statusCode: 404,
					method: req.method,
					path: req.originalUrl,
					playerId,
					sessionId,
					deviceFingerprint
				});
				return res.status(404).json({ success: false, reason: 'player_not_found' });
			}

			const registeredDevice = String(player.deviceFingerprint || '').trim();
			if (registeredDevice && requireDeviceFingerprint && registeredDevice !== deviceFingerprint) {
				securityLog('device_mismatch', {
					action: action || 'unknown_action',
					reason: 'device_mismatch',
					statusCode: 403,
					method: req.method,
					path: req.originalUrl,
					playerId,
					sessionId,
					deviceFingerprint,
					registeredDevice
				});
				return res.status(403).json({ success: false, reason: 'device_mismatch' });
			}

			req.sessionPlayerId = sessionPlayerId;
			req.sessionDoc = sessionCheck.session;
			req.playerDoc = player;
			return next();
		} catch (err) {
			console.error('requireSessionBinding middleware error:', err);
			return res.status(500).json({ success: false, reason: 'server_error' });
		}
	};
};

