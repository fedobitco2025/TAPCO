const fs = require('fs');
const articles = [
  'article-telegram-retention-loops.html',
  'article-fair-progression-design.html',
  'article-energy-system-balancing.html',
  'article-community-trust-playbook.html',
  'article-security-for-mini-apps.html',
  'article-content-governance-for-game-sites.html',
  'article-onboarding-without-hype.html',
  'article-anti-abuse-without-false-positives.html',
  'article-support-ops-for-live-games.html',
  'article-metrics-that-matter-in-tap-games.html',
  'article-monetization-separation-principles.html'
];
articles.forEach(f => {
  const c = fs.readFileSync(f, 'utf8');
  const sections = c.split('<section>').slice(1);
  let missing = false;
  sections.forEach((s, i) => {
    const en = s.includes('data-lang="en"');
    const ar = s.includes('data-lang="ar"');
    const tr = s.includes('data-lang="tr"');
    if (!en || !ar || !tr) {
      if (!missing) { console.log('\n=== ' + f + ' ==='); missing = true; }
      console.log('  Section ' + (i+1) + ': EN=' + en + ' AR=' + ar + ' TR=' + tr);
    }
  });
  if (!missing) console.log(f + ': OK');
});
