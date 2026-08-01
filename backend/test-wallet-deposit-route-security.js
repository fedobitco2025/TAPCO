const assert = require('assert');
const walletRoutes = require('./src/api/wallet/wallet.routes');

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

console.log('Wallet deposit route security test passed.');
