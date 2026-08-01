const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

const isValidNumber = (value) => typeof value === 'number' && Number.isFinite(value);

const TX_REF_REGEX = /^(?:0x[a-fA-F0-9]{64}|[a-fA-F0-9]{64}|[A-Za-z0-9_-]{16,200})$/;

const isValidTxReference = (value) => {
	if (!isNonEmptyString(value)) return false;
	const normalized = String(value).trim();
	return TX_REF_REGEX.test(normalized);
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

module.exports.validateDepositPayload = (payload = {}) => {
	const { playerId, txHash, txRef } = payload;

	if (!isNonEmptyString(playerId)) {
		return { valid: false, reason: 'invalid_player_id' };
	}

	const candidateTxRef = isNonEmptyString(txRef) ? txRef : txHash;

	if (!isNonEmptyString(candidateTxRef)) {
		return { valid: false, reason: 'invalid_tx_ref' };
	}

	if (!isValidTxReference(candidateTxRef)) {
		return { valid: false, reason: 'invalid_tx_ref_format' };
	}

	return { valid: true };
};
