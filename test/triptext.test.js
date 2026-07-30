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
ok('shows both ranges when they differ', t1.includes('fuel before 800 mi') && t1.includes('500 mi leaving the shipper'));
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
ok('same-range: only one range line shown', !t2.includes('leaving the shipper'));
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

console.log('\n=== missing optional fields do not throw or print garbage ===');
const t4 = formatTripText({ pickupAddr:'A', deliveryAddr:'B', maxRange:800, plan:[], gap:null });
ok('minimal input does not throw', typeof t4 === 'string');
ok('minimal input has no undefined text', !t4.includes('undefined'));

console.log(`\n${p} passed, ${f} failed`);
