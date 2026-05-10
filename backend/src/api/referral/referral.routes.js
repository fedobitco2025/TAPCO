const express = require('express');
const router = express.Router();
const referralService = require('./referral.service');
const verifySignature = require('../../core/verifySignature');
const verifyNonce = require('../../middleware/nonce.middleware');
const { requireSessionBinding } = require('../../middleware/auth.middleware');

router.post('/activate', verifySignature, verifyNonce, requireSessionBinding({ action: 'referral_activation', playerField: 'playerId' }), async (req, res) => {
  try {
    const result = await referralService.activateReferral(req.body, {
      headers: req.headers,
      socket: req.socket
    });
    return res.json(result);
  } catch (err) {
    console.error('POST /referral/activate error:', err);
    return res.status(500).json({ success: false, reason: 'server_error' });
  }
});

router.post('/pendingRefNotify', verifySignature, verifyNonce, requireSessionBinding({ action: 'referral_pending_notify', playerField: 'playerId' }), async (req, res) => {
  try {
    const result = await referralService.handleReferral(req);
    return res.json(result);
  } catch (err) {
    console.error('Referral Error:', err);
    return res.status(500).json({ success: false, reason: 'server_error' });
  }
});

module.exports = router;