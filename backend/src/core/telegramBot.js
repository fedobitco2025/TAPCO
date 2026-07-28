async function sendTelegramOtp({ botToken, chatId, code, fetchImpl = global.fetch }) {
  const normalizedToken = String(botToken || '').trim();
  const normalizedChatId = String(chatId || '').trim();
  if (!normalizedToken || !/^\d{5,20}$/.test(normalizedChatId) || typeof fetchImpl !== 'function') {
    return { sent: false, reason: 'telegram_otp_unavailable' };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetchImpl(`https://api.telegram.org/bot${normalizedToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: normalizedChatId,
        text: `TAPCO verification code: ${code}\nرمز التحقق الخاص بك في TAPCO: ${code}`,
        protect_content: true
      }),
      signal: controller.signal
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      return { sent: false, reason: 'telegram_otp_delivery_failed' };
    }
    return { sent: true };
  } catch (_error) {
    return { sent: false, reason: 'telegram_otp_delivery_failed' };
  } finally {
    clearTimeout(timeoutId);
  }
}

module.exports = { sendTelegramOtp };