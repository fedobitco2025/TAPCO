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

function createTelegramSessionToken({ userId, botToken, ttlMs = 12 * 60 * 60 * 1000, now = Date.now() }) {
  const normalizedUserId = String(userId || '').trim();
  const normalizedBotToken = String(botToken || '').trim();
  if (!/^\d{5,20}$/.test(normalizedUserId) || !normalizedBotToken) {
    throw new Error('invalid_telegram_session_subject');
  }
  const boundedTtlMs = Math.max(60_000, Math.min(24 * 60 * 60 * 1000, Number(ttlMs) || 0));
  const payload = Buffer.from(JSON.stringify({
    v: 1,
    sub: normalizedUserId,
    iat: Math.floor(now / 1000),
    exp: Math.floor((now + boundedTtlMs) / 1000)
  })).toString('base64url');
  const signingKey = crypto.createHmac('sha256', 'TapcoTelegramSession').update(normalizedBotToken).digest();
  const signature = crypto.createHmac('sha256', signingKey).update(payload).digest('hex');
  return `${payload}.${signature}`;
}

function verifyTelegramSessionToken(token, botToken, now = Date.now()) {
  const normalizedToken = String(token || '').trim();
  const normalizedBotToken = String(botToken || '').trim();
  if (!normalizedToken || !normalizedBotToken) return { valid: false, reason: 'telegram_session_required' };
  const [payload, signature, extra] = normalizedToken.split('.');
  if (!payload || !signature || extra || !/^[a-f0-9]{64}$/i.test(signature)) {
    return { valid: false, reason: 'telegram_session_invalid' };
  }
  const signingKey = crypto.createHmac('sha256', 'TapcoTelegramSession').update(normalizedBotToken).digest();
  const expectedSignature = crypto.createHmac('sha256', signingKey).update(payload).digest('hex');
  if (!secureHexEquals(signature, expectedSignature)) {
    return { valid: false, reason: 'telegram_session_invalid' };
  }
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const nowSeconds = Math.floor(now / 1000);
    if (claims?.v !== 1 || !/^\d{5,20}$/.test(String(claims?.sub || ''))) {
      return { valid: false, reason: 'telegram_session_invalid' };
    }
    if (!Number.isInteger(claims.iat) || !Number.isInteger(claims.exp) || claims.iat > nowSeconds + 10 || claims.exp <= nowSeconds) {
      return { valid: false, reason: 'telegram_session_expired' };
    }
    return { valid: true, userId: String(claims.sub), claims };
  } catch (_error) {
    return { valid: false, reason: 'telegram_session_invalid' };
  }
}

function createRequireVerifiedTelegramIdentity({ botToken, maxAgeMs, playerField = 'playerId', allowSessionToken = false }) {
  return (req, res, next) => {
    const telegramInitData = req.body?.telegramInitData || req.headers?.['x-telegram-init-data'];
    const sessionToken = req.headers?.['x-tapco-telegram-session'];
    const verification = telegramInitData
      ? verifyTelegramInitData(telegramInitData, botToken, maxAgeMs)
      : (allowSessionToken
          ? verifyTelegramSessionToken(sessionToken, botToken)
          : { valid: false, reason: 'telegram_init_data_required' });
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
  createTelegramSessionToken,
  verifyTelegramSessionToken,
  createRequireVerifiedTelegramIdentity
};