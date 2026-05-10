module.exports.detectAbuse = ({
  ipHash,
  deviceFingerprint,
  action,
  fromPlayer,
  toPlayer,
  playerId,
  referrerId
} = {}) => {
  const flags = [];

  // Baseline rules for suspicious patterns.
  if (action === 'withdraw' && deviceFingerprint === 'unknown') {
    flags.push('unknown_device');
  }

  if (action === 'transfer' && ipHash === '0000') {
    flags.push('suspicious_ip');
  }

  // Circular/self transfer protection.
  if (action === 'transfer' && fromPlayer && toPlayer && fromPlayer === toPlayer) {
    flags.push('self_transfer');
  }

  // Fake referral/self-referral protection.
  if (action === 'referral_activation' && playerId && referrerId && playerId === referrerId) {
    flags.push('self_referral_attempt');
  }

  return flags;
};
