const express = require('express');
const router = express.Router();
const antiBotService = require('./antibot.service');

router.post('/report', async (req, res) => {
  try {
    const result = await antiBotService.processReport(req.body, {
      headers: req.headers,
      socket: req.socket
    });
    return res.json(result);
  } catch (err) {
    console.error('AntiBot Error:', err);
    return res.status(500).json({ success: false, reason: 'server_error' });
  }
});

module.exports = router;
