const fs = require('fs');
const path = require('path');

const SKIP = ['Game.html', 'visual-test-loader.html', '404.html'];
const files = fs.readdirSync('.').filter(f =>
  f.endsWith('.html') && !SKIP.includes(f)
);

let allOk = true;
files.forEach(file => {
  const c = fs.readFileSync(file, 'utf8');
  const sections = c.split('<section').slice(1);
  const issues = [];

  sections.forEach((s, i) => {
    const en = s.includes('data-lang="en"');
    const ar = s.includes('data-lang="ar"');
    const tr = s.includes('data-lang="tr"');
    // Only flag if at least one language IS present (ignore purely structural sections)
    if ((en || ar || tr) && (!en || !ar || !tr)) {
      issues.push(`Section ${i + 1}: EN=${en} AR=${ar} TR=${tr}`);
    }
  });

  const hasEn = c.includes('data-lang="en"');
  const hasAr = c.includes('data-lang="ar"');
  const hasTr = c.includes('data-lang="tr"');

  if (!hasEn || !hasAr || !hasTr) {
    issues.unshift(`PAGE LEVEL: EN=${hasEn} AR=${hasAr} TR=${hasTr}`);
  }

  if (issues.length) {
    allOk = false;
    console.log('\n❌ ' + file);
    issues.forEach(i => console.log('   ' + i));
  } else {
    console.log('✅ ' + file);
  }
});

console.log(allOk ? '\n✅ All pages complete.' : '\n⚠ Some pages need attention.');
