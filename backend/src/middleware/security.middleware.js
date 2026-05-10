const crypto = require('crypto');
const abuse = require('../core/abuse');
const { securityLog } = require('../core/logger');
const WalletTx = require('../models/walletTx.model');

const resolveAction = (resolver, req) => {
  if (typeof resolver === 'function') {
    return resolver(req);
  }

  if (typeof resolver === 'string' && resolver.trim()) {
    return resolver;
  }

  return 'unknown_action';
};

module.exports.securityGuard = (actionResolver) => {
  return (req, res, next) => {
    const forwardedFor = req.headers['x-forwarded-for'];
    const realIP = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : (forwardedFor || req.socket?.remoteAddress || req.connection?.remoteAddress || '0.0.0.0');

    const ipHash = crypto.createHash('sha256').update(String(realIP)).digest('hex');
    const deviceFingerprint =
      req.body?.deviceFingerprint ||
      req.headers['x-device-fingerprint'] ||
      'unknown';
    const routeAction = resolveAction(actionResolver, req);

    const flags = abuse.detectAbuse({
      ipHash,
      deviceFingerprint,
      action: routeAction,
      fromPlayer: req.body?.fromPlayer,
      toPlayer: req.body?.toPlayer,
      playerId: req.body?.playerId,
      referrerId: req.body?.referrerId
    });

    securityLog('security_guard_scan', {
      routeAction,
      ipHash,
      deviceFingerprint,
      flags,
      method: req.method,
      path: req.originalUrl
    });

    if (flags.length > 0 && (routeAction === 'withdraw' || routeAction === 'transfer' || routeAction === 'referral_activation')) {
      if (routeAction === 'withdraw' || routeAction === 'transfer') {
        securityLog(`${routeAction}_abuse_detected`, {
          routeAction,
          ipHash,
          deviceFingerprint,
          flags,
          reason: 'abuse_detected',
          playerId: req.body?.playerId,
          fromPlayer: req.body?.fromPlayer,
          toPlayer: req.body?.toPlayer,
          amount: req.body?.amount
        });
      }

      if (routeAction === 'withdraw' || routeAction === 'transfer') {
        void WalletTx.create({
          txType: routeAction,
          playerId: req.body?.playerId || '',
          fromPlayer: req.body?.fromPlayer || '',
          toPlayer: req.body?.toPlayer || '',
          amount: typeof req.body?.amount === 'number' ? req.body.amount : 0,
          walletAddress: req.body?.walletAddress || '',
          ipHash,
          deviceFingerprint,
          status: 'blocked',
          reason: 'abuse_detected',
          flags
        }).catch((err) => {
          console.error('WalletTx Middleware Write Error:', err.message);
        });
      }

      securityLog('security_guard_block', {
        routeAction,
        ipHash,
        deviceFingerprint,
        flags,
        reason: 'abuse_detected',
        statusCode: 403,
        method: req.method,
        path: req.originalUrl,
        playerId: req.body?.playerId,
        fromPlayer: req.body?.fromPlayer,
        toPlayer: req.body?.toPlayer,
        amount: req.body?.amount
      });

      const statusCode = routeAction === 'withdraw' || routeAction === 'transfer' ? 200 : 403;

      return res.status(statusCode).json({
        success: false,
        reason: 'abuse_detected',
        flags
      });
    }

    req.securityContext = {
      ipHash,
      deviceFingerprint,
      flags
    };

    return next();
  };
};

module.exports.unityAccessGuard = (req, res, next) => next();

