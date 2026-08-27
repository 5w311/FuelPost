// v1.32.0 — state and corridor as MULTI-SELECT, and the removal of the brand
// and tier filters.
//
// passes() lives in index.html and cannot be required, so this mirrors it the
// way amenityfilter.test.js does — and then PINS the mirror against the real
// source, because a mirror that has drifted proves things about itself rather
// than about the app. Every semantic assertion below is only worth what those
// source pins are worth.
//
// The combination rule is the thing this file exists to hold still:
//   WITHIN a dimension  -> OR   (TX or OK; I-20 or I-59)
//   ACROSS dimensions   -> AND  (TX/OK, and on I-40, and with showers)
// An EMPTY selection is no constraint at all.

const fs = require('fs');
const path = require('path');
const { splitDataBlock, parseRowLine } = require('../tools/geocode.js');
const Corridors = require('../lib/corridors.js');

let pass = 0, fail = 0;
const ok = (n, c, e = '') => { c ? (pass++, console.log('  PASS', n)) : (fail++, console.log('  FAIL', n, e)); };

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
// Comment-stripped for every source pin below. Three releases running, a
// matcher aimed at code has instead matched the sentence describing it —
// v1.30.1's version guard, v1.31.0's revision guard and its call-site check.
const code = html
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map(l => l.replace(/^\s*\/\/.*$/, '')).join('\n');
// And a markup view with HTML comments stripped, for the same reason: the
// comment above the filter card explains WHY there is no <select multiple>,
// by writing "<select multiple>". Asserting its absence against raw html
// therefore failed on the sentence saying it is absent — the same trap in its
// fourth costume this month, so both views exist up front now.
const markup = html.replace(/<!--[\s\S]*?-->/g, '');
const DATA = splitDataBlock(html).rowLines.map(parseRowLine);
const ROW_CORRIDORS = new Map(DATA.map(r => [r, Corridors.corridorsForRow(r[0], r[7])]));
const SHOWERS_MANY = Number((html.match(/const SHOWERS_MANY\s*=\s*(\d+)/) || [])[1]);

// ---------------------------------------------------------------- the mirror
const hasCode = (r, c) => String(r[16] || '').split(',').some(x => x.trim() === c);
function passes(row, st) {
  if (st.st.size && !st.st.has(row[5])) return false;
  if (st.corridor.size
      && !(ROW_CORRIDORS.get(row) || []).some(c => st.corridor.has(c))) return false;
  if (st.q) {
    // row[20], the nav code, joined the haystack in v1.33.0. This mirror had
    // to move with it — the tests here search for 'a' and 'dallas', which
    // match through name and city either way, so a stale mirror would have
    // gone on passing while quietly describing a different function. The pin
    // below is what actually catches that.
    const hay = (row[2] + ' ' + row[4] + ' ' + row[5] + ' ' + row[7] + ' ' + row[20]).toLowerCase();
    if (!hay.includes(st.q)) return false;
  }
  if (st.showers && !(Number(row[14]) >= SHOWERS_MANY)) return false;
  if (st.gym && !(hasCode(row, 'F') || hasCode(row, 'O'))) return false;
  if (st.restaurant && !hasCode(row, 'R')) return false;
  return true;
}
const S = (o = {}) => ({
  st: new Set(o.st || []), corridor: new Set(o.corridor || []),
  q: o.q || '', showers: !!o.showers, gym: !!o.gym, restaurant: !!o.restaurant
});
const run = o => DATA.filter(r => passes(r, S(o)));
const ids = rows => rows.map(r => r[0]).sort();

// Mirrors index.html's filtersActive(). Search is deliberately absent — see
// the reset section at the bottom.
const filtersActive = st =>
  st.st.size > 0 || st.corridor.size > 0 || st.showers || st.gym || st.restaurant;

console.log('=== the mirror above still matches index.html ===');
// If any of these fail, everything below is testing a fiction.
ok('>>> state is a membership test on row[5], guarded on .size',
   /if\(state\.st\.size && !state\.st\.has\(row\[5\]\)\) return false;/.test(code));
ok('>>> corridor intersects the row\'s corridor list, guarded on .size',
   /if\(state\.corridor\.size\s*&& !\(ROW_CORRIDORS\.get\(row\) \|\| \[\]\)\.some\(c => state\.corridor\.has\(c\)\)\) return false;/.test(code));
ok('>>> both are declared as Sets, not strings',
   /let state = \{st:new Set\(\), corridor:new Set\(\), q:''/.test(code));
// The search clause is pinned here for the same reason the others are: this
// file's `q` cases would keep passing against a haystack that had gained or
// lost a column, so only the source pin can tell.
ok('>>> the search haystack is exactly the five columns this mirror joins',
   /const hay = \(row\[2\]\+' '\+row\[4\]\+' '\+row\[5\]\+' '\+row\[7\]\+' '\+row\[20\]\)\.toLowerCase\(\);/.test(code));
ok('  and the amenity clauses this mirror copies are unchanged',
   /if\(state\.showers\s+&& !\(Number\(row\[14\]\) >= SHOWERS_MANY\)\) return false;/.test(code)
   && /if\(state\.restaurant && !hasAmenCode\(row,'R'\)\) return false;/.test(code));
ok('  SHOWERS_MANY was parsed', SHOWERS_MANY === 10, String(SHOWERS_MANY));

console.log('\n=== brand and tier filters are GONE ===');
// Removed because they are not questions a driver asks — NOT because they
// failed the selectivity bar. Both facts are recorded here so nobody
// "restores" them on the theory that they were unselective: 31 Petro and 31
// Exclusive, only 5 rows carrying both, each 21.5% of the network, comfortably
// inside the 15-60% band the amenity filters are judged on.
{
  const petro = DATA.filter(r => r[1] === 'Petro');
  const excl = DATA.filter(r => r[11] === 'excl');
  const both = DATA.filter(r => r[1] === 'Petro' && r[11] === 'excl');
  ok('fixture: 31 Petro and 31 Exclusive', petro.length === 31 && excl.length === 31,
     JSON.stringify([petro.length, excl.length]));
  ok('  overlapping in only 5 rows — they were not redundant with each other',
     both.length === 5, String(both.length));
  ok('  and both sat at 21.5%, INSIDE the selectivity band, not below it',
     Math.abs(100 * petro.length / DATA.length - 21.5) < 0.1
     && 100 * excl.length / DATA.length > 15, String(100 * petro.length / DATA.length));

  ok('>>> no brandSeg in the markup', !/brandSeg/.test(markup));
  ok('>>> no typeSeg in the markup', !/typeSeg/.test(markup));
  ok('>>> state.brand is gone from the code', !/state\.brand/.test(code));
  ok('>>> state.type is gone from the code', !/state\.type/.test(code));
  // The columns themselves must NOT have gone with the filters.
  ok('>>> row[1] is still read — pin colour and the list dot',
     /row\[1\]==='TA' \? 'var\(--ta\)'/.test(code));
  ok('>>> row[11] is still read — the Exclusive tag in the list',
     /row\[11\]==='excl'\?'<span class="tag">Exclusive<\/span>'/.test(code));
  ok('  and tierBadge still exists for the result cards and the sheet',
     /tierBadge/.test(code));
  ok('  every row still carries both columns',
     DATA.every(r => typeof r[1] === 'string' && typeof r[11] === 'string'));
}

console.log('\n=== empty means no constraint ===');
ok('>>> no selection matches every row', run({}).length === DATA.length, String(run({}).length));
ok('  an empty Set is not mistaken for a filter (it is truthy!)',
   run({ st: [], corridor: [] }).length === DATA.length);
ok('  and filtersActive() says nothing is on', filtersActive(S()) === false);

console.log('\n=== one value behaves exactly like the old single select ===');
{
  const tx = run({ st: ['TX'] });
  ok('one state returns exactly that state\'s rows',
     tx.length === DATA.filter(r => r[5] === 'TX').length && tx.every(r => r[5] === 'TX'),
     String(tx.length));
  const i40 = run({ corridor: ['I-40'] });
  ok('one corridor returns exactly that corridor\'s rows',
     i40.every(r => (ROW_CORRIDORS.get(r) || []).includes('I-40'))
     && i40.length === DATA.filter(r => (ROW_CORRIDORS.get(r) || []).includes('I-40')).length,
     String(i40.length));
  ok('  and both flip filtersActive() on',
     filtersActive(S({ st: ['TX'] })) && filtersActive(S({ corridor: ['I-40'] })));
}

console.log('\n=== two values return the UNION, within a dimension ===');
{
  const tx = run({ st: ['TX'] }), ok_ = run({ st: ['OK'] });
  const union = run({ st: ['TX', 'OK'] });
  ok('>>> two states are OR, not AND',
     union.length === tx.length + ok_.length, `${union.length} vs ${tx.length}+${ok_.length}`);
  ok('  which is strictly more than either alone (or the test proves nothing)',
     union.length > tx.length && union.length > ok_.length,
     JSON.stringify([union.length, tx.length, ok_.length]));
  ok('  and every row is one or the other',
     union.every(r => r[5] === 'TX' || r[5] === 'OK'));
  ok('  order of selection does not matter',
     ids(run({ st: ['OK', 'TX'] })).join() === ids(union).join());

  const a = run({ corridor: ['I-20'] }), b = run({ corridor: ['I-59'] });
  const cu = run({ corridor: ['I-20', 'I-59'] });
  ok('>>> two corridors are OR too', cu.every(r => {
    const c = ROW_CORRIDORS.get(r) || [];
    return c.includes('I-20') || c.includes('I-59');
  }) && cu.length === new Set([...a, ...b]).size, `${cu.length} vs ${new Set([...a, ...b]).size}`);
  ok('  and it is a genuine union — these two corridors DO share stops',
     a.length + b.length > cu.length, `${a.length}+${b.length} vs ${cu.length}`);
}

console.log('\n=== a stop on two corridors matches under EITHER, and appears ONCE ===');
{
  // TA Tuscaloosa (AL2) is on I-20 and I-59. 25 stops sit on two or more
  // interstates, which is why corridor was a membership test before
  // multi-select and set-intersects-set after it.
  const al2 = DATA.find(r => r[0] === 'AL2');
  ok('fixture: AL2 really carries both corridors',
     JSON.stringify(ROW_CORRIDORS.get(al2)) === '["I-20","I-59"]',
     JSON.stringify(ROW_CORRIDORS.get(al2)));
  ok('>>> it matches under I-20', run({ corridor: ['I-20'] }).includes(al2));
  ok('>>> it matches under I-59', run({ corridor: ['I-59'] }).includes(al2));
  // The failure this guards: an implementation that iterated the SELECTION and
  // collected matches would emit the row once per matching corridor.
  const both = run({ corridor: ['I-20', 'I-59'] });
  ok('>>> and with BOTH selected it appears exactly once, not twice',
     both.filter(r => r === al2).length === 1,
     String(both.filter(r => r === al2).length));
  ok('  the whole result set is duplicate-free',
     new Set(both.map(r => r[0])).size === both.length);
  ok('  25 stops sit on 2+ corridors, so this is not a one-row curiosity',
     [...ROW_CORRIDORS.values()].filter(v => v.length >= 2).length === 25,
     String([...ROW_CORRIDORS.values()].filter(v => v.length >= 2).length));
}

console.log('\n=== ACROSS dimensions everything stays AND ===');
{
  const st = run({ st: ['TX', 'OK'] });
  const co = run({ corridor: ['I-40'] });
  const both = run({ st: ['TX', 'OK'], corridor: ['I-40'] });
  ok('>>> state AND corridor intersect', both.every(r =>
    (r[5] === 'TX' || r[5] === 'OK') && (ROW_CORRIDORS.get(r) || []).includes('I-40')));
  ok('  and the intersection is smaller than either side',
     both.length < st.length && both.length < co.length,
     JSON.stringify([both.length, st.length, co.length]));
  ok('  it is not empty either, or the AND is untested',
     both.length > 0, String(both.length));

  // ...and with the amenity filters and the search box on top.
  const withAmen = run({ st: ['TX', 'OK'], corridor: ['I-40'], showers: true });
  ok('>>> plus an amenity filter narrows further still',
     withAmen.length <= both.length
     && withAmen.every(r => Number(r[14]) >= SHOWERS_MANY), String(withAmen.length));
  const withQ = run({ st: ['TX', 'OK'], corridor: ['I-40'], showers: true, q: 'a' });
  ok('>>> plus search narrows again, and every survivor satisfies ALL FOUR',
     withQ.every(r =>
       (r[5] === 'TX' || r[5] === 'OK')
       && (ROW_CORRIDORS.get(r) || []).includes('I-40')
       && Number(r[14]) >= SHOWERS_MANY
       && (r[2] + ' ' + r[4] + ' ' + r[5] + ' ' + r[7]).toLowerCase().includes('a')),
     JSON.stringify(withQ.map(r => r[0])));
  ok('  and that stack still returns something (not a vacuous pass)',
     withQ.length > 0, String(withQ.length));

  // A combination that legitimately returns nothing must return nothing —
  // no auto-widening. AL has 3 stops, I-10 has 13, and they never coincide.
  const empty = run({ st: ['AL'], corridor: ['I-10'] });
  ok('  each half of the empty case matches on its own',
     run({ st: ['AL'] }).length > 0 && run({ corridor: ['I-10'] }).length > 0);
  ok('>>> AL x I-10 is genuinely zero, and nothing relaxes to avoid it',
     empty.length === 0, String(empty.length));
}

console.log('\n=== the badge and the reset button cannot disagree ===');
// They are two consequences of one question. Two copies of the condition would
// eventually drift, leaving a badge with nothing behind it or a Reset button
// that never appears. index.html derives both from filtersActive().
{
  ok('>>> filtersActive() exists and tests .size on both sets',
     /function filtersActive\(\)\{[\s\S]{0,240}state\.st\.size > 0 \|\| state\.corridor\.size > 0/.test(code));
  const ufb = code.slice(code.indexOf('function updateFilterBadge()'));
  const body = ufb.slice(0, ufb.indexOf('\n}\n') + 3);
  ok('>>> updateFilterBadge calls it exactly once and drives BOTH from that',
     (body.match(/filtersActive\(\)/g) || []).length === 1
     && /filterBadge'\)\.hidden = !active/.test(body)
     && /resetFiltersBtn'\)\.hidden = !active/.test(body), body);
  ok('  and neither is set anywhere else',
     (code.match(/filterBadge'\)\.hidden/g) || []).length === 1
     && (code.match(/resetFiltersBtn'\)\.hidden/g) || []).length === 1);
  // THE BUG THIS PAIR EXISTS TO CATCH. Comparing a Set to 'all' is always
  // false, so the old condition would have pinned the badge on permanently and
  // left Reset filters visible with nothing to reset.
  ok('>>> nothing compares the sets to the old \'all\' sentinel',
     !/state\.(st|corridor)\s*[!=]==?\s*'all'/.test(code));
  ok('  (proving the trap is real: a Set is never equal to a string)',
     new Set() !== 'all' && new Set(['TX']) !== 'all');

  // The truth table, over the mirror.
  const cases = [
    [{}, false], [{ st: ['TX'] }, true], [{ corridor: ['I-40'] }, true],
    [{ showers: true }, true], [{ gym: true }, true], [{ restaurant: true }, true],
    [{ st: ['TX'], corridor: ['I-40'], showers: true }, true],
    [{ q: 'dallas' }, false]
  ];
  cases.forEach(([o, want]) =>
    ok(`  filtersActive(${JSON.stringify(o)}) === ${want}`, filtersActive(S(o)) === want));
}

console.log('\n=== reset: one function, two buttons, and it leaves search alone ===');
{
  ok('>>> the reset logic is a named function, not an inline handler',
     /function resetFilters\(\)\{/.test(code));
  ok('>>> BOTH buttons are wired to that same function',
     /getElementById\('clearFiltersBtn'\)\.addEventListener\('click', resetFilters\);/.test(code)
     && /getElementById\('resetFiltersBtn'\)\.addEventListener\('click', resetFilters\);/.test(code));
  ok('  and there is no second copy of the clearing logic',
     (code.match(/state\.showers = state\.gym = state\.restaurant = false;/g) || []).length === 1);
  ok('  it clears both sets', /state\[m\.key\]\.clear\(\);/.test(code));
  ok('  unchecks every box', /#\$\{m\.list\} input`\)\.forEach\(cb => \{ cb\.checked = false; \}\);/.test(code));
  ok('>>> and COLLAPSES the disclosures', /setFilterListOpen\(m, false\);/.test(code));
  ok('  refreshing the summaries back to their empty labels',
     /refreshFilterSummary\(m\);/.test(code));
  // THE BOUNDARY. Search is a separate control with its own visible clear
  // button; a driver who typed a city and then tapped Reset filters would not
  // expect to lose it. That is also why filtersActive() ignores state.q — the
  // button that does not clear search must not appear because search is set.
  const rf = code.slice(code.indexOf('function resetFilters()'));
  const rfBody = rf.slice(0, rf.indexOf('\n}\n') + 3);
  ok('>>> resetFilters NEVER touches state.q', !/state\.q/.test(rfBody), rfBody);
  ok('>>> nor the search input', !/searchInput/.test(rfBody), rfBody);
  ok('  and filtersActive ignores search, so the two rules agree',
     !/state\.q/.test(code.slice(code.indexOf('function filtersActive()'),
                                 code.indexOf('function updateFilterBadge()'))));
}

console.log('\n=== the controls themselves ===');
{
  ok('>>> NO <select multiple> anywhere — the two platforms render it differently',
     !/<select[^>]*\bmultiple\b/.test(markup));
  ok('  (and the reason it is absent is still written down)',
     /Deliberately NOT &lt;select multiple&gt;|Deliberately NOT <select multiple>/.test(html));
  ok('>>> no <select> at all is left in the filter card',
     !/<select/.test(markup.slice(markup.indexOf('<div id="filterCard">'),
                                  markup.indexOf('<div id="scrim">'))));
  ok('  and no leftover single selects anywhere',
     !/id="stateSel"/.test(markup) && !/id="corridorSel"/.test(markup));
  ['state', 'corridor'].forEach(d => {
    ok(`>>> ${d} uses the disclosure pattern (aria-expanded + aria-controls)`,
       new RegExp(`id="${d}Toggle"[\\s\\S]{0,160}aria-expanded="false"[\\s\\S]{0,80}aria-controls="${d}List"`).test(markup));
    ok(`  with a named group for its list`,
       new RegExp(`id="${d}List" role="group" aria-label="[^"]+"`).test(markup));
    ok(`  shipped EMPTY — built from DATA at startup, never hardcoded`,
       new RegExp(`id="${d}List"[^>]*hidden></div>`).test(markup));
  });
  ok('  both are driven from one table, so they cannot drift apart',
     /const FILTER_MULTIS = \[/.test(code) && /FILTER_MULTIS\.forEach/.test(code));
  ok('>>> the state list is built from DATA', /const states = \[\.\.\.new Set\(DATA\.map\(r=>r\[5\]\)\)\]\.sort\(\);/.test(code));
  ok('>>> the corridor list is built through the shared parser',
     /Corridors\.corridorIndex\(/.test(code) && /const CORRIDOR_ITEMS = CORRIDOR_INDEX\.map/.test(code));
  ok('  keeping the count in the LABEL, so the value stays the bare corridor',
     /value: corridor, label: `\$\{corridor\} \(\$\{count\}\)`/.test(code));
  ok('>>> a reset control exists in the filter card, hidden until needed',
     /<button type="button" id="resetFiltersBtn" class="reset-filters stops-only" hidden>/.test(markup));
  ok('  the expanded list scrolls inside the card rather than growing it',
     /#filterCard \.fm-list\{max-height:\d+px;overflow-y:auto/.test(html));
}

console.log('\n=== the collapsed summary ===');
{
  // Mirrors filterSummary().
  const NAMES = Number((code.match(/const FM_SUMMARY_NAMES = (\d+)/) || [])[1]);
  ok('FM_SUMMARY_NAMES parsed', NAMES === 2, String(NAMES));
  const sum = (v, empty) => !v.length ? empty
    : v.length <= NAMES ? v.join(', ')
    : `${v.slice(0, NAMES).join(', ')} +${v.length - NAMES}`;
  ok('empty reads "All states"', sum([], 'All states') === 'All states');
  ok('one reads the value', sum(['TX'], 'All states') === 'TX');
  ok('two read both', sum(['TX', 'OK'], 'All states') === 'TX, OK');
  ok('>>> four read "TX, OK +2"', sum(['TX', 'OK', 'CA', 'GA'], 'All states') === 'TX, OK +2');
  ok('  and the source really uses that shape',
     /\$\{v\.slice\(0, FM_SUMMARY_NAMES\)\.join\(', '\)\} \+\$\{v\.length - FM_SUMMARY_NAMES\}/.test(code));
  ok('  with an ellipsis rule so an overlong summary cannot wrap the button',
     /#filterCard \.fm-sum\{[^}]*text-overflow:ellipsis;white-space:nowrap/.test(html));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
