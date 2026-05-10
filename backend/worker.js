require('dotenv').config();

const mongoose = require('mongoose');
const { ethers } = require('ethers');

const WORKER_INTERVAL_MS = Number(process.env.WORKER_INTERVAL_MS || 15_000);
const WORKER_BATCH_SIZE = Number(process.env.WORKER_BATCH_SIZE || 5);
const TOKEN_DECIMALS = Number(process.env.TAPCO_TOKEN_DECIMALS || 18);
const TX_CONFIRMATIONS = Number(process.env.TX_CONFIRMATIONS || 1);
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/tapco';
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || process.env.TAPCO_CONTRACT || '';
const SECURITY_ALERT_WINDOW_MS = Number(process.env.SECURITY_ALERT_WINDOW_MS || 60_000);
const WORKER_FAILURE_ALERT_THRESHOLD = Number(process.env.WORKER_FAILURE_ALERT_THRESHOLD || 5);

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
const missingEnv = REQUIRED_ENV.filter((key) => !String(process.env[key] || '').trim());
if (!CONTRACT_ADDRESS) missingEnv.push('CONTRACT_ADDRESS (or TAPCO_CONTRACT)');

if (missingEnv.length > 0) {
  console.error(`[worker] Missing required env vars: ${missingEnv.join(', ')}`);
  process.exit(1);
}

// ── Blockchain setup ──────────────────────────────────────────────────────────
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
const tapcoAbi = ['function transfer(address to, uint256 amount) external returns (bool)'];
const tapcoContract = new ethers.Contract(CONTRACT_ADDRESS, tapcoAbi, wallet);

// ── Mongoose models (inline to avoid circular issues when running standalone) ─
const withdrawRequestSchema = new mongoose.Schema({
  playerId: String,
  amount: Number,
  walletAddress: String,
  chainId: { type: String, default: '' },
  status: { type: String, enum: ['pending', 'processing', 'completed', 'failed'], default: 'pending' },
  txHash: { type: String, default: null },
  clientSignature: { type: String, default: '' },
  requestedAt: { type: Number, default: 0 },
  failureReason: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { versionKey: false });

const playerSchema = new mongoose.Schema({
  playerId: { type: String, required: true, unique: true },
  tapcoBalance: { type: Number, default: 0 }
}, { strict: false, versionKey: false });

const WithdrawRequest = mongoose.models.WithdrawRequest || mongoose.model('WithdrawRequest', withdrawRequestSchema);
const Player = mongoose.models.Player || mongoose.model('Player', playerSchema);

// ── Worker logic ──────────────────────────────────────────────────────────────
async function failAndRefund(request, reason) {
  trackWorkerFailure(reason);

  // Keep this path compatible with standalone MongoDB (no replica-set transactions).
  const failedRequest = await WithdrawRequest.findOneAndUpdate(
    { _id: request._id, status: 'processing' },
    { $set: { status: 'failed', failureReason: reason.slice(0, 240), updatedAt: new Date() } },
    { new: true }
  );

  if (!failedRequest) {
    console.log(`[worker] request ${request._id} already settled, skipping refund`);
    return;
  }

  await Player.findOneAndUpdate(
    { playerId: request.playerId },
    { $inc: { tapcoBalance: request.amount }, $set: { updatedAt: new Date() } }
  );

  console.log(`[worker] request ${request._id} failed + refunded ${request.amount} TAPCO to ${request.playerId}`);
}

async function processOneRequest(request) {
  // Atomically mark as processing (prevents duplicate processing)
  const updated = await WithdrawRequest.findOneAndUpdate(
    { _id: request._id, status: 'pending' },
    { $set: { status: 'processing', updatedAt: new Date() } },
    { new: true }
  );
  if (!updated) {
    return { skipped: true };
  }

  try {
    const to = String(request.walletAddress || '').trim();
    if (!ethers.isAddress(to)) {
      await failAndRefund(request, 'Invalid wallet address');
      return { ok: true, status: 'failed' };
    }

    const amountUnits = ethers.parseUnits(String(request.amount), TOKEN_DECIMALS);
    const tx = await tapcoContract.transfer(to, amountUnits);

    // Store txHash immediately so we can recover if process dies
    await WithdrawRequest.findByIdAndUpdate(
      request._id,
      { $set: { txHash: tx.hash, updatedAt: new Date() } }
    );

    console.log(`[worker] request ${request._id} tx sent: ${tx.hash}`);

    const receipt = await tx.wait(TX_CONFIRMATIONS);

    if (receipt && receipt.status === 1) {
      await WithdrawRequest.findOneAndUpdate(
        { _id: request._id, status: 'processing' },
        { $set: { status: 'completed', txHash: tx.hash, failureReason: null, updatedAt: new Date() } }
      );
      console.log(`[worker] request ${request._id} completed: ${tx.hash}`);
      return { ok: true, status: 'completed', txHash: tx.hash };
    }

    await failAndRefund(request, 'Transaction receipt indicates failure');
    return { ok: true, status: 'failed' };
  } catch (err) {
    const reason = err && err.message ? String(err.message) : 'Blockchain transfer failed';
    console.error(`[worker] request ${request._id} error:`, reason);
    await failAndRefund(request, reason);
    return { ok: true, status: 'failed' };
  }
}

async function runWorkerCycle() {
  const pending = await WithdrawRequest.find({ status: 'pending' })
    .sort({ createdAt: 1 })
    .limit(WORKER_BATCH_SIZE)
    .lean();

  if (pending.length === 0) return;

  console.log(`[worker] processing ${pending.length} pending request(s)`);
  for (const request of pending) {
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
  try {
    await runWorkerCycle();
  } catch (err) {
    console.error('[worker] cycle error:', err);
  } finally {
    isCycleRunning = false;
  }
}

async function main() {
  console.log('[worker] connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('[worker] connected. Starting interval every', WORKER_INTERVAL_MS, 'ms');
  await tick();
  setInterval(tick, WORKER_INTERVAL_MS);
}

main().catch((err) => {
  console.error('[worker] fatal startup error:', err);
  process.exit(1);
});
