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

// ---- the service worker holds the SAME version (v1.65.0) -----------------
// sw.js names its cache from its own VERSION and precaches every lib at that
// stamp. A partial bump — index.html moved, the worker not — would install a
// worker that precaches URLs the page never requests: every module misses,
// the app silently degrades to network-only, and the cache from the PREVIOUS
// version is never cleaned up because the name did not change. That is a
// build failure, not something to notice in the truck.
const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

const swVersion = (sw.match(/const VERSION = '([^']+)'/) || [])[1];
ok('sw.js declares a VERSION', !!swVersion, 'no VERSION const matched');
ok(`sw.js VERSION equals APP_VERSION (${appVersion})`, swVersion === appVersion,
   `sw.js has ${swVersion}, index.html has ${appVersion}`);

// The cache name has to CONTAIN the version, or the activate sweep that
// deletes every other fuelpost- cache would delete this one too, or keep a
// stale one forever. Derived in the file rather than written out, so this
// checks the derivation exists.
ok('the cache name is built from VERSION, not written out separately',
   /const CACHE = CACHE_PREFIX \+ 'v' \+ VERSION;/.test(sw),
   (sw.match(/const CACHE = .*/) || [''])[0]);
ok("and the prefix is 'fuelpost-', which the activate sweep matches on",
   /const CACHE_PREFIX = 'fuelpost-';/.test(sw)
   && /name\.startsWith\(CACHE_PREFIX\) && name !== CACHE/.test(sw));

// The precache list must be GENERATED from VERSION. A second hand-written
// copy of the version string is the thing that drifts.
ok('the lib stamps are generated from VERSION, never hand-written',
   /'lib\/' \+ name \+ '\.js\?v=' \+ VERSION/.test(sw)
   && !/\?v=\d+\.\d+\.\d+/.test(sw),
   JSON.stringify(sw.match(/\?v=\d+\.\d+\.\d+/g)));

// Same count guard as above, against lib/ itself: a module added to lib/ and
// wired into index.html but forgotten in the worker's list would otherwise
// just quietly never be cached.
const swLibs = (sw.match(/const LIB_MODULES = \[([\s\S]*?)\]/) || [])[1] || '';
const swLibNames = [...swLibs.matchAll(/'([a-z-]+)'/g)].map(m => m[1]);
ok(`sw.js lists every lib module (expected ${libCount}, got ${swLibNames.length})`,
   swLibNames.length === libCount, JSON.stringify(swLibNames));

const onDisk = fs.readdirSync(path.join(__dirname, '..', 'lib'))
  .filter(f => f.endsWith('.js')).map(f => f.replace(/\.js$/, '')).sort();
const missingFromSw = onDisk.filter(n => !swLibNames.includes(n));
const strayInSw = swLibNames.filter(n => !onDisk.includes(n));
ok('and they are exactly the modules on disk — none missing, none invented',
   missingFromSw.length === 0 && strayInSw.length === 0,
   JSON.stringify({ missingFromSw, strayInSw }));

// index.html and the icons, the rest of what the app cannot start without.
ok('sw.js precaches index.html', /'index\.html'/.test(sw));
const iconFiles = fs.readdirSync(path.join(__dirname, '..', 'icons'))
  .filter(f => f.endsWith('.png'));
const missingIcons = iconFiles.filter(f => !sw.includes(`icons/${f}`));
ok(`sw.js precaches all ${iconFiles.length} icons`, missingIcons.length === 0,
   JSON.stringify(missingIcons));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
