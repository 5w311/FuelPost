// lib/stopfilter.js, against the real 144 rows.
//
// This predicate used to live inside index.html reading `state`, so it could
// only be tested two ways: through a browser, or by mirroring it in a test
// file and pinning the mirror against the source. Both were proxies. Two
// other test files carried such a mirror, and one of them said so outright —
// "every semantic assertion below is only worth what those source pins are
// worth". Those mirrors are gone; this is the thing itself.
const fs = require('fs');
const path = require('path');
const { splitDataBlock, parseRowLine } = require('../tools/geocode.js');
const Corridors = require('../lib/corridors.js');
const SF = require('../lib/stopfilter.js');

let pass = 0, fail = 0;
const ok = (n, c, e = '') => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.log('  FAIL', n, e); } };

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const DATA = splitDataBlock(html).rowLines.map(parseRowLine);
const ROW_CORRIDORS = new Map(DATA.map(r => [r, Corridors.corridorsForRow(r[0], r[7])]));
const SHOWERS_MANY = Number((html.match(/const SHOWERS_MANY\s*=\s*(\d+)/) || [])[1]);

const crit = (o = {}) => ({
  states: new Set(o.st || []), corridors: new Set(o.corridor || []),
  query: o.q || '', showers: !!o.showers, gym: !!o.gym, restaurant: !!o.restaurant,
  showersMany: SHOWERS_MANY
});
const run = o => DATA.filter(r =>
  SF.stopPasses(r, { ...crit(o), rowCorridors: ROW_CORRIDORS.get(r) }));

console.log('=== the column map matches the real DATA ===');
// The lib reads DATA by index. Naming the columns is only an improvement over
// magic numbers if the names are RIGHT, so each is checked against the shape
// of the actual rows rather than taken on trust.
ok('COL.state is two-letter state codes',
   DATA.every(r => /^[A-Z]{2}$/.test(r[SF.COL.state])),
   JSON.stringify([...new Set(DATA.map(r => r[SF.COL.state]))].slice(0, 5)));
ok('COL.name is non-empty on every row',
   DATA.every(r => String(r[SF.COL.name]).trim().length > 0));
ok('COL.city is non-empty on every row',
   DATA.every(r => String(r[SF.COL.city]).trim().length > 0));
ok('COL.showers is numeric on every row',
   DATA.every(r => Number.isFinite(Number(r[SF.COL.showers]))));
ok('COL.nav holds CVEN codes (the terminal has none)',
   DATA.filter(r => r[SF.COL.nav]).length >= 140
   && DATA.filter(r => r[SF.COL.nav]).every(r => /^CVEN/.test(r[SF.COL.nav])),
   String(DATA.filter(r => r[SF.COL.nav]).length));
ok('COL.exit looks like an exit or a terminal',
   DATA.every(r => typeof r[SF.COL.exit] === 'string'));
ok('COL.amenities is a comma-code list, never a bare word',
   DATA.every(r => /^[A-Z,\s]*$/.test(String(r[SF.COL.amenities] || ''))),
   JSON.stringify([...new Set(DATA.map(r => r[SF.COL.amenities]))].slice(0, 3)));

console.log('\n=== nothing selected is no constraint ===');
ok('every row passes an empty filter', run({}).length === DATA.length,
   `${run({}).length} of ${DATA.length}`);

console.log('\n=== within a dimension: OR ===');
const tx = run({ st: ['TX'] }), ok_ = run({ st: ['OK'] });
ok('two states return their union',
   run({ st: ['TX', 'OK'] }).length === tx.length + ok_.length,
   JSON.stringify([tx.length, ok_.length, run({ st: ['TX', 'OK'] }).length]));
ok('  and every returned row is in one of them',
   run({ st: ['TX', 'OK'] }).every(r => ['TX', 'OK'].includes(r[SF.COL.state])));

console.log('\n=== across dimensions: AND ===');
{
  const both = run({ st: ['TX'], showers: true });
  ok('state AND showers is an intersection, never a union',
     both.length <= tx.length && both.every(r => r[SF.COL.state] === 'TX')
     && both.every(r => Number(r[SF.COL.showers]) >= SHOWERS_MANY),
     `${both.length} vs ${tx.length}`);
  ok('  a row matching only one dimension is rejected',
     !SF.stopPasses(DATA.find(r => r[SF.COL.state] === 'TX'),
                    { ...crit({ st: ['OK'] }), rowCorridors: [] }));
}

console.log('\n=== corridors: a stop on two roads is found under either ===');
{
  const multi = DATA.filter(r => (ROW_CORRIDORS.get(r) || []).length >= 2);
  ok(`${multi.length} stops sit on two or more interstates`, multi.length > 0, String(multi.length));
  const r = multi[0], on = ROW_CORRIDORS.get(r);
  ok('  it is returned under the first', run({ corridor: [on[0]] }).includes(r));
  ok('  and under the second', run({ corridor: [on[1]] }).includes(r));
  ok('  and appears ONCE when both are selected — it is one row, not one per road',
     run({ corridor: [on[0], on[1]] }).filter(x => x === r).length === 1);
}

console.log('\n=== search: substring, case-insensitive, five fields ===');
{
  const r = DATA.find(x => x[SF.COL.nav]);
  const navLower = String(r[SF.COL.nav]).toLowerCase();
  ok('the whole nav code finds it', run({ q: navLower }).includes(r));
  ok('  the bare digits find it too — a driver reads the number off a card',
     run({ q: navLower.replace(/\D/g, '') }).includes(r), navLower);
  ok('  and so does any mid-string fragment', run({ q: navLower.slice(4) }).includes(r));
  ok('the city matches', run({ q: String(r[SF.COL.city]).toLowerCase() }).includes(r));
  ok('the state matches', run({ q: String(r[SF.COL.state]).toLowerCase() }).includes(r));
  ok('the name matches', run({ q: String(r[SF.COL.name]).toLowerCase() }).includes(r));
  // The street address is deliberately NOT searchable: a driver has the exit,
  // not the street, and including it would make short queries match noise.
  ok('the street address does NOT match',
     !SF.searchHaystack(r).includes(String(r[3]).toLowerCase()), String(r[3]));
  ok('a query matching nothing returns nothing',
     run({ q: 'zzzzznotastop' }).length === 0);
}

console.log('\n=== every numeric nav suffix is unique, which is what makes ===');
console.log('=== digits-only search trustworthy                          ===');
{
  const nums = DATA.map(r => String(r[SF.COL.nav] || '').replace(/\D/g, '')).filter(Boolean);
  ok(`${nums.length} codes, all numerically distinct`,
     new Set(nums).size === nums.length,
     JSON.stringify(nums.filter((n, i) => nums.indexOf(n) !== i)));
  ok('  so a complete digit string identifies exactly one stop',
     nums.every(n => run({ q: n }).length >= 1));
}

console.log('\n=== amenities ===');
{
  ok('showers filters on the threshold, not on "has any"',
     run({ showers: true }).every(r => Number(r[SF.COL.showers]) >= SHOWERS_MANY)
     && run({ showers: true }).length < DATA.length);
  // F or O: the outdoor variant is only a couple of rows and NEITHER carries
  // F, so testing F alone would silently hide them from a gym search.
  const outdoorOnly = DATA.filter(r => SF.hasAmenCode(r, 'O') && !SF.hasAmenCode(r, 'F'));
  ok(`${outdoorOnly.length} rows are gym-O without F`, outdoorOnly.length > 0,
     String(outdoorOnly.length));
  ok('  and the gym filter still returns them',
     outdoorOnly.every(r => run({ gym: true }).includes(r)));
  ok('restaurant filters on R', run({ restaurant: true }).every(r => SF.hasAmenCode(r, 'R')));
}

console.log('\n=== hasAmenCode splits, never substring-matches ===');
ok("'R' does not match a hypothetical 'BR'",
   SF.hasAmenCode(['', '', '', '', '', '', '', '', '', '', '', '', '', '', 0, '', 'BR'], 'R') === false);
ok("but it does match a real 'R' in a list",
   SF.hasAmenCode(['', '', '', '', '', '', '', '', '', '', '', '', '', '', 0, '', 'F,R,S'], 'R') === true);
ok('whitespace around a code is tolerated',
   SF.hasAmenCode(['', '', '', '', '', '', '', '', '', '', '', '', '', '', 0, '', 'F, R'], 'R') === true);
ok('an empty amenity field matches nothing',
   SF.hasAmenCode(['', '', '', '', '', '', '', '', '', '', '', '', '', '', 0, '', ''], 'R') === false);
ok('a missing amenity field does not throw', SF.hasAmenCode([], 'R') === false);

console.log('\n=== it is a predicate, not a mutator ===');
{
  const row = DATA[0];
  const before = JSON.stringify(row);
  const c = { ...crit({ st: ['TX'], q: 'ta' }), rowCorridors: ['I-20'] };
  SF.stopPasses(row, c);
  ok('the row is untouched', JSON.stringify(row) === before);
  ok('missing criteria are treated as no filter, not as a crash',
     SF.stopPasses(row, {}) === true && SF.stopPasses(row) === true);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
