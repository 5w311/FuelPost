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
const deferIdx = buildBlock.indexOf('requestAnimationFrame(fitNetworkOnce)');
ok('the startup block DEFERS the network fit rather than fitting inline',
   deferIdx > addIdx && addIdx >= 0, JSON.stringify({ addIdx, deferIdx }));

const fnFn = html.slice(html.indexOf('function fitNetworkOnce('));
const fnBody = fnFn.slice(0, fnFn.indexOf('\n}\n') + 3);
ok('fitNetworkOnce fits markerGroup.getBoundingBox()',
   /markerGroup\.getBoundingBox\(\)/.test(fnBody) && /setLookAtData\(\{ bounds: b \}\)/.test(fnBody));
ok('it is one-shot', /if\(networkFitDone\) return;/.test(fnBody) && /networkFitDone = true;/.test(fnBody));
const padIdx = fnBody.indexOf('setPadding(MAP_FIT_MARGIN, MAP_FIT_MARGIN, MAP_FIT_MARGIN, MAP_FIT_MARGIN)');
const fitIdx = fnBody.indexOf('setLookAtData({ bounds: b })');
ok('the margin is applied BEFORE the fit', padIdx >= 0 && padIdx < fitIdx,
   JSON.stringify({ padIdx, fitIdx }));
// THE BUG THIS PINS: restoring padding synchronously after setLookAtData
// cancels the pending view change, and the camera never moves. Measured
// against the real SDK — the stub cannot catch it, because it computes no
// zoom. Padding must be restored from the map's own settle event.
ok('>>> padding is restored on mapviewchangeend, NOT synchronously after the fit',
   /addEventListener\('mapviewchangeend', restorePadding\)/.test(fnBody)
   && /removeEventListener\('mapviewchangeend', restorePadding\)/.test(fnBody),
   fnBody.slice(-400));
const syncAfterFit = fnBody.indexOf('syncMapPadding();', fitIdx);
const listenerIdx = fnBody.indexOf('const restorePadding');
ok('  the only syncMapPadding after the fit is inside that listener',
   syncAfterFit > listenerIdx, JSON.stringify({ syncAfterFit, listenerIdx }));
ok('the startup fit never assigns lastFitBounds (route machinery stays route-only)',
   !/lastFitBounds\s*=/.test(buildBlock) && !/lastFitBounds\s*=/.test(fnBody));
// The route re-fit keys on the FREE AREA, not the padding. Keying on
// padding missed the drawer collapse growing #mapwrap after a plan — the
// panel height never changes, so no re-fit fired and the route stayed
// fitted to the smaller pre-collapse viewport, zoomed out.
const smpFn = html.slice(html.indexOf('function syncMapPadding('));
const smpBody = smpFn.slice(0, smpFn.indexOf('\n}\n') + 3);
ok('>>> the route re-fit triggers on free-area change, not padding change',
   /mapFreeArea\(\)/.test(smpBody) && /lastFitFree/.test(smpBody)
   && !/prev\s*&&\s*prev\.bottom/.test(smpBody), smpBody.slice(0, 400));
ok('  free area is measured from the map element minus padding',
   /getElementById\('mapwrap'\)/.test(html.slice(html.indexOf('function mapFreeArea('))));
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

console.log('\n=== the nav code rides on EVERY result card type ===');
// renderPlan builds stop cards in three places — required plan stops, the
// short-trip "available" stops, and the post-gap resume stops. Adding a
// field to one and missing the others is the obvious failure, so these pin
// all three off one extraction rather than three hand-written checks.
const rpFn = html.slice(html.indexOf('function renderPlan('));
const rpBody = rpFn.slice(0, rpFn.indexOf('\n}\n') + 3);
const cards = [...rpBody.matchAll(/<button class="rr-stop[\s\S]*?<\/button>/g)].map(m => m[0]);
ok('renderPlan builds exactly three kinds of stop card', cards.length === 3, String(cards.length));
ok('>>> all three render the nav line', cards.every(c => c.includes('navLine(s.row)')),
   JSON.stringify(cards.map(c => c.slice(0, 60))));
ok('all three put it BELOW the exit line',
   cards.every(c => c.indexOf('s.row[7]') >= 0 && c.indexOf('s.row[7]') < c.indexOf('navLine(s.row)')));
// A button inside a button is invalid HTML: it breaks screen-reader
// navigation and swallows the card's tap-through to the station sheet.
// This is why the nav code is display-only, and this pin is what stops a
// later change from adding a copy control and quietly breaking the card.
ok('>>> no <button> is nested inside a stop card (no copy control crept in)',
   cards.every(c => !c.slice(1).includes('<button')),
   JSON.stringify(cards.filter(c => c.slice(1).includes('<button'))));
ok('the card tap still opens the station sheet, unchanged',
   /querySelectorAll\('\.rr-stop'\)[\s\S]{0,120}openSheet\(planStops\[\+el\.dataset\.idx\]\.row\)/.test(html));

ok('navLine is defined exactly once, not copied per card',
   (html.match(/const navLine =/g) || []).length === 1);
ok('it renders a labelled, mono code at the existing meta weight',
   /class="rr-meta rr-nav">Nav code <span class="mono">\$\{row\[20\]\}<\/span>/.test(html));
ok('it is unconditional — every stop reaching a card has a code',
   !/const navLine = row =>[^\n]*\?/.test(html), 'no empty-string branch on the result path');
ok('openSheet keeps ITS conditional, because terminals do reach the sheet',
   /if\(nav\) html \+= `<div class="row"><div class="k">Nav code<\/div>/.test(html));

console.log('\n=== the share text carries the codes without coupling to DATA ===');
// lib/triptext.js is a pure formatter with a documented input shape. The
// row is mapped to an explicit `nav` field at the call site so the
// formatter never depends on DATA column order.
ok('the trip object maps nav on for plan stops',
   /plan: stops\.map\(s => \(\{ \.\.\.s, legMiles: Math\.round\(s\.legMiles\), nav: s\.row\[20\] \}\)\)/.test(html));
ok('and for post-gap stops',
   /result\.resume\.plan\.map\(s => \(\{ \.\.\.s, legMiles: Math\.round\(s\.legMiles\), nav: s\.row\[20\] \}\)\)/.test(html));
const triptextSrc = fs.readFileSync(path.join(__dirname, '..', 'lib', 'triptext.js'), 'utf8');
// Comments stripped first: the header comment legitimately EXPLAINS that
// index.html maps the field on from row[20], and matching that text would
// make this pin pass or fail on prose rather than on code. No string or
// template literal in this file contains "//", so this is safe here.
const triptextCode = triptextSrc.split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
ok('>>> the formatter never reaches into a row array index',
   !/\brow\b\s*\[/.test(triptextCode) && !/\[20\]/.test(triptextCode), triptextCode.match(/.*row.*/));
ok('the formatter reads the explicit field and guards its absence',
   /s\.nav \? {2}`/.test(triptextSrc) || /return s\.nav \?/.test(triptextSrc));

console.log('\n=== closed stations are marked, loudly, in the sheet ===');
// The rows stay visible everywhere — a driver who knows the stop and goes
// looking for it must find it and learn why it is gone. What must not happen
// is the closed state being a quiet row lost among the amenities.
const osFn0 = html.slice(html.indexOf('function openSheet('));
const osBody0 = osFn0.slice(0, osFn0.indexOf('\n}\n') + 3);
ok('the sheet renders a closed indicator for closed rows',
   /CLOSED_STOP_IDS\.has\(id\)/.test(osBody0) && /class="closedNote"/.test(osBody0));
ok('>>> it sits at the TOP — before the first data row, not among the amenities',
   osBody0.indexOf('class="closedNote"') < osBody0.indexOf('class="k">Address'),
   'closedNote must precede the address row');
ok('  and immediately after the badges', osBody0.indexOf('class="badges"') < osBody0.indexOf('class="closedNote"'));
ok('it says plainly that the stop is closed and is not planned',
   /Permanently closed/.test(osBody0) && /not used for fuel planning/i.test(osBody0));
// Colour must not be the only carrier: a ✕ and the words do the work too.
ok('>>> meaning does not rest on colour alone (a mark and words carry it)',
   /✕/.test(osBody0) && /Permanently closed<\/b>/.test(osBody0));
ok('the banner uses theme custom properties, not a fixed light-mode red',
   /#sheet \.closedNote\{[^}]*var\(--danger-text\)/.test(html)
   && !/#sheet \.closedNote\{[^}]*background:#[0-9A-Fa-f]{6}/.test(html));
// An alternative is named only where one exists — TA Saginaw has no sibling
// and the sheet must not invent one.
ok('>>> the alternative is looked up, never hardcoded per station',
   /CLOSED_STOP_ALT\[id\]/.test(osBody0) && /\$\{alt \?/.test(osBody0));
ok('  the alt map names Petro Corning for TA Corning and nothing for Saginaw',
   /const CLOSED_STOP_ALT = \{ CA5: 'CA4' \};/.test(html));
ok('the list row also carries a closed tag',
   /CLOSED_STOP_IDS\.has\(row\[0\]\)\?'<span class="tag tag-closed">Closed<\/span>'/.test(html));

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

console.log('\n=== the startup loading state over the map ===');
// Since the stylesheet stopped blocking, the header paints in ~100ms and
// used to frame an empty rectangle while the SDK downloaded — which reads
// as broken, not loading. These pin the shape that fixes it. The timing
// itself is not unit-testable here and no test pretends otherwise; the
// browser harness (scratchpad/pw-maploading.js) covers behaviour.
const mapwrapHtml = html.slice(html.indexOf('<div id="mapwrap">'), html.indexOf('id="routeResults"'));
ok('>>> #mapLoading exists in the INITIAL HTML, not script-created',
   /<div id="mapLoading" role="status">/.test(mapwrapHtml), 'must be on screen before any script runs');
ok('>>> it is a SIBLING of #map inside #mapwrap, never inside #map',
   /<div id="map"><\/div>/.test(mapwrapHtml)
   && mapwrapHtml.indexOf('id="mapLoading"') > mapwrapHtml.indexOf('<div id="map"></div>'),
   'H.Map owns #map\'s children; an existing child is undefined territory');
ok('it is a polite live region and holds no tab stop',
   /role="status"/.test(mapwrapHtml) && !/id="mapLoading"[^>]*tabindex/.test(mapwrapHtml));
ok('its z-index sits below the list (350) and the legend/locate buttons (400)',
   /#mapLoading\{[^}]*z-index:300/.test(html));
ok('the spinner is hidden from screen readers and respects reduced motion',
   /class="mapLoadingSpin" aria-hidden="true"/.test(html)
   && /prefers-reduced-motion: reduce[^}]*\{ \.mapLoadingSpin\{animation:none;\}/.test(html));
// THE FAILURE CASE: if the SDK never loads, the main script dies at its
// first `H` reference and can show nothing — so the watchdog must be an
// inline script that parses BEFORE the HERE script tags.
const watchdogIdx = html.indexOf('window.__mapLoadTimer = setTimeout');
ok('>>> a load watchdog exists', watchdogIdx > 0);
ok('>>> and it parses BEFORE the first HERE script tag, so it runs when they never do',
   watchdogIdx < html.indexOf('<script src="https://js.api.here.com'),
   'a watchdog below the SDK tags can never report the SDK missing');
ok('  at 20s, with the reasoning commented against the measured load times',
   /}, 20000\);/.test(html) && /~757ms/.test(html));
ok('  the failure message tells the truth and does not claim the list still works',
   /could not be loaded\. Check your connection/.test(html)
   && !/list.*(still|continues to) work/i.test(html.slice(watchdogIdx - 2000, watchdogIdx + 800)));
// Removal: exactly one signal, self-removing, watchdog cleared, not sticky.
ok('>>> removal rides the FIRST mapviewchangeend — the earliest signal meaning pixels',
   /const clearMapLoading = \(\) => \{\s*\n\s*map\.removeEventListener\('mapviewchangeend', clearMapLoading\);/.test(html)
   && /map\.addEventListener\('mapviewchangeend', clearMapLoading\);/.test(html));
ok('  it clears the watchdog and removes the element outright (startup only, never reattached)',
   /clearTimeout\(window\.__mapLoadTimer\);/.test(html)
   && (html.match(/getElementById\('mapLoading'\)/g) || []).length === 1);
ok('  exactly one removal site in the whole file',
   (html.match(/clearMapLoading/g) || []).length === 3, // const + removeEventListener + addEventListener
   String((html.match(/clearMapLoading/g) || []).length));

console.log('\n=== connection hints ===');
ok('preconnect to js.api.here.com with crossorigin',
   /<link rel="preconnect" href="https:\/\/js\.api\.here\.com" crossorigin>/.test(html));
ok('dns-prefetch fallback', /<link rel="dns-prefetch" href="https:\/\/js\.api\.here\.com">/.test(html));
// Still an ordering assertion, just against the preload that replaced the
// blocking <link rel="stylesheet">. A hint that lands after the request it
// was meant to warm is dead weight.
ok('hints precede the mapsjs stylesheet request',
   html.indexOf('rel="preconnect"') < html.indexOf('mapsjs-ui.css')
   && html.indexOf('rel="dns-prefetch"') < html.indexOf('mapsjs-ui.css'));

console.log('\n=== the map stylesheet does not block first paint ===');
// As a plain <link rel="stylesheet"> this held up first paint on a
// third-party round trip: no header, no toolbar, nothing, until it landed.
// These are SOURCE-SHAPE assertions and cannot prove the swap fires — only a
// real browser can, which is what scratchpad/pw-cssblocking.js measures.
const headBlock = html.slice(0, html.indexOf('<style>'));
ok('>>> the stylesheet is requested as a preload, not a blocking stylesheet',
   /<link rel="preload" as="style" href="https:\/\/js\.api\.here\.com\/v3\/[\d.]+\/mapsjs-ui\.css"/.test(headBlock),
   headBlock.slice(headBlock.indexOf('mapsjs-ui.css') - 120, headBlock.indexOf('mapsjs-ui.css') + 40));
ok('>>> no render-blocking <link rel="stylesheet"> to HERE survives outside noscript',
   !/<link rel="stylesheet"[^>]*js\.api\.here\.com/.test(headBlock.replace(/<noscript>[\s\S]*?<\/noscript>/g, '')));
ok('>>> the swap promotes it to a stylesheet on load',
   /onload="this\.onload=null;this\.rel='stylesheet'"/.test(headBlock));
ok('  onload is nulled first, so changing rel cannot re-fire it',
   /this\.onload=null;/.test(headBlock));
ok('>>> a noscript fallback loads it the normal way',
   /<noscript><link rel="stylesheet" type="text\/css" href="https:\/\/js\.api\.here\.com\/v3\/[\d.]+\/mapsjs-ui\.css"/.test(headBlock));
ok('the stylesheet is still served from HERE — never vendored',
   (headBlock.match(/https:\/\/js\.api\.here\.com\/v3\/[\d.]+\/mapsjs-ui\.css/g) || []).length === 2);
// THE DOUBLE-DOWNLOAD FOOTGUN: HERE sends `vary: Origin`, so a CORS preload
// and a non-CORS stylesheet are separate cache entries and the file is
// fetched twice. The preload and the noscript link must agree.
ok('>>> preload and noscript fallback agree on crossorigin (neither uses it)',
   !/<link rel="preload" as="style"[^>]*crossorigin/.test(headBlock)
   && !/<noscript><link rel="stylesheet"[^>]*crossorigin/.test(headBlock));
// The HERE JS bundles must stay plain and blocking — the defer trap test
// exists for a reason. FOUR tags on 3.2, not five: mapsjs-harp.js was folded
// into core and its 3.2 CDN path returns an error page.
ok('the four HERE script tags are plain, blocking, in order',
   (html.match(/<script src="https:\/\/js\.api\.here\.com\/v3\/[\d.]+\/mapsjs-[a-z]+\.js"><\/script>/g) || []).length === 4);

console.log('\n=== HERE Maps 3.2: pinned version, and the harp trap ===');
// Every HERE asset URL must carry the SAME full pinned version (3.2.x.y),
// never the evergreen 3.2 path: pinning is the production-continuity choice
// and a mixed set of versions is the failure a partial bump leaves behind.
const hereVersions = [...new Set([...html.matchAll(/js\.api\.here\.com\/v3\/([\d.]+)\//g)].map(m => m[1]))];
ok('>>> every HERE URL carries one and the same version', hereVersions.length === 1,
   JSON.stringify(hereVersions));
ok('  it is a FULL pin (3.2.x.y), not the evergreen 3.2',
   /^3\.2\.\d+\.\d+$/.test(hereVersions[0] || ''), JSON.stringify(hereVersions));
ok('  currently 3.2.9.0 — a bump is deliberate, so it edits this line too',
   hereVersions[0] === '3.2.9.0', JSON.stringify(hereVersions));
// THE TRAP: mapsjs-harp.js does not exist on 3.2. The HARP engine lives in
// mapsjs-core.js now, and requesting the old module 403s — the map never
// comes up. Checked with comments stripped, because the comment above the
// script block deliberately names the module to warn against re-adding it.
const codeOnly = html.replace(/<!--[\s\S]*?-->/g, '').split('\n')
  .map(l => l.replace(/^\s*\/\/.*$/, '')).join('\n');
ok('>>> NO mapsjs-harp.js reference anywhere outside comments',
   !/mapsjs-harp/.test(codeOnly), 'the harp module does not exist on 3.2');
ok('the engineType comment records the 3.1 history rather than deleting it',
   /HISTORY, so nobody re-derives it/.test(html) && /Wrong style format for layer H-18/.test(html));

console.log('\n=== the Satellite view shows GROUND, not baked paint (v1.26.0) ===');
// Comments stripped first, and that is not a formality here: the layer setup
// explains at length what it deliberately stopped using, so scanning prose for
// the name of the removed layer fails on the explanation of why it was
// removed. That failure mode pushes the next person into deleting the
// reasoning to get a green run, which is exactly backwards.
const jsOnly = codeOnly.replace(/\/\*[\s\S]*?\*\//g, '');
// raster.satellite.map is the `base` resource on style explore.satellite.day:
// HERE bakes road casings and place labels into the JPEG, covering 35-46% of
// the ground. A driver opens Satellite to judge lot room. It must not come
// back by reflex.
ok('>>> the baked-label satellite raster is not used anywhere in code',
   !/raster\.satellite\.map/.test(jsOnly));
ok('>>> Satellite is the hybrid stack, day and night',
   /defaultLayers\.hybrid\.day\.raster/.test(jsOnly) &&
   /defaultLayers\.hybrid\.night\.raster/.test(jsOnly));
ok('and both vector overlays are wired to their rasters',
   /defaultLayers\.hybrid\.day\.vector/.test(jsOnly) &&
   /defaultLayers\.hybrid\.night\.vector/.test(jsOnly));
// INDEX 1, never appended. 146 station pins, the route polyline, the numbered
// route markers and the faded available-stop pins are all on the map before
// anyone taps Satellite; an appended overlay draws over every one of them.
// This is the single number that keeps the network visible on satellite.
ok('>>> the vector overlay is inserted at index 1, above the base and below the pins',
   /map\.addLayer\([^)]*,\s*1\)/.test(jsOnly));
ok('exactly one addLayer call site — the overlay sync owns it',
   (jsOnly.match(/map\.addLayer\(/g) || []).length === 1,
   String((jsOnly.match(/map\.addLayer\(/g) || []).length));
// One listener, because baselayerchange is the only place that sees every
// route to the base layer: the theme toggle, the backstop, and the driver's
// own tap on HERE's switcher alike.
ok('>>> syncHybridOverlay is wired to the baselayerchange listener',
   /addEventListener\('baselayerchange',[\s\S]{0,200}?syncHybridOverlay\(\);/.test(jsOnly));
ok('exactly one baselayerchange handler owns it',
   (jsOnly.match(/addEventListener\('baselayerchange'/g) || []).length === 1);
// The overlay lookup must stay OUT of the pair objects: nextBaseLayer compares
// base layers by identity, and handing it a vector overlay as though it were
// one would put a layer the driver can't be on into the allow-list.
ok('the pairs hold rasters only; the vector half is a separate lookup',
   /const HYBRID_LAYERS = \{\s*light:\s*defaultLayers\.hybrid\.day\.raster,\s*dark:\s*defaultLayers\.hybrid\.night\.raster\s*\};/.test(jsOnly));
ok('both pairs are handed to nextBaseLayer as THEMED_LAYERS',
   /const THEMED_LAYERS = \{ pairs: \[ROAD_LAYERS, HYBRID_LAYERS\] \};/.test(jsOnly) &&
   (jsOnly.match(/nextBaseLayer\(map\.getBaseLayer\(\), [^,]+, THEMED_LAYERS\)/g) || []).length === 2,
   'both call sites must pass the pairs');
// TDZ: the pairs are read at parse time by the H.Map construction below them.
// Declaring them beside their first use instead has blanked this app before.
ok('the layer sets are declared ABOVE the H.Map construction that reads them',
   jsOnly.indexOf('const ROAD_LAYERS') < jsOnly.indexOf('new H.Map(') &&
   jsOnly.indexOf('const HYBRID_LAYERS') < jsOnly.indexOf('new H.Map(') &&
   jsOnly.indexOf('const THEMED_LAYERS') < jsOnly.indexOf('new H.Map('));
// The setter carries hybrid rasters now, so the old name would misdescribe it.
ok('the deferred base-layer setter is not still called setNormalBaseLayer',
   !/setNormalBaseLayer/.test(jsOnly) && /function setThemedBaseLayer\(/.test(jsOnly));
ok('and every base-layer application still goes through that one choke point',
   (jsOnly.match(/\.setBaseLayer\(/g) || []).length === 1);

console.log('\n=== range tiers and arrival reserve (v1.27.0) ===');
// The tier row: four buttons, and Long preselected. The default moving from
// Max to Long is the single biggest behaviour change in this release — every
// driver who never touched the old field was silently on fewest-stops — so it
// is pinned in the markup, in the constants, and against the gauge scale.
const tierSeg = html.slice(html.indexOf('id="rangeSeg"'), html.indexOf('id="rangeCustomWrap"'));
ok('exactly four tier buttons', (tierSeg.match(/data-tier="/g) || []).length === 4,
   String((tierSeg.match(/data-tier="/g) || []).length));
ok('they are regular / long / max / custom',
   ['regular','long','max','custom'].every(t => tierSeg.includes(`data-tier="${t}"`)));
ok('>>> Long is the one marked active in the initial markup',
   /data-tier="long"[^>]*class="active"/.test(tierSeg), tierSeg.slice(0, 400));
ok('  and no other tier is', (tierSeg.match(/class="active"/g) || []).length === 1);
ok('each button shows its mile figure, not just a name',
   /400 mi/.test(tierSeg) && /625 mi/.test(tierSeg) && /875 mi/.test(tierSeg));
ok('and the stop-frequency tradeoff alongside it',
   /Most stops/.test(tierSeg) && /Fewer stops/.test(tierSeg) && /Fewest stops/.test(tierSeg));
// The constants behind them.
ok('DEFAULT_RANGE_TIER is long', /const DEFAULT_RANGE_TIER = 'long';/.test(codeOnly));
ok('>>> ROUTE_DEFAULT_RANGE is derived from the tier table, never hardcoded',
   /const ROUTE_DEFAULT_RANGE = RANGE_TIERS\[DEFAULT_RANGE_TIER\]\.miles;/.test(codeOnly));
ok('  so it can no longer be the old 875 by accident',
   !/const ROUTE_DEFAULT_RANGE = 875/.test(codeOnly));
ok('the three tier mile values are 400 / 625 / 875',
   /regular:\s*\{ miles: 400/.test(codeOnly) && /long:\s*\{ miles: 625/.test(codeOnly)
   && /max:\s*\{ miles: 875/.test(codeOnly));

// Custom must keep the original input, clamping and all — a driver who knows
// their number must not lose it.
ok('the number input still exists, behind Custom',
   /id="rangeInput"/.test(html) && /id="rangeCustomWrap"[^>]*hidden/.test(html));
ok('>>> it keeps its min and max', /id="rangeInput"[^>]*min="300"[^>]*max="1200"/.test(html));
ok('  and RANGE_MIN/RANGE_MAX still clamp it in code',
   /Math\.min\(RANGE_MAX, Math\.max\(RANGE_MIN, n\)\)/.test(codeOnly));
ok('  Custom is what reveals it', /\$\('rangeCustomWrap'\)\.hidden = rangeTier !== 'custom';/.test(codeOnly));

// The reserve control, behind its own disclosure, defaulting to today's floor.
ok('the reserve sits behind a disclosure, closed by default',
   /id="arrivalToggle"[^>]*aria-expanded="false"/.test(html) && /id="arrivalField"[^>]*hidden/.test(html));
ok('  its label asks the question rather than naming a feature',
   /Want fuel left when you get there\?/.test(html));
ok('>>> it defaults to RESERVE_TICKS — exactly the pre-v1.27.0 floor',
   /let arrivalTick = 1;/.test(codeOnly) &&
   /setArrivalTick\(FuelGauge\.RESERVE_TICKS\)/.test(codeOnly));
ok('  the choices come from the gauge, not a local list',
   /FuelGauge\.ARRIVAL_TICK_CHOICES\.map/.test(codeOnly));
ok('  and the fraction labels come from tickLabel, never a second array',
   /FuelGauge\.tickLabel\(t\)/.test(codeOnly) && !/\['1\/8', ?'1\/4'/.test(codeOnly));
ok('closing the disclosure resets it, so nothing steers plans from behind a closed panel',
   /if\(!open\) setArrivalTick\(FuelGauge\.RESERVE_TICKS\);/.test(codeOnly));

// The reserve has to reach the planner, and the shortfall has to stay distinct
// from a dry gap all the way out to the shared trip text.
ok('>>> the reserve is passed into planAdaptive',
   /planAdaptive\([\s\S]{0,200}ranges\.arrivalReserve\)/.test(codeOnly));
ok('  readRanges returns it alongside the rest',
   /return \{ maxRange, rangeAtPickup, startBurned, arrivalTick, arrivalReserve \};/.test(codeOnly));
ok('>>> a reserve shortfall is never recorded as a gap in the shared trip',
   /gap: \(result\.ok \|\| shortfall\) \? null : result\.gap,/.test(codeOnly));
ok('  and never headlined as one',
   /shortfall[\s\S]{0,120}short of your reserve/.test(codeOnly));
// TDZ: the collapsed route-bar summary reads the tier during startup.
ok('the tier state is declared ABOVE the summary that reads it',
   codeOnly.indexOf('let rangeTier') < codeOnly.indexOf('function updateRoutebarSummary'));
ok('  and the summary uses the effective range, not the empty input',
   /tierRangeMiles\(\)\} mi`/.test(codeOnly) &&
   !/\$\('rangeInput'\)\.value\} mi`/.test(codeOnly));

console.log('\n=== the corridor filter (v1.28.0) ===');
ok('the corridor select exists and is STOPS-only, like the state select',
   /<select class="stateSel stops-only" id="corridorSel">/.test(html));
ok('  it defaults to All corridors, mirroring All states',
   /id="corridorSel"><option value="all">All corridors<\/option><\/select>/.test(html));
ok('>>> its options are built from DATA, not hardcoded in the markup',
   (html.match(/id="corridorSel"[\s\S]{0,120}?<\/select>/) || [''])[0].split('<option').length === 2
   && /CORRIDOR_INDEX\.forEach/.test(codeOnly));
ok('  built through the shared parser, not a second regex in the page',
   /Corridors\.corridorIndex\(/.test(codeOnly) && !/I-\\d\+/.test(codeOnly));
// Derived ONCE. passes() runs over 146 rows per keystroke; a regex per row per
// keystroke is waste, and keying by row reference matches STOP_MARKERS.
ok('>>> each row\'s corridors are derived once into a Map keyed by row',
   /const ROW_CORRIDORS = new Map\(\s*DATA\.map\(r => \[r, Corridors\.corridorsForRow\(r\[0\], r\[7\]\)\]\)\);/.test(codeOnly));
ok('  and passes() only READS that map, never re-parses',
   /ROW_CORRIDORS\.get\(row\)/.test(codeOnly) &&
   !/corridorsForRow[\s\S]{0,80}function passes/.test(codeOnly));
ok('>>> the predicate is a membership test, not equality',
   /!\(ROW_CORRIDORS\.get\(row\) \|\| \[\]\)\.includes\(state\.corridor\)/.test(codeOnly));
ok('  and it is AND-combined like every other filter (an early return)',
   /if\(state\.corridor!=='all' && !\(ROW_CORRIDORS[^\n]*\) return false;/.test(codeOnly));
// Both of these were called out as easy to miss, and each leaves a filter the
// driver cannot see or cannot clear.
ok('>>> the corridor counts toward the filter badge',
   /state\.corridor==='all' && !anyAmenity;/.test(codeOnly));
ok('>>> and clearFilters resets both the state and the select',
   /state\.brand = state\.type = state\.st = state\.corridor = 'all';/.test(codeOnly) &&
   /getElementById\('corridorSel'\)\.value='all';/.test(codeOnly));
ok('the select has its own change handler wired to render()',
   /corridorSel\.addEventListener\('change'[^\n]*state\.corridor=e\.target\.value; render\(\); updateFilterBadge\(\);/.test(codeOnly));
// The versioned script tag, which cachebust.test.js then holds to APP_VERSION.
ok('lib/corridors.js is loaded with a version stamp and shimmed',
   /<script src="lib\/corridors\.js\?v=[\d.]+"><\/script>/.test(html) &&
   /var Corridors = module\.exports;/.test(html));

console.log('\n=== the Near Me footer (v1.29.0) ===');
ok('the panel exists, STOPS-only, hidden until there is a fix',
   /<div id="nearMe" class="stops-only nm-collapsed" hidden>/.test(html));
ok('>>> it hides with the list view, alongside the legend and locate button',
   /#listview\.show ~ #nearMe\{display:none;\}/.test(html));
ok('>>> and it is hidden outright in Route mode, which owns that space',
   /body\.route-mode #nearMe\{display:none;\}/.test(html));
// The collapsible idiom is the existing one, not a second invention.
ok('it reuses the routeResults tab pattern (.rb-tab + chevron)',
   /<button type="button" id="nmTab" class="rb-tab"/.test(html));
ok('>>> with aria-expanded and aria-controls on the tab',
   /id="nmTab"[^>]*aria-expanded="false"[^>]*aria-controls="nearMeBody"/.test(html));
ok('  and aria-expanded is kept in sync in code',
   /\$\('nmTab'\)\.setAttribute\('aria-expanded', String\(open\)\);/.test(codeOnly));
// Attribution is a terms issue: the panel must clear HERE's chrome. Measured
// on a 390px phone — copyright is bottom-flush from x=194, scalebar 24-36px up.
ok('>>> it sits clear of HERE\'s attribution and scalebar (bottom >= 40px)',
   /#nearMe\{[^}]*bottom:40px/.test(html), (/#nearMe\{[^}]*\}/.exec(html) || [''])[0]);
ok('  and clear of the locate button (left >= 58px)',
   /#nearMe\{[^}]*left:58px/.test(html));
ok('  at z-index 400, level with the other map chrome',
   /#nearMe\{[^}]*z-index:400/.test(html));
ok('  with 44px touch targets, for gloved hands on the move',
   /#nearMe \.rb-tab\{[^}]*min-height:44px/.test(html) && /\.nm-row\{[^}]*min-height:44px/.test(html));

// The ranking must never see a filter. This is the invariant the brief calls
// out as most likely to be broken later.
ok('>>> the ranking is fed FUEL_STOPS, never the filtered set',
   /NearMe\.nearestStops\(liveFix\.lat, liveFix\.lng, FUEL_STOPS,/.test(codeOnly));
ok('  and never currentFiltered or passes()',
   !/nearestStops\([^)]*currentFiltered/.test(codeOnly) && !/nearestStops\([^)]*passes/.test(codeOnly));
ok('  the real haversine is what measures every mile',
   /FuelPlan\.haversine, NEAR_ME_COUNT\)/.test(codeOnly));
// One source of truth for "is location on".
ok('>>> visibility keys off liveFix alone, with no second flag',
   /if\(!liveFix\)\{\s*el\.hidden = true;/.test(codeOnly));
ok('  and it re-renders on every fix update', /renderLocationDot\(\);\s*renderNearMe\(\);/.test(codeOnly));
ok('  and when location is switched off', /liveFix = null;[\s\S]{0,120}renderNearMe\(\);/.test(codeOnly));
// Movement threshold, so watchPosition jitter does not rebuild the DOM.
ok('>>> a movement threshold guards the rebuild',
   /const NEAR_ME_MOVE_MI = 0\.25;/.test(codeOnly) && /if\(moved < NEAR_ME_MOVE_MI\) return;/.test(codeOnly));
// No drive time, ever.
ok('>>> the summary states miles and a direction, never a time',
   /\$\{Math\.round\(n\.miles\)\} mi \$\{n\.direction\}/.test(codeOnly) &&
   !/\bmin\b|minutes|hrs|hours/.test((/function nearMeDist[\s\S]{0,200}/.exec(codeOnly) || [''])[0]));
ok('  and the over-cap message still names the distance',
   /No network stop nearby — nearest is/.test(codeOnly));
// Tap-through reuses the one detail view.
ok('>>> tapping a row opens the existing station sheet',
   /b\.addEventListener\('click', \(\) => openSheet\(n\.stop\.row\)\);/.test(codeOnly));
// The stop name already begins with its brand ("TA Dallas South"), so
// prefixing row[1] rendered "TA TA Dallas South" — caught on screen, not in
// review. The list view has always shown the name alone.
ok('>>> the brand is not prefixed onto a name that already carries it',
   !/row\[1\] \+ ' ' \+ n\.stop\.name/.test(codeOnly) &&
   !/\$\{first\.stop\.row\[1\]\} \$\{first\.stop\.name\}/.test(codeOnly));
ok('lib/nearme.js is loaded with a version stamp and shimmed',
   /<script src="lib\/nearme\.js\?v=[\d.]+"><\/script>/.test(html) &&
   /var NearMe = module\.exports;/.test(html));

console.log(`\n${p} passed, ${f} failed`);
if (f) process.exitCode = 1;
