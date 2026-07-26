function createTransactionRecovery({
  provider,
  WithdrawRequest,
  completeWithdrawal,
  failAndRefund,
  trackWorkerFailure,
  txConfirmations,
  preparationTimeoutMs,
  rebroadcastIntervalMs,
  now = Date.now,
  logger = console
}) {
  async function settleReceipt(request, receipt, txHash) {
    if (!receipt) return { ok: true, status: 'processing', txHash };
    if (receipt.status === 1) {
      await completeWithdrawal(request, txHash);
      return { ok: true, status: 'completed', txHash };
    }
    await failAndRefund(request, 'Transaction receipt indicates failure');
    return { ok: true, status: 'failed', txHash };
  }

  async function broadcastPreparedTransaction(request) {
    try {
      const tx = await provider.broadcastTransaction(request.rawTransaction);
      await WithdrawRequest.updateOne(
        { _id: request._id, status: 'processing', txHash: request.txHash },
        { $set: { broadcastAt: new Date(now()), updatedAt: new Date(now()) }, $inc: { broadcastAttempts: 1 } }
      );
      logger.log(`[worker] request ${request._id} tx broadcast: ${request.txHash}`);

      try {
        const receipt = await tx.wait(txConfirmations);
        return settleReceipt(request, receipt, request.txHash);
      } catch (error) {
        const reason = error?.message || 'Transaction confirmation unavailable';
        trackWorkerFailure(reason);
        logger.error(`[worker] request ${request._id} confirmation uncertain; retained for reconciliation:`, reason);
        return { ok: true, status: 'processing', txHash: request.txHash };
      }
    } catch (error) {
      const reason = error?.message || 'Transaction broadcast unavailable';
      trackWorkerFailure(reason);
      logger.error(`[worker] request ${request._id} broadcast uncertain; retained for reconciliation:`, reason);
      return { ok: true, status: 'processing', txHash: request.txHash };
    }
  }

  async function recoverProcessingRequest(request) {
    const currentTime = now();
    if (!request.txHash) {
      const processingStartedAt = request.processingStartedAt && new Date(request.processingStartedAt).getTime();
      if (processingStartedAt && currentTime - processingStartedAt >= preparationTimeoutMs) {
        await failAndRefund(request, 'Transaction preparation timed out before signing');
        return 'refunded';
      }
      if (!processingStartedAt && currentTime - new Date(request.updatedAt).getTime() >= preparationTimeoutMs) {
        logger.error(`[worker][ALERT] legacy processing request ${request._id} has no txHash; manual review required`);
        return 'manual_review';
      }
      return 'waiting';
    }

    let receipt;
    let chainTransaction;
    try {
      [receipt, chainTransaction] = await Promise.all([
        provider.getTransactionReceipt(request.txHash),
        provider.getTransaction(request.txHash)
      ]);
    } catch (error) {
      trackWorkerFailure(error?.message || 'Processing reconciliation RPC failed');
      return 'rpc_unavailable';
    }

    if (receipt) {
      const result = await settleReceipt(request, receipt, request.txHash);
      return result.status;
    }
    if (chainTransaction) return 'pending_on_chain';

    if (!request.rawTransaction) {
      logger.error(`[worker][ALERT] processing request ${request._id} has txHash but no signed transaction; manual review required`);
      return 'manual_review';
    }

    const lastAttemptAt = request.broadcastAt || request.updatedAt || request.processingStartedAt;
    if (lastAttemptAt && currentTime - new Date(lastAttemptAt).getTime() < rebroadcastIntervalMs) return 'waiting';
    const result = await broadcastPreparedTransaction(request);
    return result.status;
  }

  return { settleReceipt, broadcastPreparedTransaction, recoverProcessingRequest };
}

module.exports = { createTransactionRecovery };