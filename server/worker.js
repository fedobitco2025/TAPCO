require('dotenv').config();

const { ethers } = require('ethers');
const { db } = require('./db');

const WORKER_INTERVAL_MS = Number(process.env.WORKER_INTERVAL_MS || 60_000);
const WORKER_BATCH_SIZE = Number(process.env.WORKER_BATCH_SIZE || 10);
const TOKEN_DECIMALS = Number(process.env.TAPCO_TOKEN_DECIMALS || 18);
const TX_CONFIRMATIONS = Number(process.env.TX_CONFIRMATIONS || 1);

const REQUIRED_ENV = ['RPC_URL', 'PRIVATE_KEY', 'TAPCO_CONTRACT'];
const missingEnv = REQUIRED_ENV.filter((key) => !String(process.env[key] || '').trim());

if (missingEnv.length > 0) {
  throw new Error(`[worker] missing required env vars: ${missingEnv.join(', ')}`);
}

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
const tapcoAbi = [
  'function transfer(address to, uint256 amount) external returns (bool)'
];
const tapcoContract = new ethers.Contract(process.env.TAPCO_CONTRACT, tapcoAbi, wallet);

const pendingWithdrawStmt = db.prepare(`
  SELECT id, playerId, amount, walletAddress, chainId, status, txHash
  FROM withdraw_requests
  WHERE status = 'pending'
  ORDER BY id ASC
  LIMIT ?
`);

const markProcessingStmt = db.prepare(`
  UPDATE withdraw_requests
  SET status = 'processing', updatedAt = ?
  WHERE id = ? AND status = 'pending'
`);

const markCompletedStmt = db.prepare(`
  UPDATE withdraw_requests
  SET status = 'completed', txHash = ?, updatedAt = ?, failureReason = NULL
  WHERE id = ? AND status = 'processing'
`);

const markFailedStmt = db.prepare(`
  UPDATE withdraw_requests
  SET status = 'failed', updatedAt = ?, failureReason = ?
  WHERE id = ? AND status = 'processing'
`);

const setProcessingTxHashStmt = db.prepare(`
  UPDATE withdraw_requests
  SET txHash = ?, updatedAt = ?
  WHERE id = ? AND status = 'processing'
`);

const playerBalanceStmt = db.prepare('SELECT tapcoBalance FROM players WHERE id = ?');
const addPlayerBalanceStmt = db.prepare('UPDATE players SET tapcoBalance = tapcoBalance + ?, updatedAt = ? WHERE id = ?');

const failAndRefundTx = db.transaction((request, reason) => {
  const player = playerBalanceStmt.get(request.playerId);
  if (!player) {
    throw new Error('Player not found while refunding failed request');
  }

  const failResult = markFailedStmt.run(Date.now(), reason, request.id);
  if (failResult.changes === 0) {
    return { skipped: true };
  }

  addPlayerBalanceStmt.run(request.amount, Date.now(), request.playerId);
  return { skipped: false };
});

async function processOneWithdrawRequest(request) {
  const now = Date.now();
  const processingResult = markProcessingStmt.run(now, request.id);
  if (processingResult.changes === 0) {
    return { skipped: true };
  }

  try {
    const to = String(request.walletAddress || '').trim();
    if (!ethers.isAddress(to)) {
      failAndRefundTx(request, 'Invalid wallet address');
      return { ok: true, status: 'failed' };
    }

    const amountUnits = ethers.parseUnits(String(request.amount), TOKEN_DECIMALS);
    const tx = await tapcoContract.transfer(to, amountUnits);
    setProcessingTxHashStmt.run(tx.hash, Date.now(), request.id);

    // eslint-disable-next-line no-console
    console.log(`[worker] request #${request.id} tx sent: ${tx.hash}`);

    const receipt = await tx.wait(TX_CONFIRMATIONS);

    if (receipt && receipt.status === 1) {
      const completeResult = markCompletedStmt.run(tx.hash, Date.now(), request.id);
      if (completeResult.changes === 0) {
        return { skipped: true };
      }
      return { ok: true, status: 'completed', txHash: tx.hash };
    }

    failAndRefundTx(request, 'Transaction receipt indicates failure');
    return { ok: true, status: 'failed' };
  } catch (error) {
    const reason = error && error.message ? error.message : 'Blockchain transfer failed';
    failAndRefundTx(request, reason.slice(0, 240));
    return { ok: true, status: 'failed' };
  }
}

let isCycleRunning = false;

async function runWorkerCycle() {
  if (isCycleRunning) {
    // eslint-disable-next-line no-console
    console.log('[worker] previous cycle still running, skipping this tick');
    return;
  }

  isCycleRunning = true;

  const list = pendingWithdrawStmt.all(WORKER_BATCH_SIZE);
  if (list.length === 0) {
    // eslint-disable-next-line no-console
    console.log('[worker] no pending requests');
    isCycleRunning = false;
    return;
  }

  try {
    for (const request of list) {
      try {
        const result = await processOneWithdrawRequest(request);
        if (!result.skipped) {
          // eslint-disable-next-line no-console
          console.log(`[worker] request #${request.id} -> ${result.status}`);
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(`[worker] failed to process #${request.id}: ${error.message}`);
        try {
          failAndRefundTx(request, 'Worker internal error');
        } catch (_rollbackError) {
          // eslint-disable-next-line no-console
          console.error(`[worker] rollback failed for #${request.id}`);
        }
      }
    }
  } finally {
    isCycleRunning = false;
  }
}

// eslint-disable-next-line no-console
console.log(`[worker] started (interval: ${WORKER_INTERVAL_MS}ms, batch: ${WORKER_BATCH_SIZE})`);
runWorkerCycle().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(`[worker] startup cycle failed: ${error.message}`);
});
setInterval(runWorkerCycle, WORKER_INTERVAL_MS);
