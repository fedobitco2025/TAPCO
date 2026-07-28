const assert = require('assert');
const Player = require('./src/models/player.model');
const WithdrawRequest = require('./src/models/withdrawRequest.model');
const { submitTapcoWithdrawal } = require('./src/api/withdrawal/tapcoWithdrawal.service');

const originalPlayerMethods = {
  findOne: Player.findOne,
  findOneAndUpdate: Player.findOneAndUpdate,
  updateOne: Player.updateOne
};
const originalRequestMethods = {
  findOne: WithdrawRequest.findOne,
  countDocuments: WithdrawRequest.countDocuments,
  aggregate: WithdrawRequest.aggregate,
  create: WithdrawRequest.create
};

const leanResult = (value) => ({ lean: async () => value });
const input = {
  playerId: 'TG_123',
  tapcoAmount: 25,
  walletAddress: '0x1111111111111111111111111111111111111111',
  timestamp: 1700000000000,
  chainId: 56
};

function stubCommon({ player = { botStatus: 'none' }, requestResults = [] } = {}) {
  const queuedResults = [...requestResults];
  Player.findOne = () => leanResult(player);
  WithdrawRequest.findOne = () => leanResult(queuedResults.shift() || null);
  WithdrawRequest.countDocuments = async () => 0;
  WithdrawRequest.aggregate = async () => [];
}

async function run() {
  stubCommon({ player: { botStatus: 'smart_ban' } });
  let response = await submitTapcoWithdrawal(input);
  assert.equal(response.statusCode, 403);

  stubCommon({ player: { botStatus: 'shadow_ban' } });
  response = await submitTapcoWithdrawal(input);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body._shadowBanned, true);

  stubCommon({ requestResults: [{ _id: 'existing', status: 'pending' }] });
  response = await submitTapcoWithdrawal(input);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.requestId, 'existing');

  stubCommon({ requestResults: [null, { _id: 'active', status: 'processing' }] });
  response = await submitTapcoWithdrawal(input);
  assert.equal(response.statusCode, 409);
  assert.equal(response.body.code, 'ACTIVE_WITHDRAWAL_EXISTS');

  stubCommon();
  WithdrawRequest.countDocuments = async () => Number.MAX_SAFE_INTEGER;
  response = await submitTapcoWithdrawal(input);
  assert.equal(response.statusCode, 429);
  assert.equal(response.headers['Retry-After'] > 0, true);

  stubCommon();
  Player.findOneAndUpdate = async () => null;
  response = await submitTapcoWithdrawal(input);
  assert.equal(response.statusCode, 400);
  assert.equal(response.body.code, 'INSUFFICIENT_BALANCE');

  let reservationFilter;
  let reservationUpdate;
  let createdRequest;
  stubCommon();
  Player.findOneAndUpdate = async (filter, update) => {
    reservationFilter = filter;
    reservationUpdate = update;
    return { playerId: input.playerId };
  };
  WithdrawRequest.create = async (request) => {
    createdRequest = request;
    return { _id: 'created' };
  };
  response = await submitTapcoWithdrawal(input);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(reservationFilter, {
    playerId: input.playerId,
    tapcoBalance: { $gte: input.tapcoAmount }
  });
  assert.equal(reservationUpdate.$inc.tapcoBalance, -input.tapcoAmount);
  assert.equal(createdRequest.status, 'pending');
  assert.equal(createdRequest.activeRequestKey, input.playerId);

  let refundCount = 0;
  stubCommon({
    requestResults: [
      null,
      null,
      null,
      { _id: 'competing', status: 'pending', activeRequestKey: input.playerId }
    ]
  });
  Player.findOneAndUpdate = async () => ({ playerId: input.playerId });
  Player.updateOne = async () => {
    refundCount += 1;
  };
  WithdrawRequest.create = async () => {
    const error = new Error('duplicate active request');
    error.code = 11000;
    throw error;
  };
  response = await submitTapcoWithdrawal(input);
  assert.equal(response.statusCode, 409);
  assert.equal(response.body.code, 'ACTIVE_WITHDRAWAL_EXISTS');
  assert.equal(refundCount, 1);

  console.log('TAPCO withdrawal service tests passed.');
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    Object.assign(Player, originalPlayerMethods);
    Object.assign(WithdrawRequest, originalRequestMethods);
  });