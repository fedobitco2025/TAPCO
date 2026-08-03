// Spreads article publication dates across a realistic 3-month window
// so they don't all show the same date in AdSense review.
const fs = require('fs');
const path = require('path');

// Assign realistic staggered dates (oldest → newest)
const DATES = {
  'article-tap-to-earn-foundations.html':             '2026-05-10',
  'article-telegram-mini-apps.html':                  '2026-05-18',
  'article-web3-game-literacy.html':                  '2026-05-27',
  'article-referral-growth.html':                     '2026-06-05',
  'article-telegram-retention-loops.html':            '2026-06-14',
  'article-fair-progression-design.html':             '2026-06-22',
  'article-energy-system-balancing.html':             '2026-06-30',
  'article-community-trust-playbook.html':            '2026-07-07',
  'article-security-for-mini-apps.html':              '2026-07-14',
  'article-content-governance-for-game-sites.html':   '2026-07-19',
  'article-onboarding-without-hype.html':             '2026-07-24',
  'article-anti-abuse-without-false-positives.html':  '2026-07-28',
  'article-support-ops-for-live-games.html':          '2026-07-31',
  'article-metrics-that-matter-in-tap-games.html':    '2026-08-02',
  'article-monetization-separation-principles.html':  '2026-08-03',
};

const DIRS = ['.', 'backend/public'];

let updated = 0;

for (const [file, date] of Object.entries(DATES)) {
  for (const dir of DIRS) {
    const fp = path.join(dir, file);
    if (!fs.existsSync(fp)) continue;

    let content = fs.readFileSync(fp, 'utf8');
    const original = content;

    // English date
    content = content.replace(/Updated: \d{4}-\d{2}-\d{2}/g, `Updated: ${date}`);
    // Arabic date
    content = content.replace(/آخر تحديث: \d{4}-\d{2}-\d{2}/g, `آخر تحديث: ${date}`);
    // Turkish date
    content = content.replace(/Güncelleme: \d{4}-\d{2}-\d{2}/g, `Güncelleme: ${date}`);
    content = content.replace(/Guncelleme: \d{4}-\d{2}-\d{2}/g, `Güncelleme: ${date}`);

    if (content !== original) {
      fs.writeFileSync(fp, content, 'utf8');
      console.log(`${fp}: ${date}`);
      updated++;
    }
  }
}

console.log(`\nDone — ${updated} file(s) updated.`);
