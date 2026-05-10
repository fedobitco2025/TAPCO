const crypto = require('crypto');

const ETH_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const REQUEST_SECRET = String(process.env.REQUEST_SECRET || process.env.CLIENT_SECRET || '').trim();

if (!REQUEST_SECRET) {
  console.warn('[security] WARNING: REQUEST_SECRET (or CLIENT_SECRET) is not set. clientSignature validation will reject all requests.');
}

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

function buildClientSignatureString({ playerId, tapcoAmount, walletAddress, timestamp }) {
  return [
    normalizePlayerId(playerId),
    String(tapcoAmount),
    normalizeWalletAddress(walletAddress),
    String(timestamp),
    REQUEST_SECRET
  ].join('|');
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function computeClientSignature(payload) {
  return sha256(buildClientSignatureString(payload));
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
  computeClientSignature,
  isTimestampFresh
};
