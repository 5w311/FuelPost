// Service worker invariants. A service worker is the one component that can
// permanently strand installed phones on old code, so these assertions guard
// the properties that make that impossible — statically, so a future edit
// that breaks one fails here rather than in the field.

const fs = require('fs');
const path = require('path');

let p = 0, f = 0;
const ok = (n, c, e = '') => { c ? (p++, console.log('  PASS', n)) : (f++, console.log('  FAIL', n, e)); };

const root = path.join(__dirname, '..');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const APP_VERSION = (html.match(/const APP_VERSION = '([^']+)'/) || [])[1];

console.log('=== THE UN-UPDATABLE FAILURE MODE ===');
// checkForUpdate() and the "tap to reload" navigation both use ?_cb=. If the
// worker ever answers one from cache, the check reports "latest" forever and
// the reload lands back on the same build. Nothing else in the app would look
// wrong — which is exactly why this needs a test.
ok('sw bypasses any request carrying the _cb cache-buster',
   /searchParams\.has\('_cb'\)/.test(sw) && /_cb[\s\S]{0,80}return;/.test(sw), 'bypass not found');
ok('the app still cache-busts its update check', /\?_cb=' \+ Date\.now\(\)/.test(html));
ok('the app still cache-busts the update reload',
   (html.match(/\?_cb=' \+ Date\.now\(\)/g) || []).length >= 2,
   String((html.match(/\?_cb=' \+ Date\.now\(\)/g) || []).length));

ok('the update reload strips ?_cb from the address bar afterwards, so a later '
   + 'offline reload is not left on a URL the sw refuses to cache',
   /location\.search\.includes\('_cb'\)/.test(html) && /history\.replaceState/.test(html));

console.log('\n=== version cannot drift from APP_VERSION ===');
ok('APP_VERSION found', !!APP_VERSION, String(APP_VERSION));
ok('registration passes APP_VERSION into the sw URL',
   /register\('sw\.js\?v=' \+ APP_VERSION/.test(html));
ok('sw derives its version from its own URL, not a second hardcoded constant',
   /searchParams\.get\('v'\)/.test(sw));
ok('cache name is built from that version', /const CACHE = 'fuelpost-' \+ VERSION/.test(sw));
ok('no hardcoded version literal in the cache name',
   !/'fuelpost-\d+\.\d+\.\d+'/.test(sw));
ok("registration disables the browser's HTTP cache for sw.js",
   /updateViaCache:\s*'none'/.test(html));

console.log('\n=== precache covers the real shell ===');
const libFiles = fs.readdirSync(path.join(root, 'lib')).filter(x => x.endsWith('.js')).sort();
const missing = libFiles.filter(x => !sw.includes(`'${x}'`));
ok(`every lib/*.js is precached (${libFiles.length} files)`, missing.length === 0, JSON.stringify(missing));
ok('lib entries are stamped with the version, so a new build misses the old cache',
   /lib\/\$\{f\}\?v=\$\{VERSION\}/.test(sw));
ok('index.html is precached', /'index\.html'/.test(sw));
const icons = fs.readdirSync(path.join(root, 'icons')).filter(x => x.endsWith('.png'));
const linked = [...html.matchAll(/href="(icons\/[^"]+)"/g)].map(m => m[1]);
ok(`every icon referenced by index.html is precached (${linked.length})`,
   linked.every(i => sw.includes(i)), JSON.stringify(linked.filter(i => !sw.includes(i))));

console.log('\n=== old caches are cleaned up ===');
ok('activate deletes every non-current fuelpost cache',
   /caches\.keys\(\)/.test(sw) && /n !== CACHE/.test(sw) && /caches\.delete/.test(sw));
ok('deletion is scoped to this app\'s caches', /startsWith\('fuelpost-'\)/.test(sw));

console.log('\n=== cross-origin is never cached ===');
ok('cross-origin requests pass straight through',
   /url\.origin !== self\.location\.origin/.test(sw) && /origin[\s\S]{0,60}return;/.test(sw));
ok('HERE mapsjs is NOT in the precache list', !/js\.api\.here\.com/.test(sw));
ok('only same-origin basic responses are cached at runtime',
   /res\.type === 'basic'/.test(sw));

console.log('\n=== takes over promptly rather than leaving a split brain ===');
ok('install calls skipWaiting', /skipWaiting\(\)/.test(sw));
ok('activate calls clients.claim', /clients\.claim\(\)/.test(sw));

console.log('\n=== registration is non-fatal ===');
ok('registration is guarded on support and secure context',
   /'serviceWorker' in navigator/.test(html) && /window\.isSecureContext/.test(html));
ok('registration failure is caught, not thrown', /register\([\s\S]{0,120}\.catch\(/.test(html));

console.log('\n=== offline indicator ===');
ok('online/offline events are wired', /addEventListener\('online'/.test(html) && /addEventListener\('offline'/.test(html));
ok('banner reflects navigator.onLine', /offlineBar'\)\.hidden = navigator\.onLine/.test(html));

console.log(`\n${p} passed, ${f} failed`);
if (f) process.exitCode = 1;
