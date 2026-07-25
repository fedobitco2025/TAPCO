#!/usr/bin/env node

const assert = require('node:assert/strict');
const mongoose = require('mongoose');
require('dotenv').config();

const Player = require('./src/models/player.model');
const WithdrawRequest = require('./src/models/withdrawRequest.model');

function getIsolatedMongoUri() {
  const configuredUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/tapco';
  const parsed = new URL(configuredUri);
  const allowedHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
  if (parsed.protocol !== 'mongodb:' || !allowedHosts.has(parsed.hostname)) {
    throw new Error('Concurrency test only runs against a local mongodb:// instance');
  }
  parsed.pathname = `/tapco_withdraw_test_${Date.now()}_${process.pid}`;
  return parsed.toString();
}

async function reserveWithdrawal({ playerId, amount, walletAddress, clientSignature }) {
  const activeRequestKey = playerId;
  const reservedPlayer = await Player.findOneAndUpdate(
    { playerId, tapcoBalance: { $gte: amount } },
    { $inc: { tapcoBalance: -amount } },
    { new: true }
  );
  if (!reservedPlayer) return 'insufficient';

  try {
    await WithdrawRequest.create({
      playerId,
      amount,
      walletAddress,
      clientSignature,
      activeRequestKey,
      status: 'pending'
    });
    return 'created';
  } catch (error) {
    await Player.updateOne({ playerId }, { $inc: { tapcoBalance: amount } });
    if (error?.code === 11000) return 'duplicate';
    throw error;
  }
}

async function refundWithdrawal(request) {
  const requestId = String(request._id);
  const refundingRequest = await WithdrawRequest.findOneAndUpdate(
    { _id: request._id, status: { $in: ['processing', 'refunding'] } },
    { $set: { status: 'refunding', failureReason: 'test failure' } },
    { new: true }
  );
  if (!refundingRequest) return;

  const refundedPlayer = await Player.findOneAndUpdate(
    { playerId: request.playerId, refundedWithdrawalIds: { $ne: requestId } },
    { $inc: { tapcoBalance: request.amount }, $addToSet: { refundedWithdrawalIds: requestId } },
    { new: true }
  );
  if (!refundedPlayer) {
    const alreadyRefunded = await Player.exists({ playerId: request.playerId, refundedWithdrawalIds: requestId });
    if (!alreadyRefunded) throw new Error('Player disappeared during refund test');
  }

  await WithdrawRequest.updateOne(
    { _id: request._id, status: 'refunding' },
    { $set: { status: 'failed', refundedAt: new Date() }, $unset: { activeRequestKey: 1 } }
  );
}

async function main() {
  const mongoUri = getIsolatedMongoUri();
  const databaseName = new URL(mongoUri).pathname.slice(1);

  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 3000 });
    await Promise.all([Player.syncIndexes(), WithdrawRequest.syncIndexes()]);

    const playerId = 'CONCURRENCY_TEST_PLAYER';
    const walletAddress = '0x1111111111111111111111111111111111111111';
    await Player.create({ playerId, tapcoBalance: 100 });

    const reservationResults = await Promise.all([
      reserveWithdrawal({ playerId, amount: 25, walletAddress, clientSignature: 'signature-a' }),
      reserveWithdrawal({ playerId, amount: 30, walletAddress, clientSignature: 'signature-b' })
    ]);
    assert.deepEqual(reservationResults.sort(), ['created', 'duplicate']);
    assert.equal(await WithdrawRequest.countDocuments(), 1);
    const createdRequest = await WithdrawRequest.findOne({ playerId }).lean();
    assert.equal((await Player.findOne({ playerId }).lean()).tapcoBalance, 100 - createdRequest.amount);

    const request = await WithdrawRequest.findOneAndUpdate(
      { playerId },
      { $set: { status: 'processing' } },
      { new: true, lean: true }
    );
    await Promise.all([refundWithdrawal(request), refundWithdrawal(request)]);

    const [finalPlayer, finalRequest] = await Promise.all([
      Player.findOne({ playerId }).lean(),
      WithdrawRequest.findById(request._id).lean()
    ]);
    assert.equal(finalPlayer.tapcoBalance, 100);
    assert.deepEqual(finalPlayer.refundedWithdrawalIds, [String(request._id)]);
    assert.equal(finalRequest.status, 'failed');
    assert.ok(finalRequest.refundedAt instanceof Date);

    console.log(`[withdrawal-concurrency] PASS (${databaseName})`);
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  }
}

main().catch((error) => {
  console.error(`[withdrawal-concurrency] FAIL: ${error.message}`);
  process.exitCode = 1;
});