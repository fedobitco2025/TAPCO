#!/usr/bin/env node
const assert = require('assert');
const crypto = require('crypto');
require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });

const API_BASE = process.env.API_BASE || 'http://localhost:4000';
const BOT_TOKEN = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
const TELEGRAM_USER_ID = String(process.env.TEST_TELEGRAM_USER_ID || '').trim();
const WALLET = '0x1234567890123456789012345678901234567890';

function signInitData(userId, authDate = Math.floor(Date.now() / 1000)) {
  const params = new URLSearchParams({
    auth_date: String(authDate),
    query_id: `test-${Date.now()}`,
    signature: 'test-ed25519-signature',
    user: JSON.stringify({ id: userId, first_name: 'Security Test' })
  });
  const dataCheckString = Array.from(params.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  params.set('hash', crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex'));
  return params.toString();
}

async function postWithdraw(body) {
  const response = await fetch(`${API_BASE}/api/withdraw-tapco`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return { status: response.status, body: await response.json() };
}

async function runCase(name, body, expectedStatus, expectedReason) {
  const result = await postWithdraw(body);
  const payload = result.body?.data || result.body;
  assert.equal(result.status, expectedStatus, `${name}: ${JSON.stringify(result.body)}`);
  assert.equal(payload?.reason || payload?.code, expectedReason, `${name}: ${JSON.stringify(result.body)}`);
  console.log(`PASS ${name}`);
}

async function main() {
  if (!BOT_TOKEN || !/^\d{5,20}$/.test(TELEGRAM_USER_ID)) {
    throw new Error('Set TELEGRAM_BOT_TOKEN and TEST_TELEGRAM_USER_ID before running this live endpoint test.');
  }

  const playerId = `TG_${TELEGRAM_USER_ID}`;
  const base = {
    playerId,
    tapcoAmount: 100,
    walletAddress: WALLET,
    timestamp: Date.now(),
    chainId: '0x61'
  };

  await runCase('missing Telegram initData', base, 401, 'telegram_init_data_required');

  const validInitData = signInitData(TELEGRAM_USER_ID);
  const tampered = new URLSearchParams(validInitData);
  tampered.set('user', JSON.stringify({ id: '999999999', first_name: 'Attacker' }));
  await runCase(
    'tampered Telegram initData',
    { ...base, telegramInitData: tampered.toString() },
    401,
    'telegram_init_data_invalid'
  );

  await runCase(
    'player impersonation',
    { ...base, playerId: 'TG_999999999', telegramInitData: validInitData },
    403,
    'player_identity_mismatch'
  );

  await runCase(
    'expired Telegram initData',
    { ...base, telegramInitData: signInitData(TELEGRAM_USER_ID, Math.floor(Date.now() / 1000) - 600) },
    401,
    'telegram_init_data_expired'
  );

  await runCase(
    'stale withdrawal timestamp',
    { ...base, timestamp: Date.now() - 600_000, telegramInitData: validInitData },
    401,
    'request_expired'
  );

  await runCase(
    'invalid wallet address',
    { ...base, walletAddress: 'invalid', telegramInitData: validInitData },
    400,
    'invalid_wallet_address'
  );

  console.log('Secure withdrawal endpoint authentication tests passed.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});