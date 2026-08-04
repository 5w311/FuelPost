const { trafficCorrection } = require('../lib/trafficlayer.js');
let p=0,f=0; const ok=(n,c,e='')=>{c?(p++,console.log('  PASS',n)):(f++,console.log('  FAIL',n,e));};
const L = { light:{i:'map'}, dark:{i:'mapnight'}, trafficBase:{i:'traffic'},
            trafficIncidents:{i:'trafficincidents'}, trafficOverlay:{i:'traffic.map'} };

console.log('=== THE REPORTED BUG: traffic toggle in dark mode ===');
let r = trafficCorrection(L.trafficBase, 'dark', L);
ok('base is forced back to the DARK road layer', r.setBase === L.dark);
ok('traffic still gets shown, as an overlay', r.addOverlay === L.trafficOverlay);
r = trafficCorrection(L.trafficIncidents, 'dark', L);
ok('incidents toggle behaves the same way', r.setBase === L.dark && r.addOverlay === L.trafficOverlay);

console.log('\n=== light mode still works normally ===');
r = trafficCorrection(L.trafficBase, 'light', L);
ok('light theme keeps the light road base', r.setBase === L.light);
ok('and still gets the traffic overlay', r.addOverlay === L.trafficOverlay);

console.log('\n=== turning traffic OFF removes the overlay ===');
r = trafficCorrection(L.dark, 'dark', L);
ok('dark road layer, dark theme -> no base change needed', r.setBase === null);
ok('overlay is removed', r.removeOverlay === L.trafficOverlay);
r = trafficCorrection(L.light, 'dark', L);
ok('landed on LIGHT road while dark -> corrected to dark (satellite-bug case)', r.setBase === L.dark);
ok('  and overlay removed too', r.removeOverlay === L.trafficOverlay);

console.log('\n=== satellite / terrain are never touched ===');
ok('satellite in dark mode -> null', trafficCorrection({i:'satellite'}, 'dark', L) === null);
ok('terrain in light mode -> null', trafficCorrection({i:'terrain'}, 'light', L) === null);
ok('unknown future layer -> null', trafficCorrection({i:'whatever'}, 'dark', L) === null);

console.log('\n=== defensive ===');
ok('null current layer -> null', trafficCorrection(null, 'dark', L) === null);
ok('unrecognised theme treated as light', trafficCorrection(L.trafficBase, 'sepia', L).setBase === L.light);

console.log(`\n${p} passed, ${f} failed`);
if (f) process.exitCode = 1;
