const ETH_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const TON_FRIENDLY_ADDRESS_REGEX = /^(?:EQ|UQ|kQ|0Q)[A-Za-z0-9_-]{46}$/;
const TON_RAW_ADDRESS_REGEX = /^(?:-1|0):[a-fA-F0-9]{64}$/;

function getTapcoBlockchainKind() {
  const kind = String(process.env.TAPCO_BLOCKCHAIN_KIND || process.env.BLOCKCHAIN_KIND || 'evm').trim().toLowerCase();
  return kind === 'ton' ? 'ton' : 'evm';
}

function isValidEthAddress(address) {
  return ETH_ADDRESS_REGEX.test(String(address || ''));
}

function isValidTonAddress(address) {
  const value = String(address || '').trim();
  return TON_FRIENDLY_ADDRESS_REGEX.test(value) || TON_RAW_ADDRESS_REGEX.test(value);
}

function isValidTapcoAddress(address) {
  return getTapcoBlockchainKind() === 'ton'
    ? isValidTonAddress(address)
    : isValidEthAddress(address);
}

function normalizePlayerId(playerId) {
  return String(playerId || '').trim();
}

function normalizeWalletAddress(address) {
  const value = String(address || '').trim();
  if (getTapcoBlockchainKind() !== 'ton') {
    return value.toLowerCase();
  }

  if (TON_RAW_ADDRESS_REGEX.test(value)) {
    const [workchain, hex] = value.split(':');
    return `${workchain}:${String(hex || '').toLowerCase()}`;
  }

  return value;
}

function normalizeTapcoAddress(address) {
  return normalizeWalletAddress(address);
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
  getTapcoBlockchainKind,
  isValidEthAddress,
  isValidTonAddress,
  isValidTapcoAddress,
  normalizePlayerId,
  normalizeTapcoAddress,
  normalizeWalletAddress,
  toSafeInt,
  isTimestampFresh
};
