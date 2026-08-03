// Adds hreflang alternate links to all public HTML pages
// so Google treats each language version as a distinct URL via ?lang= parameter.
const fs = require('fs');
const path = require('path');

const DIRS = ['.', 'backend/public'];
const SKIP = ['Game.html', 'visual-test-loader.html', 'add-hreflang.js'];

let updated = 0;
let skipped = 0;

DIRS.forEach(dir => {
  const files = fs.readdirSync(dir).filter(f =>
    f.endsWith('.html') && !SKIP.some(s => f === s)
  );

  files.forEach(file => {
    const filePath = path.join(dir, file);
    let content = fs.readFileSync(filePath, 'utf8');

    if (content.includes('hreflang')) {
      skipped++;
      return;
    }

    const match = content.match(/<link rel="canonical" href="([^"]+)"\s*\/>/);
    if (!match) {
      skipped++;
      return;
    }

    const base = match[1];
    const sep = base.includes('?') ? '&' : '?';

    const hreflang = [
      `  <link rel="alternate" hreflang="en" href="${base}" />`,
      `  <link rel="alternate" hreflang="ar" href="${base}${sep}lang=ar" />`,
      `  <link rel="alternate" hreflang="tr" href="${base}${sep}lang=tr" />`,
      `  <link rel="alternate" hreflang="x-default" href="${base}" />`
    ].join('\n');

    content = content.replace(
      `<link rel="canonical" href="${base}" />`,
      `<link rel="canonical" href="${base}" />\n${hreflang}`
    );

    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Updated:', filePath);
    updated++;
  });
});

console.log(`\nDone — updated: ${updated}, skipped (already done or no canonical): ${skipped}`);
