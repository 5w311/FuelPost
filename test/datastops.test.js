// Brief 02: the DATA -> fuel stop mapping must exclude Covenant terminals.
// Terminals are not fuel stops; planning against them would route a driver to
// a yard expecting diesel. Reads the real DATA array out of index.html using
// the same line-based extractor tools/geocode.js uses — no eval of the page.

const path = require('path');
const fs = require('fs');
const { splitDataBlock, parseRowLine } = require('../tools/geocode.js');
const { projectStops, planFuel, haversine } = require('../lib/fuelplan.js');
const Adaptive = require('../lib/fuelplan-adaptive.js');
const ShortTrip = require('../lib/shorttrip.js');
const NearMe = require('../lib/nearme.js');

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
// v1.31.0 deleted two rows: TA Corning (CA5) and the Covenant Greenville
// Terminal (TN7). 146 -> 144. Neither was in Rev 01-2026 — both entered DATA
// through an error in the original data collection — so this count moving DOWN
// is DATA agreeing with the fuel book more closely, not less.
ok('144 rows in DATA', DATA.length === 144, DATA.length);
ok('>>> TA Corning (CA5) is gone from DATA entirely', !DATA.some(r => r[0] === 'CA5'));
ok('>>> the Greenville terminal (TN7) is gone from DATA entirely',
   !DATA.some(r => r[0] === 'TN7'));
ok('  and neither id survives anywhere in index.html',
   !/'CA5'|"CA5"|'TN7'|"TN7"/.test(html.replace(/\/\/[^\n]*/g, '')),
   'a live reference to a deleted row is a lookup that silently finds nothing');

const terms = DATA.filter(r => r[11] === 'term');
ok('exactly 1 terminal row in DATA', terms.length === 1, JSON.stringify(terms.map(r => r[0])));
ok('  it is TN6, Covenant Logistics HQ', terms.map(r => r[0]).join() === 'TN6',
   JSON.stringify(terms.map(r => r[0])));

// 144 rows - 1 terminal - 1 closed = 142, the same figure as before the
// deletions: one of each kind went. The header is DERIVED (filtered.length),
// so it now reads 144 with no filters on, and needs no separate pin.
ok('mapping yields 142 fuel stops', FUEL_STOPS.length === 142, FUEL_STOPS.length);
ok('no terminal survives the filter', FUEL_STOPS.every(s => s.tier !== 'term'),
   JSON.stringify(FUEL_STOPS.filter(s => s.tier === 'term').map(s => s.id)));
ok('  TN6 is not a fuel stop', !FUEL_STOPS.some(s => s.id === 'TN6'));
ok('every fuel stop is excl or prim',
   FUEL_STOPS.every(s => s.tier === 'excl' || s.tier === 'prim'),
   JSON.stringify([...new Set(FUEL_STOPS.map(s => s.tier))]));

console.log('\n=== closed stations: excluded from planning, kept in DATA ===');
// One row now: TA Gary (IN1), reported temporarily closed with only its
// parking lot open. TA Corning used to be the other, and v1.31.0 deleted it
// rather than closing it — which is the distinction this whole section turns
// on. A CLOSED row stays in DATA, keeps its pin, its list entry and its sheet,
// and is merely never planned; a DELETED row is gone, and a driver who goes
// looking for it learns nothing.
ok('the closed set was actually found in index.html (not an empty regex match)',
   CLOSED_STOP_IDS.size === 1, JSON.stringify([...CLOSED_STOP_IDS]));
ok('  it is exactly IN1', [...CLOSED_STOP_IDS].join() === 'IN1',
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
   [...CLOSED_STOP_IDS].every(id => DATA.some(r => r[0] === id)) && DATA.length === 144);
// The distinction v1.31.0 made explicit: DELETED is for a row the fuel book
// never had, CLOSED is for a row the book has whose station is shut — kept,
// unplannable, and still explaining itself on its own sheet. Both halves are
// asserted so a future "cleanup" cannot quietly turn the second into the first
// and throw that explanation away.
ok('  TA Gary is still in DATA under its own name — closed is not deleted',
   (DATA.find(r => r[0] === 'IN1') || [])[2] === 'TA Gary');
// The fuel book names stations, not TA's site. MI3 keeps the name a Covenant
// driver recognises even though TA now calls it TA Bridgeport, and keeps its
// nav code, which the book is likewise the authority on.
ok('  TA Saginaw keeps its fuel-book name, not TA\'s current one',
   (DATA.find(r => r[0] === 'MI3') || [])[2] === 'TA Saginaw');
ok('  and keeps nav code CVENTA198',
   (DATA.find(r => r[0] === 'MI3') || [])[20] === 'CVENTA198');
// Petro Corning stays, and deleting its same-exit sibling must not have taken
// it: an over-broad delete is the same expensive mistake an over-broad
// exclusion would be, and it is now unrecoverable rather than one line to undo.
ok('>>> Petro Corning (CA4) survived the deletion of TA Corning',
   FUEL_STOPS.some(s => s.id === 'CA4'));
ok('  with its own address, phone and nav code intact',
   (() => { const p = DATA.find(r => r[0] === 'CA4') || [];
     return p[3] === '2151 South Avenue' && p[8] === '(530) 824-4685' && p[20] === 'CVENPE309'; })(),
   JSON.stringify(DATA.find(r => r[0] === 'CA4')));
// Same for the terminal that was NOT deleted.
ok('>>> Covenant Logistics HQ (TN6) survived the deletion of the Greenville terminal',
   DATA.some(r => r[0] === 'TN6' && r[2] === 'Covenant Logistics HQ'),
   JSON.stringify(DATA.find(r => r[0] === 'TN6')));
// Closed stops are excluded at the source, not ranked down: nothing in the
// planning path may reintroduce them as a last resort.
ok('the exclusion is a filter on FUEL_STOPS, not a penalty applied later',
   /DATA\.filter\(r => r\[11\] !== 'term' && !CLOSED_STOP_IDS\.has\(r\[0\]\)\)/.test(html));

console.log('\n=== marker stacking: a closed pin never hides an open one ===');
// The case that established this was Petro Corning and TA Corning, 0.43 mi
// apart on I-5 exit 630: at any normal zoom their pins overlapped, the closed
// TA pin won, and the driver saw a station that no longer existed with the
// Petro that was actually there hidden underneath.
//
// The fix is an explicit z-index, NOT marker add order. The engine writes its
// own inline z-index on every marker, assigned by screen Y so lower pins paint
// in front, and rewrites them on every view change — add order does not
// survive that. TA Corning was SOUTH of Petro Corning, so the engine put it in
// front regardless of which was added first.
//
// v1.31.0 deleted TA Corning, so that pair is gone and the fixture asserting
// it had to go with it. The WIRING is what this block pins, and it is pinned
// harder now precisely because the case that motivated it can no longer be
// read off the data: measured over the current 144 rows, the tightest pairs
// left are TA Knoxville West / Petro Knoxville at 0.12 mi and Petro / TA Oak
// Grove at 0.22 mi — both open — while the one closed row, TA Gary, is 2.51 mi
// from Petro Gary. Nothing in DATA today would fail if this rule were dropped;
// the next closure in a tight pair would.
{

  ok('>>> the marker build pushes closed stations behind with setZIndex',
     /if\(CLOSED_STOP_IDS\.has\(row\[0\]\)\) marker\.setZIndex\(CLOSED_PIN_Z\);/.test(html));
  ok('  CLOSED_PIN_Z is below every default the engine assigns',
     /const CLOSED_PIN_Z = -1;/.test(html));
  // v1.30.3: the pin also SAYS it, rather than only sitting behind. Stacking
  // order is invisible unless two pins overlap; a closed stop alone on screen
  // looked exactly like an open one.
  ok('>>> closed pins carry a red dot',
     /\.pin\.closed:after\{[^}]*background:var\(--pin-closed\)/.test(html));
  ok('  in its own marker colour, not the theme-swapping --danger-text',
     /--pin-closed:#[0-9A-Fa-f]{6};/.test(html)
     && !/\.pin\.closed:after\{[^}]*--danger-text/.test(html));
  // Equal specificity, so source order is the whole rule. 31 rows are `excl`
  // and any of them could close; a closed exclusive must read red, not gold.
  // Index on the RULE, not the bare selector: the comment above these rules
  // names `.pin.excl:after` in prose, and a first version of this assertion
  // matched that comment instead — it sits above both rules, so swapping the
  // two rules left it passing. Requiring the `{` pins the declaration itself.
  ok('>>> the closed dot is declared AFTER the exclusive dot (red beats gold)',
     html.indexOf('.pin.excl:after{') < html.indexOf('.pin.closed:after{')
     && html.indexOf('.pin.excl:after{') !== -1);
  ok('  and shares the exclusive dot\'s offsets — .pin is rotate(-45deg), so '
     + 'top-right IS visually above',
     /\.pin\.excl:after\{[^}]*top:-5px;right:-5px/.test(html)
     && /\.pin\.closed:after\{[^}]*top:-5px;right:-5px/.test(html));
  // A new symbol on the map that nothing explains is a symbol the driver has
  // to guess at. The legend already documented the gold dot; the red one is
  // held to the same bar, in the same card, from the same variable.
  const legendCard = (html.match(/<div id="legendCard">[\s\S]*?\n {4}<\/div>/) || [''])[0];
  ok('>>> the legend explains the red dot', /var\(--pin-closed\)/.test(legendCard), legendCard.slice(0, 60));
  ok('  right after the gold one it has to be told apart from',
     legendCard.indexOf('var(--gold)') < legendCard.indexOf('var(--pin-closed)'));
  // Worded for what BOTH closures share. TA Gary is still open for parking,
  // so a bare "Closed" in the legend would overstate its own pin.
  ok('  and says "for fuel", not a bare "Closed" that overstates TA Gary',
     /Closed for fuel/.test(legendCard), legendCard);
  ok('  the swatch reads the same variable as the pin (one red, not two)',
     (html.match(/var\(--pin-closed\)/g) || []).length === 2,
     String((html.match(/var\(--pin-closed\)/g) || []).length));
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
  // Was 70 of 146 with TA Corning present; CA5 carried no R, so deleting it
  // moved the denominator and not this count. Stated because an unchanged
  // number across a data deletion looks like a stale assertion otherwise.
  ok('  the count is unchanged by v1.31.0 — neither deleted row carried R',
     withR.length === 70 && !DATA.some(r => r[0] === 'CA5' || r[0] === 'TN7'));

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
     r.plan.every(s => s.tier !== 'term' && s.id !== 'TN6'),
     JSON.stringify(r.plan.map(s => s.id)));

  // >>> EVERY planning entry point, not just the one filter. TN6 is the only
  // terminal left in DATA, it sits directly on I-24, and index.html feeds
  // FUEL_STOPS to all of these — so if any of them ever took DATA instead,
  // this is where a driver would be sent to a yard expecting diesel. Each
  // call is paired with a positive check, so a path that silently returns
  // nothing cannot pass by being empty.
  console.log('\n  -- TN6 across every path that can select a stop --');

  const adaptive = Adaptive.planAdaptive(poly, 900, FUEL_STOPS, 400, 0);
  ok('  planAdaptive returns a real plan (or the check below is vacuous)',
     Array.isArray(adaptive.plan) && adaptive.plan.length > 0,
     JSON.stringify(adaptive.plan && adaptive.plan.map(s => s.id)));
  ok('>>> planAdaptive never selects TN6',
     adaptive.plan.every(s => s.id !== 'TN6' && s.tier !== 'term'),
     JSON.stringify(adaptive.plan.map(s => s.id)));

  // Standing ON the terminal, asking for stops near the pickup. The radius is
  // 100 mi, not the app's usual 50: the nearest fuel stop to the HQ yard is TA
  // Cartersville at 60.7 mi, so at 50 the list comes back EMPTY and "TN6 is
  // not in it" passes while proving nothing. Measured, after the 50 mi version
  // of this check did exactly that.
  const nearPickup = Adaptive.stopsNearPickup(hq[9], hq[10], FUEL_STOPS, 100);
  ok('  stopsNearPickup finds something within 100 mi of the HQ',
     nearPickup.length > 0, String(nearPickup.length));
  ok('>>> stopsNearPickup never offers TN6, standing on it',
     !nearPickup.some(s => s.id === 'TN6'), JSON.stringify(nearPickup.map(s => s.id)));

  // The post-gap resume list.
  const gapped = planFuel(3000, projFuel, 300);
  ok('  fixture: that range really does gap', !!gapped.gap, JSON.stringify(gapped.gap));
  const beyond = Adaptive.planBeyondGap(poly, 3000, FUEL_STOPS, 300, gapped.gap, 8);
  ok('>>> planBeyondGap never offers TN6',
     (beyond.plan || []).every(s => s.id !== 'TN6'),
     JSON.stringify((beyond.plan || []).map(s => s.id)));

  // Short-trip "available anyway" list, and its nearest-to-delivery pick —
  // that one is a lookup by proximity with no tier filter of its own, so it
  // depends entirely on being handed FUEL_STOPS.
  const st = ShortTrip.shortTripOptions({
    routeMiles: 40, projected: projectStops(poly.slice(0, 12), FUEL_STOPS, 30),
    maxRange: 875, startBurned: 0, plannedStopCount: 0,
    allStops: FUEL_STOPS, delivery: { lat: hq[9], lng: hq[10] }
  });
  ok('  fixture: short-trip logic actually applies here', st.applies === true, JSON.stringify(st).slice(0, 160));
  ok('>>> short-trip never names TN6, with delivery AT the terminal',
     (st.nearestToDelivery || {}).id !== 'TN6'
     && (st.onRoute || []).every(x => x.id !== 'TN6'),
     JSON.stringify([(st.nearestToDelivery || {}).id, (st.onRoute || []).map(x => x.id)]));

  // Near Me, standing in the HQ yard.
  const nm = NearMe.nearestStops(hq[9], hq[10], FUEL_STOPS, haversine, 4);
  ok('  Near Me returns four stops from the HQ yard', nm.length === 4, String(nm.length));
  ok('>>> Near Me never offers TN6, standing in its own yard',
     !nm.some(x => x.stop.id === 'TN6'), JSON.stringify(nm.map(x => x.stop.id)));

  // And the wiring: every one of those call sites must be handed FUEL_STOPS.
  // A future edit passing DATA would defeat all of the above at once.
  // Comment-stripped, like the version and revision guards in header.test.js:
  // a first version of this matched the PROSE "nearPickup is
  // stopsNearPickup(pickup, NEAR_PICKUP_RADIUS_GAP)" in a comment and reported
  // a call site that does not exist. Third time this trap has been hit in the
  // suite — a matcher looking for code will find the sentence describing it.
  const htmlSansComments = html
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').map(l => l.replace(/^\s*\/\/.*$/, '')).join('\n');
  const callSites = htmlSansComments.match(/(planAdaptive|stopsNearPickup|planBeyondGap|nearestStops)\([^;]*?\)/gs) || [];
  ok('  found the call sites in index.html', callSites.length >= 4, String(callSites.length));
  ok('>>> every stop-selecting call site in index.html is handed FUEL_STOPS',
     callSites.every(c => /FUEL_STOPS/.test(c)),
     JSON.stringify(callSites.filter(c => !/FUEL_STOPS/.test(c))));
  ok('  and FUEL_STOPS is the only thing that drops terminals',
     /DATA\.filter\(r => r\[11\] !== 'term'/.test(html)
     && !FUEL_STOPS.some(s => s.tier === 'term'));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
