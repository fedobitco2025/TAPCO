const express = require('express');
const router = express.Router();
const walletService = require('./wallet.service');
const { validateWithdrawPayload, validateTransferPayload, validateDepositPayload } = require('./wallet.validation');
const verifyNonce = require('../../middleware/nonce.middleware');
const { requireSessionBinding } = require('../../middleware/auth.middleware');
const { createRequireVerifiedTelegramIdentity } = require('../../core/telegramAuth');
const envConfig = require('../../config/env');

const requireTelegramPlayer = createRequireVerifiedTelegramIdentity({
  botToken: envConfig.TELEGRAM_BOT_TOKEN,
  maxAgeMs: envConfig.TELEGRAM_INIT_DATA_MAX_AGE_MS
});
const requireTelegramSender = createRequireVerifiedTelegramIdentity({
  botToken: envConfig.TELEGRAM_BOT_TOKEN,
  maxAgeMs: envConfig.TELEGRAM_INIT_DATA_MAX_AGE_MS,
  playerField: 'fromPlayer'
});

router.post('/deposit', async (req, res) => {
  try {
    const validation = validateDepositPayload(req.body);
    if (!validation.valid) {
      return res.status(400).json({ success: false, reason: validation.reason });
    }

    const result = await walletService.handleDeposit(req.body);
    if (!result.success) {
      if (
        result.reason === 'player_not_found' ||
        result.reason === 'missing_wallet_address' ||
        result.reason === 'tx_already_used' ||
        result.reason === 'transaction_sender_mismatch' ||
        result.reason === 'invalid_tapco_amount'
      ) {
        return res.status(400).json(result);
      }

      if (result.reason === 'invalid_transaction') {
        return res.status(400).json(result);
      }

      return res.status(500).json({ success: false, reason: 'server_error' });
    }

    return res.json(result);
  } catch (err) {
    console.error('POST /wallet/deposit error:', err);
    return res.status(500).json({ success: false, reason: 'server_error' });
  }
});

router.post('/withdraw-game', (_req, res) => {
  return res.status(410).json({ success: false, reason: 'endpoint_retired' });
});

router.post('/withdraw', requireTelegramPlayer, verifyNonce, requireSessionBinding({ action: 'withdraw', playerField: 'playerId' }), async (req, res) => {
  try {
    const validation = validateWithdrawPayload(req.body);
    if (!validation.valid) {
      return res.status(400).json({ success: false, reason: validation.reason });
    }

    const result = await walletService.handleWithdraw(req.body, {
      headers: req.headers,
      socket: req.socket,
      connection: req.connection
    });
    return res.json(result);
  } catch (err) {
    console.error('POST /wallet/withdraw error:', err);
    return res.status(500).json({ success: false, reason: 'server_error' });
  }
});

router.post('/transfer', requireTelegramSender, verifyNonce, requireSessionBinding({ action: 'transfer', playerField: 'fromPlayer' }), async (req, res) => {
  try {
    const validation = validateTransferPayload(req.body);
    if (!validation.valid) {
      return res.status(400).json({ success: false, reason: validation.reason });
    }

    const result = await walletService.handleTransfer(req.body, {
      headers: req.headers,
      socket: req.socket,
      connection: req.connection
    });
    return res.json(result);
  } catch (err) {
    console.error('POST /wallet/transfer error:', err);
    return res.status(500).json({ success: false, reason: 'server_error' });
  }
});

router.get('/balance/:playerId', async (req, res) => {
  try {
    const { playerId } = req.params;
    const result = await walletService.getBalance(playerId);

    if (!result.success) {
      return res.status(404).json(result);
    }

    return res.json(result);
  } catch (err) {
    console.error('GET /wallet/balance error:', err);
    return res.status(500).json({ success: false, reason: 'server_error' });
  }
});

module.exports = router;