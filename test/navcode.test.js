// v1.33.0 — the nav code moves OUT of the station sheet and INTO the list row
// and the search haystack.
//
// The promise this file exists to hold: a driver holding a code off a dispatch
// message or a fuel receipt can type the DIGITS ALONE and land on exactly one
// stop. That works only because every numeric suffix is unique across the whole
// network, which is a property of DATA rather than of the code — so it is
// asserted over DATA, not assumed, and cannot quietly stop being true when the
// fuel book revs.

const fs = require('fs');
const path = require('path');
const { splitDataBlock, parseRowLine } = require('../tools/geocode.js');

let pass = 0, fail = 0;
const ok = (n, c, e = '') => { c ? (pass++, console.log('  PASS', n)) : (fail++, console.log('  FAIL', n, e)); };

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
// Comment-stripped views, established in v1.32.0 after four separate
// assertions matched the sentence describing the code instead of the code.
const code = html
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map(l => l.replace(/^\s*\/\/.*$/, '')).join('\n');
const markup = html.replace(/<!--[\s\S]*?-->/g, '');
const DATA = splitDataBlock(html).rowLines.map(parseRowLine);

console.log('=== the codes themselves ===');
const withCode = DATA.filter(r => r[20]);
const noCode = DATA.filter(r => !r[20]);
ok('143 rows carry a nav code', withCode.length === 143, String(withCode.length));
ok('  exactly one does not — TN6, the Covenant HQ terminal',
   noCode.length === 1 && noCode[0][0] === 'TN6', JSON.stringify(noCode.map(r => r[0])));
ok('  every code looks like CVEN + brand + digits',
   withCode.every(r => /^CVEN(TA|PE)\d+$/.test(r[20])),
   JSON.stringify(withCode.filter(r => !/^CVEN(TA|PE)\d+$/.test(r[20])).map(r => r[20])));

// >>> THE PROPERTY DIGITS-ONLY SEARCH RESTS ON.
// If two codes ever shared a numeric suffix, typing those digits would return
// two stops and the driver would have no way to tell which is theirs. This is
// the assertion that turns "digits-only works" from a hope into a fact.
console.log('\n=== every numeric suffix is unique — what makes digits-only trustworthy ===');
{
  const suffix = c => /(\d+)$/.exec(c)[1];
  const suffixes = withCode.map(r => suffix(r[20]));
  const seen = new Map();
  suffixes.forEach((s, i) => { (seen.get(s) || seen.set(s, []).get(s)).push(withCode[i][0]); });
  const dupes = [...seen.entries()].filter(([, v]) => v.length > 1);
  ok('>>> all 143 numeric suffixes are distinct',
     seen.size === 143 && dupes.length === 0, JSON.stringify(dupes));
  // Digits shared ACROSS the TA/PE prefixes would also collide, since the
  // prefix is not part of what a driver types.
  ok('  including across the TA and PE prefixes, which digits-only ignores',
     new Set(withCode.map(r => suffix(r[20]))).size === withCode.length);
}

// -------------------------------------------------- the search mirror
// Mirrors passes()'s search clause, then pins the mirror against the source.
const hay = row => (row[2] + ' ' + row[4] + ' ' + row[5] + ' ' + row[7] + ' ' + row[20]).toLowerCase();
const search = q => DATA.filter(r => hay(r).includes(String(q).trim().toLowerCase()));

console.log('\n=== the mirror above still matches index.html ===');
ok('>>> the haystack includes row[20], after the exit field',
   /const hay = \(row\[2\]\+' '\+row\[4\]\+' '\+row\[5\]\+' '\+row\[7\]\+' '\+row\[20\]\)\.toLowerCase\(\);/.test(code));
ok('  and the match is still a plain lowercased substring',
   /if\(!hay\.includes\(state\.q\)\) return false;/.test(code));
ok('  with no prefix anchoring or field-scoped syntax added',
   !/startsWith\(state\.q\)/.test(code) && !/state\.q\.split\(':'\)/.test(code));

console.log('\n=== searching by nav code ===');
{
  // AL3 TA Lincoln, CVENTA260 — the brief's worked example.
  const lincoln = DATA.find(r => r[0] === 'AL3');
  ok('fixture: AL3 is TA Lincoln with code CVENTA260',
     lincoln[2] === 'TA Lincoln' && lincoln[20] === 'CVENTA260',
     JSON.stringify([lincoln[2], lincoln[20]]));

  const full = search('CVENTA260');
  ok('>>> the full code matches its stop', full.length === 1 && full[0] === lincoln,
     JSON.stringify(full.map(r => r[0])));
  // THE POINT OF THE WHOLE CHANGE: a driver reads the NUMBER off a card, not
  // the CVEN prefix.
  const digits = search('260');
  ok('>>> the trailing digits ALONE match it', digits.length === 1 && digits[0] === lincoln,
     JSON.stringify(digits.map(r => r[0] + ' ' + r[20] + ' / ' + r[7])));
  ok('>>> "ta260" matches too — the prefix is optional, not required',
     search('ta260').length === 1 && search('ta260')[0] === lincoln,
     JSON.stringify(search('ta260').map(r => r[0])));
  ok('>>> case does not matter', search('cventa260').length === 1
     && search('CvEnTa260').length === 1
     && search('cventa260')[0] === lincoln);
  // A partial digit string need not be unique — it just has to reach the stop.
  ok('  a partial digit string still reaches it', search('26').includes(lincoln));
  ok('>>> a DIFFERENT stop\'s code does not match it',
     !search('CVENPE316').includes(lincoln)
     && search('CVENPE316').length === 1
     && search('CVENPE316')[0][20] === 'CVENPE316',
     JSON.stringify(search('CVENPE316').map(r => r[0] + ' ' + r[20])));
  ok('  a code that exists for nobody matches nothing', search('CVENTA999').length === 0);

  // Every code, not just the sample: full code and bare digits each resolve to
  // exactly the row they belong to.
  const fullMisses = withCode.filter(r => {
    const hit = search(r[20]);
    return hit.length !== 1 || hit[0] !== r;
  });
  ok('>>> every one of the 143 full codes resolves to exactly its own row',
     fullMisses.length === 0, JSON.stringify(fullMisses.map(r => r[0] + ' ' + r[20])));
  // Digits alone can legitimately over-match through the EXIT field — "127"
  // is in an exit string somewhere — so the promise is that the right row is
  // always among the hits, and that no OTHER code collides.
  const digitMisses = withCode.filter(r => !search(/(\d+)$/.exec(r[20])[1]).includes(r));
  ok('>>> and every stop is reachable by its digits alone',
     digitMisses.length === 0, JSON.stringify(digitMisses.map(r => r[0] + ' ' + r[20])));
  const codeCollisions = withCode.filter(r => {
    const d = /(\d+)$/.exec(r[20])[1];
    return search(d).filter(x => x[20] && x[20].includes(d)).length > 1;
  });
  ok('  with no digit string reaching two different CODES',
     codeCollisions.length === 0, JSON.stringify(codeCollisions.map(r => r[0] + ' ' + r[20])));
}

console.log('\n=== short numeric queries match more broadly — accepted, not a bug ===');
{
  // "20" already matched every I-20 stop through the exit field before this
  // change. It now also matches codes containing 20. That is inherent to
  // substring search and is deliberately NOT special-cased; this records the
  // behaviour so it reads as a decision rather than a regression.
  const viaExit = DATA.filter(r => String(r[7]).toLowerCase().includes('20'));
  const now = search('20');
  ok('fixture: "20" already matched stops through the exit field',
     viaExit.length > 0, String(viaExit.length));
  ok('>>> every one of those still matches', viaExit.every(r => now.includes(r)));
  ok('  and it now also reaches codes containing 20',
     now.some(r => r[20] && r[20].includes('20') && !String(r[7]).includes('20')),
     JSON.stringify(now.filter(r => r[20] && r[20].includes('20')).slice(0, 3).map(r => r[0])));
  ok('  which is a widening, not a replacement', now.length >= viaExit.length,
     `${now.length} vs ${viaExit.length}`);
}

console.log('\n=== the other search fields are untouched ===');
{
  ok('city still matches', search('memphis').length > 0);
  ok('state still matches', search('tx').length > 0);
  ok('name still matches', search('bloomsbury').some(r => r[2] === 'TA Bloomsbury'));
  ok('exit still matches', search('exit 630').length > 0);
  ok('  and a city search is unchanged by the new column',
     search('memphis').every(r => /memphis/i.test(r[2] + r[4] + r[5] + r[7])
       || /memphis/i.test(String(r[20]))));
}

console.log('\n=== the list row ===');
{
  const lf = code.slice(code.indexOf('function renderList('));
  const lb = lf.slice(0, lf.indexOf('\n}\n') + 3);
  ok('>>> the code rides on the EXIT line, not a fourth line',
     /<div class="meta mono">\$\{row\[7\]\|\|'Terminal'\}\$\{row\[20\]\?' &middot; '\+row\[20\]:''\}<\/div>/.test(lb),
     lb.slice(lb.indexOf('meta mono') - 40, lb.indexOf('meta mono') + 160));
  ok('  and the row is still three lines, not four',
     (lb.match(/<div class="(name|addr|meta mono)"/g) || []).length === 3,
     JSON.stringify(lb.match(/<div class="(name|addr|meta mono)"/g)));
  // THE DANGLING SEPARATOR. A terminal has no code, and " Terminal · " would
  // read as missing data rather than as data that does not exist.
  ok('>>> the separator is conditional on the code existing',
     /\$\{row\[20\]\?' &middot; '\+row\[20\]:''\}/.test(lb));
  ok('  so the one row without a code gets no trailing middot',
     noCode.every(r => {
       const line = (r[7] || 'Terminal') + (r[20] ? ' · ' + r[20] : '');
       return line === 'Terminal' && !/·/.test(line);
     }));
  // Nothing is truncated and there is no separate column: the EXIT matters
  // more at the ramp and must stay fully readable, so long lines wrap.
  ok('>>> the exit is never truncated to fit the code',
     !/slice\(0,\s*\d+\)/.test(lb) && !/substring\(/.test(lb) && !/ellipsis/.test(lb));
  ok('  and the code is not right-aligned into a column of its own',
     !/rr-nav|text-align:right/.test(lb));
}

console.log('\n=== line lengths, measured rather than hoped for ===');
{
  const lineOf = r => (r[7] || 'Terminal') + (r[20] ? ' · ' + r[20] : '');
  const lens = DATA.map(r => ({ id: r[0], name: r[2], line: lineOf(r), n: lineOf(r).length }))
    .sort((a, b) => b.n - a.n);
  ok('7 of the 144 rows exceed 40 characters',
     lens.filter(x => x.n > 40).length === 7, String(lens.filter(x => x.n > 40).length));
  ok('>>> exactly one reaches 50, and it is Petro Oklahoma City',
     lens[0].n === 50 && lens[0].name === 'Petro Oklahoma City'
     && lens[0].line === 'I-40E/I-35, Exit 127 / I-40W, Exit 154 · CVENPE316',
     JSON.stringify([lens[0].n, lens[0].name, lens[0].line]));
  ok('  nothing exceeds it', lens.filter(x => x.n > 50).length === 0);
  ok('  and the line wraps rather than clipping — .meta carries no nowrap rule',
     !/\.list-item \.meta\{[^}]*white-space:nowrap/.test(html));
}

console.log('\n=== the station sheet gave the row up; the result cards kept theirs ===');
{
  ok('>>> no Nav code row anywhere in the sheet', !/<div class="k">Nav code<\/div>/.test(markup));
  const of_ = code.slice(code.indexOf('function openSheet(row){'));
  const ob = of_.slice(0, of_.indexOf('\n}\n') + 3);
  const after = ob.slice(ob.indexOf('] = row;') + 8);
  ok('  and openSheet reads the column nowhere at all',
     !/\bnav\b/.test(after) && !/row\[20\]/.test(after), after.slice(0, 300));
  ok('  so it is no longer destructured — the 21-column shape is documented at DATA',
     /,scale,ulsd\] = row;/.test(code));
  // What was checked before deleting, and is recorded here so the next reader
  // does not have to check again: the navblock is the hand-off to the driver's
  // MAP app, and its copy button copies the ADDRESS. Neither touches the code.
  ok('  the navblock survives untouched — it is the map hand-off, not the code',
     /class="navblock"/.test(code) && /Apple Maps/.test(code) && /Google Maps/.test(code));
  ok('  and its copy control copies the ADDRESS, which is why it was left alone',
     /id="copyAddrBtn"/.test(code) && !/copyNavBtn|copyCodeBtn/.test(code));
  ok('>>> the route result cards STILL render the code — the one flow with no list',
     /const navLine = row =>/.test(code)
     && /class="rr-meta rr-nav">Nav code <span class="mono">\$\{row\[20\]\}<\/span>/.test(code));
  ok('  and the share text still carries it', /nav: s\.row\[20\]/.test(code));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
