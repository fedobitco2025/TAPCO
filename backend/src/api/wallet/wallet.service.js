const crypto = require('crypto');
const { securityLog } = require('../../core/logger');
const abuse = require('../../core/abuse');
const WalletTx = require('../../models/walletTx.model');
const Player = require('../../models/player.model');
const sessionManager = require('../../core/session');
const { sendTokens, getTransactionInfo } = require('../../blockchain/client');
const { isValidEthAddress, normalizeWalletAddress } = require('../../core/security');
const { POINTS_PER_TAPCO, POINTS_PER_TAPCO_DEPOSIT, MAX_WEEKLY_WITHDRAW_POINTS, TAPCO_MIN_WITHDRAW, MIN_WITHDRAW_POINTS } = require('../../config/constants');
const WithdrawRequest = require('../../models/withdrawRequest.model');

const getWeekStartTimestamp = () => {
	const now = new Date();
	const day = now.getUTCDay();
	const diff = now.getUTCDate() - day;
	const weekStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), diff, 0, 0, 0));
	return weekStart.getTime();
};

const convertPointsToTapco = (points) => points / POINTS_PER_TAPCO;
const TAPCO_DECIMALS_FACTOR = 10n ** 18n;
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

module.exports.handleWithdraw = async (input, context = {}) => {
	const { payload, context: runtimeContext } = resolvePayloadAndContext(input, context);
	const { playerId, sessionId, amount, walletAddress = '', deviceFingerprint = 'unknown' } = payload;

	if (!sessionId) {
		return { success: false, reason: 'missing_session' };
	}

	const sessionCheck = await sessionManager.validateSession({
		playerId,
		sessionId,
		deviceFingerprint,
		action: 'withdraw',
		payload,
		enforceReplayProtection: true
	});

	if (!sessionCheck.valid) {
		securityLog('withdraw_rejected', {
			playerId,
			sessionId,
			deviceFingerprint,
			reason: sessionCheck.reason
		});
		return { success: false, reason: sessionCheck.reason };
	}

	// استخراج IP
	const forwardedFor = runtimeContext.headers?.['x-forwarded-for'];
	const realIP = Array.isArray(forwardedFor)
		? forwardedFor[0]
		: (forwardedFor || runtimeContext.socket?.remoteAddress || runtimeContext.connection?.remoteAddress || 'unknown');
	const ipHash = crypto.createHash('sha256').update(String(realIP)).digest('hex');

	securityLog('withdraw_request', {
		playerId,
		sessionId,
		amount,
		walletAddress,
		ipHash,
		deviceFingerprint
	});

	const flags = abuse.detectAbuse({
		ipHash,
		deviceFingerprint,
		action: 'withdraw',
		playerId
	});

	if (flags.length > 0) {
		securityLog('withdraw_abuse_detected', {
			playerId,
			sessionId,
			amount,
			walletAddress,
			ipHash,
			deviceFingerprint,
			reason: 'abuse_detected',
			flags
		});

		await saveWalletTx({
			txType: 'withdraw',
			playerId,
			amount,
			walletAddress,
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

	const player = await Player.findOne({ playerId });
	if (!player) {
		await saveWalletTx({
			txType: 'withdraw',
			playerId,
			amount,
			walletAddress,
			ipHash,
			deviceFingerprint,
			status: 'failed',
			reason: 'player_not_found'
		});

		return { success: false, reason: 'player_not_found' };
	}

	const currentBalance = typeof player.walletBalance === 'number'
		? player.walletBalance
		: (typeof player.points === 'number' ? player.points : 0);

	if (currentBalance < amount) {
		await saveWalletTx({
			txType: 'withdraw',
			playerId,
			amount,
			walletAddress,
			ipHash,
			deviceFingerprint,
			status: 'failed',
			reason: 'insufficient_balance'
		});

		return { success: false, reason: 'insufficient_balance' };
	}

	// تحقق من الحد الأدنى
	if (amount < MIN_WITHDRAW_POINTS) {
		await saveWalletTx({
			txType: 'withdraw',
			playerId,
			amount,
			walletAddress,
			ipHash,
			deviceFingerprint,
			status: 'failed',
			reason: 'min_withdraw_not_met'
		});
		return { success: false, reason: 'min_withdraw_not_met' };
	}

	// تحقق من العنوان إن تم تمريره
	if (walletAddress && (!walletAddress.startsWith('0x') || walletAddress.length < 10)) {
		await saveWalletTx({
			txType: 'withdraw',
			playerId,
			amount,
			walletAddress,
			ipHash,
			deviceFingerprint,
			status: 'failed',
			reason: 'invalid_wallet_address'
		});
		return { success: false, reason: 'invalid_wallet_address' };
	}

	const fakeBotStatus = player.botStatus || 'none';

	if (fakeBotStatus === 'smart_ban') {
		await saveWalletTx({
			txType: 'withdraw',
			playerId,
			amount,
			walletAddress,
			ipHash,
			deviceFingerprint,
			status: 'blocked',
			reason: 'bot_blocked'
		});
		return { success: false, reason: 'bot_blocked' };
	}

	if (fakeBotStatus === 'shadow_ban') {
		await saveWalletTx({
			txType: 'withdraw',
			playerId,
			amount,
			walletAddress,
			ipHash,
			deviceFingerprint,
			status: 'success',
			reason: 'shadow_success'
		});
		return {
			success: true,
			shadow: true,
			reason: 'shadow_success',
			riskRef: ipHash.slice(0, 12)
		};
	}

	const txId = `TX_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
	const newBalance = currentBalance - amount;

	player.walletBalance = newBalance;
	player.lastWithdrawTimestamp = new Date();
	await player.save();

	securityLog('withdraw_completed', {
		playerId,
		sessionId,
		amount,
		newBalance,
		ipHash,
		deviceFingerprint,
		txId
	});

	await saveWalletTx({
		txType: 'withdraw',
		playerId,
		amount,
		walletAddress,
		ipHash,
		deviceFingerprint,
		status: 'success',
		reason: 'withdraw_completed',
		txHash: txId
	});

	return {
		success: true,
		playerId,
		newBalance,
		txId
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

module.exports.handleWithdrawGame = async (payload = {}) => {
	const { playerId, points } = payload;
	const requestedPoints = Number(points);

	if (!Number.isFinite(requestedPoints) || requestedPoints < MIN_WITHDRAW_POINTS) {
		return { success: false, reason: 'min_withdraw_not_met' };
	}

	const player = await Player.findOne({ playerId });
	if (!player) {
		return { success: false, reason: 'player_not_found' };
	}

	const earnPoints = typeof player.earnPoints === 'number' ? player.earnPoints : 0;
	if (earnPoints < requestedPoints) {
		return { success: false, reason: 'not_enough_points' };
	}

	// Weekly limit check using DB fields
	const nowWeekStart = getWeekStartTimestamp();
	if ((player.weeklyWithdrawReset || 0) !== nowWeekStart) {
		player.weeklyWithdrawPoints = 0;
		player.weeklyWithdrawReset = nowWeekStart;
	}
	const weeklyUsed = player.weeklyWithdrawPoints || 0;
	const newWeeklyTotal = weeklyUsed + requestedPoints;
	if (newWeeklyTotal > MAX_WEEKLY_WITHDRAW_POINTS) {
		return {
			success: false,
			reason: 'weekly_limit_exceeded',
			remainingPointsThisWeek: MAX_WEEKLY_WITHDRAW_POINTS - weeklyUsed
		};
	}

	if (!isValidEthAddress(player.address)) {
		return { success: false, reason: 'missing_wallet_address' };
	}

	const tapcoAmount = convertPointsToTapco(requestedPoints);

	// Deduct points and update weekly tracking atomically
	player.earnPoints = earnPoints - requestedPoints;
	player.weeklyWithdrawPoints = newWeeklyTotal;
	player.weeklyWithdrawReset = nowWeekStart;
	await player.save();

	// Queue the withdrawal for the worker to process
	const request = await WithdrawRequest.create({
		playerId,
		amount: tapcoAmount,
		walletAddress: normalizeWalletAddress(player.address),
		status: 'pending',
		requestedAt: Date.now()
	});

	return {
		success: true,
		playerId,
		pointsSpent: requestedPoints,
		tapcoQueued: tapcoAmount,
		requestId: request._id,
		earnPoints: player.earnPoints,
		remainingPointsThisWeek: MAX_WEEKLY_WITHDRAW_POINTS - newWeeklyTotal,
		config: {
			pointsPerTapco: POINTS_PER_TAPCO,
			maxWeeklyWithdrawPoints: MAX_WEEKLY_WITHDRAW_POINTS
		}
	};
};

module.exports.handleDeposit = async (payload = {}) => {
	const normalizedPlayerId = String(payload.playerId || '').trim();
	const normalizedTxHash = String(payload.txHash || '').trim().toLowerCase();

	const player = await Player.findOne({ playerId: normalizedPlayerId });
	if (!player) {
		return { success: false, reason: 'player_not_found' };
	}

	if (!isValidEthAddress(player.address)) {
		return { success: false, reason: 'missing_wallet_address' };
	}

	const existingUsedTx = await WalletTx.findOne({
		txType: 'deposit',
		txHash: normalizedTxHash,
		status: 'success'
	}).lean();

	if (existingUsedTx) {
		return { success: false, reason: 'tx_already_used' };
	}

	const tx = await getTransactionInfo(normalizedTxHash);
	if (!tx.success) {
		return {
			success: false,
			reason: 'invalid_transaction',
			error: tx.error || 'invalid_transaction'
		};
	}

	if (tx.from !== normalizeWalletAddress(player.address)) {
		return { success: false, reason: 'transaction_sender_mismatch' };
	}

	let pointsAdded;
	try {
		pointsAdded = convertTapcoRawToDepositPoints(tx.amountRaw);
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

	const currentGameBalance = typeof player.gameBalance === 'number' ? player.gameBalance : 0;
	const nextGameBalance = currentGameBalance + pointsAdded;

	try {
		player.gameBalance = nextGameBalance;
		await player.save();

		await saveWalletTx({
			txType: 'deposit',
			playerId: normalizedPlayerId,
			amount: Number(tx.amount),
			walletAddress: normalizeWalletAddress(player.address),
			status: 'success',
			reason: 'deposit_completed',
			txHash: normalizedTxHash
		});
	} catch (err) {
		if (err && err.code === 11000) {
			return { success: false, reason: 'tx_already_used' };
		}

		throw err;
	}

	securityLog('deposit_completed', {
		playerId: normalizedPlayerId,
		walletAddress: normalizeWalletAddress(player.address),
		txHash: normalizedTxHash,
		tapcoAmount: Number(tx.amount),
		pointsAdded,
		newGameBalance: nextGameBalance
	});

	return {
		success: true,
		playerId: normalizedPlayerId,
		txHash: normalizedTxHash,
		tapcoDeposited: Number(tx.amount),
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
