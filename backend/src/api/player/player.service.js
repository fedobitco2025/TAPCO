const crypto = require('crypto');
const Player = require('../../models/player.model');
const { securityLog } = require('../../core/logger');
const sessionManager = require('../../core/session');
const { isValidEthAddress, normalizeWalletAddress } = require('../../core/security');
const { getPlayerBalance } = require('../../blockchain/client');

const makePlayerId = () => `P_${crypto.randomBytes(4).toString('hex')}`;
const makeReferralCode = (playerId) => `REF-${playerId}`;

module.exports.initializePlayer = async ({ deviceFingerprint, address } = {}) => {
  if (!deviceFingerprint) {
    return { success: false, reason: 'missing_device_fingerprint' };
  }

  const normalizedAddress = isValidEthAddress(address)
    ? normalizeWalletAddress(address)
    : '';

  let player = await Player.findOne({ deviceFingerprint });

  if (!player) {
    const playerId = makePlayerId();

    player = await Player.create({
      playerId,
      referralCode: makeReferralCode(playerId),
      deviceFingerprint,
      address: normalizedAddress,
      gameBalance: 0,
      earnPoints: 0,
      walletBalance: 0,
      points: 0,
      evidenceScore: 0,
      botStatus: 'none',
      createdAt: new Date()
    });

    securityLog('player_initialized', {
      playerId: player.playerId,
      deviceFingerprint,
      reason: 'created'
    });
  } else {
    if (!player.referralCode) {
      player.referralCode = makeReferralCode(player.playerId);
    }

    if (!player.deviceFingerprint) {
      player.deviceFingerprint = deviceFingerprint;
    }

    if (!player.address && normalizedAddress) {
      player.address = normalizedAddress;
    }

    if (typeof player.gameBalance !== 'number') {
      player.gameBalance = 0;
    }

    if (typeof player.earnPoints !== 'number') {
      player.earnPoints = 0;
    }

    await player.save();

    securityLog('player_initialized', {
      playerId: player.playerId,
      deviceFingerprint,
      reason: 'existing'
    });
  }

  const { sessionId } = await sessionManager.createSession({
    playerId: player.playerId,
    deviceFingerprint
  });
  const balance = typeof player.walletBalance === 'number'
    ? player.walletBalance
    : (typeof player.points === 'number' ? player.points : 0);

  return {
    success: true,
    playerId: player.playerId,
    address: player.address || '',
    gameBalance: typeof player.gameBalance === 'number' ? player.gameBalance : 0,
    earnPoints: typeof player.earnPoints === 'number' ? player.earnPoints : 0,
    balance,
    sessionId
  };
};

module.exports.getWalletInfo = async ({ playerId } = {}) => {
  const normalizedPlayerId = String(playerId || '').trim();
  if (!normalizedPlayerId) {
    return { success: false, reason: 'missing_player_id' };
  }

  const player = await Player.findOne({ playerId: normalizedPlayerId }).lean();
  if (!player) {
    return { success: false, reason: 'player_not_found' };
  }

  if (!isValidEthAddress(player.address)) {
    return { success: false, reason: 'missing_wallet_address' };
  }

  const chainResult = await getPlayerBalance(player.address);
  if (!chainResult.success) {
    return {
      success: false,
      reason: 'blockchain_balance_failed',
      error: chainResult.error || 'unknown_error'
    };
  }

  return {
    success: true,
    playerId: normalizedPlayerId,
    address: normalizeWalletAddress(player.address),
    gameBalance: typeof player.gameBalance === 'number' ? player.gameBalance : 0,
    earnPoints: typeof player.earnPoints === 'number' ? player.earnPoints : 0,
    tapcoBalance: chainResult.balance
  };
};

module.exports.addEarnPoints = async ({ playerId, amount } = {}) => {
  const normalizedPlayerId = String(playerId || '').trim();
  if (!normalizedPlayerId) {
    return { success: false, reason: 'missing_player_id' };
  }

  const parsedAmount = Number(amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    return { success: false, reason: 'invalid_amount' };
  }

  const player = await Player.findOne({ playerId: normalizedPlayerId });
  if (!player) {
    return { success: false, reason: 'player_not_found' };
  }

  const currentEarnPoints = typeof player.earnPoints === 'number' ? player.earnPoints : 0;
  player.earnPoints = currentEarnPoints + parsedAmount;
  await player.save();

  securityLog('player_earn_points_added', {
    playerId: normalizedPlayerId,
    amount: parsedAmount,
    earnPoints: player.earnPoints,
    deviceFingerprint: player.deviceFingerprint || 'unknown'
  });

  return {
    success: true,
    playerId: normalizedPlayerId,
    amount: parsedAmount,
    earnPoints: player.earnPoints
  };
};
