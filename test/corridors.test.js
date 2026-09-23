// The corridor parser: pure string work over the DATA exit field, tested with
// no DOM. The exit field is human-entered and uses several separator
// conventions, so most of this file is about NOT over-reading it.
const fs = require('fs');
const path = require('path');
const C = require('../lib/corridors.js');
const { splitDataBlock, parseRowLine } = require('../tools/geocode.js');
let pass = 0, fail = 0;
const ok = (n, c, e = '') => { c ? (pass++, console.log('  PASS', n)) : (fail++, console.log('  FAIL', n, e)); };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const DATA = splitDataBlock(html).rowLines.map(parseRowLine);
const FUEL = DATA.filter(r => r[11] !== 'term');

console.log('=== the separator conventions, one case each ===');
// Every one of these is a real string from DATA. If the field is ever
// reformatted, these are what say so out loud.
ok('slash: "I-20/I-59, Exit 77" -> both',
   eq(C.corridorsForExit('I-20/I-59, Exit 77'), ['I-20', 'I-59']));
ok('full repeat: "I-40, Exit 280 / I-55, Exit 4" -> both',
   eq(C.corridorsForExit('I-40, Exit 280 / I-55, Exit 4'), ['I-40', 'I-55']));
ok('bare slash pair: "I-57/I-70" -> both',
   eq(C.corridorsForExit('I-57/I-70, Exit 160'), ['I-57', 'I-70']));
ok('ampersand: "I-35 & US 77, Exit 471" -> the interstate only',
   eq(C.corridorsForExit('I-35 & US 77, Exit 471'), ['I-35']));
ok('>>> comma with a state route: "I-95, SR 261, Exit 119" -> I-95 only',
   eq(C.corridorsForExit('I-95, SR 261, Exit 119'), ['I-95']));
// The specific trap a comma-splitting parser falls into.
ok('  and NOT "Exit" or "119" as corridors',
   !C.corridorsForExit('I-95, SR 261, Exit 119').some(c => /Exit|119|261/.test(c)));
ok('slash with a US route: "I-20/US441, Exit 114" -> I-20 only',
   eq(C.corridorsForExit('I-20/US441, Exit 114'), ['I-20']));

console.log('\n=== the E/W suffix folds into the parent route ===');
ok('>>> "I-35E, Exit 374" folds to I-35', eq(C.corridorsForExit('I-35E, Exit 374'), ['I-35']));
// The brief called TX7 the only suffixed row; OK2 is a second one, and it is
// the harder shape — the same route appears twice with opposite suffixes and
// must collapse to ONE corridor, not two.
ok('>>> "I-40E/I-35, Exit 127 / I-40W, Exit 154" -> I-40 and I-35, no duplicate',
   eq(C.corridorsForExit('I-40E/I-35, Exit 127 / I-40W, Exit 154'), ['I-40', 'I-35']));
ok('a suffix never invents a separate corridor',
   eq(C.corridorsForExit('I-40E, Exit 1 / I-40W, Exit 2'), ['I-40']));

console.log('\n=== digits are read whole, never as a prefix ===');
// This is the bug the whole filter exists to fix, at the parser level: the
// text search matches "I-5" inside "I-55". Parsing must not.
ok('"I-55" is I-55, not I-5', eq(C.corridorsForExit('I-55, Exit 1'), ['I-55']));
ok('"I-5" is I-5, not I-55', eq(C.corridorsForExit('I-5, Exit 99'), ['I-5']));
ok('"I-4" does not yield I-40 or I-44', eq(C.corridorsForExit('I-4, Exit 55'), ['I-4']));
ok('"I-40" does not yield I-4', eq(C.corridorsForExit('I-40, Exit 283'), ['I-40']));

console.log('\n=== the three hand-mapped stops ===');
ok('the override map holds exactly three ids',
   eq(Object.keys(C.CORRIDOR_OVERRIDES).sort(), ['CA1', 'TX6', 'TX14'].sort()),
   JSON.stringify(Object.keys(C.CORRIDOR_OVERRIDES)));
ok('CA1 TA Livingston -> SR 99', eq(C.corridorsForRow('CA1', 'SR 99, Exit 203'), ['SR 99']));
ok('TX6 TA Ganado -> US 59 (the field says "Hwy 59")',
   eq(C.corridorsForRow('TX6', 'Hwy 59, Exit 522E'), ['US 59']));
ok('TX14 TA Edinburg -> US 281 (the field says "Hwy. 281")',
   eq(C.corridorsForRow('TX14', 'Hwy. 281, Exit FM 2812'), ['US 281']));
// An override must never shadow a real parse: if one of these rows ever gains
// an interstate in its exit field, the interstate wins.
ok('>>> a parsed interstate beats the override for the same id',
   eq(C.corridorsForRow('CA1', 'I-5, Exit 12'), ['I-5']));
// THE DANGLING-OVERRIDE GUARD: an id here that no longer exists in DATA is a
// silent dead entry, the same class of bug as a typo'd CLOSED_STOP_IDS.
const ids = new Set(DATA.map(r => r[0]));
ok('>>> every overridden id still exists in DATA',
   Object.keys(C.CORRIDOR_OVERRIDES).every(id => ids.has(id)),
   JSON.stringify(Object.keys(C.CORRIDOR_OVERRIDES).filter(id => !ids.has(id))));

console.log('\n=== NOTHING is parsed out of a non-interstate designation ===');
// GA4's "Hwy 36" is Georgia SR 36, not US 36. A normaliser that guessed would
// invent a road that does not exist, which is why parsing was declined.
ok('"I-75/Hwy 36, Exit 201" yields I-75 and nothing else',
   eq(C.corridorsForExit('I-75/Hwy 36, Exit 201'), ['I-75']));
ok('a bare non-interstate with no override yields nothing at all',
   eq(C.corridorsForRow('ZZ9', 'SR 261, Exit 119'), []));
ok('an empty exit with no override yields nothing',
   eq(C.corridorsForRow('ZZ9', ''), []) && eq(C.corridorsForRow('ZZ9', null), []));

console.log('\n=== numeric ordering, which is the whole point of the dropdown ===');
ok('>>> I-4 sorts before I-10 (lexical order would not)',
   C.compareCorridors('I-4', 'I-10') < 0);
ok('I-5 before I-10', C.compareCorridors('I-5', 'I-10') < 0);
ok('I-10 before I-12', C.compareCorridors('I-10', 'I-12') < 0);
ok('I-95 after I-80', C.compareCorridors('I-95', 'I-80') > 0);
ok('interstates come before non-interstates',
   C.compareCorridors('I-95', 'SR 99') < 0 && C.compareCorridors('US 59', 'I-4') > 0);
ok('non-interstates order alphabetically among themselves',
   C.compareCorridors('SR 99', 'US 59') < 0 && C.compareCorridors('US 281', 'US 59') < 0);
{
  const sorted = ['I-10', 'US 59', 'I-4', 'SR 99', 'I-95', 'I-5'].sort(C.compareCorridors);
  ok('>>> a mixed list sorts I-4, I-5, I-10, I-95, then the rest',
     eq(sorted, ['I-4', 'I-5', 'I-10', 'I-95', 'SR 99', 'US 59']), JSON.stringify(sorted));
}

console.log('\n=== against the real DATA ===');
// THE REGRESSION THAT MATTERS MOST. Every fuel stop must land on at least one
// corridor. LA7 TA Express Laplace had a BLANK exit field until v1.28.0; this
// is what catches the next blank, or a reformat that stops parsing.
const orphans = FUEL.filter(r => C.corridorsForRow(r[0], r[7]).length === 0);
ok(`>>> all ${FUEL.length} fuel stops yield at least one corridor`,
   orphans.length === 0, JSON.stringify(orphans.map(r => [r[0], r[2], r[7]])));
// The LA7 correction itself, pinned by id so a re-blanked field fails loudly.
{
  const la7 = DATA.find(r => r[0] === 'LA7');
  ok('LA7 TA Express Laplace has a non-empty exit field', !!String(la7[7]).trim(), JSON.stringify(la7[7]));
  ok('>>> and it parses as BOTH I-10 and I-55',
     eq(C.corridorsForRow('LA7', la7[7]), ['I-10', 'I-55']), JSON.stringify(C.corridorsForRow('LA7', la7[7])));
  ok('  matching the two-corridor format AR2 already used',
     /I-10, Exit 209 \/ I-55, Exit 1/.test(la7[7]), la7[7]);
}

const index = C.corridorIndex(FUEL.map(r => [r[0], r[7]]));
const interstates = index.filter(e => /^I-/.test(e.corridor));
const others = index.filter(e => !/^I-/.test(e.corridor));
ok('>>> 36 interstate corridors', interstates.length === 36, String(interstates.length));
ok('>>> plus exactly 3 non-interstates', others.length === 3, JSON.stringify(others.map(e => e.corridor)));
ok('  and the non-interstates sort last', index.slice(-3).every(e => !/^I-/.test(e.corridor)),
   JSON.stringify(index.slice(-4).map(e => e.corridor)));
ok('  the index is in numeric order end to end',
   eq(index.map(e => e.corridor), [...index.map(e => e.corridor)].sort(C.compareCorridors)));
ok('  no duplicate entries', new Set(index.map(e => e.corridor)).size === index.length);

// The long tail the count display exists to make legible.
{
  const by = Object.fromEntries(index.map(e => [e.corridor, e.count]));
  ok('I-40 carries 13 stops', by['I-40'] === 13, String(by['I-40']));
  // I-10 is 13 too, not the 12 the pre-fix survey found: LA7 was the blank
  // exit field, and giving it "I-10, Exit 209 / I-55, Exit 1" adds a stop to
  // I-10 and to I-55. That the correction moves a real count is the clearest
  // evidence it was a genuine hole rather than a cosmetic tidy-up.
  ok('I-10 carries 13 after the LA7 fix (12 before it)', by['I-10'] === 13, String(by['I-10']));
  ok('I-95 and I-80 carry 12 each',
     by['I-95'] === 12 && by['I-80'] === 12, JSON.stringify([by['I-95'], by['I-80']]));
  ok('I-55 gained LA7 as well', by['I-55'] === 4, String(by['I-55']));
  ok('I-20 and I-75 carry 11 each', by['I-20'] === 11 && by['I-75'] === 11,
     JSON.stringify([by['I-20'], by['I-75']]));
  ok('I-70 carries 10', by['I-70'] === 10, String(by['I-70']));
  ok('the three hand-mapped corridors carry one stop each',
     by['SR 99'] === 1 && by['US 59'] === 1 && by['US 281'] === 1,
     JSON.stringify([by['SR 99'], by['US 59'], by['US 281']]));
  const tail = index.filter(e => e.count <= 3).length;
  ok('and the tail is long — twenty-plus corridors with three stops or fewer',
     tail >= 20, String(tail));
}

console.log('\n=== multi-corridor membership works from either side ===');
{
  const rowsFor = c => FUEL.filter(r => C.corridorsForRow(r[0], r[7]).includes(c)).map(r => r[0]);
  const i20 = rowsFor('I-20'), i59 = rowsFor('I-59');
  const both = i20.filter(id => i59.includes(id));
  ok('at least one stop is on BOTH I-20 and I-59', both.length > 0, JSON.stringify(both));
  const multi = FUEL.filter(r => C.corridorsForRow(r[0], r[7]).length > 1);
  ok('25 stops sit on two or more corridors after the LA7 fix',
     multi.length === 25, String(multi.length));
  ok('LA7 is one of them', multi.some(r => r[0] === 'LA7'));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
