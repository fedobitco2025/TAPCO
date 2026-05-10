const Nonce = require('../models/nonce.model');
const { securityLog } = require('../core/logger');

module.exports = async (req, res, next) => {
  try {
    const rawNonce = req.body?.nonce;
    const nonce = typeof rawNonce === 'string' ? rawNonce.trim() : '';

    if (!nonce) {
      securityLog('nonce_rejected', {
        reason: 'missing_nonce',
        statusCode: 400,
        method: req.method,
        path: req.originalUrl,
        playerId: req.body?.playerId || req.body?.fromPlayer || '',
        sessionId: req.body?.sessionId || ''
      });
      return res.status(400).json({ success: false, reason: 'missing_nonce' });
    }

    await Nonce.create({ nonce });
    req.nonce = nonce;
    return next();
  } catch (err) {
    if (err && err.code === 11000) {
      securityLog('replay_attack', {
        reason: 'replay_detected',
        nonce: req.body?.nonce || '',
        method: req.method,
        path: req.originalUrl,
        playerId: req.body?.playerId || req.body?.fromPlayer || '',
        sessionId: req.body?.sessionId || ''
      });

      return res.status(409).json({ success: false, reason: 'replay_detected' });
    }

    console.error('verifyNonce middleware error:', err);
    return res.status(500).json({ success: false, reason: 'server_error' });
  }
};
