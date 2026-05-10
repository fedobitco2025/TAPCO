module.exports.normalizeApiResponse = (req, res, next) => {
  const originalJson = res.json.bind(res);

  res.json = (body) => {
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return originalJson(body);
    }

    if (Object.prototype.hasOwnProperty.call(body, 'meta') && Object.prototype.hasOwnProperty.call(body, 'success')) {
      return originalJson(body);
    }

    if (body.success === true) {
      const { success, data, ...rest } = body;
      const normalizedData = data !== undefined ? data : rest;
      const meta = { timestamp: Date.now() };

      if (req.body?.sessionId) {
        meta.sessionId = req.body.sessionId;
      }

      return originalJson({
        success,
        data: normalizedData,
        meta
      });
    }

    if (body.success === false) {
      const { reason, success, ...rest } = body;
      const meta = { timestamp: Date.now() };

      if (req.body?.sessionId) {
        meta.sessionId = req.body.sessionId;
      }

      const normalized = {
        success,
        reason: reason || 'unknown_error',
        meta
      };

      if (Object.keys(rest).length > 0) {
        normalized.data = rest;
      }

      return originalJson(normalized);
    }

    return originalJson(body);
  };

  return next();
};
