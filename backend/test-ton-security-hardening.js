const assert = require('assert');

const TON_FRIENDLY = 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c';
const TON_HOT_WALLET = 'UQCM-gKKEiM8vwapfhkO6Z_fxPmqujX5mG6N6w4516W4hpap';

function loadClientWithTonEnv(overrides = {}) {
  const previous = {
    TAPCO_BLOCKCHAIN_KIND: process.env.TAPCO_BLOCKCHAIN_KIND,
    TAPCO_TON_HOT_WALLET_MNEMONIC: process.env.TAPCO_TON_HOT_WALLET_MNEMONIC,
    TAPCO_TON_HOT_WALLET_ADDRESS: process.env.TAPCO_TON_HOT_WALLET_ADDRESS,
    TAPCO_TON_API_BASE: process.env.TAPCO_TON_API_BASE,
    TAPCO_JETTON_MASTER: process.env.TAPCO_JETTON_MASTER,
    TAPCO_TON_DEPOSIT_WALLET: process.env.TAPCO_TON_DEPOSIT_WALLET,
  };

  process.env.TAPCO_BLOCKCHAIN_KIND = 'ton';
  process.env.TAPCO_TON_HOT_WALLET_MNEMONIC = '';
  process.env.TAPCO_TON_HOT_WALLET_ADDRESS = TON_HOT_WALLET;
  process.env.TAPCO_TON_API_BASE = 'https://tonapi.io';
  process.env.TAPCO_JETTON_MASTER = 'EQClOnhTOqXTEowkgCRTa2v0dItW66ohr_P5M4aspQj5v0bd';
  process.env.TAPCO_TON_DEPOSIT_WALLET = TON_HOT_WALLET;

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined || value === null) {
      delete process.env[key];
    } else {
      process.env[key] = String(value);
    }
  }

  const modulePath = require.resolve('./src/blockchain/client');
  delete require.cache[modulePath];
  const client = require('./src/blockchain/client');

  const restore = () => {
    for (const [key, value] of Object.entries(previous)) {
      if (typeof value === 'undefined') {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    delete require.cache[modulePath];
  };

  return { client, restore };
}

async function run() {
  const { client, restore } = loadClientWithTonEnv();

  try {
    assert.equal(client.isTonMode(), true);

    assert.equal(client.normalizeTonAddress(TON_FRIENDLY), TON_FRIENDLY);
    assert.throws(() => client.normalizeTonAddress('0x1111111111111111111111111111111111111111'), /Invalid TON address format/i);

    await assert.rejects(
      async () => client.getTransactionInfo('event-id-sample'),
      /playerAddress is required/i
    );

    await assert.rejects(
      async () => client.sendTapco(TON_FRIENDLY, 1),
      /TAPCO_TON_HOT_WALLET_MNEMONIC is required/i
    );

    const distributionAddress = await client.getDistributionWalletAddress();
    assert.equal(distributionAddress, TON_HOT_WALLET);
  } finally {
    restore();
  }

  console.log('TON security hardening tests passed.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
