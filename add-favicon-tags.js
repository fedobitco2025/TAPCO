// Adds complete favicon + apple-touch-icon tags to every HTML page
// that doesn't already have them, covering Google Search and iOS.
const fs = require('fs');
const path = require('path');

const FAVICON_HTML =
  '  <link rel="icon" type="image/x-icon" href="/favicon.ico" />\n' +
  '  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />\n' +
  '  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />\n';

const DIRS = ['.', 'backend/public'];
const SKIP = ['Game.html', 'visual-test-loader.html'];

let updated = 0;

for (const dir of DIRS) {
  const files = fs.readdirSync(dir).filter(f =>
    f.endsWith('.html') && !SKIP.includes(f)
  );

  for (const file of files) {
    const fp = path.join(dir, file);
    let c = fs.readFileSync(fp, 'utf8');

    // Skip if already has a favicon link
    if (c.includes('rel="icon"') || c.includes("rel='icon'")) continue;

    // Insert after <head> opening or before first <meta>
    const insertBefore = c.indexOf('  <meta charset');
    if (insertBefore === -1) continue;

    c = c.slice(0, insertBefore) + FAVICON_HTML + c.slice(insertBefore);
    fs.writeFileSync(fp, c, 'utf8');
    console.log('Updated:', fp);
    updated++;
  }
}
console.log('\nDone —', updated, 'pages updated with favicon tags.');
