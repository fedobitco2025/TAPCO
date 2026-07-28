const crypto = require('crypto');

function secureHexEquals(value, expected) {
  if (!/^[a-f0-9]{64}$/i.test(String(value || ''))) return false;
  const valueBuffer = Buffer.from(String(value), 'hex');
  const expectedBuffer = Buffer.from(String(expected), 'hex');
  return valueBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(valueBuffer, expectedBuffer);
}

function verifyTelegramInitData(initData, botToken, maxAgeMs = 5 * 60 * 1000) {
  const rawInitData = String(initData || '').trim();
  const normalizedBotToken = String(botToken || '').trim();
  if (!rawInitData) return { valid: false, reason: 'telegram_init_data_required' };
  if (!normalizedBotToken) return { valid: false, reason: 'telegram_auth_unavailable' };

  const params = new URLSearchParams(rawInitData);
  const receivedHash = params.get('hash');
  const authDate = Number(params.get('auth_date'));
  if (!receivedHash || !Number.isInteger(authDate)) {
    return { valid: false, reason: 'telegram_init_data_invalid' };
  }

  const authTimeMs = authDate * 1000;
  const now = Date.now();
  if (authTimeMs > now + 10_000 || now - authTimeMs > maxAgeMs) {
    return { valid: false, reason: 'telegram_init_data_expired' };
  }

  const dataCheckString = Array.from(params.entries())
    .filter(([key]) => key !== 'hash')
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(normalizedBotToken)
    .digest();
  const expectedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');
  if (!secureHexEquals(receivedHash, expectedHash)) {
    return { valid: false, reason: 'telegram_init_data_invalid' };
  }

  try {
    const user = JSON.parse(params.get('user') || 'null');
    const userId = String(user?.id || '').trim();
    if (!/^\d{5,20}$/.test(userId)) {
      return { valid: false, reason: 'telegram_user_invalid' };
    }
    return { valid: true, userId, user, authDate };
  } catch (_error) {
    return { valid: false, reason: 'telegram_user_invalid' };
  }
}

function createRequireVerifiedTelegramIdentity({ botToken, maxAgeMs, playerField = 'playerId' }) {
  return (req, res, next) => {
    const verification = verifyTelegramInitData(req.body?.telegramInitData, botToken, maxAgeMs);
    if (!verification.valid) {
      const status = verification.reason === 'telegram_auth_unavailable' ? 503 : 401;
      return res.status(status).json({
        ok: false,
        code: verification.reason.toUpperCase(),
        reason: verification.reason,
        message: status === 503
          ? 'خدمة التحقق من هوية Telegram غير متاحة'
          : 'تعذر التحقق من هوية Telegram، أعد فتح اللعبة من البوت'
      });
    }

    const canonicalPlayerId = `TG_${verification.userId}`;
    const suppliedPlayerId = String(req.body?.[playerField] || '').trim();
    if (suppliedPlayerId && suppliedPlayerId !== canonicalPlayerId) {
      return res.status(403).json({
        ok: false,
        code: 'PLAYER_IDENTITY_MISMATCH',
        reason: 'player_identity_mismatch',
        message: 'هوية اللاعب لا تطابق حساب Telegram الموثق'
      });
    }

    req.telegramUserId = verification.userId;
    req.telegramUser = verification.user;
    req.body[playerField] = canonicalPlayerId;
    return next();
  };
}

module.exports = {
  verifyTelegramInitData,
  createRequireVerifiedTelegramIdentity
};