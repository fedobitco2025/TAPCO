const { MIN_WITHDRAW_POINTS } = require('../../config/constants');

const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

const isValidNumber = (value) => typeof value === 'number' && Number.isFinite(value);

module.exports.validateWithdrawPayload = (payload = {}) => {
	const { playerId, amount } = payload;

	if (!isNonEmptyString(playerId)) {
		return { valid: false, reason: 'invalid_player_id' };
	}

	if (!isValidNumber(amount)) {
		return { valid: false, reason: 'invalid_amount' };
	}

	return { valid: true };
};

module.exports.validateTransferPayload = (payload = {}) => {
	const { fromPlayer, toPlayer, amount } = payload;

	if (!isNonEmptyString(fromPlayer)) {
		return { valid: false, reason: 'invalid_from_player' };
	}

	if (!isNonEmptyString(toPlayer)) {
		return { valid: false, reason: 'invalid_to_player' };
	}

	if (!isValidNumber(amount)) {
		return { valid: false, reason: 'invalid_amount' };
	}

	return { valid: true };
};

module.exports.validateWithdrawGamePayload = (payload = {}) => {
	const { playerId, points } = payload;

	if (!isNonEmptyString(playerId)) {
		return { valid: false, reason: 'invalid_player_id' };
	}

	if (!isValidNumber(points)) {
		return { valid: false, reason: 'invalid_points' };
	}

	if (!Number.isInteger(points) || points <= 0) {
		return { valid: false, reason: 'invalid_points_amount' };
	}

	if (points < MIN_WITHDRAW_POINTS) {
		return { valid: false, reason: 'min_withdraw_not_met' };
	}

	return { valid: true };
};

module.exports.validateDepositPayload = (payload = {}) => {
	const { playerId, txHash } = payload;

	if (!isNonEmptyString(playerId)) {
		return { valid: false, reason: 'invalid_player_id' };
	}

	if (!isNonEmptyString(txHash)) {
		return { valid: false, reason: 'invalid_tx_hash' };
	}

	return { valid: true };
};
