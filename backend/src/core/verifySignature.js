const crypto = require('crypto');
const { requestSecret } = require('../config');
const { securityLog } = require('./logger');

const secureCompareHex = (a, b) => {
  try {
    const left = Buffer.from(String(a || ''), 'hex');
    const right = Buffer.from(String(b || ''), 'hex');

    if (left.length === 0 || right.length === 0 || left.length !== right.length) {
      return false;
    }

    return crypto.timingSafeEqual(left, right);
  } catch (_) {
    return false;
  }
};

module.exports = (req, res, next) => {
  if (!requestSecret) {
    console.error('REQUEST_SECRET is not configured. Rejecting signed request validation.');
    return res.status(500).json({ success: false, reason: 'server_misconfigured' });
  }

  const signature = req.headers['x-signature'];
  const bodyString = JSON.stringify(req.body || {});

  if (!signature) {
    securityLog('missing_signature', {
      reason: 'missing_signature',
      method: req.method,
      path: req.originalUrl,
      playerId: req.body?.playerId || req.body?.fromPlayer || '',
      sessionId: req.body?.sessionId || ''
    });

    return res.status(401).json({ success: false, reason: 'missing_signature' });
  }

  const expected = crypto
    .createHmac('sha256', requestSecret)
    .update(bodyString)
    .digest('hex');

  if (!secureCompareHex(signature, expected)) {
    securityLog('invalid_signature', {
      reason: 'tampered_request',
      method: req.method,
      path: req.originalUrl,
      playerId: req.body?.playerId || req.body?.fromPlayer || '',
      sessionId: req.body?.sessionId || ''
    });

    return res.status(401).json({ success: false, reason: 'invalid_signature' });
  }

  return next();
};
