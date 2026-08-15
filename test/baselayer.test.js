const { nextBaseLayer } = require('../lib/baselayer.js');
let pass = 0, fail = 0;
const ok = (n, c, e = '') => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.log('  FAIL', n, e); } };

// Stand-ins for the real HERE layer objects — identity is all that matters,
// which is the whole design: this module never inspects a layer, it only
// asks whether the layer it was handed is one of the ones it was told about.
const light = { id:'vector.normal.map' };
const dark  = { id:'vector.normal.mapnight' };
const hybridDay   = { id:'hybrid.day.raster' };
const hybridNight = { id:'hybrid.night.raster' };
const terrain     = { id:'raster.terrain.map' };
const bakedSat    = { id:'raster.satellite.map' };  // what Satellite USED to be

const ROAD   = { light, dark };
const HYBRID = { light: hybridDay, dark: hybridNight };
const L = { pairs: [ROAD, HYBRID] };                // what the app passes

// ---- WHAT HAPPENED TO THE OLD HEADLINE TESTS (read this before "fixing") ----
// Until v1.25.x the first section of this file was "THE REPORTED BUG:
// satellite must survive a theme change", and it asserted that satellite plus
// a theme change returned null — no layer change at all. Those assertions are
// gone, on purpose, and their absence is not a gap to be filled back in.
//
// v1.26.0 moved Satellite from a single baked raster (raster.satellite.map,
// road casings and labels burned into the JPEG) to HERE's hybrid stack, which
// ships day AND night variants. A themed view that ignores the theme would be
// the bug. So satellite now FOLLOWS the theme, and the section below pins that
// instead.
//
// The promise underneath never changed and is still pinned here: a theme
// change must not yank the driver off the view they are looking at. Before, on
// an unthemed layer, keeping that promise meant doing nothing. Now, on a
// themed one, it means swapping day for night and staying on satellite. The
// mechanism that makes both correct is the same one — an allow-list by
// identity — and the tests that matter most in this file are the ones proving
// a layer in NO pair is still untouched.

console.log('=== both themed pairs follow the theme (v1.26.0) ===');
ok('light road + switch to dark  -> dark road',  nextBaseLayer(light, 'dark',  L) === dark);
ok('dark road  + switch to light -> light road', nextBaseLayer(dark,  'light', L) === light);
ok('day satellite + switch to dark  -> night satellite',
   nextBaseLayer(hybridDay, 'dark', L) === hybridNight);
ok('night satellite + switch to light -> day satellite',
   nextBaseLayer(hybridNight, 'light', L) === hybridDay);

console.log('\n=== idempotent: already correct means no call at all ===');
// Returning null when nothing needs doing is also what makes the app's
// baselayerchange backstop self-terminating instead of a feedback loop.
ok('light road + light theme -> null (no redundant setBaseLayer)', nextBaseLayer(light, 'light', L) === null);
ok('dark road  + dark theme  -> null (no redundant setBaseLayer)', nextBaseLayer(dark,  'dark',  L) === null);
ok('day satellite + light theme -> null',   nextBaseLayer(hybridDay,   'light', L) === null);
ok('night satellite + dark theme -> null',  nextBaseLayer(hybridNight, 'dark',  L) === null);

console.log('\n=== THE PROPERTY THAT MUST NOT BREAK: a layer in no pair is left alone ===');
// This is the allow-list, and it is the reason the original bug (a theme
// change yanking the driver off whatever they were looking at) cannot come
// back in a new shape. Anything HERE offers that this app did not put on the
// map is the driver's business, not the theme's.
ok('terrain + switch to dark    -> no layer change', nextBaseLayer(terrain, 'dark',  L) === null);
ok('terrain + switch to light   -> no layer change', nextBaseLayer(terrain, 'light', L) === null);
ok('an unknown future layer is left alone too',
   nextBaseLayer({id:'something.new'}, 'dark', L) === null);
// The retired baked satellite raster is, deliberately, just another stranger
// now: if some path ever puts it back on the map, the theme leaves it alone
// rather than pretending it is half of a pair.
ok('the old baked satellite raster is in no pair, so it is untouched',
   nextBaseLayer(bakedSat, 'dark', L) === null && nextBaseLayer(bakedSat, 'light', L) === null);

console.log('\n=== the four-case matrix from the original bug report, re-answered ===');
// Same four taps as the v1.11.x report, now against the hybrid satellite. The
// expected answer changed from "stay put" to "stay on satellite, themed" —
// what has NOT changed is that none of them lands the driver on a road map.
const cases = [
  ['satellite, was light, tapped Dark',  hybridDay,   'dark',  hybridNight],
  ['satellite, was dark,  tapped Light', hybridNight, 'light', hybridDay],
  ['satellite, was dark,  tapped Dark',  hybridNight, 'dark',  null],
  ['satellite, was light, tapped Light', hybridDay,   'light', null],
];
cases.forEach(([label, cur, theme, want]) => {
  const got = nextBaseLayer(cur, theme, L);
  ok(label + ' -> stays on satellite', got === want, 'got ' + JSON.stringify(got));
  ok('   ...and never returns a road layer', got !== light && got !== dark);
});

console.log('\n=== the single-pair form still works (one caller, one shape) ===');
// The signature accepts a bare {light, dark} as well as {pairs:[...]}, so a
// caller with only one pair — and every pre-v1.26.0 call site — is unchanged.
ok('bare pair: light + dark theme -> dark', nextBaseLayer(light, 'dark', ROAD) === dark);
ok('bare pair: a stranger is still left alone', nextBaseLayer(hybridDay, 'dark', ROAD) === null);

console.log('\n=== defensive: missing/odd inputs do not throw or force a change ===');
ok('null current layer -> null', nextBaseLayer(null, 'dark', L) === null);
ok('undefined current layer -> null', nextBaseLayer(undefined, 'light', L) === null);
ok('unrecognized theme string treated as light', nextBaseLayer(dark, 'sepia', L) === light);
ok('unrecognized theme on satellite treated as light too',
   nextBaseLayer(hybridNight, 'sepia', L) === hybridDay);
// A pair the app could not build — a layer this SDK build didn't return — is
// skipped rather than thrown on, so a missing satellite pair cannot take the
// road pair down with it.
ok('a null pair in the list is skipped, not thrown on',
   nextBaseLayer(light, 'dark', { pairs: [null, ROAD] }) === dark);
ok('an empty pair list asks for nothing', nextBaseLayer(light, 'dark', { pairs: [] }) === null);
ok('no layers argument at all -> null, no throw', nextBaseLayer(light, 'dark') === null);
// A look-alike is not the layer: identity, never a name match.
ok('a look-alike object is not the light layer and is left alone',
   nextBaseLayer({ id:'vector.normal.map' }, 'dark', L) === null);
ok('a look-alike satellite object is left alone too',
   nextBaseLayer({ id:'hybrid.day.raster' }, 'dark', L) === null);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
