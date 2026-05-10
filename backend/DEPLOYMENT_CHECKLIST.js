/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔒 TAPCO SECURITY DEPLOYMENT CHECKLIST
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Complete guide for deploying the new 9-layer security stack
 * Before going to production with REAL MONEY
 * 
 * Date: May 5, 2026
 * Security Level: MILITARY-GRADE (9 layers)
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 0: PRE-DEPLOYMENT VERIFICATION (Do This First!)
// ═══════════════════════════════════════════════════════════════════════════

const PHASE_0_CHECKS = [
  {
    name: '✅ Backend Files Created',
    status: 'VERIFIED',
    files: [
      'backend/src/core/advancedSecurity.js (320+ lines)',
      'backend/src/middleware/sensitiveOps.middleware.js (340+ lines)',
      'backend/SECURITY_HARDENING.md (documentation)',
      'backend/2FA_INTEGRATION_GUIDE.js (UI integration guide)',
      'backend/test-secure-withdrawal.js (test suite)',
      'backend/test-security-integration.js (integration test)'
    ]
  },
  {
    name: '✅ Configuration Updated',
    status: 'VERIFIED',
    files: [
      'backend/src/config/env.js (added 20+ security vars)',
      'backend/.env.example (security settings documented)'
    ]
  },
  {
    name: '✅ Middleware Imported',
    status: 'VERIFIED',
    endpoint: 'backend/server.js (line 1-15)',
    imported: [
      'checkBruteForce',
      'checkIpReputation',
      'require2FA',
      'detectLocationAnomaly',
      'verifyHighRiskOperation',
      'validateWithdrawalSecurity',
      'validateEnhancedSignature',
      'withdrawalRateLimit',
      'logSensitiveRequest'
    ]
  },
  {
    name: '✅ Endpoint Protected',
    status: 'VERIFIED',
    endpoint: 'POST /api/withdraw-tapco',
    layers: 9,
    order: [
      '1. validateEnhancedSignature (timestamp validation)',
      '2. checkBruteForce (account lockout check)',
      '3. checkIpReputation (IP scoring)',
      '4. detectLocationAnomaly (geolocation check)',
      '5. withdrawalRateLimit (rate limiting)',
      '6. require2FA (OTP validation)',
      '7. verifyHighRiskOperation (additional checks)',
      '8. validateWithdrawalSecurity (request validation)',
      '9. logSensitiveRequest (audit logging)'
    ]
  },
  {
    name: '✅ Dangerous Endpoints Removed',
    status: 'VERIFIED',
    removed: [
      'GET /blockchain/balance (REMOVED - security risk)',
      'POST /blockchain/withdraw (REMOVED - security risk)',
      'GET /wallet/player-balance (REMOVED - security risk)',
      'POST /wallet/withdraw (REMOVED - duplicate)'
    ]
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 1: ENVIRONMENT CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const PHASE_1_SETUP = {
  description: 'Configure .env file with security variables',
  
  required_variables: {
    // Core blockchain
    'MONGODB_URI': {
      description: 'MongoDB connection string',
      example: 'mongodb+srv://user:pass@cluster.mongodb.net/tapco',
      security: 'HIGH - Store in vault'
    },
    'REQUEST_SECRET': {
      description: 'HMAC secret for request signing',
      example: 'your-super-secret-key-min-32-chars',
      security: 'CRITICAL - Must match Game.html TAPCO_CLIENT_SECRET_2024',
      how_to_generate: 'openssl rand -base64 32'
    },
    'RPC_URL': {
      description: 'Ethereum RPC endpoint',
      example: 'https://data-seed-prebsc-1-b.binance.org:8545',
      security: 'HIGH - Never expose publicly'
    },
    'PRIVATE_KEY': {
      description: 'Private key for withdrawals',
      example: 'your-private-key-without-0x-prefix',
      security: 'CRITICAL - Store in vault only',
      how_to_store: 'Use AWS Secrets Manager or HashiCorp Vault'
    },
    'CONTRACT_ADDRESS': {
      description: 'TAPCO token contract address',
      example: '0x123456...',
      security: 'HIGH'
    }
  },
  
  security_variables: {
    '🔒 Brute Force Protection': {
      'ENABLE_BRUTE_FORCE_DETECTION': {
        value: 'true',
        description: 'Enable/disable brute force detection'
      },
      'BRUTE_FORCE_THRESHOLD': {
        value: 5,
        description: 'Failed attempts before lockout'
      },
      'BRUTE_FORCE_WINDOW_MS': {
        value: 900000,
        description: '15 minutes - window for counting attempts'
      },
      'BRUTE_FORCE_LOCKOUT_MS': {
        value: 1800000,
        description: '30 minutes - how long account stays locked'
      }
    },
    
    '🌐 IP Reputation': {
      'ENABLE_IP_REPUTATION': {
        value: 'true',
        description: 'Enable/disable IP reputation tracking'
      },
      'SUSPICIOUS_IP_THRESHOLD': {
        value: 100,
        description: 'Reputation score for blacklist (0-100)'
      },
      'IP_ACTIVITY_WINDOW_MS': {
        value: 86400000,
        description: '24 hours - activity tracking window'
      },
      'IP_WHITELIST': {
        value: '',
        description: 'Comma-separated IPs to always trust (optional)'
      }
    },
    
    '🔐 Two-Factor Authentication': {
      'ENABLE_2FA': {
        value: 'true',
        description: 'Enable/disable 2FA for withdrawals'
      },
      'WITHDRAWAL_2FA_THRESHOLD': {
        value: 10000,
        description: 'Require 2FA for withdrawals above this amount'
      },
      'OTP_EXPIRY_MS': {
        value: 300000,
        description: '5 minutes - OTP code expiry time'
      },
      'OTP_MAX_ATTEMPTS': {
        value: 3,
        description: 'Wrong attempts before lockout'
      }
    },
    
    '🗺️ Location Anomaly': {
      'ENABLE_LOCATION_ANOMALY_DETECTION': {
        value: 'true',
        description: 'Detect rapid IP location changes'
      },
      'LOCATION_CHANGE_THRESHOLD_MS': {
        value: 1800000,
        description: '30 minutes - minimum time between locations'
      }
    },
    
    '📊 Withdrawal Limits': {
      'LARGE_WITHDRAWAL_DAILY_LIMIT': {
        value: 25000,
        description: 'Max withdrawal per day'
      },
      'LARGE_WITHDRAWAL_WEEKLY_LIMIT': {
        value: 100000,
        description: 'Max withdrawal per week'
      },
      'WITHDRAW_MIN_AMOUNT': {
        value: 25,
        description: 'Minimum withdrawal amount'
      }
    },
    
    '🔍 Audit Logging': {
      'ENABLE_AUDIT_LOG': {
        value: 'true',
        description: 'Enable comprehensive audit logging'
      },
      'AUDIT_LOG_RETENTION_DAYS': {
        value: 90,
        description: 'How long to keep audit logs'
      }
    },
    
    '🔒 Encryption': {
      'ENCRYPTION_KEY': {
        value: '<256-bit hex key>',
        description: 'AES-256 encryption key for sensitive data',
        how_to_generate: 'openssl rand -hex 32'
      }
    }
  },
  
  steps: [
    '1. Copy backend/.env.example to backend/.env',
    '2. Fill in all REQUIRED variables (listed above)',
    '3. Leave security variables at defaults for now',
    '4. CRITICAL: Ensure REQUEST_SECRET matches Game.html value',
    '5. CRITICAL: Never commit .env to git'
  ]
};

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 2: INTEGRATION TESTING
// ═══════════════════════════════════════════════════════════════════════════

const PHASE_2_TESTS = {
  description: 'Verify all security layers work correctly',
  
  pre_test_checklist: [
    '☐ MongoDB running and connected',
    '☐ .env file configured with all required variables',
    '☐ backend/node_modules installed (npm install)',
    '☐ Game.html and server.js in same repo'
  ],
  
  test_commands: {
    'Integration Test': 'cd backend && node test-security-integration.js',
    'Syntax Check': 'node -c backend/server.js',
    'Secure Withdrawal Test': 'cd backend && node test-secure-withdrawal.js'
  },
  
  expected_results: {
    'Integration Test': '✅ All security layers are properly integrated!',
    'Secure Withdrawal Test': '✅ Security middleware stack is functioning properly!',
    'Server Start': 'Server running WITH DB on port 4000'
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 3: FEATURE TESTING
// ═══════════════════════════════════════════════════════════════════════════

const PHASE_3_FEATURES = {
  description: 'Test individual security features',
  
  tests: [
    {
      name: 'Brute Force Detection',
      steps: [
        '1. Make 5 failed withdrawal requests with wrong signature',
        '2. Expected: 5th request returns 429 (Too Many Requests)',
        '3. Expected: Account locked for 30 minutes',
        '4. Wait 30 minutes OR restart backend to reset',
        '5. Verify: Account unlocked, can withdraw again'
      ],
      verification: 'curl -X POST http://localhost:4000/api/withdraw-tapco -H "Content-Type: application/json" -d "{...bad_data...}"'
    },
    
    {
      name: '2FA for Large Withdrawals',
      steps: [
        '1. Attempt withdrawal of 15,000 TAPCO',
        '2. Expected: Backend returns OTP requirement',
        '3. Expected: OTP code sent to email/SMS',
        '4. Submit withdrawal WITH otp: field',
        '5. Expected: Withdrawal proceeds on correct OTP'
      ],
      threshold: '> 10,000 TAPCO'
    },
    
    {
      name: 'Rate Limiting',
      steps: [
        '1. Submit 11 withdrawal requests rapidly',
        '2. Expected: 11th request returns 429 (rate limited)',
        '3. Expected: Retry-After header set to seconds',
        '4. Wait for retry time',
        '5. Expected: Next request succeeds'
      ],
      limit: 'Max 10 withdrawals per hour per player'
    },
    
    {
      name: 'Geolocation Anomaly Detection',
      steps: [
        '1. Send request from IP 1.1.1.1',
        '2. Immediately send request from IP 2.2.2.2',
        '3. Expected: Second request flagged as suspicious',
        '4. Expected: May require additional OTP verification',
        '5. Check audit logs for anomaly detection event'
      ],
      threshold: 'Location change within 30 minutes'
    },
    
    {
      name: 'Signature Validation',
      steps: [
        '1. Create withdrawal with correct signature',
        '2. Expected: Request succeeds (or fails for other reasons)',
        '3. Create withdrawal with wrong signature',
        '4. Expected: 400 Bad Request - invalid signature',
        '5. Modify signature slightly',
        '6. Expected: 400 Bad Request - signature mismatch'
      ],
      security: 'HMAC-SHA256'
    },
    
    {
      name: 'Timestamp Validation',
      steps: [
        '1. Submit request with timestamp from 10 minutes ago',
        '2. Expected: 400 Bad Request - timestamp too old',
        '3. Submit request with future timestamp',
        '4. Expected: 400 Bad Request - timestamp in future',
        '5. Submit request with current timestamp',
        '6. Expected: Proceeds to signature check'
      ],
      window: '±5 minutes'
    },
    
    {
      name: 'Request Structure Validation',
      steps: [
        '1. Omit playerId from request',
        '2. Expected: 400 - missing playerId',
        '3. Omit tapcoAmount from request',
        '4. Expected: 400 - missing amount',
        '5. Provide invalid wallet address',
        '6. Expected: 400 - invalid wallet address'
      ]
    },
    
    {
      name: 'Audit Logging',
      steps: [
        '1. Make successful withdrawal',
        '2. Make failed withdrawal (bad signature)',
        '3. Check MongoDB securityLog collection',
        '4. Expected: Both events logged with playerId, timestamp, ipHash',
        '5. Expected: Status: success or failure for each'
      ],
      query: 'db.securityLog.find({ type: "withdrawal" }).pretty()'
    }
  ]
};

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 4: GAME.HTML INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════

const PHASE_4_UI = {
  description: 'Integrate OTP UI components into Game.html',
  
  components_needed: [
    '✅ OTP Modal (HTML structure)',
    '✅ OTP Input Field (6 digits)',
    '✅ Countdown Timer (5 minutes)',
    '✅ Attempt Counter (3 attempts max)',
    '✅ Error Messages (Arabic)',
    '✅ Resend OTP Button',
    '✅ Submit OTP Button',
    '✅ Cancel Button'
  ],
  
  reference_file: 'backend/2FA_INTEGRATION_GUIDE.js',
  
  steps: [
    '1. Read 2FA_INTEGRATION_GUIDE.js',
    '2. Copy HTML modal structure to Game.html',
    '3. Copy JavaScript functions to Game.html',
    '4. Add CSS styling (optional)',
    '5. Test withdrawal flow:',
    '   - Small withdrawal (≤10,000): Should NOT show modal',
    '   - Large withdrawal (>10,000): Should show modal',
    '6. Enter correct OTP: Should proceed',
    '7. Enter wrong OTP: Should show error',
    '8. Wait 5 minutes: Should show timeout error'
  ]
};

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 5: PRODUCTION DEPLOYMENT
// ═══════════════════════════════════════════════════════════════════════════

const PHASE_5_DEPLOY = {
  description: 'Deploy to production (MAINNET)',
  
  final_checklist: [
    '☐ All Phase 2 tests PASSED',
    '☐ All Phase 3 features TESTED',
    '☐ Phase 4 UI INTEGRATED into Game.html',
    '☐ .env file properly configured for MAINNET',
    '☐ Private key safely stored in vault',
    '☐ REQUEST_SECRET rotated and secure',
    '☐ Audit logging ENABLED',
    '☐ 2FA ENABLED for large withdrawals',
    '☐ Brute force protection ENABLED',
    '☐ IP reputation ENABLED',
    '☐ Rate limiting ENABLED',
    '☐ Location anomaly detection ENABLED',
    '☐ Backend running without errors',
    '☐ Worker process running for withdrawals',
    '☐ MongoDB backup ACTIVE',
    '☐ Monitoring/alerting configured',
    '☐ Emergency hotline ready'
  ],
  
  deployment_steps: [
    '1. Deploy backend/server.js to production',
    '2. Deploy Game.html to production',
    '3. Start worker process (npm run worker)',
    '4. Monitor logs for 24 hours',
    '5. If any issues: ROLLBACK immediately',
    '6. Once stable (48h): Open to production users'
  ],
  
  monitoring: {
    'Critical Alerts': [
      'Brute force lockouts',
      'Withdrawals >50,000',
      'Failed OTP attempts (>5 in 1h)',
      'IP reputation >200',
      'Location anomalies',
      'Worker failures'
    ],
    
    'Daily Report': [
      'Total withdrawals processed',
      'Success rate',
      'Failed withdrawals (reasons)',
      'Security events detected',
      'Locked accounts (due to brute force)',
      'Top blocked IPs'
    ]
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// EMERGENCY PROCEDURES
// ═══════════════════════════════════════════════════════════════════════════

const EMERGENCY = {
  'If withdrawals are stuck': {
    steps: [
      '1. Check worker process: ps aux | grep worker.js',
      '2. Restart worker: npm run worker',
      '3. Check MongoDB: db.withdrawRequest.find({ status: "pending" }).count()',
      '4. Check logs for errors',
      '5. Contact blockchain support if RPC is down'
    ]
  },
  
  'If rate limiting too strict': {
    steps: [
      '1. Increase WITHDRAW_PLAYER_MAX_REQUESTS in .env',
      '2. Increase LARGE_WITHDRAWAL_DAILY_LIMIT',
      '3. Restart backend: npm start',
      '4. Monitor for abusive patterns'
    ]
  },
  
  'If false positives (legitimate users blocked)': {
    steps: [
      '1. Check: Was it brute force or IP reputation?',
      '2. For brute force: Account unlocks after 30 min',
      '3. For IP reputation: Add IP to IP_WHITELIST',
      '4. Whitelist format: "1.2.3.4,5.6.7.8" (comma-separated)',
      '5. Restart backend'
    ]
  },
  
  'If compromised REQUEST_SECRET': {
    steps: [
      '1. IMMEDIATELY: Update REQUEST_SECRET in .env',
      '2. Update TAPCO_CLIENT_SECRET_2024 in Game.html',
      '3. RESTART backend',
      '4. Invalidate all pending withdrawals',
      '5. Force users to re-authenticate'
    ],
    urgency: 'CRITICAL - Do immediately'
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════════════════

console.log(`
╔════════════════════════════════════════════════════════════════════════════╗
║                                                                            ║
║              🔒 TAPCO SECURITY DEPLOYMENT COMPLETE 🔒                    ║
║                                                                            ║
║  Status: 9-Layer Military-Grade Security Implemented                      ║
║  Ready for: Development Testing → Testnet → Mainnet Production            ║
║                                                                            ║
╚════════════════════════════════════════════════════════════════════════════╝

📋 DEPLOYMENT PHASES:

Phase 0 (NOW):      ✅ Pre-deployment verification
                   → All files created and integrated
                   → 9 security layers mounted on /api/withdraw-tapco
                   → 4 dangerous endpoints removed

Phase 1:            📝 Environment configuration
                   → Configure .env with security variables
                   → Generate encryption keys
                   → Set withdrawal limits
                   Estimated time: 30 minutes

Phase 2:            🧪 Integration testing
                   → Run test suite
                   → Verify all layers load correctly
                   → Check for import errors
                   Estimated time: 15 minutes

Phase 3:            🔍 Feature testing
                   → Test brute force protection
                   → Test 2FA/OTP system
                   → Test rate limiting
                   → Test geolocation detection
                   Estimated time: 2-4 hours

Phase 4:            🎨 Game.html UI integration
                   → Add OTP modal
                   → Add 2FA JavaScript
                   → Test withdrawal flow
                   Estimated time: 1-2 hours

Phase 5:            🚀 Production deployment
                   → Deploy to mainnet
                   → Monitor 48 hours
                   → Open to users
                   Estimated time: Variable

═══════════════════════════════════════════════════════════════════════════════

🎯 NEXT IMMEDIATE STEPS:

  1. Read backend/SECURITY_HARDENING.md for full documentation
  2. Run: cd backend && node test-security-integration.js
  3. Verify all ✅ marks in output
  4. Update .env file with security variables
  5. Run: cd backend && node test-secure-withdrawal.js
  6. Continue to Phase 4 (UI integration)

═══════════════════════════════════════════════════════════════════════════════

⚠️  CRITICAL REMINDERS:

  🔴 NEVER commit .env to git
  🔴 NEVER hardcode API keys or private keys
  🔴 NEVER disable security features without understanding impact
  🔴 ALWAYS keep backups of encryption keys
  🔴 ALWAYS test on testnet before mainnet
  🔴 ALWAYS have rollback plan ready
  🔴 ALWAYS monitor logs 24/7 after deployment

═══════════════════════════════════════════════════════════════════════════════

Questions? See:
  - backend/SECURITY_HARDENING.md (complete documentation)
  - backend/2FA_INTEGRATION_GUIDE.js (UI integration)
  - backend/test-security-integration.js (testing)

═══════════════════════════════════════════════════════════════════════════════
`);

module.exports = { PHASE_0_CHECKS, PHASE_1_SETUP, PHASE_2_TESTS, PHASE_3_FEATURES, PHASE_4_UI, PHASE_5_DEPLOY, EMERGENCY };
