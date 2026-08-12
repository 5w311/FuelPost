// Brief 02: the DATA -> fuel stop mapping must exclude Covenant terminals.
// Terminals are not fuel stops; planning against them would route a driver to
// a yard expecting diesel. Reads the real DATA array out of index.html using
// the same line-based extractor tools/geocode.js uses — no eval of the page.

const path = require('path');
const fs = require('fs');
const { splitDataBlock, parseRowLine } = require('../tools/geocode.js');
const { projectStops, planFuel } = require('../lib/fuelplan.js');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name, extra); }
};

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const DATA = splitDataBlock(html).rowLines.map(parseRowLine);

// Mirrors the mapping in index.html. The closed-stop ids are READ OUT of
// index.html rather than hardcoded here: this file mirrors the filter, and a
// hand-copied list would let the mirror drift from the real thing silently —
// which is exactly what happened when the closed exclusion was added and
// every assertion below kept passing against a stale copy of the rule.
const CLOSED_STOP_IDS = new Set(
  (html.match(/const CLOSED_STOP_IDS = new Set\(\[([^\]]*)\]\)/) || [, ''])[1]
    .split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean));
const FUEL_STOPS = DATA.filter(r => r[11] !== 'term' && !CLOSED_STOP_IDS.has(r[0])).map(r => ({
  id: r[0], name: r[2], lat: r[9], lng: r[10], tier: r[11], row: r
}));

console.log('\n=== DATA -> fuel stops mapping ===');
ok('146 rows in DATA', DATA.length === 146, DATA.length);

const terms = DATA.filter(r => r[11] === 'term');
ok('exactly 2 terminal rows in DATA', terms.length === 2, JSON.stringify(terms.map(r => r[0])));
ok('  they are the two Covenant terminals', terms.map(r => r[0]).sort().join() === 'TN6,TN7',
   JSON.stringify(terms.map(r => r[0])));

// 146 rows - 2 terminals - 2 closed = 142. DATA itself keeps all 146 and the
// header still counts 146: the header counts stations in the book, and the
// book has not revved.
ok('mapping yields 142 fuel stops', FUEL_STOPS.length === 142, FUEL_STOPS.length);
ok('no terminal survives the filter', FUEL_STOPS.every(s => s.tier !== 'term'),
   JSON.stringify(FUEL_STOPS.filter(s => s.tier === 'term').map(s => s.id)));
ok('  neither TN6 nor TN7 is a fuel stop',
   !FUEL_STOPS.some(s => s.id === 'TN6' || s.id === 'TN7'));
ok('every fuel stop is excl or prim',
   FUEL_STOPS.every(s => s.tier === 'excl' || s.tier === 'prim'),
   JSON.stringify([...new Set(FUEL_STOPS.map(s => s.tier))]));

console.log('\n=== closed stations: excluded from planning, kept in DATA ===');
// TA Corning (CA5) and TA Saginaw (MI3) are absent from TA's location master
// 08-2026. The rows stay so DATA still agrees with the fuel book it is
// sourced from; only planning drops them.
ok('the closed set was actually found in index.html (not an empty regex match)',
   CLOSED_STOP_IDS.size === 2, JSON.stringify([...CLOSED_STOP_IDS]));
ok('  it is exactly CA5 and MI3', [...CLOSED_STOP_IDS].sort().join() === 'CA5,MI3',
   JSON.stringify([...CLOSED_STOP_IDS]));
// THE FAILURE MODE WORTH PINNING: a typo'd id silently matches nothing, the
// closed stop stays plannable, and every count above still adds up because
// the typo just never fires. Check each id against DATA.
ok('>>> every closed id exists in DATA (a typo would exclude nothing, silently)',
   [...CLOSED_STOP_IDS].every(id => DATA.some(r => r[0] === id)),
   JSON.stringify([...CLOSED_STOP_IDS].filter(id => !DATA.some(r => r[0] === id))));
ok('>>> neither closed stop survives into FUEL_STOPS',
   !FUEL_STOPS.some(s => CLOSED_STOP_IDS.has(s.id)),
   JSON.stringify(FUEL_STOPS.filter(s => CLOSED_STOP_IDS.has(s.id)).map(s => s.id)));
ok('>>> both rows are still IN DATA — visible on the map, in the list, in a sheet',
   [...CLOSED_STOP_IDS].every(id => DATA.some(r => r[0] === id)) && DATA.length === 146);
ok('  TA Corning is still in DATA under its own name',
   (DATA.find(r => r[0] === 'CA5') || [])[2] === 'TA Corning');
ok('  TA Saginaw is still in DATA under its own name',
   (DATA.find(r => r[0] === 'MI3') || [])[2] === 'TA Saginaw');
// Petro Corning is a DIFFERENT station at the same exit, not a rename, and it
// is in TA's master. Losing it to an over-broad exclusion would be the
// expensive mistake here.
ok('>>> Petro Corning (CA4) is still plannable', FUEL_STOPS.some(s => s.id === 'CA4'));
ok('  and it really is a separate row at the same exit as TA Corning',
   (() => { const p = DATA.find(r => r[0] === 'CA4'), t = DATA.find(r => r[0] === 'CA5');
     return p[7] === t[7] && p[3] !== t[3] && p[8] !== t[8]; })(),
   JSON.stringify([DATA.find(r => r[0] === 'CA4'), DATA.find(r => r[0] === 'CA5')].map(r => [r[3], r[7], r[8]])));
// Closed stops are excluded at the source, not ranked down: nothing in the
// planning path may reintroduce them as a last resort.
ok('the exclusion is a filter on FUEL_STOPS, not a penalty applied later',
   /DATA\.filter\(r => r\[11\] !== 'term' && !CLOSED_STOP_IDS\.has\(r\[0\]\)\)/.test(html));

console.log('\n=== the Bloomsbury spelling ===');
ok('NJ1 is spelled TA Bloomsbury, matching TA and the post office',
   (DATA.find(r => r[0] === 'NJ1') || [])[2] === 'TA Bloomsbury',
   (DATA.find(r => r[0] === 'NJ1') || [])[2]);
ok('  the doubled-r spelling is gone from the file entirely', !/Bloomsburry/.test(html));
ok('  TA Bloomsburg (PA1) is a DIFFERENT station and is untouched',
   (DATA.find(r => r[0] === 'PA1') || [])[2] === 'TA Bloomsburg');
ok('  only the display name changed on NJ1 — nav code and address intact',
   (() => { const r = DATA.find(x => x[0] === 'NJ1');
     return r[20] === 'CVENTA048' && r[3] === '975 S.R. 173' && r[4] === 'Bloomsbury'; })());

console.log('\n=== fuel stop shape is what the planner consumes ===');
ok('all have numeric lat/lng',
   FUEL_STOPS.every(s => typeof s.lat === 'number' && typeof s.lng === 'number'));
ok('all coords inside continental US box',
   FUEL_STOPS.every(s => s.lat >= 24 && s.lat <= 50 && s.lng >= -125 && s.lng <= -66));
ok('all have id, name and back-reference row',
   FUEL_STOPS.every(s => s.id && s.name && Array.isArray(s.row) && s.row.length === 21));
ok('ids are unique', new Set(FUEL_STOPS.map(s => s.id)).size === FUEL_STOPS.length);

// A terminal sitting right on a route must never be selected as a fuel stop.
// Chattanooga HQ (TN6) is on I-24; build a short route past it and confirm.
console.log('\n=== terminals are never planned as fuel ===');
{
  const hq = DATA.find(r => r[0] === 'TN6');
  ok('TN6 is the Chattanooga terminal', !!hq && hq[11] === 'term', hq && hq[11]);

  // Straight synthetic route running east-west through the terminal's latitude,
  // long enough to force several fuel stops.
  const poly = [];
  for (let i = 0; i <= 200; i++) poly.push([hq[9], hq[10] - 8 + i * 0.08]);

  const withTerminals = DATA.map(r => ({ id: r[0], lat: r[9], lng: r[10], tier: r[11] }));
  const projAll = projectStops(poly, withTerminals, 8);
  ok('  terminal does project onto this route (so the test is meaningful)',
     projAll.some(s => s.id === 'TN6'));

  const projFuel = projectStops(poly, FUEL_STOPS, 8);
  ok('  but is absent once terminals are filtered out',
     !projFuel.some(s => s.id === 'TN6'));

  const r = planFuel(900, projFuel, 400);
  ok('  no terminal appears in the resulting plan',
     r.plan.every(s => s.tier !== 'term' && s.id !== 'TN6' && s.id !== 'TN7'),
     JSON.stringify(r.plan.map(s => s.id)));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
