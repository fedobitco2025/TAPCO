const assert = require('assert');

process.env.TELEGRAM_BOT_TOKEN = '123456:test-token';
process.env.NODE_ENV = 'test';

let deliveredCode = '';
global.fetch = async (_url, options) => {
  const payload = JSON.parse(options.body);
  deliveredCode = String(payload.text).match(/\b\d{6}\b/)?.[0] || '';
  return { ok: true, json: async () => ({ ok: true }) };
};

const { require2FA } = require('./src/middleware/sensitiveOps.middleware');

async function invoke(body) {
  const req = { body: { ...body }, telegramUserId: '123456789' };
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
  await require2FA(req, res, () => { nextCalled = true; });
  return { response, nextCalled };
}

async function run() {
  const withdrawal = {
    playerId: 'TG_123456789',
    tapcoAmount: 100,
    walletAddress: '0x1111111111111111111111111111111111111111'
  };

  const challenge = await invoke(withdrawal);
  assert.equal(challenge.response.statusCode, 200);
  assert.equal(challenge.response.payload.reason, 'otp_required');
  assert.equal(challenge.response.payload.devOtp, undefined);
  assert.doesNotMatch(challenge.response.payload.message, /\b\d{6}\b/);
  assert.match(deliveredCode, /^\d{6}$/);

  const verified = await invoke({ ...withdrawal, otp: deliveredCode });
  assert.equal(verified.nextCalled, true);

  await invoke(withdrawal);
  const changedRequest = await invoke({ ...withdrawal, tapcoAmount: 101, otp: deliveredCode });
  assert.equal(changedRequest.nextCalled, false);
  assert.equal(changedRequest.response.statusCode, 401);
  assert.equal(changedRequest.response.payload.reason, 'otp_invalid');

  console.log('2FA middleware non-disclosure and operation-binding tests passed.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});