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

console.log('\n=== markers are STATIC: built once, filtered by visibility ===');
// The 146 stops never change within a session. Rebuilding the marker layer
// per filter interaction — every search keystroke — was seven full teardown
// cycles for the word "memphis". These pin the shape that prevents it.
const addObjectsCalls = (html.match(/markerGroup\.addObjects\(/g) || []).length;
ok('exactly ONE markerGroup.addObjects in the whole file (the startup build)',
   addObjectsCalls === 1, String(addObjectsCalls));
ok('no markerGroup.removeAll anywhere — the layer is never torn down',
   !/markerGroup\.removeAll/.test(html));
ok('no per-marker addObject on the stops group', !/markerGroup\.addObject\(/.test(html));
const rmFn = html.slice(html.indexOf('function renderMarkers('));
const rmBody = rmFn.slice(0, rmFn.indexOf('\n}\n') + 3);
ok('renderMarkers constructs NOTHING (no DomMarker, no buildIcon in its body)',
   !/new H\.map\.DomMarker/.test(rmBody) && !/buildIcon/.test(rmBody), rmBody.slice(0, 200));
ok('the render path is a visibility flip from the filtered set',
   /setVisibility\(show\.has\(row\)\)/.test(rmBody));
ok('the one-time build keys markers by row reference',
   /STOP_MARKERS\.set\(row, marker\)/.test(html));

console.log('\n=== startup view fits the full network, once ===');
// The first view is a bounds fit to the markers, not a hardcoded zoom —
// framed correctly on every screen shape, self-correcting across data
// revisions. These pin the exact sequence: margin, fit, padding restore.
const buildStart = html.indexOf('const STOP_MARKERS');
const buildBlock = html.slice(buildStart, html.indexOf('\n}\n', buildStart) + 3);
const addIdx = buildBlock.indexOf('markerGroup.addObjects(markers)');
const fitIdx = buildBlock.indexOf('setLookAtData({ bounds: netBounds })');
ok('the startup block fits the view to markerGroup.getBoundingBox() after addObjects',
   /markerGroup\.getBoundingBox\(\)/.test(buildBlock) && fitIdx > addIdx && addIdx >= 0,
   JSON.stringify({ addIdx, fitIdx }));
const padIdx = buildBlock.indexOf('setPadding(MAP_FIT_MARGIN, MAP_FIT_MARGIN, MAP_FIT_MARGIN, MAP_FIT_MARGIN)');
const restoreIdx = buildBlock.indexOf('syncMapPadding();', fitIdx);   // the CALL, not the comment mention
ok('the fit applies MAP_FIT_MARGIN before and restores via syncMapPadding after',
   padIdx >= 0 && padIdx < fitIdx && restoreIdx > fitIdx,
   JSON.stringify({ padIdx, fitIdx, restoreIdx }));
ok('the startup block never assigns lastFitBounds (route machinery stays route-only)',
   !/lastFitBounds\s*=/.test(buildBlock));
ok('the constructor keeps its pre-fit fallback center and zoom',
   /center: \{ lat: 39\.5, lng: -98\.35 \}/.test(html) && /zoom: 5,/.test(html));
ok('the padding machinery is declared BEFORE the startup block that calls it (TDZ guard)',
   html.indexOf('const MAP_FIT_MARGIN') < buildStart
   && html.indexOf('let lastFitBounds') < buildStart,
   'moving these below the marker build is a startup crash');

console.log('\n=== pin icons are shared per appearance ===');
const biFn = html.slice(html.indexOf('function buildIcon('));
const biBody = biFn.slice(0, biFn.indexOf('\n}\n') + 3);
ok('buildIcon consults the icon cache BEFORE constructing',
   biBody.indexOf('iconCache.get(') !== -1
   && biBody.indexOf('iconCache.get(') < biBody.indexOf('new H.map.DomIcon'),
   'cache lookup missing or after construction');
ok('a cache miss stores what it built', /iconCache\.set\(key, icon\)/.test(biBody));
ok('the cache key distinguishes exclusive and faded variants',
   /const key = `\$\{cls\} \$\{exclClass\}\$\{faded\}`/.test(biBody), biBody.slice(0, 300));

console.log('\n=== the station sheet hands off to a nav app ===');
const osFn = html.slice(html.indexOf('function openSheet('));
const osBody = osFn.slice(0, osFn.indexOf('\n}\n') + 3);
ok('the sheet renders the navigation block', /class="navblock"/.test(osBody));
ok('both maps buttons are built from the shared lib, not inline URLs',
   /NavLinks\.appleMapsUrl\(row\)/.test(osBody) && /NavLinks\.googleMapsUrl\(row\)/.test(osBody));
ok('>>> the Apple button is CONDITIONAL, the Google button is not',
   /\$\{apple \? `<a class="navbtn"[^`]*Apple Maps<\/a>` : ''\}/.test(osBody)
   && /NavLinks\.isApplePlatform\(/.test(osBody), 'apple button must be gated on the platform test');
ok('nav links open in a new context, safely',
   (osBody.match(/target="_blank" rel="noopener"/g) || []).length === 2);
ok('every nav href is HTML-escaped into the attribute (apostrophes survive encodeURIComponent)',
   (osBody.match(/href="\$\{Esc\.escapeHtml\(NavLinks\./g) || []).length === 2);
ok('the navigation block is NOT gated on a phone number (terminals navigate too)',
   osBody.indexOf('class="navblock"') > osBody.indexOf('if(phone) html += `<a class="callbtn"'),
   'navblock must sit outside the phone conditional');
ok('Copy address reuses the shared clipboard chain, not a second implementation',
   /copyStationAddress\(row, copyBtn\)/.test(osBody)
   && /showCopyFallback\(text, btn\)/.test(html) && !/showShareFallback/.test(html));

console.log('\n=== list is lazy ===');
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
