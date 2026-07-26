const assert = require('assert');
const os = require('os');
const path = require('path');
const express = require('express');
const { chromium } = require('playwright');

function createPreviewServer() {
  const app = express();
  const now = new Date().toISOString();
  const player = {
    playerId: 'TG_102938475', telegramUserId: '102938475', address: '0x356C...d62e',
    level: 18, dailyPoints: 8420, dailyClicks: 2910, gameBalance: 48750,
    tapcoBalance: 12.5, botStatus: 'none', updatedAt: now, referrals: 14, achievements: 22
  };

  app.use('/api/admin', (req, res, next) => {
    if (req.get('X-TAPCO-Admin-Key') !== 'preview') return res.status(401).json({ ok: false });
    return next();
  });
  app.get('/api/admin/economy', (_req, res) => res.json({
    ok: true,
    alerts: [],
    controls: { worker: { status: 'healthy', healthy: true, heartbeatAt: now } }
  }));
  app.get('/api/admin/overview', (_req, res) => res.json({
    ok: true,
    generatedAt: now,
    historyStartsAt: '2026-06-01',
    players: { total: 1284, activeToday: 396, newToday: 47, flagged: 6 },
    economy: { totalPointsEarned: 9876543, gameBalance: 4421900, tapcoBalance: 1935.75 },
    activity: [
      { day: '2026-06-01', activePlayers: 302, points: 310000, clicks: 98000, sessionTime: 12000 },
      { day: '2026-06-02', activePlayers: 351, points: 385000, clicks: 110000, sessionTime: 14500 },
      { day: '2026-06-03', activePlayers: 396, points: 451200, clicks: 129000, sessionTime: 16800 }
    ],
    withdrawals: [
      { _id: 'completed', count: 73, amount: 240 },
      { _id: 'processing', count: 9, amount: 31 },
      { _id: 'failed', count: 3, amount: 8 }
    ],
    walletActivity: [],
    securityActions24h: [{ _id: 'SIGNATURE_REJECTED', count: 12 }, { _id: 'RATE_LIMITED', count: 7 }],
    topPlayers: [player]
  }));
  app.get('/api/admin/players', (_req, res) => res.json({ ok: true, page: 1, limit: 25, total: 1, pages: 1, players: [player] }));
  app.get('/api/admin/players/:playerId', (_req, res) => res.json({
    ok: true, player,
    activity: [{ day: '2026-06-03', points: 8420, clicks: 2910, sessionTime: 1900 }],
    withdrawals: [], walletTransactions: [], securityEvents: []
  }));
  app.get('/api/admin/withdrawals', (_req, res) => res.json({
    ok: true, page: 1, limit: 25, total: 1,
    items: [{ playerId: player.playerId, amount: 3.5, walletAddress: player.address, status: 'completed', broadcastAttempts: 1, txHashShort: '0x6f29...cc181', createdAt: now }]
  }));
  app.get('/api/admin/wallet-transactions', (_req, res) => res.json({ ok: true, page: 1, limit: 25, total: 0, items: [] }));
  app.get('/api/admin/security-events', (_req, res) => res.json({ ok: true, page: 1, limit: 25, total: 0, items: [] }));
  app.use(express.static(path.join(__dirname, 'public', 'admin')));
  return app;
}

async function login(page) {
  await page.goto(page.url(), { waitUntil: 'networkidle' });
  await page.locator('#adminKey').fill('wrong-key');
  await page.locator('#loginForm .primary-button').click();
  await page.locator('#loginError').filter({ hasText: 'مفتاح الإدارة غير صحيح' }).waitFor();
  await page.locator('#adminKey').fill('preview');
  await page.locator('#loginForm .primary-button').click();
  await page.locator('#overviewView.active').waitFor();
}

async function assertLayout(page, label) {
  const metrics = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    overflowingControls: [...document.querySelectorAll('button, .kpi')]
      .filter((element) => {
        const style = getComputedStyle(element);
        return style.display !== 'none' && element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 2;
      })
      .map((element) => element.id || element.className)
  }));
  assert(metrics.documentWidth <= metrics.viewportWidth + 1, `${label}: horizontal page overflow`);
  assert.deepStrictEqual(metrics.overflowingControls, [], `${label}: overflowing controls`);
}

async function run() {
  const server = createPreviewServer().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  const browser = await chromium.launch({ headless: true });
  const screenshots = [];

  try {
    for (const viewport of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      const consoleErrors = [];
      page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
      await page.goto(`http://127.0.0.1:${port}`);
      await login(page);
      consoleErrors.length = 0;

      await page.locator('#kpiGrid .kpi').first().waitFor();
      assert.strictEqual(await page.locator('#kpiGrid .kpi').count(), 4);
      assert.strictEqual(await page.locator('#connectionState').textContent(), 'API متصل · عامل السحب سليم');
      const visibleText = await page.locator('body').innerText();
      assert(!/[٠-٩]/.test(visibleText), `${viewport.name}: Arabic-Indic digits are visible`);
      const numericTypography = await page.locator('.kpi-value').first().evaluate((element) => {
        const style = getComputedStyle(element);
        return { family: style.fontFamily, variant: style.fontVariantNumeric };
      });
      assert(numericTypography.family.includes('Bahnschrift'), `${viewport.name}: dashboard numeric font is not Bahnschrift`);
      assert(numericTypography.variant.includes('tabular-nums'), `${viewport.name}: dashboard numbers are not tabular`);
      const nonBlankPixels = await page.locator('#activityChart').evaluate((canvas) => {
        const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        let count = 0;
        for (let index = 0; index < pixels.length; index += 16) {
          if (pixels[index + 3] > 0 && (pixels[index] < 245 || pixels[index + 1] < 245 || pixels[index + 2] < 245)) count += 1;
        }
        return count;
      });
      assert(nonBlankPixels > 100, `${viewport.name}: activity chart is blank`);
      await assertLayout(page, viewport.name);

      const overviewScreenshot = path.join(os.tmpdir(), `tapco-admin-${viewport.name}-overview.png`);
      await page.screenshot({ path: overviewScreenshot, fullPage: true });
      screenshots.push(overviewScreenshot);

      if (viewport.name === 'mobile') await page.locator('#menuButton').click();
      await page.locator('[data-view="players"]').click();
      await page.locator('#playersBody [data-player]').waitFor();
      assert.strictEqual(await page.locator('#playersBody .cell-main').textContent(), playerIdForAssertion());
      await page.locator('#playersBody [data-player]').click();
      await page.locator('#playerDrawer.open').waitFor();
      await page.waitForTimeout(300);
      const drawerBounds = await page.locator('#playerDrawer').boundingBox();
      assert(drawerBounds, `${viewport.name}: player drawer has no bounds`);
      assert(drawerBounds.x >= -1, `${viewport.name}: player drawer is off-screen`);
      assert(drawerBounds.width >= Math.min(480, viewport.width - 2), `${viewport.name}: player drawer is too narrow`);
      await assertLayout(page, `${viewport.name}-drawer`);

      const screenshotPath = path.join(os.tmpdir(), `tapco-admin-${viewport.name}-drawer.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      screenshots.push(screenshotPath);
      assert.deepStrictEqual(consoleErrors, [], `${viewport.name}: browser console errors`);
      await context.close();
    }

    console.log(`[admin-dashboard-ui] PASS\n${screenshots.join('\n')}`);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

function playerIdForAssertion() {
  return 'TG_102938475';
}

run().catch((error) => {
  console.error('[admin-dashboard-ui] FAIL', error);
  process.exitCode = 1;
});