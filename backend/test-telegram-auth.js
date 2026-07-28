const assert = require('assert');
const crypto = require('crypto');
const {
  verifyTelegramInitData,
  createTelegramSessionToken,
  verifyTelegramSessionToken,
  createRequireVerifiedTelegramIdentity
} = require('./src/core/telegramAuth');

const BOT_TOKEN = '123456:test-token';

function signInitData(userId, authDate = Math.floor(Date.now() / 1000)) {
  const params = new URLSearchParams({
    auth_date: String(authDate),
    query_id: 'test-query',
    signature: 'test-ed25519-signature',
    user: JSON.stringify({ id: userId, first_name: 'Test' })
  });
  const dataCheckString = Array.from(params.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  params.set('hash', crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex'));
  return params.toString();
}

function invokeMiddleware(body) {
  const req = { body: { ...body }, headers: {} };
  const response = { statusCode: 200, payload: null };
  const res = {
    status(code) {
      response.statusCode = code;
      return this;
    },
    json(payload) {
      response.payload = payload;
      return payload;
    }
  };
  let nextCalled = false;
  createRequireVerifiedTelegramIdentity({ botToken: BOT_TOKEN, maxAgeMs: 300_000 })(
    req,
    res,
    () => { nextCalled = true; }
  );
  return { req, response, nextCalled };
}

const validInitData = signInitData('123456789');
const valid = verifyTelegramInitData(validInitData, BOT_TOKEN);
assert.equal(valid.valid, true);
assert.equal(valid.userId, '123456789');

const tampered = new URLSearchParams(validInitData);
tampered.set('user', JSON.stringify({ id: '999999999', first_name: 'Attacker' }));
assert.equal(verifyTelegramInitData(tampered.toString(), BOT_TOKEN).valid, false);

const expired = signInitData('123456789', Math.floor(Date.now() / 1000) - 600);
assert.equal(verifyTelegramInitData(expired, BOT_TOKEN).reason, 'telegram_init_data_expired');

const accepted = invokeMiddleware({
  telegramInitData: validInitData,
  playerId: 'TG_123456789'
});
assert.equal(accepted.nextCalled, true);
assert.equal(accepted.req.body.playerId, 'TG_123456789');
assert.equal(accepted.req.telegramUserId, '123456789');

const headerAccepted = invokeMiddleware({ playerId: 'TG_123456789' });
headerAccepted.req.headers['x-telegram-init-data'] = validInitData;
let headerNextCalled = false;
createRequireVerifiedTelegramIdentity({ botToken: BOT_TOKEN, maxAgeMs: 300_000 })(
  headerAccepted.req,
  { status: () => ({ json: () => assert.fail('Valid header initData was rejected') }) },
  () => { headerNextCalled = true; }
);
assert.equal(headerNextCalled, true);

const impersonation = invokeMiddleware({
  telegramInitData: validInitData,
  playerId: 'TG_999999999'
});
assert.equal(impersonation.nextCalled, false);
assert.equal(impersonation.response.statusCode, 403);
assert.equal(impersonation.response.payload.code, 'PLAYER_IDENTITY_MISMATCH');

const sessionToken = createTelegramSessionToken({ userId: '123456789', botToken: BOT_TOKEN });
assert.equal(verifyTelegramSessionToken(sessionToken, BOT_TOKEN).userId, '123456789');
assert.equal(verifyTelegramSessionToken(`${sessionToken}tampered`, BOT_TOKEN).valid, false);
const expiredSessionToken = createTelegramSessionToken({
  userId: '123456789',
  botToken: BOT_TOKEN,
  ttlMs: 60_000,
  now: Date.now() - 120_000
});
assert.equal(verifyTelegramSessionToken(expiredSessionToken, BOT_TOKEN).reason, 'telegram_session_expired');

const sessionReq = {
  body: { playerId: 'TG_123456789' },
  headers: { 'x-tapco-telegram-session': sessionToken }
};
let sessionNextCalled = false;
createRequireVerifiedTelegramIdentity({
  botToken: BOT_TOKEN,
  maxAgeMs: 300_000,
  allowSessionToken: true
})(sessionReq, {}, () => { sessionNextCalled = true; });
assert.equal(sessionNextCalled, true);
assert.equal(sessionReq.telegramUserId, '123456789');

const transferReq = {
  body: {
    telegramInitData: validInitData,
    fromPlayer: 'TG_999999999'
  }
};
const transferResponse = { statusCode: 200, payload: null };
const transferRes = {
  status(code) {
    transferResponse.statusCode = code;
    return this;
  },
  json(payload) {
    transferResponse.payload = payload;
    return payload;
  }
};
createRequireVerifiedTelegramIdentity({
  botToken: BOT_TOKEN,
  maxAgeMs: 300_000,
  playerField: 'fromPlayer'
})(transferReq, transferRes, () => assert.fail('Impersonated transfer reached the route'));
assert.equal(transferResponse.statusCode, 403);
assert.equal(transferResponse.payload.code, 'PLAYER_IDENTITY_MISMATCH');

console.log('Telegram initData authentication tests passed.');