const V = require('../lib/vehicleprofile.js');
let p=0,f=0; const ok=(n,c,e='')=>{c?(p++,console.log('  PASS',n)):(f++,console.log('  FAIL',n,e));};

console.log('=== unit conversion (a silent error here is a wrong-road bug) ===');
ok("13'6\" (162in) -> 412cm (411.48 rounded UP)", V.inToCm(162) === 412, V.inToCm(162));
ok("8'6\" (102in) -> 260cm, matching CFR 658.15's own 2.6m equivalent", V.inToCm(102) === 260, V.inToCm(102));
ok("70ft (840in) -> 2134cm", V.inToCm(840) === 2134, V.inToCm(840));
ok('80,000 lb -> 36,288 kg (36287.39 rounded UP)', V.lbToKg(80000) === 36288, V.lbToKg(80000));
ok('never returns a fraction', Number.isInteger(V.inToCm(13.7)) && Number.isInteger(V.lbToKg(1234.5)));

console.log('  -- rounding DIRECTION: under-declaring is the unsafe error --');
for(const inches of [100, 101, 102, 161, 162, 163]){
  const cm = V.inToCm(inches);
  ok(`${inches}in -> ${cm}cm is >= true ${(inches*2.54).toFixed(2)}cm`, cm >= inches*2.54);
}
for(const lb of [79999, 80000, 80001, 45000]){
  const kg = V.lbToKg(lb);
  ok(`${lb}lb -> ${kg}kg is >= true ${(lb*0.45359237).toFixed(2)}kg`, kg >= lb*0.45359237);
}

console.log('\n=== standard non-hazmat profile (the default) ===');
let q = V.vehicleParams({});
ok('height sent', q['vehicle[height]'] === '412');
ok('width sent', q['vehicle[width]'] === '260');
ok('length sent', q['vehicle[length]'] === '2134');
ok('grossWeight sent', q['vehicle[grossWeight]'] === '36288');
ok('NO hazmat param when not hauling', !('vehicle[shippedHazardousGoods]' in q));

console.log('\n=== hazmat profile ===');
q = V.vehicleParams({ hazmat: ['flammable'] });
ok('single class sent', q['vehicle[shippedHazardousGoods]'] === 'flammable');
ok('dimensions still sent alongside hazmat', q['vehicle[height]'] === '412');
q = V.vehicleParams({ hazmat: ['explosive','flammable','poison'] });
ok('multiple classes comma-joined', q['vehicle[shippedHazardousGoods]'] === 'explosive,flammable,poison');
q = V.vehicleParams({ hazmat: ['flammable','notARealClass'] });
ok('unknown class silently dropped, valid one kept',
   q['vehicle[shippedHazardousGoods]'] === 'flammable');
q = V.vehicleParams({ hazmat: ['bogus'] });
ok('all-invalid hazmat omits the param entirely (never sends garbage)',
   !('vehicle[shippedHazardousGoods]' in q));
q = V.vehicleParams({ hazmat: [] });
ok('empty hazmat array omits the param', !('vehicle[shippedHazardousGoods]' in q));

console.log('\n=== custom profile overrides ===');
q = V.vehicleParams({ heightIn: 168, weightLb: 92000 });
ok('custom height overrides standard', q['vehicle[height]'] === String(V.inToCm(168)));
ok('custom weight overrides standard', q['vehicle[grossWeight]'] === String(V.lbToKg(92000)));
ok('unspecified fields fall back to standard', q['vehicle[width]'] === '260');

console.log('\n=== custom validation ===');
ok('clean input passes', V.validateCustom({heightIn:162,widthIn:102,lengthIn:840,weightLb:80000}).length === 0);
ok('blank fields are allowed (means: use standard)', V.validateCustom({heightIn:'',weightLb:''}).length === 0);
ok('non-numeric rejected', V.validateCustom({heightIn:'tall'}).length === 1);
ok('absurd height rejected', V.validateCustom({heightIn:5000}).length === 1);
ok('absurd weight rejected', V.validateCustom({weightLb:1}).length === 1);
ok('several bad fields report several messages', V.validateCustom({heightIn:9999,weightLb:1}).length === 2);

console.log('\n=== purity ===');
const orig = { heightIn: 168, hazmat: ['gas'] };
const snap = JSON.stringify(orig);
V.vehicleParams(orig);
ok('does not mutate the profile passed in', JSON.stringify(orig) === snap);

console.log('\n=== query-string emission (bracket encoding is easy to get wrong) ===');
// Mirrors exactly how index.html builds the routing URL by hand.
const qs = prof => Object.entries(V.vehicleParams(prof))
  .map(([k,v]) => `&${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('');

let s1 = qs({});
ok('brackets are percent-encoded, not raw',
   s1.includes('vehicle%5Bheight%5D=412') && !s1.includes('vehicle[height]'), s1);
ok('all four standard dimensions present in the query string',
   ['vehicle%5Bheight%5D=412','vehicle%5Bwidth%5D=260','vehicle%5Blength%5D=2134',
    'vehicle%5BgrossWeight%5D=36288'].every(f => s1.includes(f)), s1);
ok('standard emits NO hazmat parameter', !s1.includes('shippedHazardousGoods'), s1);

let s2 = qs({ hazmat: ['flammable','corrosive'] });
ok('hazmat comma is encoded as %2C (one param, not two)',
   s2.includes('vehicle%5BshippedHazardousGoods%5D=flammable%2Ccorrosive'), s2);

let s3 = qs({ hazmat: ['nope','alsoNope'] });
ok('a hazmat profile whose classes are ALL invalid emits no hazmat param at all',
   !s3.includes('shippedHazardousGoods'), s3);
ok('...but still emits the dimensions', s3.includes('vehicle%5Bheight%5D=412'), s3);

// Parse back out to prove the URL a server would actually receive is right.
const parsed = new URLSearchParams(qs({ heightIn: 168, hazmat: ['gas'] }).slice(1));
ok('round-trips through URLSearchParams to the literal HERE param names',
   parsed.get('vehicle[height]') === String(V.inToCm(168)) &&
   parsed.get('vehicle[shippedHazardousGoods]') === 'gas',
   JSON.stringify([...parsed.entries()]));

console.log('\n=== enum matches HERE\'s live OpenAPI spec (checked at implementation) ===');
const LIVE_SPEC_ENUM = ['explosive','gas','flammable','combustible','organic','poison',
  'radioactive','corrosive','poisonousInhalation','harmfulToWater','other'];
ok('HAZMAT_CLASSES equals the documented enum exactly',
   JSON.stringify(V.HAZMAT_CLASSES) === JSON.stringify(LIVE_SPEC_ENUM),
   JSON.stringify(V.HAZMAT_CLASSES));

console.log(`\n${p} passed, ${f} failed`);
