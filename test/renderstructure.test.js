// render() was split so the map never waits on list DOM that may never be
// shown. The specific regression risk is a count that only updates when the
// list happens to be open — these pin the structure that prevents it.

const fs = require('fs');
const path = require('path');
let p = 0, f = 0;
const ok = (n, c, e = '') => { c ? (p++, console.log('  PASS', n)) : (f++, console.log('  FAIL', n, e)); };

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const render = html.slice(html.indexOf('function render(){'));
const body = render.slice(0, render.indexOf('\n}\n') + 3);

console.log('=== the count must never depend on the list being open ===');
// The count is set in render() itself, NOT inside renderList — otherwise it
// would silently freeze for any driver who never opens the list.
ok('countNum is set inside render(), not renderList()',
   /countNum'\)\.textContent = filtered\.length/.test(body), 'not found in render()');
const listFn = html.slice(html.indexOf('function renderList('));
ok('renderList() does NOT set the count',
   !/countNum/.test(listFn.slice(0, listFn.indexOf('\n}\n'))));
ok('the no-match map chip is also set from render(), not the list',
   /noMatch'\);\s*\n\s*if\(chip\) chip\.hidden = filtered\.length !== 0/.test(body));

console.log('\n=== markers are batched, list is lazy ===');
ok('markers added with one addObjects call', /markerGroup\.addObjects\(markers\)/.test(html));
ok('no per-marker addObject in the stops renderer', !/markerGroup\.addObject\(/.test(html));
ok('list rows built into a DocumentFragment', /createDocumentFragment\(\)/.test(html));
ok('fragment attached in a single replaceChildren', /listEl\.replaceChildren\(frag\)/.test(html));
ok('render() skips list work when the panel is hidden',
   /classList\.contains\('show'\)/.test(body) && /listDirty = true/.test(body));
ok('the toggle builds the list before it becomes visible',
   /opening && listDirty\) renderList\(currentFiltered\)/.test(html));
ok('renderList clears the dirty flag', /listDirty = false/.test(listFn));

console.log('\n=== THE TRAP: lib scripts must never be deferred ===');
// Inline shims are not deferred; a deferred src script would let the shim
// capture module.exports while still empty, turning every lib module into {}
// with no error anywhere. Guard it so nobody adds it later.
const libTags = [...html.matchAll(/<script src="lib\/[^"]+"[^>]*>/g)].map(m => m[0]);
ok(`all ${libTags.length} lib script tags found`, libTags.length >= 12, String(libTags.length));
ok('no lib script carries defer', !libTags.some(t => /\bdefer\b/.test(t)),
   JSON.stringify(libTags.filter(t => /\bdefer\b/.test(t))));
ok('no lib script carries async', !libTags.some(t => /\basync\b/.test(t)),
   JSON.stringify(libTags.filter(t => /\basync\b/.test(t))));

console.log('\n=== connection hints ===');
ok('preconnect to js.api.here.com with crossorigin',
   /<link rel="preconnect" href="https:\/\/js\.api\.here\.com" crossorigin>/.test(html));
ok('dns-prefetch fallback', /<link rel="dns-prefetch" href="https:\/\/js\.api\.here\.com">/.test(html));
ok('hints precede the mapsjs stylesheet',
   html.indexOf('rel="preconnect"') < html.indexOf('mapsjs-ui.css'));

console.log(`\n${p} passed, ${f} failed`);
if (f) process.exitCode = 1;
