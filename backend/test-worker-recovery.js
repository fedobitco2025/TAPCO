#!/usr/bin/env node

const assert = require('node:assert/strict');
const { createTransactionRecovery } = require('./src/worker/transactionRecovery');

const NOW = Date.parse('2026-07-26T12:00:00.000Z');

function createHarness(providerOverrides = {}) {
  const calls = { completed: [], refunded: [], failures: [], updates: [], broadcasts: [] };
  const provider = {
    getTransactionReceipt: async () => null,
    getTransaction: async () => null,
    broadcastTransaction: async (rawTransaction) => {
      calls.broadcasts.push(rawTransaction);
      return { wait: async () => null };
    },
    ...providerOverrides
  };
  const recovery = createTransactionRecovery({
    provider,
    WithdrawRequest: { updateOne: async (...args) => calls.updates.push(args) },
    completeWithdrawal: async (...args) => calls.completed.push(args),
    failAndRefund: async (...args) => calls.refunded.push(args),
    trackWorkerFailure: (reason) => calls.failures.push(reason),
    txConfirmations: 1,
    preparationTimeoutMs: 300000,
    rebroadcastIntervalMs: 60000,
    now: () => NOW,
    logger: { log() {}, error() {} }
  });
  return { calls, recovery };
}

async function main() {
  const baseRequest = {
    _id: 'request-1',
    status: 'processing',
    txHash: '0xhash',
    rawTransaction: '0xsigned',
    processingStartedAt: new Date(NOW - 600000),
    updatedAt: new Date(NOW - 120000),
    broadcastAt: new Date(NOW - 120000)
  };

  const successful = createHarness({
    getTransactionReceipt: async () => ({ status: 1 }),
    getTransaction: async () => ({ hash: '0xhash' })
  });
  assert.equal(await successful.recovery.recoverProcessingRequest(baseRequest), 'completed');
  assert.equal(successful.calls.completed.length, 1);
  assert.equal(successful.calls.refunded.length, 0);

  const reverted = createHarness({
    getTransactionReceipt: async () => ({ status: 0 }),
    getTransaction: async () => ({ hash: '0xhash' })
  });
  assert.equal(await reverted.recovery.recoverProcessingRequest(baseRequest), 'failed');
  assert.equal(reverted.calls.refunded.length, 1);

  const uncertainConfirmation = createHarness({
    broadcastTransaction: async () => ({ wait: async () => { throw new Error('RPC timeout'); } })
  });
  const uncertainResult = await uncertainConfirmation.recovery.broadcastPreparedTransaction(baseRequest);
  assert.equal(uncertainResult.status, 'processing');
  assert.equal(uncertainConfirmation.calls.refunded.length, 0);
  assert.deepEqual(uncertainConfirmation.calls.failures, ['RPC timeout']);

  const uncertainBroadcast = createHarness({
    broadcastTransaction: async () => { throw new Error('Broadcast timeout'); }
  });
  const broadcastResult = await uncertainBroadcast.recovery.broadcastPreparedTransaction(baseRequest);
  assert.equal(broadcastResult.status, 'processing');
  assert.equal(uncertainBroadcast.calls.refunded.length, 0);
  assert.deepEqual(uncertainBroadcast.calls.failures, ['Broadcast timeout']);

  const rebroadcast = createHarness();
  assert.equal(await rebroadcast.recovery.recoverProcessingRequest(baseRequest), 'processing');
  assert.deepEqual(rebroadcast.calls.broadcasts, ['0xsigned']);

  const stalePreparation = createHarness();
  const unsignedRequest = { ...baseRequest, txHash: null, rawTransaction: '', broadcastAt: null };
  assert.equal(await stalePreparation.recovery.recoverProcessingRequest(unsignedRequest), 'refunded');
  assert.equal(stalePreparation.calls.refunded.length, 1);

  const legacy = createHarness();
  const legacyRequest = { ...unsignedRequest, processingStartedAt: null, updatedAt: new Date(NOW - 600000) };
  assert.equal(await legacy.recovery.recoverProcessingRequest(legacyRequest), 'manual_review');
  assert.equal(legacy.calls.refunded.length, 0);

  const pending = createHarness({
    getTransaction: async () => ({ hash: '0xhash' })
  });
  assert.equal(await pending.recovery.recoverProcessingRequest(baseRequest), 'pending_on_chain');
  assert.equal(pending.calls.broadcasts.length, 0);

  const rpcUnavailable = createHarness({
    getTransactionReceipt: async () => { throw new Error('RPC unavailable'); }
  });
  assert.equal(await rpcUnavailable.recovery.recoverProcessingRequest(baseRequest), 'rpc_unavailable');
  assert.equal(rpcUnavailable.calls.refunded.length, 0);
  assert.deepEqual(rpcUnavailable.calls.failures, ['RPC unavailable']);

  console.log('[worker-recovery] PASS');
}

main().catch((error) => {
  console.error(`[worker-recovery] FAIL: ${error.message}`);
  process.exitCode = 1;
});