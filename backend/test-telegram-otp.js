const assert = require('assert');
const { sendTelegramOtp } = require('./src/core/telegramBot');
const { buildOtpSubject } = require('./src/middleware/sensitiveOps.middleware');

async function run() {
  let capturedRequest = null;
  const sent = await sendTelegramOtp({
    botToken: '123456:test-token',
    chatId: '123456789',
    code: '654321',
    fetchImpl: async (url, options) => {
      capturedRequest = { url, options };
      return { ok: true, json: async () => ({ ok: true }) };
    }
  });

  assert.deepEqual(sent, { sent: true });
  assert.match(capturedRequest.url, /^https:\/\/api\.telegram\.org\/bot123456:test-token\/sendMessage$/);
  const body = JSON.parse(capturedRequest.options.body);
  assert.equal(body.chat_id, '123456789');
  assert.match(body.text, /654321/);
  assert.equal(body.protect_content, true);

  const failed = await sendTelegramOtp({
    botToken: '123456:test-token',
    chatId: '123456789',
    code: '654321',
    fetchImpl: async () => ({ ok: false, json: async () => ({ ok: false }) })
  });
  assert.equal(failed.sent, false);

  const baseRequest = {
    body: { playerId: 'TG_123456789', tapcoAmount: 100, walletAddress: '0x1111111111111111111111111111111111111111' }
  };
  assert.notEqual(
    buildOtpSubject(baseRequest),
    buildOtpSubject({ body: { ...baseRequest.body, tapcoAmount: 101 } })
  );
  assert.notEqual(
    buildOtpSubject(baseRequest),
    buildOtpSubject({ body: { ...baseRequest.body, walletAddress: '0x2222222222222222222222222222222222222222' } })
  );

  console.log('Telegram OTP delivery and binding tests passed.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});