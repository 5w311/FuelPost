// Guards the regression that lost the fuel book revision: in v1.1.0 the app
// version was placed in the header subtitle and replaced "Rev 01-2026" instead
// of joining it, leaving no indication anywhere of which edition of the Covenant
// fuel book the 146 stations came from. These are two different facts and they
// belong in two different places — the revision where the driver reads it, the
// build number in the legend as a support detail.

const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name, extra); }
};

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');

const appVerDecl = html.match(/^const APP_VERSION = '([^']+)';$/m);
const revDecl = html.match(/^const FUEL_BOOK_REV = '([^']+)';$/m);

console.log('\n=== two constants, one each, visibly separate ===');
ok('APP_VERSION declared', !!appVerDecl, 'not found');
ok('FUEL_BOOK_REV declared', !!revDecl, 'not found');
ok('APP_VERSION declared exactly once',
   (html.match(/const APP_VERSION\s*=/g) || []).length === 1);
ok('FUEL_BOOK_REV declared exactly once',
   (html.match(/const FUEL_BOOK_REV\s*=/g) || []).length === 1);

const APP_VERSION = appVerDecl && appVerDecl[1];
const FUEL_BOOK_REV = revDecl && revDecl[1];
ok('fuel book revision is a Rev NN-YYYY string', /^Rev \d{2}-\d{4}$/.test(FUEL_BOOK_REV), FUEL_BOOK_REV);
ok('app version is semver', /^\d+\.\d+\.\d+$/.test(APP_VERSION), APP_VERSION);
ok('the two values are not the same string', APP_VERSION !== FUEL_BOOK_REV);

console.log('\n=== header subtitle carries the revision, not the build ===');
const subtitle = (html.match(/<div class="titles">[\s\S]*?<\/div>/) || [''])[0];
ok('header subtitle renders #fuelBookRev', /id="fuelBookRev"/.test(subtitle), subtitle);
ok('header subtitle does NOT contain #appVer', !/id="appVer"/.test(subtitle), subtitle);
ok('header subtitle has no hardcoded v-number',
   !/\bv\d+\.\d+\.\d+/.test(subtitle), subtitle);
// v1.3.0 removed the header's compliance line as a duplicate. The rule itself
// must still be stated exactly once, in the legend card, alongside the Driver
// Support number — dedup was the point, dropping the rule was not.
ok('header no longer duplicates the compliance line', !/100% compliance required/.test(subtitle), subtitle);
ok('  the compliance rule is still stated in the legend',
   /Fuel only at network stops/.test(html), 'legend note missing');
ok('  and it appears exactly once in the app',
   (html.match(/Fuel only at network stops/g) || []).length === 1,
   String((html.match(/Fuel only at network stops/g) || []).length));

console.log('\n=== build number lives in the legend card ===');
const legend = (html.match(/<div id="legendCard">[\s\S]*?\n {4}<\/div>/) || [''])[0];
ok('legend card contains #appVer', /id="appVer"/.test(legend), legend.slice(0, 200));
ok('  and it sits after the Driver Support note',
   legend.indexOf('423-463-3680') < legend.indexOf('id="appVer"'),
   `support at ${legend.indexOf('423-463-3680')}, appVer at ${legend.indexOf('id="appVer"')}`);
ok('#appVer appears exactly once in the markup',
   (html.match(/id="appVer"/g) || []).length === 1);
ok('#fuelBookRev appears exactly once in the markup',
   (html.match(/id="fuelBookRev"/g) || []).length === 1);

console.log('\n=== both rendered from the constants, never hardcoded twice ===');
// v1.9.0 made #appVer tappable (check-for-update), so its idle text now
// comes from renderAppVer() rather than a single direct assignment — still
// built from the same 'FuelPost v' + APP_VERSION concatenation, just inside
// a function that also handles the update-available state.
ok('appVer idle text is built from APP_VERSION',
   /appVerBtn\.textContent = appVerUpdateTo[\s\S]{0,160}'FuelPost v' \+ APP_VERSION/.test(html));
ok('fuelBookRev text is built from FUEL_BOOK_REV',
   /getElementById\('fuelBookRev'\)\.textContent = FUEL_BOOK_REV/.test(html));
// The literal version must appear only in its own declaration — plus the
// deliberate ?v= cache-bust stamps on the lib URLs, which are copies BY
// DESIGN and are held in sync with APP_VERSION by cachebust.test.js. Strip
// those first so this guard still catches any OTHER stray hardcoded copy.
const htmlSansStamps = html.split(`?v=${APP_VERSION}`).join('?v=');
ok(`version string "${APP_VERSION}" appears once outside the ?v= stamps`,
   (htmlSansStamps.match(new RegExp(APP_VERSION.replace(/\./g, '\\.'), 'g')) || []).length === 1);
ok(`revision string "${FUEL_BOOK_REV}" appears once in index.html`,
   (html.match(new RegExp(FUEL_BOOK_REV, 'g')) || []).length === 1);

console.log('\n=== README tracks both ===');
ok(`README has a v${APP_VERSION} version history entry`,
   new RegExp(`^### v${APP_VERSION.replace(/\./g, '\\.')}$`, 'm').test(readme), APP_VERSION);
ok('README mentions the fuel book revision', readme.includes(FUEL_BOOK_REV), FUEL_BOOK_REV);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
