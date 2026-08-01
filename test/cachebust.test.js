// Every lib/*.js the page loads must carry a ?v= stamp equal to APP_VERSION.
// The stamp is what stops a freshly fetched index.html from running against
// a stale cached lib file (GitHub Pages serves max-age=600, and the browser
// may revalidate the HTML but not the scripts — that skew shipped a build
// that existed in no commit: a v1.12.4 footer with v1.12.3's trip text).
// This test turns "remember to bump the stamps" into a hard failure instead.
const fs = require('fs');
const path = require('path');
let pass = 0, fail = 0;
const ok = (n, c, e = '') => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.log('  FAIL', n, e); } };

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

const appVersion = (html.match(/const APP_VERSION = '([^']+)'/) || [])[1];
ok('APP_VERSION found in index.html', !!appVersion, 'no APP_VERSION const matched');

// Both load mechanisms: <script src="lib/..."> and fetch('lib/...').
const refs = [];
for (const m of html.matchAll(/(?:src="|fetch\(')(lib\/[a-z-]+\.js)(?:\?v=([^"')]*))?["')]/g)) {
  refs.push({ path: m[1], v: m[2] });
}

// Count guard: if a refactor changes how libs load and this regex stops
// matching, the per-ref checks below would vacuously pass on nothing.
// Counted against lib/ itself rather than a hardcoded number, so adding a
// lib updates the expectation automatically — and a lib that exists but is
// never loaded by the page still fails here, which is worth knowing too.
const libCount = fs.readdirSync(path.join(__dirname, '..', 'lib'))
  .filter(f => f.endsWith('.js')).length;
ok(`every lib/*.js is referenced by index.html (expected ${libCount}, got ${refs.length})`,
   refs.length === libCount, JSON.stringify(refs.map(r => r.path)));

const unstamped = refs.filter(r => !r.v);
ok('every lib reference carries a ?v= stamp', unstamped.length === 0,
   JSON.stringify(unstamped.map(r => r.path)));

const drifted = refs.filter(r => r.v && r.v !== appVersion);
ok(`every stamp equals APP_VERSION (${appVersion})`, drifted.length === 0,
   JSON.stringify(drifted));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
