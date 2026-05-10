function validateReferralPayload(body = {}) {
  const playerId = String(body.playerId || '').trim();
  const referrerCode = String(body.referrerCode || '').trim();

  if (!playerId) {
    return { ok: false, message: 'playerId مطلوب' };
  }

  if (!referrerCode) {
    return { ok: false, message: 'referrerCode مطلوب' };
  }

  return { ok: true, data: { playerId, referrerCode } };
}

function validateActivateReferralPayload(body = {}) {
  const playerId = String(body.playerId || '').trim();

  if (!playerId) {
    return { ok: false, message: 'playerId مطلوب' };
  }

  return { ok: true, data: { playerId } };
}

module.exports = { validateReferralPayload, validateActivateReferralPayload };
