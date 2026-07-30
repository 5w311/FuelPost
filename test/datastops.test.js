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

// Mirrors the mapping in index.html exactly.
const FUEL_STOPS = DATA.filter(r => r[11] !== 'term').map(r => ({
  id: r[0], name: r[2], lat: r[9], lng: r[10], tier: r[11], row: r
}));

console.log('\n=== DATA -> fuel stops mapping ===');
ok('146 rows in DATA', DATA.length === 146, DATA.length);

const terms = DATA.filter(r => r[11] === 'term');
ok('exactly 2 terminal rows in DATA', terms.length === 2, JSON.stringify(terms.map(r => r[0])));
ok('  they are the two Covenant terminals', terms.map(r => r[0]).sort().join() === 'TN6,TN7',
   JSON.stringify(terms.map(r => r[0])));

ok('mapping yields 144 fuel stops', FUEL_STOPS.length === 144, FUEL_STOPS.length);
ok('no terminal survives the filter', FUEL_STOPS.every(s => s.tier !== 'term'),
   JSON.stringify(FUEL_STOPS.filter(s => s.tier === 'term').map(s => s.id)));
ok('  neither TN6 nor TN7 is a fuel stop',
   !FUEL_STOPS.some(s => s.id === 'TN6' || s.id === 'TN7'));
ok('every fuel stop is excl or prim',
   FUEL_STOPS.every(s => s.tier === 'excl' || s.tier === 'prim'),
   JSON.stringify([...new Set(FUEL_STOPS.map(s => s.tier))]));

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
