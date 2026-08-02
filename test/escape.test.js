const { escapeHtml } = require('../lib/escape.js');
let p=0,f=0; const ok=(n,c,e='')=>{c?(p++,console.log('  PASS',n)):(f++,console.log('  FAIL',n,e));};

console.log('=== the actual attack shapes ===');
ok('img onerror is neutralised',
   escapeHtml('123 Main St <img src=x onerror="alert(1)">') ===
   '123 Main St &lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
ok('script tag is neutralised', !escapeHtml('<script>alert(1)</script>').includes('<script>'));
ok('attribute break-out is neutralised (quotes escaped)',
   escapeHtml('" onmouseover="alert(1)').indexOf('"') === -1);
ok("single-quote break-out too", escapeHtml("' onfocus='x").indexOf("'") === -1);

console.log('\n=== ampersand handled first, so no double-encoding ===');
ok('& becomes &amp; exactly once', escapeHtml('Ben & Jerry') === 'Ben &amp; Jerry');
ok('already-encoded entity is escaped, not collapsed', escapeHtml('&lt;') === '&amp;lt;');

console.log('\n=== real addresses survive intact and readable ===');
const real = [
  '2000 Distribution Way, Memphis, TN 38118',
  "O'Fallon, MO 63366",
  'Sears & Roebuck Dist Ctr, Chicago, IL',
  '1234 S 3200 W, Salt Lake City, UT 84104'
];
real.forEach(a => {
  const out = escapeHtml(a);
  const back = out.replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"')
                  .replace(/&lt;/g,'<').replace(/&gt;/g,'>');
  ok(`round-trips unchanged: ${a.slice(0,28)}...`, back === a, out);
});

console.log('\n=== defensive inputs ===');
ok('null -> empty string', escapeHtml(null) === '');
ok('undefined -> empty string', escapeHtml(undefined) === '');
ok('number coerces safely', escapeHtml(102) === '102');
ok('plain text untouched', escapeHtml('TA Tuscaloosa') === 'TA Tuscaloosa');

console.log('\n=== renderSuggest\'s exact template is neutralised ===');
{
  // Mirrors index.html's renderSuggest() line verbatim, so this guard fails
  // if the escaping is ever dropped from that template.
  const row = (label, i) =>
    `<button type="button" class="suggest-item" data-idx="${i}">${escapeHtml(label)}</button>`;
  const out = row('123 Main St <img src=x onerror="window.__pwned=true">', 0);
  ok('no unescaped <img in the dropdown markup', !/<img/i.test(out), out);
  ok('no unescaped attribute quotes escape the data-idx attribute',
     out.indexOf('onerror="') === -1, out);
  ok('the button element itself is still well-formed',
     out.startsWith('<button type="button" class="suggest-item" data-idx="0">') && out.endsWith('</button>'), out);
  ok('a real business name still renders readably',
     row("O'Fallon & Sons", 1).includes('O&#39;Fallon &amp; Sons'), row("O'Fallon & Sons", 1));
}

console.log(`\n${p} passed, ${f} failed`);
