const assert = require('assert');

const TON_FRIENDLY = 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c';
const TON_RAW = '0:ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789';

function loadSecurityFor(kind) {
  process.env.TAPCO_BLOCKCHAIN_KIND = kind;
  const modulePath = require.resolve('./src/core/security');
  delete require.cache[modulePath];
  return require('./src/core/security');
}

function unloadBlockchainClient() {
  const modulePath = require.resolve('./src/blockchain/client');
  delete require.cache[modulePath];
}

async function run() {
  const previousKind = process.env.TAPCO_BLOCKCHAIN_KIND;

  const tonSecurity = loadSecurityFor('ton');
  assert.equal(tonSecurity.getTapcoBlockchainKind(), 'ton');
  assert.equal(tonSecurity.isValidTapcoAddress(TON_FRIENDLY), true);
  assert.equal(tonSecurity.isValidTapcoAddress(TON_RAW), true);
  assert.equal(tonSecurity.isValidTapcoAddress('0x1111111111111111111111111111111111111111'), false);
  assert.equal(
    tonSecurity.normalizeTapcoAddress(TON_RAW),
    '0:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789'
  );

  unloadBlockchainClient();
  assert.throws(() => require('./src/blockchain/client'), /TON blockchain client is not implemented/i);

  if (typeof previousKind === 'undefined') delete process.env.TAPCO_BLOCKCHAIN_KIND;
  else process.env.TAPCO_BLOCKCHAIN_KIND = previousKind;

  console.log('TON address validation tests passed.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});