function getWorkerHealth(heartbeat, options = {}) {
  const enabled = options.enabled !== false;
  const now = Number(options.now || Date.now());
  const staleAfterMs = Math.max(1000, Number(options.staleAfterMs || 60_000));

  if (!enabled) {
    return { status: 'disabled', healthy: false, ageMs: null, heartbeatAt: null };
  }
  if (!heartbeat?.heartbeatAt) {
    return { status: 'not_started', healthy: false, ageMs: null, heartbeatAt: null };
  }

  const heartbeatAt = new Date(heartbeat.heartbeatAt);
  const timestamp = heartbeatAt.getTime();
  if (!Number.isFinite(timestamp)) {
    return { status: 'invalid', healthy: false, ageMs: null, heartbeatAt: null };
  }

  const ageMs = Math.max(0, now - timestamp);
  const state = String(heartbeat.state || 'idle');
  const stale = ageMs > staleAfterMs;
  const healthy = !stale && state !== 'error' && state !== 'stopped';

  return {
    status: stale ? 'stale' : (state === 'error' ? 'error' : (state === 'stopped' ? 'stopped' : 'healthy')),
    healthy,
    state,
    ageMs,
    heartbeatAt: heartbeatAt.toISOString(),
    lastCycleCompletedAt: heartbeat.lastCycleCompletedAt || null,
    lastError: state === 'error' ? String(heartbeat.lastError || '').slice(0, 240) : ''
  };
}

module.exports = { getWorkerHealth };