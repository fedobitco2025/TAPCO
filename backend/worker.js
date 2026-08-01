require('dotenv').config();

const crypto = require('node:crypto');
const mongoose = require('mongoose');
const { ethers } = require('ethers');
const { createTransactionRecovery } = require('./src/worker/transactionRecovery');
const { createWorkerLease } = require('./src/worker/workerLease');
const WorkerHeartbeat = require('./src/models/workerHeartbeat.model');

const WORKER_INTERVAL_MS = Number(process.env.WORKER_INTERVAL_MS || 15_000);
const BLOCKCHAIN_KIND = String(process.env.TAPCO_BLOCKCHAIN_KIND || process.env.BLOCKCHAIN_KIND || 'evm').trim().toLowerCase();
const WORKER_BATCH_SIZE = Number(process.env.WORKER_BATCH_SIZE || 5);
const TOKEN_DECIMALS = Number(process.env.TAPCO_TOKEN_DECIMALS || 18);
const TX_CONFIRMATIONS = Number(process.env.TX_CONFIRMATIONS || 1);
const EXPECTED_CHAIN_ID = Number(process.env.EXPECTED_CHAIN_ID || 97);
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/tapco';
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || process.env.TAPCO_CONTRACT || '';
const SECURITY_ALERT_WINDOW_MS = Number(process.env.SECURITY_ALERT_WINDOW_MS || 60_000);
const WORKER_FAILURE_ALERT_THRESHOLD = Number(process.env.WORKER_FAILURE_ALERT_THRESHOLD || 5);
const WORKER_PREPARATION_TIMEOUT_MS = Number(process.env.WORKER_PREPARATION_TIMEOUT_MS || 5 * 60_000);
const WORKER_REBROADCAST_INTERVAL_MS = Number(process.env.WORKER_REBROADCAST_INTERVAL_MS || 60_000);
const WORKER_LEASE_MS = Number(process.env.WORKER_LEASE_MS || 10 * 60_000);
const WITHDRAWAL_WORKER_ENABLED = process.env.WITHDRAWAL_WORKER_ENABLED !== 'false';
const WORKER_INSTANCE_ID = `${process.pid}-${crypto.randomUUID()}`;
const TON_WITHDRAW_SEND_ENABLED = process.env.TON_WITHDRAW_SEND_ENABLED === 'true';

if (!WITHDRAWAL_WORKER_ENABLED) {
  console.log('[worker] disabled by WITHDRAWAL_WORKER_ENABLED=false');
  process.exit(0);
}

const TON_MODE = BLOCKCHAIN_KIND === 'ton';

const workerAlertState = {
  failuresInWindow: 0,
  windowStartedAt: Date.now()
};

function trackWorkerFailure(reason) {
  const now = Date.now();
  if (now - workerAlertState.windowStartedAt >= SECURITY_ALERT_WINDOW_MS) {
    workerAlertState.failuresInWindow = 0;
    workerAlertState.windowStartedAt = now;
  }

  workerAlertState.failuresInWindow += 1;
  if (workerAlertState.failuresInWindow >= WORKER_FAILURE_ALERT_THRESHOLD) {
    console.error(
      `[worker][ALERT] ${workerAlertState.failuresInWindow} failures within ${SECURITY_ALERT_WINDOW_MS}ms. Latest reason: ${reason}`
    );
  }
}

const REQUIRED_ENV = ['RPC_URL', 'PRIVATE_KEY'];
const missingEnv = TON_MODE
  ? []
  : REQUIRED_ENV.filter((key) => !String(process.env[key] || '').trim());
if (!TON_MODE && !CONTRACT_ADDRESS) missingEnv.push('CONTRACT_ADDRESS (or TAPCO_CONTRACT)');

if (missingEnv.length > 0) {
  console.error(`[worker] Missing required env vars: ${missingEnv.join(', ')}`);
  process.exit(1);
}

// ── Blockchain setup ──────────────────────────────────────────────────────────
const provider = TON_MODE ? null : new ethers.JsonRpcProvider(process.env.RPC_URL);
const wallet = TON_MODE ? null : new ethers.Wallet(process.env.PRIVATE_KEY, provider);
const tapcoAbi = ['function transfer(address to, uint256 amount) external returns (bool)'];
const tapcoContract = TON_MODE ? null : new ethers.Contract(CONTRACT_ADDRESS, tapcoAbi, wallet);

// ── Mongoose models (inline to avoid circular issues when running standalone) ─
const withdrawRequestSchema = new mongoose.Schema({
  playerId: String,
  amount: Number,
  walletAddress: String,
  chainId: { type: String, default: '' },
  status: { type: String, enum: ['pending', 'processing', 'refunding', 'completed', 'failed'], default: 'pending' },
  txHash: { type: String, default: null },
  rawTransaction: { type: String, default: '' },
  processingStartedAt: { type: Date, default: null },
  broadcastAt: { type: Date, default: null },
  broadcastAttempts: { type: Number, default: 0 },
  clientSignature: { type: String, default: '' },
  activeRequestKey: { type: String, default: null },
  reservationId: { type: String, default: null },
  requestedAt: { type: Number, default: 0 },
  failureReason: { type: String, default: null },
  refundedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { versionKey: false });

const playerSchema = new mongoose.Schema({
  playerId: { type: String, required: true, unique: true },
  tapcoBalance: { type: Number, default: 0 },
  refundedWithdrawalIds: { type: [String], default: [] }
}, { strict: false, versionKey: false });

const workerLeaseSchema = new mongoose.Schema({
  _id: String,
  ownerId: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  updatedAt: { type: Date, required: true }
}, { versionKey: false });

const WithdrawRequest = mongoose.models.WithdrawRequest || mongoose.model('WithdrawRequest', withdrawRequestSchema);
const Player = mongoose.models.Player || mongoose.model('Player', playerSchema);
const WorkerLease = mongoose.models.WorkerLease || mongoose.model('WorkerLease', workerLeaseSchema);
const workerLease = createWorkerLease({
  LeaseModel: WorkerLease,
  leaseId: 'withdrawal-dispatch',
  ownerId: WORKER_INSTANCE_ID,
  leaseMs: WORKER_LEASE_MS
});

async function writeWorkerHeartbeat(state, fields = {}) {
  try {
    const now = new Date();
    await WorkerHeartbeat.findByIdAndUpdate(
      'withdrawal-worker',
      {
        $set: {
          state,
          heartbeatAt: now,
          instanceId: WORKER_INSTANCE_ID,
          updatedAt: now,
          ...fields
        }
      },
      { upsert: true, setDefaultsOnInsert: true }
    );
  } catch (error) {
    console.error('[worker] heartbeat write failed:', error?.message || error);
  }
}

// ── Worker logic ──────────────────────────────────────────────────────────────
async function failAndRefund(request, reason) {
  trackWorkerFailure(reason);
  const requestId = String(request._id);

  const refundingRequest = await WithdrawRequest.findOneAndUpdate(
    { _id: request._id, status: { $in: ['processing', 'refunding'] } },
    { $set: { status: 'refunding', failureReason: reason.slice(0, 240), updatedAt: new Date() } },
    { new: true }
  );

  if (!refundingRequest) {
    console.log(`[worker] request ${request._id} already settled, skipping refund`);
    return;
  }

  const refundedPlayer = await Player.findOneAndUpdate(
    { playerId: request.playerId, refundedWithdrawalIds: { $ne: requestId } },
    {
      $inc: { tapcoBalance: request.amount },
      $addToSet: { refundedWithdrawalIds: requestId },
      $set: { updatedAt: new Date() }
    },
    { new: true }
  );

  if (!refundedPlayer) {
    const alreadyRefunded = await Player.exists({
      playerId: request.playerId,
      refundedWithdrawalIds: requestId
    });
    if (!alreadyRefunded) {
      throw new Error(`Cannot refund withdrawal ${requestId}: player record not found`);
    }
  }

  await WithdrawRequest.updateOne(
    { _id: request._id, status: 'refunding' },
    {
      $set: { status: 'failed', refundedAt: new Date(), updatedAt: new Date() },
      $unset: { activeRequestKey: 1, rawTransaction: 1 }
    }
  );

  console.log(`[worker] request ${request._id} failed + refunded ${request.amount} TAPCO to ${request.playerId}`);
}

async function completeWithdrawal(request, txHash) {
  const completed = await WithdrawRequest.findOneAndUpdate(
    { _id: request._id, status: 'processing' },
    {
      $set: { status: 'completed', txHash, failureReason: null, updatedAt: new Date() },
      $unset: { activeRequestKey: 1, rawTransaction: 1 }
    },
    { new: true }
  );
  if (completed) console.log(`[worker] request ${request._id} completed: ${txHash}`);
  return completed;
}

const transactionRecovery = TON_MODE
  ? {
      broadcastPreparedTransaction: async () => ({ ok: false, status: 'failed' }),
      recoverProcessingRequest: async (request) => {
        await failAndRefund(request, 'TON withdrawal dispatch is not enabled');
      }
    }
  : createTransactionRecovery({
      provider,
      WithdrawRequest,
      completeWithdrawal,
      failAndRefund,
      trackWorkerFailure,
      txConfirmations: TX_CONFIRMATIONS,
      preparationTimeoutMs: WORKER_PREPARATION_TIMEOUT_MS,
      rebroadcastIntervalMs: WORKER_REBROADCAST_INTERVAL_MS
    });

const { broadcastPreparedTransaction, recoverProcessingRequest } = transactionRecovery;

async function processOneRequest(request) {
  // Atomically mark as processing (prevents duplicate processing)
  const updated = await WithdrawRequest.findOneAndUpdate(
    { _id: request._id, status: 'pending' },
    { $set: { status: 'processing', processingStartedAt: new Date(), updatedAt: new Date() } },
    { new: true }
  );
  if (!updated) {
    return { skipped: true };
  }

  if (TON_MODE && !TON_WITHDRAW_SEND_ENABLED) {
    await failAndRefund(updated, 'TON withdrawal dispatch is disabled by TON_WITHDRAW_SEND_ENABLED=false');
    return { ok: true, status: 'failed' };
  }

  try {
    const to = String(request.walletAddress || '').trim();
    if (!ethers.isAddress(to)) {
      await failAndRefund(request, 'Invalid wallet address');
      return { ok: true, status: 'failed' };
    }

    const amountUnits = ethers.parseUnits(String(request.amount), TOKEN_DECIMALS);
    const transferRequest = await tapcoContract.transfer.populateTransaction(to, amountUnits);
    const populatedTransaction = await wallet.populateTransaction(transferRequest);
    const rawTransaction = await wallet.signTransaction(populatedTransaction);
    const txHash = ethers.keccak256(rawTransaction);

    const prepared = await WithdrawRequest.findOneAndUpdate(
      { _id: request._id, status: 'processing', txHash: null },
      {
        $set: { txHash, rawTransaction, updatedAt: new Date() }
      },
      { new: true }
    );
    if (!prepared) return { skipped: true };
    return broadcastPreparedTransaction(prepared);
  } catch (err) {
    const reason = err && err.message ? String(err.message) : 'Blockchain transfer failed';
    console.error(`[worker] request ${request._id} preparation error:`, reason);
    await failAndRefund(updated, reason);
    return { ok: true, status: 'failed' };
  }
}

async function runWorkerCycle(canDispatch = () => true) {
  if (!WITHDRAWAL_WORKER_ENABLED) return;

  const refunding = await WithdrawRequest.find({ status: 'refunding' })
    .sort({ updatedAt: 1 })
    .limit(WORKER_BATCH_SIZE)
    .lean();
  for (const request of refunding) {
    await failAndRefund(request, request.failureReason || 'Blockchain transfer failed');
  }

  const processing = await WithdrawRequest.find({ status: 'processing' })
    .sort({ updatedAt: 1 })
    .limit(WORKER_BATCH_SIZE)
    .lean();
  for (const request of processing) {
    await recoverProcessingRequest(request);
  }

  const pending = await WithdrawRequest.find({ status: 'pending' })
    .sort({ createdAt: 1 })
    .limit(WORKER_BATCH_SIZE)
    .lean();

  if (pending.length === 0) return;
  if (!canDispatch()) return;

  console.log(`[worker] processing ${pending.length} pending request(s)`);
  for (const request of pending) {
    if (!canDispatch()) {
      console.error('[worker][ALERT] worker lease lost; stopping new withdrawal claims');
      break;
    }
    await processOneRequest(request);
  }
}

let isCycleRunning = false;

async function tick() {
  if (isCycleRunning) {
    console.log('[worker] previous cycle still running, skipping tick');
    return;
  }
  isCycleRunning = true;
  let leaseAcquired = false;
  let leaseHealthy = false;
  let leaseHeartbeat = null;
  let cycleError = null;
  try {
    await writeWorkerHeartbeat('running', { lastCycleStartedAt: new Date(), lastError: '' });
    leaseAcquired = await workerLease.acquire();
    if (!leaseAcquired) return;
    leaseHealthy = true;
    leaseHeartbeat = setInterval(async () => {
      try {
        leaseHealthy = await workerLease.renew();
        if (!leaseHealthy) console.error('[worker][ALERT] withdrawal worker lease ownership was lost');
      } catch (error) {
        leaseHealthy = false;
        trackWorkerFailure(error?.message || 'Worker lease renewal failed');
      }
    }, Math.max(1000, Math.floor(WORKER_LEASE_MS / 3)));
    leaseHeartbeat.unref();
    await runWorkerCycle(() => leaseHealthy);
  } catch (err) {
    cycleError = err;
    trackWorkerFailure(err?.message || 'Worker cycle failed');
    console.error('[worker] cycle error:', err);
    await writeWorkerHeartbeat('error', { lastError: String(err?.message || err).slice(0, 240) });
  } finally {
    if (leaseHeartbeat) clearInterval(leaseHeartbeat);
    if (leaseAcquired) {
      try {
        await workerLease.release();
      } catch (error) {
        trackWorkerFailure(error?.message || 'Worker lease release failed');
      }
    }
    if (!cycleError) {
      await writeWorkerHeartbeat('idle', { lastCycleCompletedAt: new Date(), lastError: '' });
    }
    isCycleRunning = false;
  }
}

async function main() {
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== EXPECTED_CHAIN_ID) {
    throw new Error(`Unexpected chain ID ${network.chainId}; expected ${EXPECTED_CHAIN_ID}`);
  }
  console.log('[worker] connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  await writeWorkerHeartbeat('starting', { lastError: '' });
  console.log('[worker] connected. Starting interval every', WORKER_INTERVAL_MS, 'ms');
  await tick();
  setInterval(tick, WORKER_INTERVAL_MS);
}

main().catch((err) => {
  console.error('[worker] fatal startup error:', err);
  process.exit(1);
});
