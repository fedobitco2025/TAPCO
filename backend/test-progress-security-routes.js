const assert = require('assert');
const crypto = require('crypto');

const BOT_TOKEN = '123456:test-token';
process.env.TELEGRAM_BOT_TOKEN = BOT_TOKEN;

const Player = require('./src/models/player.model');
const originalFindOne = Player.findOne;
const { app } = require('./server');

function signInitData(userId) {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: 'progress-security-test',
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

function findPostRoute(path) {
  const layer = app._router.stack.find((item) => item.route?.path === path && item.route.methods.post);
  assert(layer, `Expected POST ${path}`);
  return layer.route.stack.map((item) => item.handle);
}

function findGetRoute(path) {
  const layer = app._router.stack.find((item) => item.route?.path === path && item.route.methods.get);
  assert(layer, `Expected GET ${path}`);
  return layer.route.stack.map((item) => item.handle);
}

async function invoke(handlers, body) {
  const req = { body: { ...body }, headers: {}, query: {}, socket: {} };
  const response = { statusCode: 200, payload: null };
  const res = {
    status(code) {
      response.statusCode = code;
      return this;
    },
    json(payload) {
      response.payload = payload;
      return payload;
    },
    setHeader() {}
  };

  async function dispatch(index) {
    if (index >= handlers.length) return;
    await handlers[index](req, res, () => dispatch(index + 1));
  }
  await dispatch(0);
  return { req, response };
}

async function invokeFirstMiddleware(handlers, { body = {}, headers = {}, query = {} }, nextMessage) {
  const req = { body, headers, query, socket: {} };
  const response = { statusCode: 200, payload: null };
  const res = {
    status(code) { response.statusCode = code; return this; },
    json(payload) { response.payload = payload; return payload; },
    setHeader() {}
  };
  await handlers[0](req, res, () => assert.fail(nextMessage));
  return response;
}

async function run() {
  let saveCalled = false;
  Player.findOne = async () => ({
    playerId: 'TG_123456789',
    telegramUserId: '123456789',
    save: async () => { saveCalled = true; }
  });

  const progressHandlers = findPostRoute('/api/player-progress');
  const unauthenticated = await invoke(progressHandlers, {
    playerId: 'TG_123456789',
    score: 999999999
  });
  assert.equal(unauthenticated.response.statusCode, 401);
  assert.equal(saveCalled, false);

  const authenticated = await invoke(progressHandlers, {
    telegramInitData: signInitData('123456789'),
    playerId: 'TG_123456789',
    score: 999999999,
    totalPointsEarned: 999999999
  });
  assert.equal(authenticated.response.statusCode, 409);
  assert.equal(authenticated.response.payload.code, 'CLIENT_AUTHORITATIVE_PROGRESS_REJECTED');
  assert.equal(saveCalled, false);

  const impersonation = await invoke(progressHandlers, {
    telegramInitData: signInitData('123456789'),
    playerId: 'TG_999999999',
    score: 999999999
  });
  assert.equal(impersonation.response.statusCode, 403);
  assert.equal(impersonation.response.payload.code, 'PLAYER_IDENTITY_MISMATCH');

  const sessionResponse = await invoke(findPostRoute('/api/auth/telegram-session'), {
    telegramInitData: signInitData('123456789'),
    playerId: 'TG_123456789'
  });
  assert.equal(sessionResponse.response.statusCode, 200);
  assert.equal(typeof sessionResponse.response.payload.token, 'string');
  assert.equal(sessionResponse.response.payload.playerId, 'TG_123456789');

  const gameplaySessionHeaders = { 'x-tapco-telegram-session': sessionResponse.response.payload.token };
  const withdrawalResponse = await invokeFirstMiddleware(findPostRoute('/api/withdraw-tapco'), {
    body: {
      playerId: 'TG_123456789',
      tapcoAmount: 25,
      walletAddress: '0x1111111111111111111111111111111111111111',
      timestamp: Date.now()
    },
    headers: gameplaySessionHeaders
  }, 'Gameplay session reached withdrawal handler');
  assert.equal(withdrawalResponse.statusCode, 401);
  assert.equal(withdrawalResponse.payload.code, 'TELEGRAM_INIT_DATA_REQUIRED');

  for (const financialReadPath of ['/api/player-balance', '/api/withdraw-status']) {
    const response = await invokeFirstMiddleware(findGetRoute(financialReadPath), {
      headers: gameplaySessionHeaders,
      query: { playerId: 'TG_123456789' }
    }, `Gameplay session reached ${financialReadPath} handler`);
    assert.equal(response.statusCode, 401);
    assert.equal(response.payload.code, 'TELEGRAM_INIT_DATA_REQUIRED');
  }

  const migration = await invoke(findPostRoute('/api/player-progress/migrate'), {
    telegramInitData: signInitData('123456789'),
    playerId: 'TG_123456789',
    fromPlayerId: 'TG_999999999',
    toPlayerId: 'TG_123456789'
  });
  assert.equal(migration.response.statusCode, 410);
  assert.equal(migration.response.payload.code, 'PLAYER_PROGRESS_MIGRATION_RETIRED');

  console.log('Player progress security route tests passed.');
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    Player.findOne = originalFindOne;
  });