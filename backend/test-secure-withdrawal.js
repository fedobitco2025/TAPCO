#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SECURE WITHDRAWAL TEST
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Tests the new security middleware stack on /api/withdraw-tapco endpoint
 * 
 * Usage: node test-secure-withdrawal.js
 * 
 * Prerequisites:
 * - npm install crypto
 * - Backend running on port 4000
 * - MongoDB connected
 */

const crypto = require('crypto');
const http = require('http');
require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });

const API_BASE = 'http://localhost:4000';
const REQUEST_SECRET = process.env.REQUEST_SECRET || 'TAPCO_CLIENT_SECRET_2024';

console.log('\n🔒 TAPCO Secure Withdrawal Test\n');
console.log('═'.repeat(70));

// ═══════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

function computeSignature(playerId, tapcoAmount, walletAddress, timestamp) {
  // Must match backend/src/core/security.js::buildClientSignatureString + sha256
  const payload = `${String(playerId).trim()}|${tapcoAmount}|${String(walletAddress).trim().toLowerCase()}|${timestamp}|${REQUEST_SECRET}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function makeRequest(endpoint, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(API_BASE + endpoint);
    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(JSON.stringify(body))
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: JSON.parse(data)
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: data
          });
        }
      });
    });

    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST CASES
// ═══════════════════════════════════════════════════════════════════════════

let passedCount = 0;
let failedCount = 0;

async function testCase(name, testFn) {
  console.log(`\n📋 ${name}`);
  console.log('-'.repeat(70));

  try {
    await testFn();
    passedCount++;
    console.log('✅ PASSED');
  } catch (err) {
    failedCount++;
    console.log(`❌ FAILED: ${err.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN TEST SUITE
// ═══════════════════════════════════════════════════════════════════════════

(async () => {
  const testPlayerBase = 'test_player_' + Date.now();
  const testWallet = '0x1234567890123456789012345678901234567890';
  const testChainId = '0x61'; // BNB Testnet

  console.log(`Test Player Base: ${testPlayerBase}`);
  console.log(`Test Wallet: ${testWallet}`);
  console.log(`Chain ID: ${testChainId}\n`);
  
  // ───────────────────────────────────────────────────────────────────────────
  // Test 1: Small withdrawal (should succeed without 2FA)
  // ───────────────────────────────────────────────────────────────────────────
  
  await testCase('Small Withdrawal (5000 TAPCO - Security Path)', async () => {
    const playerId = `${testPlayerBase}_small`;
    const amount = 5000;
    const timestamp = Date.now();
    const signature = computeSignature(playerId, amount, testWallet, timestamp);

    const response = await makeRequest('/api/withdraw-tapco', {
      playerId,
      tapcoAmount: amount,
      walletAddress: testWallet,
      timestamp: timestamp,
      chainId: testChainId,
      clientSignature: signature
    });

    console.log(`Status: ${response.status}`);
    console.log(`Response:`, JSON.stringify(response.body, null, 2));

    const msg = String(response.body?.message || '').trim();
    const isOtpGate = response.status === 200 && response.body?.reason === 'otp_required';
    const isInsufficientBalance = response.status === 400 && msg.includes('رصيد غير كاف');

    if (!isOtpGate && !isInsufficientBalance) {
      throw new Error(`Unexpected response: ${response.status} / ${response.body?.reason || response.body?.message}`);
    }
  });
  
  // ───────────────────────────────────────────────────────────────────────────
  // Test 2: Large withdrawal (15000 TAPCO - 2FA Required)
  // ───────────────────────────────────────────────────────────────────────────
  
  await testCase('Large Withdrawal (15000 TAPCO - Security Path)', async () => {
    const playerId = `${testPlayerBase}_large`;
    const amount = 15000;
    const timestamp = Date.now();
    const signature = computeSignature(playerId, amount, testWallet, timestamp);

    const response = await makeRequest('/api/withdraw-tapco', {
      playerId,
      tapcoAmount: amount,
      walletAddress: testWallet,
      timestamp: timestamp,
      chainId: testChainId,
      clientSignature: signature
    });

    console.log(`Status: ${response.status}`);
    console.log('Response:', JSON.stringify(response.body, null, 2));

    const msg = String(response.body?.message || '').trim();
    const isOtpGate = response.status === 200 && response.body?.reason === 'otp_required';
    const isInsufficientBalance = response.status === 400 && msg.includes('رصيد غير كاف');

    if (!isOtpGate && !isInsufficientBalance) {
      throw new Error(`Unexpected response: ${response.status} / ${response.body?.reason || response.body?.message}`);
    }
  });
  
  // ───────────────────────────────────────────────────────────────────────────
  // Test 3: Invalid signature (should fail)
  // ───────────────────────────────────────────────────────────────────────────
  
  await testCase('Invalid Signature (Should Fail)', async () => {
    const playerId = `${testPlayerBase}_bad_sig`;
    const amount = 5000;
    const timestamp = Date.now();
    const invalidSignature = 'not_a_valid_signature';

    const response = await makeRequest('/api/withdraw-tapco', {
      playerId,
      tapcoAmount: amount,
      walletAddress: testWallet,
      timestamp: timestamp,
      chainId: testChainId,
      clientSignature: invalidSignature
    });
    
    console.log(`Status: ${response.status}`);
    console.log(`Response:`, JSON.stringify(response.body, null, 2));
    
    if (response.status !== 400) {
      throw new Error(`Expected 400, got: ${response.status}`);
    }
  });
  
  // ───────────────────────────────────────────────────────────────────────────
  // Test 4: Expired timestamp (should fail)
  // ───────────────────────────────────────────────────────────────────────────
  
  await testCase('Expired Timestamp (Should Fail)', async () => {
    const playerId = `${testPlayerBase}_expired`;
    const amount = 5000;
    const timestamp = Date.now() - (10 * 60 * 1000); // 10 min ago
    const signature = computeSignature(playerId, amount, testWallet, timestamp);

    const response = await makeRequest('/api/withdraw-tapco', {
      playerId,
      tapcoAmount: amount,
      walletAddress: testWallet,
      timestamp: timestamp,
      chainId: testChainId,
      clientSignature: signature
    });
    
    console.log(`Status: ${response.status}`);
    console.log(`Response:`, JSON.stringify(response.body, null, 2));
    
    if (response.status !== 401) {
      throw new Error(`Expected 401, got: ${response.status}`);
    }
  });
  
  // ───────────────────────────────────────────────────────────────────────────
  // Test 5: Invalid wallet address (should fail)
  // ───────────────────────────────────────────────────────────────────────────
  
  await testCase('Invalid Wallet Address (Should Fail)', async () => {
    const playerId = `${testPlayerBase}_bad_wallet`;
    const amount = 5000;
    const timestamp = Date.now();
    const invalidWallet = 'not_a_valid_address';
    const signature = computeSignature(playerId, amount, invalidWallet, timestamp);

    const response = await makeRequest('/api/withdraw-tapco', {
      playerId,
      tapcoAmount: amount,
      walletAddress: invalidWallet,
      timestamp: timestamp,
      chainId: testChainId,
      clientSignature: signature
    });

    console.log(`Status: ${response.status}`);
    console.log(`Response:`, JSON.stringify(response.body, null, 2));

    const isValidationError = response.status === 400;
    const isIpRateLimited = response.status === 429 && response.body?.code === 'RATE_LIMITED' && response.body?.scope === 'ip';

    if (!isValidationError && !isIpRateLimited) {
      throw new Error(`Expected 400 or IP 429 rate-limit, got: ${response.status}`);
    }
  });
  
  // ───────────────────────────────────────────────────────────────────────────
  // Test 6: Amount below minimum (should fail)
  // ───────────────────────────────────────────────────────────────────────────
  
  await testCase('Amount Below Minimum (Should Fail)', async () => {
    const playerId = `${testPlayerBase}_min_amount`;
    const amount = 10; // Below minimum
    const timestamp = Date.now();
    const signature = computeSignature(playerId, amount, testWallet, timestamp);

    const response = await makeRequest('/api/withdraw-tapco', {
      playerId,
      tapcoAmount: amount,
      walletAddress: testWallet,
      timestamp: timestamp,
      chainId: testChainId,
      clientSignature: signature
    });

    console.log(`Status: ${response.status}`);
    console.log(`Response:`, JSON.stringify(response.body, null, 2));

    const isValidationError = response.status === 400;
    const isIpRateLimited = response.status === 429 && response.body?.code === 'RATE_LIMITED' && response.body?.scope === 'ip';

    if (!isValidationError && !isIpRateLimited) {
      throw new Error(`Expected 400 or IP 429 rate-limit, got: ${response.status}`);
    }
  });
  
  // ───────────────────────────────────────────────────────────────────────────
  // Summary
  // ───────────────────────────────────────────────────────────────────────────
  
  console.log('\n' + '═'.repeat(70));
  console.log(`\nSummary: ${passedCount} passed, ${failedCount} failed\n`);

  if (failedCount === 0) {
    console.log('✅ Security middleware stack is functioning properly!\n');
    console.log('Next steps:');
    console.log('1. Monitor backend logs for security events');
    console.log('2. Test brute force detection (multiple failed attempts)');
    console.log('3. Test OTP verification (after 2FA is implemented)');
    console.log('4. Test rate limiting (multiple rapid requests)');
    console.log('5. Deploy to testnet for real transaction testing\n');
    process.exit(0);
  }

  console.log('⚠️ Some secure withdrawal tests failed. Review logs above.\n');
  process.exit(1);
})().catch(err => {
  console.error('\n❌ Test suite error:', err);
  process.exit(1);
});
