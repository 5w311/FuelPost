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
// Two rows, shut in two different senses: TA Corning (CA5), whose address and
// phone are both absent from TA's location master 08-2026, and TA Gary (IN1),
// reported temporarily closed with only its parking lot open. Both rows stay
// so DATA still agrees with the fuel book it is sourced from; only planning
// drops them, and it drops them identically — "parking only" is still "no
// fuel here", which is the only question the planner asks.
ok('the closed set was actually found in index.html (not an empty regex match)',
   CLOSED_STOP_IDS.size === 2, JSON.stringify([...CLOSED_STOP_IDS]));
ok('  it is exactly CA5 and IN1', [...CLOSED_STOP_IDS].sort().join() === 'CA5,IN1',
   JSON.stringify([...CLOSED_STOP_IDS]));
// THE REGRESSION THIS FILE EXISTS TO CATCH FROM NOW ON: v1.22.0 marked TA
// Saginaw (MI3) closed because it was looked up under "Saginaw" while TA
// lists it as "TA Bridgeport" — same address, same phone, same coordinates.
// An absent NAME is not evidence of closure; an open station spent a release
// unplannable on that mistake.
ok('>>> TA Saginaw (MI3) IS plannable — a rename is not a closure',
   FUEL_STOPS.some(s => s.id === 'MI3'),
   JSON.stringify([...CLOSED_STOP_IDS]));
ok('  and MI3 is not in the closed set at all', !CLOSED_STOP_IDS.has('MI3'));
ok('>>> TA Corning (CA5) is still excluded', !FUEL_STOPS.some(s => s.id === 'CA5')
   && CLOSED_STOP_IDS.has('CA5'));
// v1.30.2. A temporary closure is excluded on exactly the same terms as a
// permanent one. The tempting half-measure — leave it plannable because the
// gate is open — routes a driver to an island that cannot sell them fuel,
// which is the whole failure this set exists to prevent.
ok('>>> TA Gary (IN1) is excluded too — parking open is not fuel available',
   !FUEL_STOPS.some(s => s.id === 'IN1') && CLOSED_STOP_IDS.has('IN1'));
ok('  and TA Gary is still in DATA under its own name',
   (DATA.find(r => r[0] === 'IN1') || [])[2] === 'TA Gary');
// The Corning trap again, in Indiana. TA Gary and Petro Gary are two separate
// stations 2.5 mi apart on I-80/I-94 (exits 6 and 9), with different
// addresses, phones and nav codes. Shutting one must not take the other, and
// Petro Gary is the alternative the closed sheet points at — so if this ever
// fails, the banner is sending drivers to a stop the planner won't use.
ok('>>> Petro Gary (IN2) is still plannable', FUEL_STOPS.some(s => s.id === 'IN2'));
{
  const in1 = DATA.find(r => r[0] === 'IN1') || [];
  const in2 = DATA.find(r => r[0] === 'IN2') || [];
  ok('  they really are two separate rows, not one renamed',
     in1[3] !== in2[3] && in1[8] !== in2[8] && in1[20] !== in2[20],
     JSON.stringify([in1[3], in2[3], in1[8], in2[8]]));
  ok('  at different exits of the same road', in1[7] !== in2[7],
     JSON.stringify([in1[7], in2[7]]));
}
// THE FAILURE MODE WORTH PINNING: a typo'd id silently matches nothing, the
// closed stop stays plannable, and every count above still adds up because
// the typo just never fires. Check each id against DATA.
ok('>>> every closed id exists in DATA (a typo would exclude nothing, silently)',
   [...CLOSED_STOP_IDS].every(id => DATA.some(r => r[0] === id)),
   JSON.stringify([...CLOSED_STOP_IDS].filter(id => !DATA.some(r => r[0] === id))));
ok('>>> no closed stop survives into FUEL_STOPS',
   !FUEL_STOPS.some(s => CLOSED_STOP_IDS.has(s.id)),
   JSON.stringify(FUEL_STOPS.filter(s => CLOSED_STOP_IDS.has(s.id)).map(s => s.id)));
ok('>>> the closed row is still IN DATA — on the map, in the list, in a sheet',
   [...CLOSED_STOP_IDS].every(id => DATA.some(r => r[0] === id)) && DATA.length === 146);
ok('  TA Corning is still in DATA under its own name',
   (DATA.find(r => r[0] === 'CA5') || [])[2] === 'TA Corning');
// The fuel book names stations, not TA's site. MI3 keeps the name a Covenant
// driver recognises even though TA now calls it TA Bridgeport, and keeps its
// nav code, which the book is likewise the authority on.
ok('  TA Saginaw keeps its fuel-book name, not TA\'s current one',
   (DATA.find(r => r[0] === 'MI3') || [])[2] === 'TA Saginaw');
ok('  and keeps nav code CVENTA198',
   (DATA.find(r => r[0] === 'MI3') || [])[20] === 'CVENTA198');
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

console.log('\n=== marker stacking: a closed pin never hides an open one ===');
// Petro Corning and TA Corning are 0.43 mi apart on I-5 exit 630, so at any
// normal zoom their pins overlap and only the top one is visible. The closed
// TA pin was winning that overlap, showing the driver a station that no
// longer exists and hiding the Petro that is actually there.
//
// The fix is an explicit z-index, NOT marker add order. The map engine writes
// its own inline z-index on every marker, assigned by screen Y so lower pins
// paint in front, and rewrites them on every view change — add order does not
// survive that. TA Corning is SOUTH of Petro Corning, so the engine put it in
// front regardless of which was added first. Measured against the real SDK;
// the behaviour cannot be reproduced here, so this file pins the wiring and
// scratchpad/pw-pinorder.js pins the painted result.
{
  ok('fixture: CA4 and CA5 really are the same state and city (they overlap)',
     (() => { const a = DATA.find(r => r[0] === 'CA4'), b = DATA.find(r => r[0] === 'CA5');
       return a[5] === b[5] && a[4] === b[4]; })());
  ok('  and CA5 (closed) is SOUTH of CA4, which is why the engine favoured it',
     DATA.find(r => r[0] === 'CA5')[9] < DATA.find(r => r[0] === 'CA4')[9]);

  ok('>>> the marker build pushes closed stations behind with setZIndex',
     /if\(CLOSED_STOP_IDS\.has\(row\[0\]\)\) marker\.setZIndex\(CLOSED_PIN_Z\);/.test(html));
  ok('  CLOSED_PIN_Z is below every default the engine assigns',
     /const CLOSED_PIN_Z = -1;/.test(html));
  ok('  only closed rows get it — open pins keep the engine default',
     (html.match(/marker\.setZIndex\(/g) || []).length === 1);
  // The sort is deliberately untouched: it matches render()'s list order and
  // has nothing to do with stacking.
  ok('  the build sort is unchanged (state, then city)',
     /\[\.\.\.DATA\]\.sort\(\(a,b\)=> a\[5\]===b\[5\] \? a\[4\]\.localeCompare\(b\[4\]\) : a\[5\]\.localeCompare\(b\[5\]\)\)/.test(html));

  // The set is read at parse time by the marker build, so it must be declared
  // above it. This exact ordering was a startup crash when first written:
  // "Cannot access 'CLOSED_STOP_IDS' before initialization", zero markers.
  ok('>>> CLOSED_STOP_IDS is declared ABOVE the marker build (TDZ guard)',
     html.indexOf('const CLOSED_STOP_IDS') < html.indexOf('const STOP_MARKERS'),
     'declaring it below the marker build is a blank map on load');
  ok('  so is CLOSED_PIN_Z', html.indexOf('const CLOSED_PIN_Z') < html.indexOf('const STOP_MARKERS'));
}

console.log('\n=== amenity codes ===');
// Deliberately does NOT pin all 146 amenity strings verbatim: that would break
// on every future data correction and pins far more than any one change.
{
  const codes = r => String(r[16] || '').split(',').map(s => s.trim()).filter(Boolean);
  const has = (r, c) => codes(r).includes(c);

  // THE BARE-CHIP FAILURE MODE: amenChips prints the raw code when a label is
  // missing, so an unlabelled code shows the driver a bare "R" instead of
  // erroring. Checked over every code actually in use, so it keeps catching
  // this for any code added later, not just R.
  const labels = new Set(
    ((html.match(/const AMEN_LABEL = \{([^}]*)\}/) || [, ''])[1].match(/(\w+):"/g) || [])
      .map(s => s.replace(':"', '')));
  const used = [...new Set(DATA.flatMap(codes))].sort();
  ok('AMEN_LABEL was actually parsed out of index.html', labels.size >= 6, JSON.stringify([...labels]));
  ok('>>> every amenity code in DATA has an AMEN_LABEL entry (no bare chips)',
     used.every(c => labels.has(c)), JSON.stringify(used.filter(c => !labels.has(c))));
  ok('  R is labelled "Sit-down restaurant"', /R:"Sit-down restaurant"/.test(html));

  console.log('\n  -- R, the sit-down restaurant code --');
  const withR = DATA.filter(r => has(r, 'R'));
  ok('>>> exactly 70 rows carry R', withR.length === 70, String(withR.length));
  // R is appended, never interleaved, so every pre-existing string keeps its
  // F,O,W,H,B,T prefix and ordering untouched.
  ok('>>> R is always LAST in any string containing it',
     withR.every(r => codes(r).pop() === 'R'),
     JSON.stringify(withR.filter(r => codes(r).pop() !== 'R').map(r => [r[0], r[16]])));
  // CA5 is the one stop with no match in TA's current location data, which is
  // consistent with it being closed.
  ok('>>> CA5 (TA Corning, closed) has no R', !has(DATA.find(r => r[0] === 'CA5'), 'R'),
     JSON.stringify(DATA.find(r => r[0] === 'CA5')[16]));

  console.log('\n  -- the four fitness room corrections --');
  // Counted over STOPS, not all DATA rows: TN6, the Covenant HQ terminal, also
  // carries F, so the all-rows figure is one higher and means something else.
  const fStops = DATA.filter(r => r[11] !== 'term' && has(r, 'F'));
  ok('>>> 35 fitness rooms across the stops after the corrections',
     fStops.length === 35, String(fStops.length));
  ok('  (the terminal TN6 carries F too, which is why the all-rows count is 36)',
     DATA.filter(r => has(r, 'F')).length === 36 && has(DATA.find(r => r[0] === 'TN6'), 'F'));
  ok('>>> MO2 Petro Oak Grove no longer claims F', !has(DATA.find(r => r[0] === 'MO2'), 'F'),
     JSON.stringify(DATA.find(r => r[0] === 'MO2')[16]));
  ok('  and it kept its walking trail', has(DATA.find(r => r[0] === 'MO2'), 'W'));
  ok('>>> VA4 Petro Raphine now has F', has(DATA.find(r => r[0] === 'VA4'), 'F'),
     JSON.stringify(DATA.find(r => r[0] === 'VA4')[16]));
  ok('>>> IN2 Petro Gary now has F', has(DATA.find(r => r[0] === 'IN2'), 'F'),
     JSON.stringify(DATA.find(r => r[0] === 'IN2')[16]));
  // Absence of evidence is not evidence of absence: CT1 could be neither
  // confirmed nor refuted, so it keeps what it claims.
  ok('>>> CT1 TA New Haven still claims F (unconfirmed, deliberately untouched)',
     has(DATA.find(r => r[0] === 'CT1'), 'F'), JSON.stringify(DATA.find(r => r[0] === 'CT1')[16]));

  // Adding a code must not have disturbed the row shape.
  ok('every row still has 21 fields', DATA.every(r => r.length === 21));
}

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
