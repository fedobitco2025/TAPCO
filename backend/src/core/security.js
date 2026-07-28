const ETH_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

function isValidEthAddress(address) {
  return ETH_ADDRESS_REGEX.test(String(address || ''));
}

function normalizePlayerId(playerId) {
  return String(playerId || '').trim();
}

function normalizeWalletAddress(address) {
  return String(address || '').trim().toLowerCase();
}

function toSafeInt(value) {
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

function isTimestampFresh(timestamp, windowMs) {
  const now = Date.now();
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  if (ts > now + 10_000) return false;
  return Math.abs(now - ts) <= windowMs;
}

module.exports = {
  isValidEthAddress,
  normalizePlayerId,
  normalizeWalletAddress,
  toSafeInt,
  isTimestampFresh
};
