const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

const isValidNumber = (value) => typeof value === 'number' && Number.isFinite(value);

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

module.exports.validateDepositPayload = (payload = {}) => {
	const { playerId, txHash, txRef } = payload;

	if (!isNonEmptyString(playerId)) {
		return { valid: false, reason: 'invalid_player_id' };
	}

	if (!isNonEmptyString(txRef) && !isNonEmptyString(txHash)) {
		return { valid: false, reason: 'invalid_tx_ref' };
	}

	return { valid: true };
};
