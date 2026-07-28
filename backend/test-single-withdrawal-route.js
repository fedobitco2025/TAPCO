const assert = require('assert');
const walletRoutes = require('./src/api/wallet/wallet.routes');

for (const routePath of ['/withdraw', '/withdraw-game']) {
  const routeLayer = walletRoutes.stack.find(
    (layer) => layer.route?.path === routePath && layer.route.methods.post
  );

  assert(routeLayer, `Expected the retired ${routePath} route to exist`);
  assert.equal(routeLayer.route.stack.length, 1, 'Retired route must not execute financial middleware');

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

  routeLayer.route.stack[0].handle({ body: { playerId: 'victim', amount: 1000 } }, res);
  assert.equal(response.statusCode, 410);
  assert.equal(response.payload.reason, 'endpoint_retired');
  if (routePath === '/withdraw') {
    assert.equal(response.payload.canonicalEndpoint, '/api/withdraw-tapco');
  }
}
console.log('Single authoritative withdrawal route test passed.');