const express = require('express');
const router = express.Router();
const referralService = require('./referral.service');

router.post('/pendingRefNotify', async (req, res) => {
  try {
    const result = await referralService.handleReferral(req);
    return res.json(result);
  } catch (err) {
    console.error('Referral Error:', err);
    return res.status(500).json({ success: false, reason: 'server_error' });
  }
});

module.exports = router;
