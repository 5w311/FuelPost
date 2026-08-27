// Amenity filters, asserted against the REAL DATA array.
//
// passes() lives in index.html (per the original brief, filtering stays there
// rather than moving to a lib), so this mirrors its amenity predicates — but
// SHOWERS_MANY is PARSED OUT OF THE SOURCE rather than repeated here. If the
// threshold is retuned this test follows it automatically; if the parse fails,
// the test fails loudly rather than silently checking nothing.
//
// The counts below are the point: they catch a future DATA refresh that
// quietly invalidates a filter — specifically one that starts matching
// everything, which is a control that looks broken to a driver. That is not
// hypothetical. The previous set was removed for exactly this: CAT scale
// matched 144 of 144 rows and could not remove a single stop, 100+ parking
// matched 79%, and 4+ bays 71%. A filter earns its place by landing roughly
// between 15% and 60%.
//
// POPULATION MATTERS AND IS EASY TO GET WRONG. passes() runs over all 144 DATA
// rows, terminals included, so the count a driver sees on screen is over 144.
// Counts over the 143 non-terminal stops differ, because TN6 (the Covenant HQ
// terminal) carries both a fitness room and 30 showers. Both are asserted
// below and labelled, so neither can quietly rot into the other.
//
// v1.31.0 moved these: DATA went 146 -> 144 and stops 144 -> 143 when TA
// Corning and the Greenville terminal came out. Only the showers counts
// actually changed value (TA Corning had 10); the rest moved denominator only,
// which is why they are re-stated here rather than left to look stale.

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
const SHOWERS_MANY = constOf('SHOWERS_MANY');

console.log('=== the threshold is readable from source ===');
ok('SHOWERS_MANY parsed', SHOWERS_MANY !== null, String(SHOWERS_MANY));
ok('  and is unchanged at 10', SHOWERS_MANY === 10, String(SHOWERS_MANY));
// Removed constants must be gone, not merely unreferenced.
ok('PARKING_LARGE is gone from the source', constOf('PARKING_LARGE') === null);
ok('BAYS_MANY is gone from the source', constOf('BAYS_MANY') === null);

// Mirrors passes()'s amenity clauses exactly, including EXACT membership on
// the comma-separated amenity column rather than a substring test.
const hasCode = (r, c) => String(r[16] || '').split(',').some(x => x.trim() === c);
const amen = {
  showers:    r => Number(r[14]) >= SHOWERS_MANY,
  gym:        r => hasCode(r, 'F') || hasCode(r, 'O'),
  restaurant: r => hasCode(r, 'R')
};
const applyAll = (rows, keys) => rows.filter(r => keys.every(k => amen[k](r)));
const STOPS = DATA.filter(r => r[11] !== 'term');

console.log('\n=== each filter discriminates, and none is a dead control ===');
ok(`fixture: DATA has 144 rows`, DATA.length === 144, String(DATA.length));
for (const k of ['showers', 'gym', 'restaurant']) {
  const n = applyAll(DATA, [k]).length;
  const pct = 100 * n / DATA.length;
  ok(`${k}: keeps ${n}/144 (${pct.toFixed(0)}%), neither a no-op nor empty`,
     n > 0 && n < DATA.length, `${n}/144`);
  ok(`  and lands in the 15-60% band a filter has to earn`,
     pct >= 15 && pct <= 60, `${pct.toFixed(1)}%`);
}

console.log('\n=== exact counts, over BOTH populations ===');
// What a driver actually sees, since passes() runs over all of DATA.
ok('10+ showers keeps 75 of 144 DATA rows', applyAll(DATA, ['showers']).length === 75,
   String(applyAll(DATA, ['showers']).length));
ok('gym keeps 38 of 144 DATA rows', applyAll(DATA, ['gym']).length === 38,
   String(applyAll(DATA, ['gym']).length));
ok('sit-down keeps 70 of 144 DATA rows', applyAll(DATA, ['restaurant']).length === 70,
   String(applyAll(DATA, ['restaurant']).length));
// Over stops only — one lower for showers and gym, because the HQ terminal
// TN6 has a fitness room and 30 showers.
ok('  over the 143 non-terminal stops: showers 74', applyAll(STOPS, ['showers']).length === 74,
   String(applyAll(STOPS, ['showers']).length));
ok('  over the 143 non-terminal stops: gym 37', applyAll(STOPS, ['gym']).length === 37,
   String(applyAll(STOPS, ['gym']).length));
ok('  over the 143 non-terminal stops: sit-down 70', applyAll(STOPS, ['restaurant']).length === 70,
   String(applyAll(STOPS, ['restaurant']).length));
ok('  the difference is exactly TN6, which has a gym and 30 showers',
   amen.gym(DATA.find(r => r[0] === 'TN6')) && amen.showers(DATA.find(r => r[0] === 'TN6')));

console.log('\n=== gym counts BOTH F and O ===');
// O is only two rows, but NEITHER also carries F, so a filter that tested F
// alone would silently hide them from a driver looking for a gym.
const oRows = DATA.filter(r => hasCode(r, 'O'));
ok('there really are O rows to lose', oRows.length === 2, JSON.stringify(oRows.map(r => r[0])));
ok('>>> and none of them also carries F — dropping O would hide them entirely',
   oRows.every(r => !hasCode(r, 'F')), JSON.stringify(oRows.map(r => r[16])));
ok('>>> the gym filter matches every O row', oRows.every(amen.gym));
ok('the gym filter matches F rows', DATA.filter(r => hasCode(r, 'F')).every(amen.gym));
ok('and excludes rows with neither F nor O',
   DATA.filter(r => !hasCode(r, 'F') && !hasCode(r, 'O')).every(r => !amen.gym(r)));
// Named rows from the device check.
ok('  Petro Raphine (VA4) is matched by the gym filter', amen.gym(DATA.find(r => r[0] === 'VA4')));
ok('  TA Tuscaloosa (AL2, bean bag toss only) is not', !amen.gym(DATA.find(r => r[0] === 'AL2')));

console.log('\n=== membership is EXACT, not substring ===');
// The whole reason for splitting on comma. No code is a substring of another
// today, so a naive includes() would pass every real-data test and fail the
// day someone adds one — assert against a hypothetical directly.
const fake = ['X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 0, 0, 'prim', 0, 0, 0, 0, 'W,BR', '', 1, 1, 'X'];
ok('>>> a row whose codes contain "BR" is NOT matched by the R filter',
   !amen.restaurant(fake), JSON.stringify(fake[16]));
ok('  a naive substring test WOULD have matched it (proving the guard is live)',
   String(fake[16]).includes('R'));
const fakeF = ['X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 0, 0, 'prim', 0, 0, 0, 0, 'FX', '', 1, 1, 'X'];
ok('>>> a row whose codes contain "FX" is NOT matched by the gym filter',
   !amen.gym(fakeF), JSON.stringify(fakeF[16]));
ok('whitespace around a code still matches exactly',
   amen.restaurant(['X','X','X','X','X','X','X','X','X',0,0,'prim',0,0,0,0,'W, R','',1,1,'X']));
ok('an empty amenity column matches nothing',
   !amen.gym(['X','X','X','X','X','X','X','X','X',0,0,'prim',0,0,0,0,'','',1,1,'X'])
   && !amen.restaurant(['X','X','X','X','X','X','X','X','X',0,0,'prim',0,0,0,0,'','',1,1,'X']));

console.log('\n=== filters AND together ===');
const all3 = applyAll(DATA, ['showers', 'gym', 'restaurant']);
ok('all three combined is a subset of each alone',
   all3.length <= Math.min(...['showers','gym','restaurant'].map(k => applyAll(DATA, [k]).length)),
   String(all3.length));
ok('every survivor satisfies all three predicates',
   all3.every(r => amen.showers(r) && amen.gym(r) && amen.restaurant(r)));
ok('the intersection is exactly the rows matching all three',
   all3.length === DATA.filter(r => amen.showers(r) && amen.gym(r) && amen.restaurant(r)).length);
console.log(`  (all three combined: ${all3.length} stops)`);
const gr = applyAll(DATA, ['gym', 'restaurant']).length;
ok('two combined is no larger than either alone',
   gr <= applyAll(DATA, ['gym']).length && gr <= applyAll(DATA, ['restaurant']).length,
   String(gr));

console.log('\n=== combined with brand / state, which still AND ===');
const ta = DATA.filter(r => r[1] === 'TA');
const taGym = applyAll(ta, ['gym']);
ok('brand + gym narrows within the brand',
   taGym.length > 0 && taGym.length <= ta.length && taGym.every(r => r[1] === 'TA'),
   `${taGym.length}/${ta.length}`);
const tx = DATA.filter(r => r[5] === 'TX');
const txAll = applyAll(tx, ['showers', 'gym', 'restaurant']);
ok('state + all three amenities stays inside the state',
   txAll.every(r => r[5] === 'TX') && txAll.length <= tx.length, `${txAll.length}/${tx.length}`);

console.log('\n=== a zero result is genuinely reachable (the empty state is real) ===');
// The new set is narrower than the old one, so three taps in one state can
// return nothing — which is why the empty state gained a way back.
const zeroState = DATA.filter(r => r[5] === 'AL');
const zeroCombo = applyAll(zeroState, ['showers', 'gym', 'restaurant']);
ok('>>> gym + sit-down + 10 showers in one state really can return zero',
   zeroCombo.length === 0, `AL -> ${zeroCombo.length}`);

console.log('\n=== the filter row itself ===');
const wrap = html.slice(html.indexOf('id="amenWrap"'), html.indexOf('</div>', html.indexOf('id="amenWrap"')));
const btns = [...wrap.matchAll(/data-amen="([a-z]+)"/g)].map(m => m[1]);
ok('>>> exactly three amenity buttons', btns.length === 3, JSON.stringify(btns));
ok('  they are showers, gym, restaurant, in that order',
   btns.join(',') === 'showers,gym,restaurant', JSON.stringify(btns));
ok('>>> no button carries a removed value',
   !btns.some(b => ['parking','service','scale'].includes(b)), JSON.stringify(btns));
ok('the removed buttons are DELETED, not hidden or disabled',
   !/data-amen="(parking|service|scale)"/.test(html));
// Accessibility landed once already; do not regress it while editing markup.
ok('every button keeps aria-pressed', (wrap.match(/aria-pressed="false"/g) || []).length === 3);
ok('the wrapper keeps role=group and its label',
   /role="group" aria-label="Amenity filters"/.test(html));
ok('the heading still describes the row', /What do you need tonight\?/.test(html));
ok('the restaurant button says SIT-DOWN, not just "Restaurant"',
   />Sit-down restaurant</.test(html) && !/>Restaurant</.test(html));
ok('the gym button matches the sheet vocabulary ("Fitness room")',
   />Fitness room</.test(html) && /F:"Fitness room"/.test(html));

console.log('\n=== the empty state offers a way back ===');
ok('there is a clear-filters control in the no-match chip',
   /id="noMatch"[^>]*>[^<]*<button type="button" id="clearFiltersBtn">Clear filters<\/button>/.test(html));
ok('it resets all three amenity toggles',
   /state\.showers = state\.gym = state\.restaurant = false;/.test(html));
// Corridor joined the list in v1.28.0; brand and tier left it in v1.32.0.
// Every dimension that can empty the map has to be reset, or the driver is
// left with a filter they cannot see and cannot clear.
ok('  and both multi-selects too',
   /state\[m\.key\]\.clear\(\);/.test(html) && /const FILTER_MULTIS = \[/.test(html));
ok('  the CHECKBOXES are reset as well, not just the sets behind them',
   /cb\.checked = false;/.test(html));
// v1.32.0: one function, two buttons. The no-match panel's button is the one a
// driver reaches when the map is already empty, so a second drifting copy of
// the reset logic would be expensive exactly where it hurts most.
ok('>>> BOTH reset buttons call the same named function',
   /getElementById\('clearFiltersBtn'\)\.addEventListener\('click', resetFilters\);/.test(html)
   && /getElementById\('resetFiltersBtn'\)\.addEventListener\('click', resetFilters\);/.test(html));
ok('  and there is exactly one copy of the clearing logic',
   (html.match(/state\.showers = state\.gym = state\.restaurant = false;/g) || []).length === 1);
// Nothing may quietly relax a filter to avoid an empty result. Checked on
// CODE, not prose: filter state is only ever written by the toggle handler
// and the explicit clear button — never from render() or passes(), which is
// where an "if nothing matched, drop a filter" fallback would have to live.
const code = html.split('\n').map(l => l.replace(/^\s*\/\/.*$/, '')).join('\n');
const renderFn = code.slice(code.indexOf('function render(){'));
const renderBody = renderFn.slice(0, renderFn.indexOf('\n}\n') + 3);
const passesFn = code.slice(code.indexOf('function passes(row){'));
const passesBody = passesFn.slice(0, passesFn.indexOf('\n}\n') + 3);
ok('>>> render() never writes filter state (no auto-widening fallback)',
   !/state\.(showers|gym|restaurant|brand|type|st)\s*=[^=]/.test(renderBody));
ok('>>> passes() never writes filter state either',
   !/state\.\w+\s*=[^=]/.test(passesBody));
ok('  passes() only ever rejects — every amenity clause is a plain guard',
   (passesBody.match(/return false;/g) || []).length >= 3 && /return true;/.test(passesBody));

console.log(`\n${p} passed, ${f} failed`);
if (f) process.exitCode = 1;
