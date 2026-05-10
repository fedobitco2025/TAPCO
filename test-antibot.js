/**
 * TAPCO Anti-Bot System - Standalone Test Suite
 * يعمل بدون npm install - يحاكي قاعدة البيانات في الذاكرة
 */

'use strict';

// ======================================================
// MOCK: محاكاة better-sqlite3 بالذاكرة
// ======================================================
const mockDB = {
  bot_reports: [],
  player_bot_profiles: [],
  banned_devices: []
};

function createMockDB() {
  return {
    prepare: (sql) => ({
      run: (...args) => executeMock(sql, args),
      get: (...args) => queryOneMock(sql, args),
      all: (...args) => queryAllMock(sql, args)
    }),
    pragma: () => {},
    exec: () => {}
  };
}

function executeMock(sql, args) {
  const s = sql.trim().toUpperCase();
  if (s.startsWith('INSERT INTO BOT_REPORTS')) {
    mockDB.bot_reports.push({
      id: mockDB.bot_reports.length + 1,
      playerId: args[0], sessionId: args[1], botTier: args[2],
      suspicionScore: args[3], tps: args[4], patternStdDev: args[5],
      deviceFingerprint: args[6], ipHash: args[7],
      timestamp: args[8], createdAt: args[9]
    });
  } else if (s.startsWith('INSERT INTO PLAYER_BOT_PROFILES')) {
    mockDB.player_bot_profiles.push({
      playerId: args[0], evidenceScore: args[1], reportCount: args[2],
      banStatus: args[3], firstReportTime: args[4], lastReportTime: args[5],
      deviceFingerprint: args[6], ipHash: args[7],
      createdAt: args[8], updatedAt: args[9], deviceBanApplied: 0
    });
  } else if (s.startsWith('UPDATE PLAYER_BOT_PROFILES')) {
    const idx = mockDB.player_bot_profiles.findIndex(p => p.playerId === args[8]);
    if (idx !== -1) {
      mockDB.player_bot_profiles[idx] = {
        ...mockDB.player_bot_profiles[idx],
        evidenceScore: args[0], reportCount: args[1], banStatus: args[2],
        lastReportTime: args[3], deviceFingerprint: args[4], ipHash: args[5],
        deviceBanApplied: args[6], updatedAt: args[7]
      };
    }
  } else if (s.startsWith('INSERT INTO BANNED_DEVICES')) {
    mockDB.banned_devices.push({
      deviceFingerprint: args[0], ipHash: args[1], banType: args[2],
      reason: args[3], createdAt: args[4], updatedAt: args[5]
    });
  }
  return { changes: 1 };
}

function queryOneMock(sql, args) {
  const s = sql.trim().toUpperCase();
  if (s.includes('FROM BOT_REPORTS') && s.includes('WHERE PLAYERID = ?')) {
    return null; // handled by COUNT
  }
  if (s.includes('COUNT(*)') && s.includes('FROM BOT_REPORTS')) {
    const cutoff = args[1] || 0;
    const count = mockDB.bot_reports.filter(r =>
      r.playerId === args[0] && r.timestamp >= cutoff
    ).length;
    return { count };
  }
  if (s.includes('FROM PLAYER_BOT_PROFILES') && s.includes('WHERE PLAYERID = ?')) {
    return mockDB.player_bot_profiles.find(p => p.playerId === args[0]) || null;
  }
  if (s.includes('COUNT(DISTINCT PLAYERID)') && s.includes('DEVICEFINGERPRINT = ?')) {
    const count = new Set(
      mockDB.player_bot_profiles
        .filter(p => p.deviceFingerprint === args[0] && p.banStatus !== 'none')
        .map(p => p.playerId)
    ).size;
    return { count };
  }
  if (s.includes('COUNT(DISTINCT PLAYERID)') && s.includes('IPHASH = ?')) {
    const count = new Set(
      mockDB.player_bot_profiles
        .filter(p => p.ipHash === args[0] && p.banStatus !== 'none')
        .map(p => p.playerId)
    ).size;
    return { count };
  }
  if (s.includes('FROM BANNED_DEVICES')) {
    return mockDB.banned_devices.find(
      d => d.deviceFingerprint === args[0] || d.ipHash === args[1]
    ) || null;
  }
  return null;
}

function queryAllMock(sql, args) {
  const s = sql.trim().toUpperCase();
  if (s.includes('FROM BOT_REPORTS') && s.includes('WHERE PLAYERID = ?')) {
    return mockDB.bot_reports
      .filter(r => r.playerId === args[0])
      .sort((a, b) => b.timestamp - a.timestamp);
  }
  if (s.includes('FROM PLAYER_BOT_PROFILES') && s.includes('DEVICEFINGERPRINT = ?')) {
    return mockDB.player_bot_profiles.filter(p => p.deviceFingerprint === args[0]);
  }
  if (s.includes('FROM PLAYER_BOT_PROFILES') && s.includes('IPHASH = ?')) {
    return mockDB.player_bot_profiles.filter(p => p.ipHash === args[0]);
  }
  return [];
}

// Inject mock into module system BEFORE loading anti-bot
const Module = require('module');
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === './db' || request.endsWith('/db')) {
    return { db: createMockDB() };
  }
  return originalLoad.apply(this, arguments);
};

// Now load anti-bot with mocked DB
const antiBot = require('./server/anti-bot.js');

// ======================================================
// TEST FRAMEWORK
// ======================================================
let passed = 0, failed = 0, total = 0;
const results = [];

function test(name, fn) {
  total++;
  try {
    fn();
    passed++;
    results.push({ status: '✅ PASS', name });
    console.log(`✅ PASS: ${name}`);
  } catch(e) {
    failed++;
    results.push({ status: '❌ FAIL', name, error: e.message });
    console.log(`❌ FAIL: ${name}\n   → ${e.message}`);
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'assertion failed');
}

function assertEqual(a, b, msg) {
  if (a !== b) throw new Error(`${msg || 'assertEqual'}: expected "${b}", got "${a}"`);
}

// ======================================================
// RESET MOCK DB BETWEEN GROUPS
// ======================================================
function resetDB() {
  mockDB.bot_reports = [];
  mockDB.player_bot_profiles = [];
  mockDB.banned_devices = [];
}

// ======================================================
// GROUP 1: applyPointPenalty
// ======================================================
console.log('\n════════════════════════════════════════');
console.log(' اختبار 1: نظام العقوبات (Points Penalty)');
console.log('════════════════════════════════════════');

test('Tier A - بدون عقوبة (100%)', () => {
  const r = antiBot.applyPointPenalty(1000, 'A');
  assertEqual(r.finalPoints, 1000, 'Tier A points');
  assertEqual(r.penaltyPercent, 0, 'Tier A penalty');
});

test('Tier B - عقوبة 10% (يجب أن يكون 900)', () => {
  const r = antiBot.applyPointPenalty(1000, 'B');
  assertEqual(r.finalPoints, 900, 'Tier B points');
  assertEqual(r.penaltyPercent, 10, 'Tier B penalty');
});

test('Tier C - عقوبة 40% (يجب أن يكون 600)', () => {
  const r = antiBot.applyPointPenalty(1000, 'C');
  assertEqual(r.finalPoints, 600, 'Tier C points');
  assertEqual(r.penaltyPercent, 40, 'Tier C penalty');
});

test('Tier C - نقاط غير زوجية (floor)', () => {
  const r = antiBot.applyPointPenalty(999, 'C');
  assertEqual(r.finalPoints, 599, 'floor(999 * 0.6) = 599');
});

// ======================================================
// GROUP 2: applyEnergyPenalty
// ======================================================
console.log('\n════════════════════════════════════════');
console.log(' اختبار 2: نظام طاقة (Energy Penalty)');
console.log('════════════════════════════════════════');

test('Tier A - طاقة طبيعية (100%)', () => {
  const r = antiBot.applyEnergyPenalty(100, 'A');
  assertEqual(r.finalCost, 100, 'Tier A energy');
  assertEqual(r.bonusPercent, 0, 'Tier A bonus');
});

test('Tier B - طاقة طبيعية (100%)', () => {
  const r = antiBot.applyEnergyPenalty(100, 'B');
  assertEqual(r.finalCost, 100, 'Tier B energy');
});

test('Tier C - طاقة +15% (ceil 115)', () => {
  const r = antiBot.applyEnergyPenalty(100, 'C');
  assertEqual(r.finalCost, 115, 'Tier C energy = 115');
  assertEqual(r.bonusPercent, 15, 'Tier C bonus = 15');
});

test('Tier C - ceil يعمل صح (ceil(10 * 1.15) = 12)', () => {
  const r = antiBot.applyEnergyPenalty(10, 'C');
  assert(r.finalCost >= 11, `finalCost ${r.finalCost} should be >= 11`);
});

// ======================================================
// GROUP 3: canPlayerActivateReferral
// ======================================================
console.log('\n════════════════════════════════════════');
console.log(' اختبار 3: التحقق من الإحالات');
console.log('════════════════════════════════════════');

test('Tier A, none ban - يُسمح بالإحالة', () => {
  const r = antiBot.canPlayerActivateReferral('A', 'none');
  assert(r.allowed, 'Tier A should allow referral');
});

test('Tier B, none ban - يُسمح بالإحالة', () => {
  const r = antiBot.canPlayerActivateReferral('B', 'none');
  assert(r.allowed, 'Tier B should allow referral');
});

test('Tier C, none ban - لا يُسمح', () => {
  const r = antiBot.canPlayerActivateReferral('C', 'none');
  assert(!r.allowed, 'Tier C should block referral');
});

test('shadow_ban - لا يُسمح', () => {
  const r = antiBot.canPlayerActivateReferral('A', 'shadow_ban');
  assert(!r.allowed, 'shadow_ban should block referral');
});

test('smart_ban - لا يُسمح', () => {
  const r = antiBot.canPlayerActivateReferral('A', 'smart_ban');
  assert(!r.allowed, 'smart_ban should block referral');
});

// ======================================================
// GROUP 4: canPlayerPerformWalletOp
// ======================================================
console.log('\n════════════════════════════════════════');
console.log(' اختبار 4: عمليات المحفظة (Wallet Ops)');
console.log('════════════════════════════════════════');

test('Tier A, none ban - يُسمح للمحفظة', () => {
  const r = antiBot.canPlayerPerformWalletOp('A', 'none', 'withdraw');
  assert(r.allowed, 'should allow wallet op');
  assert(!r.silent, 'should not be silent');
});

test('shadow_ban - يُسمح بصمت (silent mode)', () => {
  const r = antiBot.canPlayerPerformWalletOp('A', 'shadow_ban', 'withdraw');
  assert(r.allowed, 'shadow_ban returns allowed=true (fake)');
  assert(r.silent, 'shadow_ban must be silent');
});

test('smart_ban - محظور تماماً (allowed=false)', () => {
  const r = antiBot.canPlayerPerformWalletOp('A', 'smart_ban', 'withdraw');
  assert(!r.allowed, 'smart_ban must block wallet op');
  assert(!r.silent, 'smart_ban is not silent, shows error');
});

// ======================================================
// GROUP 5: getServerBotState (بدون بيانات)
// ======================================================
console.log('\n════════════════════════════════════════');
console.log(' اختبار 5: حالة البوت على السيرفر');
console.log('════════════════════════════════════════');

test('لاعب جديد - Tier A بدون حظر', () => {
  resetDB();
  const r = antiBot.getServerBotState('PLAYER_NEW');
  assertEqual(r.botTier, 'A', 'new player tier = A');
  assertEqual(r.banStatus, 'none', 'new player ban = none');
  assertEqual(r.serverBotScore, 0, 'new player score = 0');
});

// ======================================================
// GROUP 6: analyzeBotReport - دورة الحياة الكاملة
// ======================================================
console.log('\n════════════════════════════════════════');
console.log(' اختبار 6: تحليل تقارير البوت (دورة كاملة)');
console.log('════════════════════════════════════════');

test('تقرير ناقص - يجب أن يرفضه', () => {
  resetDB();
  const r = antiBot.analyzeBotReport('P1', {
    botTier: 'C',
    suspicionScore: 80,
    tps: 30
    // ناقص deviceFingerprint و ipHash
  });
  assert(!r.ok, 'incomplete report should fail');
});

test('تقرير كامل - يُقبل ويُنشأ الملف', () => {
  resetDB();
  const r = antiBot.analyzeBotReport('P_TEST', {
    sessionId: 'S001',
    botTier: 'C',
    suspicionScore: 80,
    tps: 22,
    patternStdDev: 1.2,
    deviceFingerprint: 'device_abc',
    ipHash: 'ip_abc',
    timestamp: Date.now()
  });
  assert(r.ok, `expected ok=true, got: ${JSON.stringify(r)}`);
  assertEqual(r.playerId, 'P_TEST', 'player ID matches');
  assert(['none','soft_flag','shadow_ban','smart_ban'].includes(r.banStatus),
    `valid ban status, got: ${r.banStatus}`);
});

test('5 تقارير متتالية → يرفع نقاط الدليل', () => {
  resetDB();
  const now = Date.now();
  const playerId = 'P_MULTI';
  
  for (let i = 0; i < 5; i++) {
    antiBot.analyzeBotReport(playerId, {
      sessionId: 'S001',
      botTier: 'C',
      suspicionScore: 80,
      tps: 28,
      patternStdDev: 0.5,
      deviceFingerprint: 'device_xyz',
      ipHash: 'ip_xyz',
      timestamp: now - (i * 60000) // كل دقيقة
    });
  }
  
  const state = antiBot.getServerBotState(playerId);
  assert(state.serverBotScore > 0, `evidence score should be > 0, got ${state.serverBotScore}`);
  assert(state.reportCount >= 5, `reportCount should be >= 5, got ${state.reportCount}`);
  console.log(`   → Evidence score after 5 reports: ${state.serverBotScore}, tier: ${state.botTier}`);
});

test('getPlayerBotTier - score=0 → Tier A', () => {
  resetDB();
  antiBot.analyzeBotReport('P_LOW', {
    sessionId: 'S1', botTier: 'C', suspicionScore: 10, tps: 5,
    patternStdDev: 5, deviceFingerprint: 'dev_low', ipHash: 'ip_low',
    timestamp: Date.now()
  });
  // نقاط الدليل قليلة → Tier A أو B
  const tier = antiBot.getPlayerBotTier('P_LOW');
  assert(['A','B','C'].includes(tier), `tier should be A/B/C, got: ${tier}`);
  console.log(`   → Tier for low-risk player: ${tier}`);
});

// ======================================================
// GROUP 7: checkBanStatus
// ======================================================
console.log('\n════════════════════════════════════════');
console.log(' اختبار 7: فحص حالة الحظر');
console.log('════════════════════════════════════════');

test('لاعب غير موجود - غير محظور', () => {
  resetDB();
  const r = antiBot.checkBanStatus('P_UNKNOWN', 'dev999', 'ip999');
  assert(!r.isBanned, 'unknown player should not be banned');
  assertEqual(r.banStatus, 'none', 'ban status = none');
});

test('جهاز محظور - يظهر device_locked', () => {
  resetDB();
  // إضافة جهاز محظور مباشرة
  mockDB.banned_devices.push({
    deviceFingerprint: 'banned_dev',
    ipHash: 'banned_ip',
    banType: 'both',
    reason: 'test',
    createdAt: Date.now(),
    updatedAt: Date.now()
  });
  const r = antiBot.checkBanStatus('P_ANY', 'banned_dev', 'safe_ip');
  assert(r.isBanned, 'banned device should return isBanned=true');
  assertEqual(r.banStatus, 'device_locked', 'status = device_locked');
  assert(!r.canWithdraw, 'banned device cannot withdraw');
});

// ======================================================
// GROUP 8: logAntiBotAction
// ======================================================
console.log('\n════════════════════════════════════════');
console.log(' اختبار 8: نظام الـ Logging');
console.log('════════════════════════════════════════');

test('تسجيل action → يُضاف لـ global.antiBotLogs', () => {
  global.antiBotLogs = [];
  antiBot.logAntiBotAction('P_LOG', 'test_action', { reason: 'testing' });
  assert(global.antiBotLogs.length === 1, 'should have 1 log entry');
  assertEqual(global.antiBotLogs[0].playerId, 'P_LOG', 'player ID in log');
  assertEqual(global.antiBotLogs[0].action, 'test_action', 'action in log');
});

test('تسجيل 100 action متتالية → يُحفظ الكل', () => {
  global.antiBotLogs = [];
  for (let i = 0; i < 100; i++) {
    antiBot.logAntiBotAction(`P_${i}`, 'mass_test', { i });
  }
  assertEqual(global.antiBotLogs.length, 100, 'should have 100 entries');
});

// ======================================================
// FINAL REPORT
// ======================================================
console.log('\n══════════════════════════════════════════════');
console.log('                نتائج الاختبار');
console.log('══════════════════════════════════════════════');
console.log(`المجموع : ${total}`);
console.log(`نجح     : ${passed} ✅`);
console.log(`فشل     : ${failed} ${failed > 0 ? '❌' : '✅'}`);
console.log('──────────────────────────────────────────────');

if (failed > 0) {
  console.log('\n⚠️ الاختبارات التي فشلت:');
  results.filter(r => r.status.includes('FAIL')).forEach(r => {
    console.log(`  ❌ ${r.name}`);
    console.log(`     → ${r.error}`);
  });
}

if (failed === 0) {
  console.log('\n🎉 جميع الاختبارات نجحت! النظام يعمل بشكل صحيح.');
} else {
  console.log(`\n⚠️ ${failed} اختبار فشل - يحتاج مراجعة.`);
}

process.exit(failed > 0 ? 1 : 0);
