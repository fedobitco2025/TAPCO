const assert = require('assert');
const crypto = require('crypto');

const BOT_TOKEN = '123456:test-token';
process.env.TELEGRAM_BOT_TOKEN = BOT_TOKEN;

const walletRoutes = require('./src/api/wallet/wallet.routes');

function signInitData(userId) {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: 'wallet-deposit-security-test',
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

function findDepositRoute() {
  return walletRoutes.stack.find(
    (layer) => layer.route?.path === '/deposit' && layer.route.methods.post
  );
}

function invokeMiddleware(middleware, req) {
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
  middleware(req, res, () => {
    nextCalled = true;
  });

  return { response, nextCalled };
}

const depositRoute = findDepositRoute();
assert(depositRoute, 'Expected /deposit route to exist');
assert(
  depositRoute.route.stack.length >= 2,
  'Expected /deposit route to be protected by identity middleware before handler'
);

const authMiddleware = depositRoute.route.stack[0].handle;
assert.equal(typeof authMiddleware, 'function');

const { response, nextCalled } = invokeMiddleware(authMiddleware, {
  headers: {},
  body: { playerId: 'TG_123' }
});

assert.equal(nextCalled, false, 'Auth middleware should block unauthenticated requests');
assert(
  response.statusCode === 401 || response.statusCode === 503,
  `Expected 401/503 for unauthenticated deposit request, got ${response.statusCode}`
);
assert(
  String(response.payload?.reason || '').includes('telegram'),
  'Expected telegram-related authentication failure reason'
);

const mismatch = invokeMiddleware(authMiddleware, {
  headers: { 'x-telegram-init-data': signInitData('123456789') },
  body: { playerId: 'TG_999999999', txRef: '0x' + 'a'.repeat(64) }
});
assert.equal(mismatch.nextCalled, false, 'Identity mismatch should not pass to next middleware');
assert.equal(mismatch.response.statusCode, 403, 'Identity mismatch must return forbidden');
assert.equal(mismatch.response.payload?.reason, 'player_identity_mismatch');

console.log('Wallet deposit route security test passed.');
