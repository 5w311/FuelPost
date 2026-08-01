const { nextBaseLayer } = require('../lib/baselayer.js');
let pass = 0, fail = 0;
const ok = (n, c, e = '') => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.log('  FAIL', n, e); } };

// Stand-ins for the real HERE layer objects — identity is all that matters.
const light = { id:'vector.normal.map' };
const dark  = { id:'vector.normal.mapnight' };
const satellite = { id:'raster.satellite.map' };
const terrain   = { id:'raster.terrain.map' };
const L = { light, dark };

console.log('=== THE REPORTED BUG: satellite must survive a theme change ===');
ok('satellite + switch to dark  -> no layer change', nextBaseLayer(satellite, 'dark',  L) === null);
ok('satellite + switch to light -> no layer change', nextBaseLayer(satellite, 'light', L) === null);
ok('terrain + switch to dark    -> no layer change', nextBaseLayer(terrain,   'dark',  L) === null);
ok('terrain + switch to light   -> no layer change', nextBaseLayer(terrain,   'light', L) === null);
ok('unknown future layer is left alone too',
   nextBaseLayer({id:'something.new'}, 'dark', L) === null);

console.log('\n=== normal road layers still follow the theme (no regression) ===');
ok('light road + switch to dark  -> dark road',  nextBaseLayer(light, 'dark',  L) === dark);
ok('dark road  + switch to light -> light road', nextBaseLayer(dark,  'light', L) === light);

console.log('\n=== idempotent: already correct means no call at all ===');
ok('light road + light theme -> null (no redundant setBaseLayer)', nextBaseLayer(light, 'light', L) === null);
ok('dark road  + dark theme  -> null (no redundant setBaseLayer)', nextBaseLayer(dark,  'dark',  L) === null);

console.log('\n=== the exact four-case matrix from the bug report ===');
const cases = [
  ['satellite, was light, tapped Dark',  satellite, 'dark',  null],
  ['satellite, was dark,  tapped Light', satellite, 'light', null],
  ['satellite, was dark,  tapped Dark',  satellite, 'dark',  null],
  ['satellite, was light, tapped Light', satellite, 'light', null],
];
cases.forEach(([label, cur, theme, want]) => {
  const got = nextBaseLayer(cur, theme, L);
  ok(label + ' -> stays on satellite', got === want, 'got ' + JSON.stringify(got));
});

console.log('\n=== defensive: missing/odd inputs do not throw or force a change ===');
ok('null current layer -> null', nextBaseLayer(null, 'dark', L) === null);
ok('undefined current layer -> null', nextBaseLayer(undefined, 'light', L) === null);
ok('unrecognized theme string treated as light', nextBaseLayer(dark, 'sepia', L) === light);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
