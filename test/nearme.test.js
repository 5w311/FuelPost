// Near Me: the ranking and bearing behind the STOPS-tab footer. Pure, so this
// runs with no DOM — but it uses the REAL haversine and the REAL DATA, because
// the invariants that matter are about actual stops at actual coordinates.
const fs = require('fs');
const path = require('path');
const N = require('../lib/nearme.js');
const { haversine } = require('../lib/fuelplan.js');
const { splitDataBlock, parseRowLine } = require('../tools/geocode.js');
let pass = 0, fail = 0;
const ok = (n, c, e = '') => { c ? (pass++, console.log('  PASS', n)) : (fail++, console.log('  FAIL', n, e)); };

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const DATA = splitDataBlock(html).rowLines.map(parseRowLine);
// The app's own exclusion, mirrored from index.html's source rather than
// hardcoded, so a change to CLOSED_STOP_IDS cannot leave this test behind.
const closedSrc = /const CLOSED_STOP_IDS = new Set\(\[([^\]]*)\]\)/.exec(html)[1];
const CLOSED = new Set(closedSrc.match(/'([^']+)'/g).map(s => s.slice(1, -1)));
const FUEL_STOPS = DATA.filter(r => r[11] !== 'term' && !CLOSED.has(r[0]))
  .map(r => ({ id: r[0], name: r[2], lat: r[9], lng: r[10], tier: r[11], row: r }));
const near = (lat, lng, limit) => N.nearestStops(lat, lng, FUEL_STOPS, haversine, limit);

console.log('=== bearing: the eight points, each from a due offset ===');
// From a point, step a degree in each direction and check the name. A sign
// error here is easy to write and easy to miss on a map, so all eight.
const O = [35, -90];
const cases = [
  ['N',  [36, -90]], ['NE', [36, -89]], ['E',  [35, -89]], ['SE', [34, -89]],
  ['S',  [34, -90]], ['SW', [34, -91]], ['W',  [35, -91]], ['NW', [36, -91]]
];
cases.forEach(([want, [lat, lng]]) => {
  const got = N.compassPoint(N.bearing(O[0], O[1], lat, lng));
  ok(`due ${want} reads ${want}`, got === want, `got ${got} (${N.bearing(O[0], O[1], lat, lng).toFixed(1)}deg)`);
});
ok('a point due north is 0 degrees', Math.abs(N.bearing(35, -90, 36, -90)) < 0.001);
ok('a point due south is 180 degrees', Math.abs(N.bearing(35, -90, 34, -90) - 180) < 0.001);
ok('due east is 90-ish', Math.abs(N.bearing(0, 0, 0, 1) - 90) < 0.001);

console.log('\n=== compassPoint boundaries: each point owns 45 degrees CENTRED on itself ===');
ok('0 -> N', N.compassPoint(0) === 'N');
ok('22 -> N (just inside)', N.compassPoint(22) === 'N');
ok('23 -> NE (just past the boundary)', N.compassPoint(23) === 'NE');
ok('359 -> N (wraps, not out of range)', N.compassPoint(359) === 'N');
ok('360 -> N', N.compassPoint(360) === 'N');
ok('negative degrees normalise', N.compassPoint(-45) === 'NW', N.compassPoint(-45));
// 725 - 720 = 5 degrees, which is N. (An earlier draft of this test guessed
// NE and was simply wrong about the arithmetic; the module was right.)
ok('720+ normalises', N.compassPoint(725) === 'N', N.compassPoint(725));
ok('  and 770 (=50deg) is NE', N.compassPoint(770) === 'NE', N.compassPoint(770));
ok('there are exactly eight points', N.COMPASS_POINTS.length === 8);

console.log('\n=== no NaN at the equator, the antimeridian, or on top of a stop ===');
// No Covenant stop is near any of these, but a NaN would render as "NaN mi"
// on a driver's screen, so they are cheap to rule out.
ok('identical points give a finite bearing, not NaN',
   Number.isFinite(N.bearing(35, -90, 35, -90)) && N.compassPoint(N.bearing(35, -90, 35, -90)) === 'N');
ok('across the antimeridian is finite and points EAST',
   Number.isFinite(N.bearing(0, 179.9, 0, -179.9)) && N.compassPoint(N.bearing(0, 179.9, 0, -179.9)) === 'E',
   String(N.bearing(0, 179.9, 0, -179.9)));
ok('back across it points WEST',
   N.compassPoint(N.bearing(0, -179.9, 0, 179.9)) === 'W');
ok('on the equator is finite', Number.isFinite(N.bearing(0, 0, 0, 10)));
ok('at a pole is finite', Number.isFinite(N.bearing(90, 0, 45, 10)));
ok('NaN input gives an empty direction rather than "NaN"', N.compassPoint(NaN) === '');
ok('a NaN position yields no results at all', near(NaN, -90).length === 0);
ok('a missing stop list yields none', N.nearestStops(35, -90, null, haversine).length === 0);

console.log('\n=== ordering is strictly by distance ===');
{
  // Sitting on top of TA Amarillo.
  const r = near(35.1916, -101.7589, 4);
  ok('returns four', r.length === 4, String(r.length));
  ok('>>> nearest first, distances ascending',
     r.every((x, i) => i === 0 || r[i - 1].miles <= x.miles), JSON.stringify(r.map(x => +x.miles.toFixed(1))));
  ok('  the stop underfoot is first and essentially zero miles',
     r[0].stop.id === 'TX1' && r[0].miles < 1, JSON.stringify([r[0].stop.id, r[0].miles]));
  ok('  every result carries a distance, a bearing and a direction',
     r.every(x => Number.isFinite(x.miles) && Number.isFinite(x.bearing) && /^(N|NE|E|SE|S|SW|W|NW)$/.test(x.direction)));
  ok('  and the row, so the caller can open the station sheet',
     r.every(x => Array.isArray(x.stop.row) && x.stop.row.length > 20));
  // No tier, brand or amenity weighting: the order is distance and nothing else.
  const byDist = [...r].sort((a, b) => a.miles - b.miles).map(x => x.stop.id);
  ok('>>> no tier or brand preference perturbs the order',
     JSON.stringify(r.map(x => x.stop.id)) === JSON.stringify(byDist));
}

console.log('\n=== closed stops and terminals never appear ===');
{
  // TN6 is the Covenant HQ terminal; IN1 is TA Gary, closed for fuel with only
  // its parking open. Stand next to each and confirm neither is ever the
  // answer. (This used to stand at TA Corning, which v1.31.0 deleted from DATA
  // as a data-collection error — so the fixture moved to the row that is
  // actually closed rather than being dropped.)
  const atTerminal = near(35.0083, -85.3906, 4);
  ok('>>> the HQ terminal is not offered as fuel',
     !atTerminal.some(x => x.stop.id === 'TN6'), JSON.stringify(atTerminal.map(x => x.stop.id)));
  const in1 = DATA.find(r => r[0] === 'IN1');
  ok('  fixture: the closed row is still in DATA to stand on', !!in1);
  const atClosed = near(in1[9], in1[10], 4);
  ok('>>> the closed stop is not offered either',
     !atClosed.some(x => x.stop.id === 'IN1'), JSON.stringify(atClosed.map(x => x.stop.id)));
  // Petro Gary, 2.5 mi east — the same stop TA Gary's own sheet points at, so
  // the footer and the banner cannot disagree about the alternative.
  ok('  and standing on it, the nearest OPEN stop is offered instead',
     atClosed[0].stop.id === 'IN2', atClosed[0].stop.id);
  ok('no closed id appears anywhere in the ranked network',
     !FUEL_STOPS.some(s => CLOSED.has(s.id)));
  ok('no terminal appears either', !FUEL_STOPS.some(s => s.tier === 'term'));
}

console.log('\n=== THE INVARIANT MOST LIKELY TO BE BROKEN LATER: filters are ignored ===');
// nearestStops takes the stop list and a distance function. It takes NO filter
// state, and there is no way to pass any. This asserts the shape, because the
// failure mode is a future reader "helpfully" wiring it into passes().
{
  ok('>>> nearestStops accepts no filter argument (arity is 5: lat,lng,stops,dist,limit)',
     N.nearestStops.length === 4, String(N.nearestStops.length));   // limit has a default
  // Same position, same answer, regardless of what a filtered list would be.
  const all = near(32.6536, -96.7516, 4).map(x => x.stop.id);
  const restaurantsOnly = FUEL_STOPS.filter(s => String(s.row[16] || '').split(',').some(c => c.trim() === 'R'));
  const filtered = N.nearestStops(32.6536, -96.7516, restaurantsOnly, haversine, 4).map(x => x.stop.id);
  ok('  a filtered list WOULD give a different answer...',
     JSON.stringify(all) !== JSON.stringify(filtered), JSON.stringify([all, filtered]));
  ok('>>> ...which is exactly why the app must pass the FULL list, never the filtered one',
     all.length === 4);
  // And the module holds no state that could remember a filter between calls.
  ok('  repeated calls are identical (no hidden state)',
     JSON.stringify(near(32.6536, -96.7516, 4).map(x => x.stop.id)) === JSON.stringify(all));
}

console.log('\n=== the hard cap ===');
ok('the cap is 200 miles', N.NEARBY_CAP_MI === 200, String(N.NEARBY_CAP_MI));
ok('the cap sits in the 150-250 band the brief allowed',
   N.NEARBY_CAP_MI >= 150 && N.NEARBY_CAP_MI <= 250);
ok('just inside the cap is nearby', N.isNearby(199.9) === true);
ok('>>> exactly at the cap is still nearby (<=, not <)', N.isNearby(200) === true);
ok('>>> a mile past it is not', N.isNearby(200.1) === false);
ok('zero is nearby', N.isNearby(0) === true);
ok('NaN is never nearby', N.isNearby(NaN) === false);
ok('the cap is overridable for testing without editing the module',
   N.isNearby(100, 50) === false && N.isNearby(40, 50) === true);
{
  // Deep in the New Mexico gap — the real place this message exists for.
  const r = near(34.9, -106.0, 4);
  ok('>>> in the New Mexico gap the nearest is beyond the cap',
     !N.isNearby(r[0].miles), `${r[0].miles.toFixed(0)} mi to ${r[0].stop.name}`);
  ok('  but the panel still HAS an answer to show', r.length === 4 && Number.isFinite(r[0].miles));
  console.log(`   nearest from mid-New-Mexico: ${r[0].miles.toFixed(0)} mi ${r[0].direction} to ${r[0].stop.name}`);
  // Somewhere ordinary, the cap must not fire.
  const dal = near(32.6536, -96.7516, 1);
  ok('  and in Dallas it is comfortably inside the cap', N.isNearby(dal[0].miles),
     `${dal[0].miles.toFixed(1)} mi`);
}

console.log('\n=== fewer candidates than asked for ===');
{
  const two = [FUEL_STOPS[0], FUEL_STOPS[1]];
  const r = N.nearestStops(35, -90, two, haversine, 4);
  ok('asking for four from a two-stop network returns two, not padding',
     r.length === 2, String(r.length));
  ok('an empty network returns an empty list, not a throw',
     N.nearestStops(35, -90, [], haversine, 4).length === 0);
  ok('a limit of one returns exactly one', near(35, -90, 1).length === 1);
  ok('a limit of zero returns none', near(35, -90, 0).length === 0);
  ok('a negative limit returns none rather than reversing the slice',
     near(35, -90, -3).length === 0);
}

console.log('\n=== distances agree with the app\'s own haversine ===');
{
  const r = near(32.6536, -96.7516, 1)[0];
  const direct = haversine(32.6536, -96.7516, r.stop.lat, r.stop.lng);
  ok('>>> the mileage is the real haversine, to the foot',
     Math.abs(r.miles - direct) < 1e-9, `${r.miles} vs ${direct}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
