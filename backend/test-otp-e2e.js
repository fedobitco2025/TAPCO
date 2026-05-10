const crypto = require('crypto');
const mongoose = require('mongoose');
require('dotenv').config();

const Player = require('./src/models/player.model');

const API_BASE = process.env.API_BASE || 'http://localhost:4000';
const SECRET = process.env.REQUEST_SECRET || process.env.CLIENT_SECRET || 'TAPCO_CLIENT_SECRET_2024';
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/tapco_game';
const WALLET = '0x1234567890123456789012345678901234567890';
const AMOUNT = 500;

function buildSignature({ playerId, tapcoAmount, walletAddress, timestamp }) {
  const payload = `${playerId}|${tapcoAmount}|${walletAddress}|${timestamp}|${SECRET}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

async function postWithdraw(body) {
  const res = await fetch(`${API_BASE}/api/withdraw-tapco`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch (_e) {
    data = { raw: text };
  }

  return { status: res.status, data };
}

function extractOtp(data) {
  const payload = (data && data.data && typeof data.data === 'object') ? data.data : data;
  if (payload && payload.devOtp) return String(payload.devOtp);
  const msg = String((payload && payload.message) || '');
  const m = msg.match(/(\d{6})/);
  return m ? m[1] : '';
}

async function main() {
  const playerId = `otp_e2e_${Date.now()}`;

  console.log('\n🔐 OTP E2E Test');
  console.log('='.repeat(72));
  console.log(`Player: ${playerId}`);

  await mongoose.connect(MONGODB_URI);
  await Player.updateOne(
    { playerId },
    {
      $set: {
        playerId,
        tapcoBalance: 60000,
        weeklyWithdrawPoints: 0,
        weeklyWithdrawReset: Date.now(),
        address: WALLET,
        updatedAt: new Date()
      },
      $setOnInsert: { createdAt: new Date() }
    },
    { upsert: true }
  );

  const ts1 = Date.now();
  const draft1 = {
    playerId,
    tapcoAmount: AMOUNT,
    walletAddress: WALLET,
    timestamp: ts1,
    chainId: '0x61'
  };
  const req1 = { ...draft1, clientSignature: buildSignature(draft1) };

  console.log('\n1) Request large withdraw WITHOUT OTP (expect requiresOtp=true)');
  const r1 = await postWithdraw(req1);
  console.log(`Status: ${r1.status}`);
  console.log('Body:', JSON.stringify(r1.data, null, 2));

  const firstPayload = (r1.data && r1.data.data && typeof r1.data.data === 'object') ? r1.data.data : r1.data;
  if (!firstPayload || !firstPayload.requiresOtp) {
    throw new Error('Expected requiresOtp=true on first request');
  }

  const otp = extractOtp(r1.data);
  if (!otp) {
    throw new Error('Could not extract OTP from server response');
  }

  const ts2 = Date.now();
  const draft2 = {
    playerId,
    tapcoAmount: AMOUNT,
    walletAddress: WALLET,
    timestamp: ts2,
    chainId: '0x61'
  };
  const req2 = {
    ...draft2,
    clientSignature: buildSignature(draft2),
    otp,
    otpAttempt: 1
  };

  console.log(`\n2) Resend WITH OTP=${otp} (expect ok=true)`);
  const r2 = await postWithdraw(req2);
  console.log(`Status: ${r2.status}`);
  console.log('Body:', JSON.stringify(r2.data, null, 2));

  if (!(r2.data && r2.data.ok)) {
    throw new Error('Expected final withdraw request to succeed with ok=true');
  }

  const p = await Player.findOne({ playerId }).lean();
  console.log(`\n3) Player balance after withdraw: ${p ? p.tapcoBalance : 'N/A'} (expected 59500)`);

  if (!p || p.tapcoBalance !== 59500) {
    throw new Error('Player tapcoBalance did not decrease correctly');
  }

  console.log('\n✅ OTP E2E flow passed successfully.');
}

main()
  .catch((err) => {
    console.error('\n❌ OTP E2E flow failed:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try { await mongoose.disconnect(); } catch (_e) {}
  });
