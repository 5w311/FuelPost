// Brief: widen the search before declaring a fuel gap.
// The provided test drives against a fixture stops.json; that fixture wasn't
// shipped with the brief, and building one by hand risks drifting from the
// real station data. Instead this derives the same {id,name,lat,lng,tier,row}
// shape straight from the live DATA array in index.html (144 fuel stops,
// terminals excluded) — the exact set the app plans against, always in sync.

const fs = require('fs');
const path = require('path');
const { splitDataBlock, parseRowLine } = require('../tools/geocode.js');
const { planAdaptive, stopsNearPickup } = require('../lib/fuelplan-adaptive.js');
const { cumulativeMiles } = require('../lib/fuelplan.js');

let p = 0, f = 0;
const ok = (n, c, e = '') => { c ? (p++, console.log('  PASS', n)) : (f++, console.log('  FAIL', n, e)); };

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const DATA = splitDataBlock(html).rowLines.map(parseRowLine);
const stops = DATA.filter(r => r[11] !== 'term').map(r => ({
  id: r[0], name: r[2], lat: r[9], lng: r[10], tier: r[11], row: r
}));

// Approximate I-80 SLC -> Toledo waypoints, as provided with the brief.
const i80 = [
 [40.740,-111.993],[40.780,-111.900],[41.100,-111.550],[41.250,-111.000],
 [41.300,-110.550],[41.290,-110.000],[41.310,-109.500],[41.590,-109.220],
 [41.660,-108.700],[41.760,-108.200],[41.780,-107.200],[41.760,-106.300],
 [41.640,-105.600],[41.310,-105.100],[41.160,-104.700],[41.196,-104.355],
 [41.180,-103.700],[41.140,-103.000],[41.130,-102.300],[41.010,-101.700],
 [40.930,-100.900],[40.800,-100.000],[40.760,-99.200],[40.800,-98.500],
 [40.870,-97.800],[41.000,-97.000],[41.130,-96.200],[41.230,-95.860],
 [41.520,-95.000],[41.590,-94.000],[41.600,-93.200],[41.660,-92.400],
 [41.700,-91.500],[41.740,-90.600],[41.600,-90.000],[41.520,-89.000],
 [41.590,-88.200],[41.700,-87.700],[41.700,-86.900],[41.700,-86.000],
 [41.650,-85.000],[41.700,-84.400],[41.630,-83.680]
];
const routeMiles = cumulativeMiles(i80).at(-1);
const PU = [40.7395, -111.9930];

console.log('\n=== adaptive tolerance on the reported SLC -> Toledo lane ===');
const strict = planAdaptive(i80, routeMiles, stops, 500, 0, [8]);
ok('strict 8mi alone strands the driver', !strict.ok, JSON.stringify(strict.gap));
const adapt = planAdaptive(i80, routeMiles, stops, 500, 0);
ok('adaptive finds a complete plan', adapt.ok, JSON.stringify(adapt.gap));
ok('and it escalated past 8mi', adapt.detourMax > 8, 'used ' + adapt.detourMax);
console.log(`  -> solved at ${adapt.detourMax} mi tolerance, ${adapt.plan.length} stops`);
adapt.plan.forEach(s => console.log(`     mile ${s.mile.toFixed(0).padStart(4)}  ${s.name} (${s.detour.toFixed(1)} mi off)`));

console.log('\n=== tight routes must NOT be widened unnecessarily ===');
const i40 = [[35.189,-114.053],[35.198,-111.651],[34.902,-110.159],[35.084,-106.650],
             [35.190,-102.200],[35.222,-101.360],[35.400,-98.700],[35.467,-97.516]];
const rm40 = cumulativeMiles(i40).at(-1);
const a40 = planAdaptive(i40, rm40, stops, 800, 0);
ok('I-40 @800 solves at the tightest tier', a40.ok && a40.detourMax === 8, 'used ' + a40.detourMax);

console.log('\n=== nearest stops to the reported pickup ===');
const near = stopsNearPickup(PU[0], PU[1], stops, 50);
ok('finds TA Tooele near the SLC pickup', near.length > 0 && near[0].name === 'TA Tooele', JSON.stringify(near.map(s => s.name)));
ok('  and reports it under 20 mi out', near[0].fromPickup < 20, near[0].fromPickup.toFixed(1));
console.log(`     ${near[0].name} — ${near[0].fromPickup.toFixed(1)} mi from the shipper`);

console.log('\n=== genuine dead zone still reports a gap ===');
const nowhere = [[48.9,-104.5],[48.9,-103.0],[48.9,-101.5]]; // rural far-north MT/ND
const rmN = cumulativeMiles(nowhere).at(-1);
const aN = planAdaptive(nowhere, rmN, stops, 60, 0);  // route is ~136mi, range 60 -> must fuel, nothing there
ok('does not invent a stop where none exists', !aN.ok);

// ---------------------------------------------------------------------------
// Added for this brief: confirm the default tiers argument is really [8,15,30]
// (not a placeholder that happens to behave similarly), and that a route
// solvable at the tightest tier never reports as widened — this is exactly
// the flag index.html's UI checks (`detourMax > 8`) before showing the
// "this plan uses stops up to N miles off" note. A wrong default here would
// either silently widen every route or silently narrow the reported gap.
console.log('\n=== default tiers is exactly [8, 15, 30] ===');
{
  const withDefault = planAdaptive(i80, routeMiles, stops, 500, 0);
  const withExplicit = planAdaptive(i80, routeMiles, stops, 500, 0, [8, 15, 30]);
  ok('omitting tiers matches passing [8,15,30] explicitly (detourMax)',
     withDefault.detourMax === withExplicit.detourMax,
     `${withDefault.detourMax} vs ${withExplicit.detourMax}`);
  ok('  and the chosen plan is identical',
     JSON.stringify(withDefault.plan.map(s => s.id)) === JSON.stringify(withExplicit.plan.map(s => s.id)),
     JSON.stringify({ default: withDefault.plan.map(s => s.id), explicit: withExplicit.plan.map(s => s.id) }));

  // A tier list missing 15 would jump straight to 30 on this lane — proves the
  // default really walks 8 -> 15 -> 30 in order rather than skipping ahead.
  const skip15 = planAdaptive(i80, routeMiles, stops, 500, 0, [8, 30]);
  ok('  removing 15 from the tier list changes which tolerance solves it',
     skip15.detourMax !== withDefault.detourMax || skip15.detourMax === 30,
     `skip15 used ${skip15.detourMax}, default used ${withDefault.detourMax}`);

  ok('a route solvable at 8mi reports detourMax===8 (UI must not call this "widened")',
     a40.detourMax === 8 && !(a40.detourMax > 8), 'used ' + a40.detourMax);
}

console.log(`\n${p} passed, ${f} failed`);
if (f) process.exitCode = 1;
