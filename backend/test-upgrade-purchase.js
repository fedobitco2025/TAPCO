const assert = require('assert');
const Player = require('./src/models/player.model');
const { getUpgradeCost, purchaseUpgrade } = require('./src/api/gameplay/upgradePurchase.service');

const originalFindOne = Player.findOne;
const originalUpdateOne = Player.updateOne;

async function run() {
  assert.equal(getUpgradeCost('tapPower', 0), 500);
  assert.equal(getUpgradeCost('tapPower', 1), 740);
  assert.equal(getUpgradeCost('energyRegen', 0), 950);
  assert.equal(getUpgradeCost('maxEnergy', 4), 15000);
  assert.equal(getUpgradeCost('maxEnergy', 5), null);

  let storedPlayer = {
    playerId: 'TG_123456789',
    authoritativeScore: 2000,
    authoritativeTapPowerLevel: 0,
    authoritativeMaxEnergyLevel: 0,
    authoritativeEnergyRegenLevel: 0,
    upgradePurchaseRevision: 0,
    processedUpgradePurchaseIds: []
  };
  Player.findOne = () => ({ lean: async () => ({ ...storedPlayer }) });
  Player.updateOne = async (_filter, update) => {
    assert.equal(update.$push.processedUpgradePurchaseIds.$slice, -256);
    storedPlayer = {
      ...storedPlayer,
      authoritativeScore: storedPlayer.authoritativeScore + update.$inc.authoritativeScore,
      authoritativeTapPowerLevel: storedPlayer.authoritativeTapPowerLevel + (update.$inc.authoritativeTapPowerLevel || 0),
      authoritativeMaxEnergyLevel: storedPlayer.authoritativeMaxEnergyLevel + (update.$inc.authoritativeMaxEnergyLevel || 0),
      authoritativeEnergyRegenLevel: storedPlayer.authoritativeEnergyRegenLevel + (update.$inc.authoritativeEnergyRegenLevel || 0),
      upgradePurchaseRevision: storedPlayer.upgradePurchaseRevision + 1,
      processedUpgradePurchaseIds: storedPlayer.processedUpgradePurchaseIds.concat(update.$push.processedUpgradePurchaseIds.$each)
    };
    return { modifiedCount: 1 };
  };

  const input = { playerId: storedPlayer.playerId, purchaseId: 'purchase_1234567890', upgradeType: 'tapPower' };
  const first = await purchaseUpgrade(input);
  assert.equal(first.statusCode, 200);
  assert.equal(first.body.cost, 500);
  assert.equal(first.body.level, 1);
  assert.equal(storedPlayer.authoritativeScore, 1500);

  const duplicate = await purchaseUpgrade(input);
  assert.equal(duplicate.statusCode, 200);
  assert.equal(duplicate.body.duplicate, true);
  assert.equal(storedPlayer.authoritativeScore, 1500);
  assert.equal(storedPlayer.authoritativeTapPowerLevel, 1);

  storedPlayer.authoritativeScore = 100;
  const insufficient = await purchaseUpgrade({ ...input, purchaseId: 'purchase_0987654321', upgradeType: 'energyRegen' });
  assert.equal(insufficient.statusCode, 409);
  assert.equal(insufficient.body.code, 'INSUFFICIENT_AUTHORITATIVE_SCORE');

  console.log('Server-authoritative upgrade purchase tests passed.');
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    Player.findOne = originalFindOne;
    Player.updateOne = originalUpdateOne;
  });