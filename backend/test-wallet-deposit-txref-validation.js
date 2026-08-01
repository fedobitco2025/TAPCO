const assert = require('assert');
const { validateDepositPayload } = require('./src/api/wallet/wallet.validation');

function expectInvalid(payload, reason) {
  const result = validateDepositPayload(payload);
  assert.equal(result.valid, false, `Expected invalid payload for ${JSON.stringify(payload)}`);
  assert.equal(result.reason, reason);
}

function expectValid(payload) {
  const result = validateDepositPayload(payload);
  assert.equal(result.valid, true, `Expected valid payload for ${JSON.stringify(payload)}`);
}

expectInvalid({}, 'invalid_player_id');
expectInvalid({ playerId: 'TG_1' }, 'invalid_tx_ref');
expectInvalid({ playerId: 'TG_1', txRef: 'abc' }, 'invalid_tx_ref_format');
expectInvalid({ playerId: 'TG_1', txRef: '0x123' }, 'invalid_tx_ref_format');
expectInvalid({ playerId: 'TG_1', txRef: 'x'.repeat(201) }, 'invalid_tx_ref_format');
expectInvalid({ playerId: 'TG_1', txRef: 'INVALID*REF!!' }, 'invalid_tx_ref_format');

expectValid({ playerId: 'TG_1', txRef: '0x' + 'a'.repeat(64) });
expectValid({ playerId: 'TG_1', txRef: 'a'.repeat(64) });
expectValid({ playerId: 'TG_1', txRef: 'ton_event_' + 'A'.repeat(16) });
expectValid({ playerId: 'TG_1', txHash: '0x' + 'b'.repeat(64) });

console.log('Wallet deposit txRef validation tests passed.');
