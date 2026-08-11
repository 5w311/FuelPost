const { formatTripText } = require('../lib/triptext.js');
let p=0,f=0; const ok=(n,c,e='')=>{c?(p++,console.log('  PASS',n)):(f++,console.log('  FAIL',n,e));};

console.log('=== normal multi-stop plan ===');
const t1 = formatTripText({
  pickupAddr: '1234 South 3200 West, Salt Lake City, UT 84104',
  deliveryAddr: '5330 Angola Rd, Toledo, OH 43615',
  maxRange: 800, rangeAtPickup: 500,
  plan: [
    {name:'TA Cheyenne', mile:423, legMiles:423, tier:'prim'},
    {name:'TA Council Bluffs', mile:881, legMiles:458, tier:'prim'},
  ],
  gap: null, finalLegMiles: 151, detourMax: 15,
  appVersion: '1.1.2', fuelBookRev: 'Rev 01-2026'
});
console.log(t1);
ok('has header', t1.startsWith('FUELPOST TRIP PLAN'));
ok('has both addresses', t1.includes('Salt Lake City') && t1.includes('Toledo'));
ok('no Range section', !t1.includes('Range:') && !t1.includes('leaving the shipper'));
ok('numbers stops 1 and 2', t1.includes('1. TA Cheyenne') && t1.includes('2. TA Council Bluffs'));
ok('includes leg miles', t1.includes('(423 mi leg)'));
ok('includes widened-detour note', t1.includes('up to 15 mi off'));
ok('includes final leg', t1.includes('Final leg to delivery: 151 mi'));
ok('no gap warning when there is no gap', !t1.includes('WARNING'));
ok('includes version and rev footer', t1.includes('FuelPost v1.1.2') && t1.includes('Rev 01-2026'));
ok('no accidental [object Object]', !t1.includes('[object'));
ok('no undefined leaking through', !t1.includes('undefined'));

console.log('\n=== zero-stop plan (short load) ===');
const t2 = formatTripText({
  pickupAddr: 'A', deliveryAddr: 'B', maxRange: 800, rangeAtPickup: 800,
  plan: [], gap: null, finalLegMiles: 380, detourMax: 8
});
ok('no Range section even when maxRange/rangeAtPickup match', !t2.includes('Range:'));
ok('states no stop needed', t2.includes('No fuel stop needed'));
ok('does not print a bogus final-leg line for zero stops', !t2.includes('Final leg to delivery'));

console.log('\n=== gapped plan ===');
const t3 = formatTripText({
  pickupAddr: 'Kingman AZ', deliveryAddr: 'Oklahoma City OK',
  maxRange: 450, rangeAtPickup: 450,
  plan: [{name:'TA Holbrook', mile:220, legMiles:220, tier:'excl'}],
  gap: {fromMile:220, deadMile:670}, finalLegMiles: null, detourMax: 30
});
ok('shows partial plan before the gap', t3.includes('1. TA Holbrook'));
ok('shows the warning with correct mile range', t3.includes('mile 220 and mile 670'));
ok('includes Driver Support number', t3.includes('423-463-3680'));
ok('does not print a final-leg line when the load cannot complete', !t3.includes('Final leg to delivery'));

console.log('\n=== exclusive tier tag ===');
ok('tags Exclusive stops', t3.includes('[Exclusive]'));
ok('does not tag primary stops', !t1.includes('[Exclusive]'));

console.log('\n=== optional routeLabel (only set when alternatives existed) ===');
const t5 = formatTripText({
  pickupAddr: 'A', deliveryAddr: 'B', routeLabel: 'via I-40',
  plan: [{name:'TA Holbrook', mile:220, legMiles:220, tier:'prim'}],
  gap: null, finalLegMiles: 100, detourMax: 8
});
ok('names the route when a label is given', t5.includes('Route:    via I-40'));
ok('the label sits with the addresses, above the stops',
   t5.indexOf('Route:') > t5.indexOf('Delivery:') && t5.indexOf('Route:') < t5.indexOf('FUEL STOPS'));
ok('no Route line when no label (the single-route case is unchanged)',
   !t1.includes('Route:') && !t2.includes('Route:') && !t3.includes('Route:'));

console.log('\n=== optional vehicle profile (only set when not Standard) ===');
const t6 = formatTripText({
  pickupAddr: 'A', deliveryAddr: 'B', vehicle: 'Hazmat — all classes declared',
  plan: [], gap: null, finalLegMiles: 200, detourMax: 8
});
ok('names the vehicle profile when given', t6.includes('Vehicle:  Hazmat — all classes declared'));
ok('no Vehicle line on a Standard plan (existing output unchanged)',
   !t1.includes('Vehicle:') && !t2.includes('Vehicle:') && !t3.includes('Vehicle:'));

console.log('\n=== post-gap continuation (only ever set alongside a gap) ===');
const t7 = formatTripText({
  pickupAddr: 'Wendell ID', deliveryAddr: 'Gainesville FL',
  plan: [{name:'TA Tooele', mile:241, legMiles:241, tier:'excl'}],
  gap: {fromMile:242, deadMile:1117},
  postGapPlan: [
    {name:'TA Amarillo', mile:1150, legMiles:908, tier:'prim'},
    {name:'TA Dallas South', mile:1520, legMiles:370, tier:'prim'}
  ],
  postGapFinalLegMiles: 300, finalLegMiles: null, detourMax: 50
});
ok('names the after-the-gap section and its precondition',
   t7.includes('AFTER THE GAP') && t7.includes('out-of-network fuel above first'));
ok('post-gap numbering continues from the reachable stops',
   t7.includes('2. TA Amarillo — mile 1150') && t7.includes('3. TA Dallas South'));
ok('post-gap section sits after the gap warning',
   t7.indexOf('AFTER THE GAP') > t7.indexOf('WARNING'));
ok('post-gap final leg reported', t7.includes('Final leg to delivery: 300 mi'));
ok('gapped trips without a continuation are unchanged',
   !t3.includes('AFTER THE GAP'));
const t8 = formatTripText({
  pickupAddr: 'A', deliveryAddr: 'B',
  plan: [], gap: {fromMile:0, deadMile:400},
  postGapPlan: [{name:'S1', mile:450, legMiles:450, tier:'prim'}],
  postGapSecondGap: {fromMile:450, deadMile:1325}, detourMax: 50
});
ok('a second gap after the continuation is named',
   t8.includes('SECOND gap between mile 450 and mile 1325'));

console.log('\n=== short-trip extras (only ever set on a no-stop plan) ===');
const t9 = formatTripText({
  pickupAddr: 'Orlando FL', deliveryAddr: 'Richmond Hill GA',
  plan: [], gap: null, finalLegMiles: 241, detourMax: 8,
  arrivalRange: 634, nearestToDelivery: { name: 'TA Baldwin', miles: 121 }
});
ok('carries the arrival range', t9.includes('You arrive with about 634 mi of range.'));
ok('carries nearest network fuel to delivery',
   t9.includes('Nearest network fuel to delivery: TA Baldwin, 121 mi away.'));
ok('still leads with the no-stop line, extras after it',
   t9.indexOf('No fuel stop needed') < t9.indexOf('You arrive with about'));
ok('no-stop output without the fields is unchanged (t2 has neither line)',
   !t2.includes('You arrive with about') && !t2.includes('Nearest network fuel'));
ok('a plan WITH stops never grows these lines even if the fields leak through',
   (() => { const t = formatTripText({ pickupAddr:'A', deliveryAddr:'B',
     plan:[{name:'S1', mile:100, legMiles:100, tier:'prim'}], gap:null, finalLegMiles:50,
     arrivalRange: 634, nearestToDelivery: { name:'X', miles: 2 } });
     return !t.includes('You arrive with about') && !t.includes('Nearest network fuel'); })());

console.log('\n=== nav codes on stop lines (v1.21.0) ===');
// Byte-exact on the whole line, not a substring: the point of putting the
// code here is that a driver can read it off a pasted message, so the
// separator and the label are part of the contract, not incidental.
const tn = formatTripText({
  pickupAddr: 'A', deliveryAddr: 'B',
  plan: [
    {name:'TA Cheyenne', mile:423, legMiles:423, tier:'prim', nav:'CVENTA260'},
    {name:'TA Holbrook', mile:881, legMiles:458, tier:'excl', nav:'CVENTA016'}
  ],
  gap: null, finalLegMiles: 151, detourMax: 8
});
console.log(tn);
ok('a plan stop line carries its nav code, exactly',
   tn.includes('1. TA Cheyenne — mile 423  (423 mi leg)  Nav code CVENTA260'),
   tn.split('\n').find(l => l.startsWith('1.')));
ok('the code lands AFTER the tier badge, so the line shape is unchanged up to it',
   tn.includes('2. TA Holbrook — mile 881  (458 mi leg)  [Exclusive]  Nav code CVENTA016'),
   tn.split('\n').find(l => l.startsWith('2.')));
ok('the code is labelled the same way the card and the station sheet label it',
   !/\bNav [A-Z]{4}/.test(tn) && tn.includes('Nav code '));

// Post-gap stops get the same treatment — the section a gapped plan needs
// most, since those are the stops the approval call is about.
const tng = formatTripText({
  pickupAddr: 'A', deliveryAddr: 'B',
  plan: [{name:'TA Tooele', mile:241, legMiles:241, tier:'excl', nav:'CVENTA555'}],
  gap: {fromMile:242, deadMile:1117},
  postGapPlan: [{name:'TA Amarillo', mile:1150, legMiles:908, tier:'prim', nav:'CVENTA777'}],
  postGapFinalLegMiles: 300, finalLegMiles: null, detourMax: 50
});
ok('a post-gap stop line carries its nav code, exactly',
   tng.includes('2. TA Amarillo — mile 1150  (908 mi leg)  Nav code CVENTA777'),
   tng.split('\n').find(l => l.startsWith('2.')));
ok('the pre-gap stop in the same trip still carries its own',
   tng.includes('1. TA Tooele — mile 241  (241 mi leg)  [Exclusive]  Nav code CVENTA555'));

// THE GUARD: this formatter is pure and tested without DATA, so it must not
// assume the caller mapped the field on. Absent means no tag at all — never
// a trailing separator or a "Nav code undefined".
const tnm = formatTripText({
  pickupAddr: 'A', deliveryAddr: 'B',
  plan: [{name:'S1', mile:100, legMiles:100, tier:'prim'}],
  gap: {fromMile:101, deadMile:900},
  postGapPlan: [{name:'S2', mile:950, legMiles:850, tier:'prim'}],
  postGapFinalLegMiles: 40, detourMax: 8
});
ok('>>> a stop with no nav field prints no label and no dangling separator',
   tnm.includes('1. S1 — mile 100  (100 mi leg)\n'),
   tnm.split('\n').find(l => l.startsWith('1.')));
ok('>>> same for a post-gap stop with no nav field',
   tnm.includes('2. S2 — mile 950  (850 mi leg)\n'),
   tnm.split('\n').find(l => l.startsWith('2.')));
ok('no "Nav code" text appears anywhere when no entry has one', !tnm.includes('Nav code'));
ok('nothing prints undefined', !tnm.includes('undefined'));
// The pre-existing fixtures never set nav, so their output must be untouched.
ok('plans built without nav are byte-identical to before this feature',
   !t1.includes('Nav code') && !t3.includes('Nav code') && !t7.includes('Nav code'));

console.log('\n=== missing optional fields do not throw or print garbage ===');
const t4 = formatTripText({ pickupAddr:'A', deliveryAddr:'B', maxRange:800, plan:[], gap:null });
ok('minimal input does not throw', typeof t4 === 'string');
ok('minimal input has no undefined text', !t4.includes('undefined'));

console.log(`\n${p} passed, ${f} failed`);
