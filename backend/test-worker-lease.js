#!/usr/bin/env node

const assert = require('node:assert/strict');
const { createWorkerLease } = require('./src/worker/workerLease');

const NOW = Date.parse('2026-07-26T12:00:00.000Z');

async function main() {
  const calls = { find: [], update: [], delete: [] };
  const model = {
    findOneAndUpdate: async (...args) => {
      calls.find.push(args);
      return { ownerId: 'owner-a' };
    },
    updateOne: async (...args) => {
      calls.update.push(args);
      return { matchedCount: 1, modifiedCount: 1 };
    },
    deleteOne: async (...args) => {
      calls.delete.push(args);
      return { deletedCount: 1 };
    }
  };
  const lease = createWorkerLease({
    LeaseModel: model,
    leaseId: 'withdrawal-dispatch',
    ownerId: 'owner-a',
    leaseMs: 600000,
    now: () => NOW
  });

  assert.equal(await lease.acquire(), true);
  assert.equal(calls.find[0][0]._id, 'withdrawal-dispatch');
  assert.deepEqual(calls.find[0][0].$or[0], { ownerId: 'owner-a' });
  assert.equal(calls.find[0][2].upsert, true);
  assert.equal(await lease.renew(), true);
  assert.deepEqual(calls.update[0][0], { _id: 'withdrawal-dispatch', ownerId: 'owner-a' });
  assert.equal(await lease.release(), true);
  assert.deepEqual(calls.delete[0][0], { _id: 'withdrawal-dispatch', ownerId: 'owner-a' });

  const competingModel = {
    findOneAndUpdate: async () => {
      const error = new Error('duplicate lease');
      error.code = 11000;
      throw error;
    }
  };
  const competitor = createWorkerLease({
    LeaseModel: competingModel,
    leaseId: 'withdrawal-dispatch',
    ownerId: 'owner-b',
    leaseMs: 600000,
    now: () => NOW
  });
  assert.equal(await competitor.acquire(), false);

  console.log('[worker-lease] PASS');
}

main().catch((error) => {
  console.error(`[worker-lease] FAIL: ${error.message}`);
  process.exitCode = 1;
});