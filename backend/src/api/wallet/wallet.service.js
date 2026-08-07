const crypto = require('crypto');
const { securityLog } = require('../../core/logger');
const abuse = require('../../core/abuse');
const WalletTx = require('../../models/walletTx.model');
const Player = require('../../models/player.model');
const sessionManager = require('../../core/session');
const { getTransactionInfo, isTonMode } = require('../../blockchain/client');
const { isValidTapcoAddress, normalizeTapcoAddress } = require('../../core/security');
const { POINTS_PER_TAPCO, POINTS_PER_TAPCO_DEPOSIT, MAX_WEEKLY_WITHDRAW_POINTS } = require('../../config/constants');

const getWeekStartTimestamp = () => {
	const now = new Date();
	const day = now.getUTCDay();
	const diff = now.getUTCDate() - day;
	const weekStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), diff, 0, 0, 0));
	return weekStart.getTime();
};

const convertPointsToTapco = (points) => points / POINTS_PER_TAPCO;
const getUtcDayKey = (date = new Date()) => date.toISOString().slice(0, 10);
const configuredDecimals = Number.parseInt(process.env.TOKEN_DECIMALS || (isTonMode() ? '9' : '18'), 10);
const tapcoDecimals = Number.isFinite(configuredDecimals) && configuredDecimals >= 0 ? configuredDecimals : (isTonMode() ? 9 : 18);
const TAPCO_DECIMALS_FACTOR = 10n ** BigInt(tapcoDecimals);
const MAX_SAFE_INT_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

const convertTapcoRawToDepositPoints = (tapcoRaw) => {
	const raw = BigInt(tapcoRaw);
	if (raw <= 0n) {
		return 0;
	}

	const pointsBigInt = (raw * BigInt(POINTS_PER_TAPCO_DEPOSIT)) / TAPCO_DECIMALS_FACTOR;
	if (pointsBigInt <= 0n) {
		return 0;
	}

	if (pointsBigInt > MAX_SAFE_INT_BIGINT) {
		throw new Error('deposit_points_overflow');
	}

	return Number(pointsBigInt);
};

const convertTapcoRawToTokenAmount = (tapcoRaw) => {
	const raw = BigInt(tapcoRaw || 0);
	if (raw <= 0n) {
		return 0;
	}

	return Number(raw) / 10 ** tapcoDecimals;
};

const saveWalletTx = async (payload) => {
	try {
		await WalletTx.create(payload);
	} catch (err) {
		console.error('WalletTx Write Error:', err.message);
	}
};

const resolvePayloadAndContext = (input, context = {}) => {
	if (input && typeof input === 'object' && input.body) {
		return {
			payload: input.body,
			context: {
				headers: input.headers,
				socket: input.socket,
				connection: input.connection
			}
		};
	}

	return {
		payload: input || {},
		context: context || {}
	};
};

module.exports.handleTransfer = async (input, context = {}) => {
	const { payload, context: runtimeContext } = resolvePayloadAndContext(input, context);
	const { fromPlayer, toPlayer, sessionId, amount, deviceFingerprint = 'unknown' } = payload;

	if (!sessionId) {
		return { success: false, reason: 'missing_session' };
	}

	const sessionCheck = await sessionManager.validateSession({
		playerId: fromPlayer,
		sessionId,
		deviceFingerprint,
		action: 'transfer',
		payload,
		enforceReplayProtection: true
	});

	if (!sessionCheck.valid) {
		securityLog('transfer_rejected', {
			fromPlayer,
			toPlayer,
			sessionId,
			deviceFingerprint,
			reason: sessionCheck.reason
		});
		return { success: false, reason: sessionCheck.reason };
	}

	securityLog('transfer_request', {
		fromPlayer,
		toPlayer,
		sessionId,
		amount
	});

	const forwardedFor = runtimeContext.headers?.['x-forwarded-for'];
	const realIP = Array.isArray(forwardedFor)
		? forwardedFor[0]
		: (forwardedFor || runtimeContext.socket?.remoteAddress || runtimeContext.connection?.remoteAddress || 'unknown');
	const ipHash = crypto.createHash('sha256').update(String(realIP)).digest('hex');

	const flags = abuse.detectAbuse({
		ipHash,
		deviceFingerprint,
		action: 'transfer',
		fromPlayer,
		toPlayer
	});

	if (flags.length > 0) {
		securityLog('transfer_blocked', {
			fromPlayer,
			toPlayer,
			sessionId,
			amount,
			ipHash,
			deviceFingerprint,
			reason: 'abuse_detected',
			flags
		});

		await saveWalletTx({
			txType: 'transfer',
			fromPlayer,
			toPlayer,
			amount,
			ipHash,
			deviceFingerprint,
			status: 'blocked',
			reason: 'abuse_detected',
			flags
		});

		return {
			success: false,
			reason: 'abuse_detected',
			flags
		};
	}

	if (amount <= 0) {
		await saveWalletTx({
			txType: 'transfer',
			fromPlayer,
			toPlayer,
			amount,
			ipHash,
			deviceFingerprint,
			status: 'failed',
			reason: 'invalid_amount'
		});
		return { success: false, reason: 'invalid_amount' };
	}

	const sender = await Player.findOne({ playerId: fromPlayer });
	if (!sender) {
		await saveWalletTx({
			txType: 'transfer',
			fromPlayer,
			toPlayer,
			amount,
			ipHash,
			deviceFingerprint,
			status: 'failed',
			reason: 'from_player_not_found'
		});

		return { success: false, reason: 'from_player_not_found' };
	}

	const receiver = await Player.findOne({ playerId: toPlayer });
	if (!receiver) {
		await saveWalletTx({
			txType: 'transfer',
			fromPlayer,
			toPlayer,
			amount,
			ipHash,
			deviceFingerprint,
			status: 'failed',
			reason: 'to_player_not_found'
		});

		return { success: false, reason: 'to_player_not_found' };
	}

	const senderBalance = typeof sender.walletBalance === 'number'
		? sender.walletBalance
		: (typeof sender.points === 'number' ? sender.points : 0);

	if (senderBalance < amount) {
		await saveWalletTx({
			txType: 'transfer',
			fromPlayer,
			toPlayer,
			amount,
			ipHash,
			deviceFingerprint,
			status: 'failed',
			reason: 'insufficient_balance'
		});

		return { success: false, reason: 'insufficient_balance' };
	}

	if (sender.botStatus === 'smart_ban') {
		await saveWalletTx({
			txType: 'transfer',
			fromPlayer,
			toPlayer,
			amount,
			ipHash,
			deviceFingerprint,
			status: 'blocked',
			reason: 'bot_blocked'
		});

		return { success: false, reason: 'bot_blocked' };
	}

	const txId = `TX_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
	const newSenderBalance = senderBalance - amount;
	const receiverBalance = typeof receiver.walletBalance === 'number'
		? receiver.walletBalance
		: (typeof receiver.points === 'number' ? receiver.points : 0);

	sender.walletBalance = newSenderBalance;
	receiver.walletBalance = receiverBalance + amount;

	await sender.save();
	await receiver.save();

	securityLog('transfer_completed', {
		fromPlayer,
		toPlayer,
		sessionId,
		amount,
		newBalance: newSenderBalance,
		txId,
		ipHash,
		deviceFingerprint
	});

	await saveWalletTx({
		txType: 'transfer',
		fromPlayer,
		toPlayer,
		amount,
		ipHash,
		deviceFingerprint,
		status: 'success',
		reason: 'transfer_completed',
		txHash: txId
	});

	return {
		success: true,
		fromPlayer,
		toPlayer,
		amount,
		newBalance: newSenderBalance,
		txId
	};
};

module.exports.getBalance = async (playerId) => {
	const player = await Player.findOne({ playerId }).lean();

	if (!player) {
		return {
			success: false,
			reason: 'player_not_found'
		};
	}

	const balance = typeof player.walletBalance === 'number'
		? player.walletBalance
		: (typeof player.points === 'number' ? player.points : 0);

	return {
		success: true,
		playerId,
		balance
	};
};

module.exports.handleDeposit = async (payload = {}) => {
	const normalizedPlayerId = String(payload.playerId || '').trim();
	const normalizedTxRef = String(payload.txRef || payload.txHash || '').trim();

	const player = await Player.findOne({ playerId: normalizedPlayerId });
	if (!player) {
		return { success: false, reason: 'player_not_found' };
	}

	if (!isValidTapcoAddress(player.address)) {
		return { success: false, reason: 'missing_wallet_address' };
	}

	const existingUsedTx = await WalletTx.findOne({
		txType: 'deposit',
		txHash: normalizedTxRef,
		status: 'success'
	}).lean();

	if (existingUsedTx) {
		return { success: false, reason: 'tx_already_used' };
	}

	const normalizedPlayerAddress = normalizeTapcoAddress(player.address);
	const tx = await getTransactionInfo(normalizedTxRef, {
		playerAddress: normalizedPlayerAddress,
		expectedReceiver: process.env.TAPCO_TON_DEPOSIT_WALLET,
		minAmount: 1n
	});

	if (!tx || tx.status !== 'confirmed') {
		return {
			success: false,
			reason: 'invalid_transaction',
			error: 'invalid_transaction'
		};
	}

	const normalizedSender = normalizeTapcoAddress(tx.from);
	if (normalizedSender !== normalizedPlayerAddress) {
		return { success: false, reason: 'transaction_sender_mismatch' };
	}

	const amountRaw = tx.amountRaw ?? tx.amount;
	if (amountRaw === undefined || amountRaw === null) {
		return {
			success: false,
			reason: 'invalid_transaction',
			error: 'missing_amount'
		};
	}

	let pointsAdded;
	try {
		pointsAdded = convertTapcoRawToDepositPoints(amountRaw);
	} catch (err) {
		return {
			success: false,
			reason: 'points_conversion_failed',
			error: err.message
		};
	}

	if (!Number.isFinite(pointsAdded) || pointsAdded <= 0) {
		return { success: false, reason: 'invalid_tapco_amount' };
	}

	const now = new Date();
	const progressDay = getUtcDayKey(now);
	const currentAuthoritativeScore = Math.max(0, Number(player.authoritativeScore || 0));
	const currentTotalPointsEarned = Math.max(0, Number(player.authoritativeTotalPointsEarned || 0));
	const sameProgressDay = String(player.authoritativeProgressDay || '') === progressDay;
	const currentDailyPoints = sameProgressDay ? Math.max(0, Number(player.authoritativeDailyPoints || 0)) : 0;
	const nextGameBalance = currentAuthoritativeScore + pointsAdded;

	try {
		player.gameBalance = nextGameBalance;
		player.authoritativeScore = nextGameBalance;
		player.authoritativeTotalPointsEarned = currentTotalPointsEarned + pointsAdded;
		player.authoritativeDailyPoints = currentDailyPoints + pointsAdded;
		player.authoritativeProgressDay = progressDay;
		player.updatedAt = now;
		await player.save();

		await saveWalletTx({
			txType: 'deposit',
			playerId: normalizedPlayerId,
			amount: convertTapcoRawToTokenAmount(amountRaw),
			walletAddress: normalizeTapcoAddress(player.address),
			status: 'success',
			reason: 'deposit_completed',
			txHash: normalizedTxRef
		});
	} catch (err) {
		if (err && err.code === 11000) {
			return { success: false, reason: 'tx_already_used' };
		}

		throw err;
	}

	securityLog('deposit_completed', {
		playerId: normalizedPlayerId,
		walletAddress: normalizeTapcoAddress(player.address),
		txHash: normalizedTxRef,
		tapcoAmount: convertTapcoRawToTokenAmount(amountRaw),
		pointsAdded,
		newGameBalance: nextGameBalance
	});

	return {
		success: true,
		playerId: normalizedPlayerId,
		txHash: normalizedTxRef,
		txRef: normalizedTxRef,
		tapcoDeposited: convertTapcoRawToTokenAmount(amountRaw),
		pointsAdded,
		newGameBalance: nextGameBalance,
		config: {
			pointsPerTapcoDeposit: POINTS_PER_TAPCO_DEPOSIT
		}
	};
};

module.exports.__internal = {
	getWeekStartTimestamp,
	convertPointsToTapco,
	convertTapcoRawToDepositPoints,
	POINTS_PER_TAPCO,
	POINTS_PER_TAPCO_DEPOSIT,
	MAX_WEEKLY_WITHDRAW_POINTS
};
