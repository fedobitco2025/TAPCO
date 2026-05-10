const express = require('express');
const router = express.Router();
const antiBotService = require('./antibot.service');
const verifySignature = require('../../core/verifySignature');
const verifyNonce = require('../../middleware/nonce.middleware');
const { requireSessionBinding } = require('../../middleware/auth.middleware');

router.post('/report', verifySignature, verifyNonce, requireSessionBinding({ action: 'antibot_report', playerField: 'playerId' }), async (req, res) => {
  try {
    const result = await antiBotService.processReport(req.body, {
      headers: req.headers,
      socket: req.socket
    });
    return res.json(result);
  } catch (err) {
    console.error('POST /antibot/report error:', err);
    return res.status(500).json({ success: false, reason: 'server_error' });
  }
});

module.exports = router;