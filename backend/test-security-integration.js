#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════
 * SECURITY INTEGRATION TEST
 * ═══════════════════════════════════════════════════════════════════
 * 
 * Verifies all security layers are properly loaded and initialized
 * 
 * Usage: node test-security-integration.js
 * 
 * Expected Output: All ✅ marks = Security stack ready
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

console.log('\n🔒 TAPCO Security Integration Test\n');
console.log('=' .repeat(60));

const tests = [];

// ══════════════════════════════════════════════════════════════
// Test 1: Environment Configuration
// ══════════════════════════════════════════════════════════════

try {
  const envConfig = require('./src/config/env');
  
  const requiredVars = [
    'MONGODB_URI',
    'REQUEST_SECRET',
    'RPC_URL',
    'PRIVATE_KEY',
    'CONTRACT_ADDRESS'
  ];
  
  const securityVars = [
    'ENABLE_2FA',
    'ENABLE_IP_REPUTATION',
    'ENABLE_LOCATION_ANOMALY_DETECTION',
    'ENABLE_AUDIT_LOG',
    'BRUTE_FORCE_THRESHOLD',
    'OTP_EXPIRY_MS'
  ];
  
  let configOk = true;
  let missingVars = [];
  
  for (const v of requiredVars) {
    if (!envConfig[v]) {
      configOk = false;
      missingVars.push(v);
    }
  }
  
  for (const v of securityVars) {
    if (envConfig[v] === undefined) {
      console.warn(`⚠️  ${v} not configured (optional)`);
    }
  }
  
  if (configOk) {
    tests.push({ name: 'Environment Configuration', status: '✅' });
  } else {
    tests.push({ name: 'Environment Configuration', status: '❌', error: `Missing: ${missingVars.join(', ')}` });
  }
} catch (e) {
  tests.push({ name: 'Environment Configuration', status: '❌', error: e.message });
}

// ══════════════════════════════════════════════════════════════
// Test 2: Advanced Security Module
// ══════════════════════════════════════════════════════════════

try {
  const advancedSecurity = require('./src/core/advancedSecurity');
  
  const requiredFunctions = [
    'isBruteForced',
    'recordFailedAttempt',
    'clearFailedAttempts',
    'getIpReputation',
    'isIpSuspicious',
    'generateOtp',
    'verifyOtp',
    'auditWithdrawal',
    'encryptSensitiveData',
    'decryptSensitiveData',
    'detectLocationAnomaly'
  ];
  
  let functionsOk = true;
  let missingFunctions = [];
  
  for (const fn of requiredFunctions) {
    if (typeof advancedSecurity[fn] !== 'function') {
      functionsOk = false;
      missingFunctions.push(fn);
    }
  }
  
  if (functionsOk) {
    tests.push({ name: 'Advanced Security Module', status: '✅', count: requiredFunctions.length });
  } else {
    tests.push({ 
      name: 'Advanced Security Module', 
      status: '❌', 
      error: `Missing functions: ${missingFunctions.join(', ')}`
    });
  }
} catch (e) {
  tests.push({ name: 'Advanced Security Module', status: '❌', error: e.message });
}

// ══════════════════════════════════════════════════════════════
// Test 3: Sensitive Operations Middleware
// ══════════════════════════════════════════════════════════════

try {
  const sensitiveOpsMiddleware = require('./src/middleware/sensitiveOps.middleware');
  
  const requiredMiddleware = [
    'checkBruteForce',
    'checkIpReputation',
    'require2FA',
    'detectLocationAnomaly',
    'verifyHighRiskOperation',
    'validateWithdrawalSecurity',
    'validateEnhancedSignature',
    'withdrawalRateLimit',
    'logSensitiveRequest'
  ];
  
  let middlewareOk = true;
  let missingMiddleware = [];
  
  for (const mw of requiredMiddleware) {
    if (typeof sensitiveOpsMiddleware[mw] !== 'function') {
      middlewareOk = false;
      missingMiddleware.push(mw);
    }
  }
  
  if (middlewareOk) {
    tests.push({ name: 'Sensitive Operations Middleware', status: '✅', count: requiredMiddleware.length });
  } else {
    tests.push({ 
      name: 'Sensitive Operations Middleware', 
      status: '❌', 
      error: `Missing middleware: ${missingMiddleware.join(', ')}`
    });
  }
} catch (e) {
  tests.push({ name: 'Sensitive Operations Middleware', status: '❌', error: e.message });
}

// ══════════════════════════════════════════════════════════════
// Test 4: Security Logging
// ══════════════════════════════════════════════════════════════

try {
  const logger = require('./src/core/logger');
  
  if (typeof logger.securityLog === 'function') {
    tests.push({ name: 'Security Logging', status: '✅' });
  } else {
    tests.push({ name: 'Security Logging', status: '❌', error: 'securityLog function not found' });
  }
} catch (e) {
  tests.push({ name: 'Security Logging', status: '❌', error: e.message });
}

// ══════════════════════════════════════════════════════════════
// Test 5: Database Models
// ══════════════════════════════════════════════════════════════

try {
  const Player = require('./src/models/player.model');
  const WithdrawRequest = require('./src/models/withdrawRequest.model');
  const SecurityLog = require('./src/models/securityLog.model');
  
  if (Player && WithdrawRequest && SecurityLog) {
    tests.push({ name: 'Database Models', status: '✅', count: 3 });
  } else {
    tests.push({ name: 'Database Models', status: '❌', error: 'One or more models missing' });
  }
} catch (e) {
  tests.push({ name: 'Database Models', status: '❌', error: e.message });
}

// ══════════════════════════════════════════════════════════════
// Test 6: Existing Security Modules
// ══════════════════════════════════════════════════════════════

try {
  const security = require('./src/core/security');
  const rateLimit = require('./src/middleware/rateLimit.middleware');
  
  if (security && rateLimit) {
    tests.push({ name: 'Existing Security Modules', status: '✅' });
  } else {
    tests.push({ name: 'Existing Security Modules', status: '❌', error: 'One or more modules missing' });
  }
} catch (e) {
  tests.push({ name: 'Existing Security Modules', status: '❌', error: e.message });
}

// ══════════════════════════════════════════════════════════════
// PRINT RESULTS
// ══════════════════════════════════════════════════════════════

console.log('\nTest Results:\n');

let passed = 0;
let failed = 0;

for (const test of tests) {
  const status = test.status;
  const count = test.count ? ` (${test.count} functions)` : '';
  const error = test.error ? ` - ${test.error}` : '';
  
  console.log(`${status} ${test.name}${count}${error}`);
  
  if (test.status === '✅') {
    passed++;
  } else {
    failed++;
  }
}

console.log('\n' + '=' .repeat(60));
console.log(`\nSummary: ${passed} passed, ${failed} failed\n`);

if (failed === 0) {
  console.log('🎉 All security layers are properly integrated!\n');
  console.log('Next steps:');
  console.log('1. npm install (to ensure all deps installed)');
  console.log('2. Configure .env with security variables');
  console.log('3. npm start (to start the server)');
  console.log('4. Test withdrawal endpoint\n');
  process.exit(0);
} else {
  console.log('⚠️  Some tests failed. Check the errors above.\n');
  process.exit(1);
}
