const assert = require('assert');
const { getWorkerHealth } = require('./src/monitoring/workerHealth');

const now = Date.parse('2026-07-26T12:00:00.000Z');
const options = { enabled: true, now, staleAfterMs: 60_000 };

assert.deepStrictEqual(getWorkerHealth(null, options).status, 'not_started');
assert.deepStrictEqual(getWorkerHealth(null, { ...options, enabled: false }).status, 'disabled');

const healthy = getWorkerHealth({
  state: 'idle',
  heartbeatAt: new Date(now - 15_000),
  lastCycleCompletedAt: new Date(now - 15_000)
}, options);
assert.strictEqual(healthy.status, 'healthy');
assert.strictEqual(healthy.healthy, true);
assert.strictEqual(healthy.ageMs, 15_000);

const stale = getWorkerHealth({ state: 'idle', heartbeatAt: new Date(now - 60_001) }, options);
assert.strictEqual(stale.status, 'stale');
assert.strictEqual(stale.healthy, false);

const failed = getWorkerHealth({ state: 'error', heartbeatAt: new Date(now - 1_000), lastError: 'RPC unavailable' }, options);
assert.strictEqual(failed.status, 'error');
assert.strictEqual(failed.healthy, false);
assert.strictEqual(failed.lastError, 'RPC unavailable');

console.log('[worker-health] PASS');