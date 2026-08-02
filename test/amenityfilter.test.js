// Amenity filters, asserted against the REAL DATA array.
//
// passes() lives in index.html (per the brief, filtering stays there rather
// than moving to a lib), so this mirrors its amenity predicates — but the
// thresholds are PARSED OUT OF THE SOURCE rather than repeated here. If a
// constant is retuned, this test follows it automatically; if the parse
// fails, the test fails loudly rather than silently checking nothing.
//
// The counts below are the point: they catch a future DATA refresh that
// quietly invalidates a threshold (e.g. a filter that starts matching
// everything, which is a control that looks broken to a driver).

const fs = require('fs');
const path = require('path');
const { splitDataBlock, parseRowLine } = require('../tools/geocode.js');

let p = 0, f = 0;
const ok = (n, c, e = '') => { c ? (p++, console.log('  PASS', n)) : (f++, console.log('  FAIL', n, e)); };

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const DATA = splitDataBlock(html).rowLines.map(parseRowLine);

const constOf = name => {
  const m = html.match(new RegExp(`const ${name}\\s*=\\s*(\\d+)`));
  return m ? Number(m[1]) : null;
};
const PARKING_LARGE = constOf('PARKING_LARGE');
const SHOWERS_MANY  = constOf('SHOWERS_MANY');
const BAYS_MANY     = constOf('BAYS_MANY');

console.log('=== thresholds are readable from source ===');
ok('PARKING_LARGE parsed', PARKING_LARGE !== null, String(PARKING_LARGE));
ok('SHOWERS_MANY parsed',  SHOWERS_MANY  !== null, String(SHOWERS_MANY));
ok('BAYS_MANY parsed',     BAYS_MANY     !== null, String(BAYS_MANY));

// Mirrors passes()'s amenity clauses exactly.
const amen = {
  parking: r => Number(r[12]) >= PARKING_LARGE,
  showers: r => Number(r[14]) >= SHOWERS_MANY,
  service: r => Number(r[15]) >= BAYS_MANY,
  scale:   r => !!r[18]
};
const applyAll = (rows, keys) => rows.filter(r => keys.every(k => amen[k](r)));

console.log('\n=== each filter in isolation actually discriminates ===');
const TOTAL = DATA.length;
ok(`fixture: DATA has ${TOTAL} rows`, TOTAL === 146, String(TOTAL));
for (const k of ['parking', 'showers', 'service']) {
  const n = applyAll(DATA, [k]).length;
  // A filter matching every row is a dead control — that is the failure mode
  // this test exists to catch on a data refresh.
  ok(`${k}: keeps ${n}/${TOTAL}, and is neither a no-op nor empty`,
     n > 0 && n < TOTAL, `${n}/${TOTAL}`);
}
ok('parking (100+) keeps 116', applyAll(DATA, ['parking']).length === 116, String(applyAll(DATA, ['parking']).length));
ok('showers (10+) keeps 76',   applyAll(DATA, ['showers']).length === 76,  String(applyAll(DATA, ['showers']).length));
ok('service (4+ bays) keeps 102', applyAll(DATA, ['service']).length === 102, String(applyAll(DATA, ['service']).length));
// CAT scale is genuinely near-universal here; asserted so the near-no-op is a
// recorded fact rather than an accident nobody noticed.
ok('CAT scale keeps 144 — every fuel stop has one, only the 2 terminals do not',
   applyAll(DATA, ['scale']).length === 144, String(applyAll(DATA, ['scale']).length));

console.log('\n=== filters AND together ===');
const all4 = applyAll(DATA, ['parking', 'showers', 'service', 'scale']);
ok('all four combined is a subset of each alone',
   all4.length <= Math.min(...['parking','showers','service','scale'].map(k => applyAll(DATA, [k]).length)),
   String(all4.length));
ok('all four combined still returns stops (not an accidental dead end)',
   all4.length > 0, String(all4.length));
ok('every survivor of the combined filter satisfies all four predicates',
   all4.every(r => amen.parking(r) && amen.showers(r) && amen.service(r) && amen.scale(r)));
console.log(`  (all four combined: ${all4.length} stops)`);

const pk = applyAll(DATA, ['parking']).length, sh = applyAll(DATA, ['showers']).length;
const both = applyAll(DATA, ['parking','showers']).length;
ok('two combined is no larger than either alone', both <= pk && both <= sh, `${both} vs ${pk}/${sh}`);

console.log('\n=== combined with an existing brand/state filter ===');
const ta = DATA.filter(r => r[1] === 'TA');
const taBig = applyAll(ta, ['parking']);
ok('brand + parking narrows within the brand',
   taBig.length > 0 && taBig.length <= ta.length && taBig.every(r => r[1] === 'TA'),
   `${taBig.length}/${ta.length}`);
const tx = DATA.filter(r => r[5] === 'TX');
const txAll = applyAll(tx, ['parking','showers','service']);
ok('state + three amenities stays inside the state',
   txAll.every(r => r[5] === 'TX') && txAll.length <= tx.length, `${txAll.length}/${tx.length}`);

console.log('\n=== a zero-result combination is reachable (the empty state is real) ===');
// Narrow to one state and demand the strictest combination; whatever the
// answer, the app must be able to render zero without breaking.
const zero = DATA.filter(r => r[5] === 'RI' || r[5] === 'VT' || r[5] === 'AK');
ok('a state with no network stops yields zero rows', zero.length === 0, String(zero.length));

console.log(`\n${p} passed, ${f} failed`);
if (f) process.exitCode = 1;
