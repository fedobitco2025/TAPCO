const express = require('express');
const router = express.Router();
const playerService = require('./player.service');
const verifySignature = require('../../core/verifySignature');
const verifyNonce = require('../../middleware/nonce.middleware');

router.post('/init', verifySignature, verifyNonce, async (req, res) => {
  try {
    const result = await playerService.initializePlayer(req.body);
    return res.json(result);
  } catch (err) {
    console.error('POST /player/init error:', err);
    return res.status(500).json({ success: false, reason: 'server_error' });
  }
});

router.get('/wallet-info', async (req, res) => {
  try {
    const result = await playerService.getWalletInfo({ playerId: req.query?.playerId });
    if (!result.success) {
      if (result.reason === 'missing_player_id') {
        return res.status(400).json(result);
      }

      if (result.reason === 'player_not_found') {
        return res.status(404).json(result);
      }

      if (result.reason === 'missing_wallet_address') {
        return res.status(400).json(result);
      }

      return res.status(500).json(result);
    }

    return res.json(result);
  } catch (err) {
    console.error('GET /player/wallet-info error:', err);
    return res.status(500).json({ success: false, reason: 'server_error' });
  }
});

router.post('/earn', async (req, res) => {
  try {
    const result = await playerService.addEarnPoints({
      playerId: req.body?.playerId,
      amount: req.body?.amount
    });

    if (!result.success) {
      if (result.reason === 'missing_player_id' || result.reason === 'invalid_amount') {
        return res.status(400).json(result);
      }

      if (result.reason === 'player_not_found') {
        return res.status(404).json(result);
      }

      return res.status(500).json(result);
    }

    return res.json(result);
  } catch (err) {
    console.error('POST /player/earn error:', err);
    return res.status(500).json({ success: false, reason: 'server_error' });
  }
});

module.exports = router;
