const assert = require('assert');
const Player = require('./src/models/player.model');
const { calculateTapCredit, creditTapBatch } = require('./src/api/gameplay/tapLedger.service');

const originalFindOne = Player.findOne;
const originalUpdateOne = Player.updateOne;

async function run() {
  const now = Date.parse('2026-07-29T12:00:00.000Z');
  const credit = calculateTapCredit({
    authoritativeEnergy: 20,
    authoritativeEnergyUpdatedAt: new Date(now),
    lastAuthoritativeTapAt: null,
    authoritativeTapPowerLevel: 0
  }, 20, now);
  assert.equal(credit.acceptedTaps, 18);
  assert.equal(credit.pointsAwarded, 18);
  assert.equal(credit.energy, 2);

  let storedPlayer = {
    playerId: 'TG_123456789',
    authoritativeScore: 0,
    authoritativeTotalPointsEarned: 0,
    authoritativeEnergy: 20,
    authoritativeEnergyUpdatedAt: new Date(now),
    tapCreditRevision: 0,
    processedTapBatchIds: [],
    botStatus: 'none'
  };
  Player.findOne = () => ({ lean: async () => ({ ...storedPlayer }) });
  Player.updateOne = async (filter, update) => {
    if (storedPlayer.tapCreditRevision === 0) {
      assert.deepEqual(filter.tapCreditRevision, { $in: [0, null] });
    } else {
      assert.equal(filter.tapCreditRevision, storedPlayer.tapCreditRevision);
    }
    storedPlayer = {
      ...storedPlayer,
      authoritativeScore: storedPlayer.authoritativeScore + update.$inc.authoritativeScore,
      authoritativeTotalPointsEarned: storedPlayer.authoritativeTotalPointsEarned + update.$inc.authoritativeTotalPointsEarned,
      tapCreditRevision: storedPlayer.tapCreditRevision + 1,
      authoritativeEnergy: update.$set.authoritativeEnergy,
      authoritativeEnergyUpdatedAt: update.$set.authoritativeEnergyUpdatedAt,
      lastAuthoritativeTapAt: update.$set.lastAuthoritativeTapAt,
      processedTapBatchIds: storedPlayer.processedTapBatchIds.concat(update.$push.processedTapBatchIds.$each)
    };
    return { modifiedCount: 1 };
  };

  const input = {
    playerId: storedPlayer.playerId,
    batchId: 'batch_1234567890',
    tapCount: 10,
    now: new Date(now)
  };
  const first = await creditTapBatch(input);
  assert.equal(first.statusCode, 200);
  assert.equal(first.body.acceptedTaps, 10);
  assert.equal(storedPlayer.authoritativeScore, 10);

  const duplicate = await creditTapBatch(input);
  assert.equal(duplicate.statusCode, 200);
  assert.equal(duplicate.body.duplicate, true);
  assert.equal(storedPlayer.authoritativeScore, 10);

  const invalid = await creditTapBatch({ ...input, batchId: 'short', tapCount: 999 });
  assert.equal(invalid.statusCode, 400);

  console.log('Server-authoritative tap ledger tests passed.');
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