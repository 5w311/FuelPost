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

console.log('=== Auto: what a stop is worth, and the needle at the receiver (v1.51.0) ===');
{
  const src = html.replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
  ok('>>> every stop row carries what it will pump',
     (src.match(/class="rr-fill/g) || []).length >= 2
     && /function fillNote\(fillMiles\)\{/.test(src)
     && /shower credit/.test(src) && /short of a credit/.test(src));
  // v1.58.0 — the FILL, not the leg. They differ only at the first stop, and
  // only when the driver did not leave the shipper full: the pump also has to
  // replace what was already missing. Reported from the road as "~37 gal" on a
  // fill that actually takes ~91.
  ok('>>> the label is computed from the fill, never the leg',
     /FuelGauge\.fillMilesAt\(i, legMiles, ranges\.pickupFuelMiles\)/.test(src)
     && /fillNote\(fillAt\(i, s\.legMiles\)\)/.test(src));
  ok('  and the credit colour is judged on the same number as the words',
     /earnsCredit\(fillAt\(i, s\.legMiles\)\)/.test(src));
  // The word matters: "~84 gal" beside a leg figure reads as the leg. "~84 gal
  // fill" says which quantity it is.
  // BOTH stop lists, counted — a pin that only needs one match passes while
  // the other list quietly loses its bold, which a mutation walked through.
  ok('>>> the leg and detour figures are bold on every stop list',
     (src.match(/<b>\$\{mi\(s\.legMiles\)\} mi<\/b> this leg &middot; <b>\$\{s\.detour\.toFixed\(1\)\} mi<\/b> off route/g) || []).length === 2
     && /\.rr-meta\.mono b\{color:var\(--ink\)/.test(html),
     String((src.match(/<b>\$\{mi\(s\.legMiles\)\} mi<\/b> this leg/g) || []).length));
  ok('  and the number is labelled a FILL, on both wordings',
     (src.match(/gal fill &middot;/g) || []).length === 2,
     String((src.match(/gal fill &middot;/g) || []).length));
  // Shipping since v1.51.0: post-gap stops rendered their fill row twice.
  // Counted over the whole file — one for the plan list, one for the post-gap
  // list, and no third.
  ok('  exactly two fill rows exist: the plan list and the post-gap list',
     (src.match(/class="rr-fill/g) || []).length === 2,
     String((src.match(/class="rr-fill/g) || []).length));
  ok('  and a short fill is coloured, not just worded',
     /\.rr-fill-short\{color:var\(--danger-text\)/.test(html)
     && /rr-fill-short.*: ''/.test(src.replace(/\n/g, ' ')));
  // A MUTATION CAUGHT THIS ONE: reading the arrival off ranges.maxRange
  // instead of the tank passed every unit test there was. The tier is a
  // policy about how far to run between stops; the needle shows fuel.
  ok('>>> the arrival reading comes from the TANK, never the tier',
     /const fuelLeaving = stops\.length \? FuelGauge\.FULL_TANK_MILES : ranges\.pickupFuelMiles;/.test(src)
     && !/fuelAtArrival\(ranges\.maxRange/.test(src));
  // v1.59.0 — flooring never over-stated, but it understated by nearly a whole
  // mark: 439 mi is 2.93 marks and printed as "1/4", hiding 139 mi of fuel.
  // needleReading says where the needle sits and still never over-states.
  ok('  read as a needle position, not floored to the mark below',
     /FuelGauge\.needleReading\(arriveTick\)/.test(src)
     && !/tickLabel\(Math\.floor\(arriveTick\)\)/.test(src));
  // v1.59.0 — the mileage must be PLANNABLE, the same scale the pickup gauge
  // quotes ("1/2 — about 300 mi"). Physical fuel here meant the app printed two
  // different mileages against one set of marks: at 3/8 a driver expects 150 mi
  // and the line said 439.
  ok('  and the mileage is plannable range, not physical fuel',
     /arriveMiles - FuelGauge\.milesForTick\(FuelGauge\.RESERVE_TICKS\)/.test(src)
     && /roughly <b>\$\{mi\(arrivePlannable\)\} mi<\/b> of range left/.test(src)
     && !/in the tank/.test(src));
  ok('  and at the floor it says so rather than printing "0 mi"',
     /no plannable range left<\/b>, on the \$\{FuelGauge\.tickLabel\(FuelGauge\.RESERVE_TICKS\)\} floor/.test(src));
  ok('>>> it answers whether fuel past the delivery is reachable',
     /FuelGauge\.canReachFuelAfter\(arriveMiles, deliveryFuelMiles\)/.test(src)
     && /You can fuel after you drop/.test(src)
     && /<b>Fuel before you deliver<\/b>/.test(src));
  // The station and its distance belong to the tappable panel below, not to
  // this line as well — the same duplication the green "fewest-stop" block was
  // removed for in v1.55.0.
  ok('  and it does not repeat the station the panel below already names',
     !/canFuelAfter\s*\n?\s*\? ` \$\{Esc\.escapeHtml\(nearDel/.test(src));
  ok('  and the nearest-fuel panel is offered on every plan, not just a low one',
     /if\(!nearDel && delivery\)\{/.test(src));
  // v1.60.0 — that panel is a stop a driver may actually drive to, so it
  // carries what every other stop row carries. Read off the ONE resolved
  // value rather than re-ranked, so it can never name a different station
  // than the one measured, or than the one the shared text quotes.
  ok('>>> the nearest-fuel row carries the exit and the nav code',
     /const ndRow = nearDel\.row;/.test(src)
     && /ndRow\[7\]/.test(src) && /navLine\(ndRow\)/.test(src));
  ok('  with the station name escaped and its tier badge shown',
     /Esc\.escapeHtml\(nearDel\.name\)/.test(src) && /tierBadge\(nearDel\.tier\)/.test(src));
  ok('  and it degrades rather than throwing if the id does not resolve',
     /ndRow && ndRow\[7\] \?/.test(src) && /\$\{ndRow \? navLine\(ndRow\) : ''\}/.test(src));
  // v1.60.0 — ONE resolution, above lastTrip. While the panel resolved it for
  // itself, lastTrip could only copy shortTrip's copy, which exists on a
  // no-stop plan and nowhere else: the shared text was silent about the
  // nearest fuel on exactly the plans a driver is most likely to share.
  ok('>>> the nearest station is resolved once, ahead of lastTrip',
     src.indexOf('let nearDel = shortTrip.applies') < src.indexOf('lastTrip = {')
     && (src.match(/let nearDel/g) || []).length === 1
     && !/nearDel = shortTrip\.applies \? shortTrip\.nearestToDelivery : null;[\s\S]{0,200}nearDel = shortTrip\.applies/.test(src),
     JSON.stringify([src.indexOf('let nearDel = shortTrip.applies'),
                     src.indexOf('lastTrip = {')]));
  ok('  and the station row is attached there, not looked up per reader',
     /nearDel = \{ \.\.\.nearDel, tier: nds \? nds\.tier : null, row: nds \? nds\.row : null \};/.test(src));
  ok('>>> the shared text carries it on every completable plan',
     /nearestToDelivery: \(result\.ok && nearDel\)/.test(src)
     && !/nearestToDelivery: \(shortTrip\.applies/.test(src));
  ok('  with the exit and the nav code mapped onto named fields for triptext',
     /exit: nearDel\.row \? nearDel\.row\[7\] : undefined/.test(src)
     && /nav: nearDel\.row \? nearDel\.row\[20\] : undefined/.test(src));
  // The top-off tip is advice about LEAVING the shipper. It used to render at
  // the very bottom, past the delivery and the arrival — after the decision.
  ok('>>> the top-off tip renders ABOVE the pickup row',
     src.indexOf('topping off there before you roll') <
       src.indexOf('<div class="rr-endlabel">Pickup</div>'),
     JSON.stringify([src.indexOf('topping off there before you roll'),
                     src.indexOf('<div class="rr-endlabel">Pickup</div>')]));
  ok('  and only once — it did not get left behind at the bottom too',
     (src.match(/topping off there before you roll/g) || []).length === 1,
     String((src.match(/topping off there before you roll/g) || []).length));
  ok('  the near-delivery button is wired from the value that rendered it',
     /if\(ndBtn && nearDel\)\{/.test(src));
  // v1.61.0 — the tip names a real station, so it opens that station's sheet.
  // It was the ONLY named station in the panel that did not, which left the
  // hours, the amenities and the nav code with nowhere to be reached from.
  ok('>>> the top-off tip is a button, not a dead line of text',
     /<button type="button" class="rr-tip" id="rrNearPick">/.test(src)
     && !/<div class="rr-tip">/.test(src));
  ok('  and it opens the station sheet',
     /if\(tipBtn && tipStop && tipStop\.row\)\{/.test(src)
     && /tipBtn\.addEventListener\('click', \(\) => openSheet\(tipStop\.row\)\)/.test(src));
  ok('  from the row the LINE was written from, never a second lookup',
     /tipStop = near;/.test(src)
     && !/tipStop = FUEL_STOPS\.find/.test(src)
     && src.indexOf('tipStop = near;') < src.indexOf('nearPickupLineTappable(near)'),
     JSON.stringify([src.indexOf('tipStop = near;'),
                     src.indexOf('nearPickupLineTappable(near)')]));
  // v1.62.0 — the station NAME is what opens the sheet, so it wears the
  // colour every other tappable thing in the app wears. Weight alone was not
  // reading as a link against a whole bold line.
  ok('>>> the station name is coloured as a link',
     /\.rr-tip-name\{color:var\(--navy-text\);text-decoration:underline;\}/.test(src)
     && /<span class="rr-tip-name">/.test(src));
  ok('  and only in the tip — the gap notes promise no tap',
     // Twice in the whole file: the rule, and the one span that uses it.
     (src.match(/rr-tip-name/g) || []).length === 2,
     String((src.match(/rr-tip-name/g) || []).length));
  // .map passes the INDEX as a second argument. A flag parameter on the
  // shared formatter would have linked the second station and not the first,
  // which is why the tappable dressing is its own function.
  ok('  the two gap notes still call the PLAIN formatter through .map',
     (src.match(/\.map\(nearPickupLine\)/g) || []).length === 2
     && !/nearPickupLine\(s, /.test(src),
     String((src.match(/\.map\(nearPickupLine\)/g) || []).length));
  ok('  and the wording lives in one place, so the two cannot drift',
     (src.match(/mi from your pickup/g) || []).length === 1,
     String((src.match(/mi from your pickup/g) || []).length));
  ok('  declared at function scope, or the handler wires nothing',
     /let tipStop = null;/.test(src)
     && src.indexOf('let tipStop = null;') < src.indexOf('tipStop = near;'));
  ok('  it carries a chevron, which is what says tappable',
     /<span class="rr-chev">\u203a<\/span>\s*<\/button>/.test(src)
     || /rr-chev">›<\/span>/.test(src));
  // v1.62.0 — the chevron alone was not carrying it: at 12px muted the line
  // read as a footnote, and nobody tries to tap a footnote. Weight is the
  // affordance. The SIZE stays small and it stays out of a box, so it still
  // reads as an option beside the pickup, not a stop the plan requires.
  ok('  and the text is bold, which is what makes it look tappable',
     /\.rr-tip\{[^}]*font-weight:700;/.test(src));
  ok('  but still small and unboxed — not promoted to a required stop',
     /\.rr-tip\{[^}]*font-size:12px;/.test(src)
     && /\.rr-tip\{[^}]*background:none;border:none;/.test(src));
  ok('  and the old duplicate arrival figure is gone from the no-stop copy',
     /No fuel stop <b>required<\/b> for this run\./.test(src)
     && !/required<\/b> — you arrive with about/.test(src));
}

console.log('=== a locate tap frames the three closest stops (v1.50.0) ===');
// It used to be a fixed zoom 11 — a fine picture of the truck and a poor one
// of its options. The view now widens as far as it must to hold the three
// closest stops, and never tightens past what zoom 11 showed.
{
  const src = html.replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
  ok('>>> the framing is computed from the three nearest stops',
     /const LOCATE_STOPS_IN_VIEW = 3;/.test(src)
     && /NearMe\.nearestStops\(at\.lat, at\.lng, FUEL_STOPS,\s*\n\s*FuelPlan\.haversine, LOCATE_STOPS_IN_VIEW\)/.test(src));
  ok('  from FUEL_STOPS, so it cannot disagree with the Near Me footer',
     !/nearestStops\(at\.lat, at\.lng, currentFiltered/.test(src));
  // Mirrored, so the driver is in the middle rather than at whichever edge
  // the stops are not on.
  ok('>>> the rect is mirrored around the fix, not fitted to the points',
     /at\.lat \+ halfLat, at\.lng - halfLng, at\.lat - halfLat, at\.lng \+ halfLng/.test(src));
  ok('>>> and never tighter than the old fixed zoom',
     /const LOCATE_MIN_HALF_MI = 7\.5;/.test(src)
     && /halfLat = Math\.max\(halfLat, LOCATE_MIN_HALF_MI \/ MI_PER_DEG_LAT\);/.test(src));
  // BOTH recenter paths — a tap with a fix in hand, and the first fix after a
  // tap that had to acquire one. The old code duplicated setCenter+setZoom in
  // each; either one left behind would frame differently from the other.
  ok('>>> both recenter paths use it, and neither sets a zoom of its own',
     (src.match(/frameFixWithNearestStops\(\);/g) || []).length === 2
     && !/map\.setZoom\(11\)/.test(src),
     String((src.match(/frameFixWithNearestStops\(\);/g) || []).length));
}

console.log('=== the search box has two jobs (v1.46.0) ===');
// Open list -> filter the rows. Closed list -> look a place up on the map.
// The failure mode this guards is a box doing BOTH: typing a city would then
// hide the very stops the lookup is about to measure against.
{
  const src = html.replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
  ok('>>> one function decides which job is live, from the list state',
     /function activeSearchQuery\(\)\{\s*\n\s*return listIsOpen\(\) \? state\.q : '';/.test(src));
  ok('  and the row filter reads THAT, never state.q directly',
     /query:\s+activeSearchQuery\(\),/.test(src)
     && !/if\(state\.q\)\{/.test(src));
  // v1.48.0 — ONLY a tapped suggestion pins a place. Enter used to geocode
  // whatever was typed, which put a pin on a place the driver never chose.
  const kd = src.slice(src.indexOf("getElementById('searchInput').addEventListener('keydown'"));
  const kdBody = kd.slice(0, kd.indexOf('});') + 3);
  ok('>>> enter never pins anything — it only dismisses',
     !/lookupPlace\(/.test(kdBody) && /hideSuggest\('place'\);/.test(kdBody), kdBody);
  ok('  and it stays out of the way entirely while the list is filtering',
     /if\(listIsOpen\(\)\) return;/.test(kdBody), kdBody);
  ok('>>> the ONLY caller that pins is the suggestion selection',
     /if\(field === 'place'\)\{[\s\S]{0,400}showPlace\(cand\.lat, cand\.lng, cand\.label\);/.test(src)
     && (src.match(/lookupPlace\(/g) || []).length === 2,   // the definition + the needsLookup fallback
     String((src.match(/lookupPlace\(/g) || []).length));
  // v1.63.0 — the copy no longer spells the gesture out. On a phone the box
  // truncates to "Look up a city — tap a…", so the explaining half was the
  // half that got cut; the dropdown teaches the gesture. What still matters
  // is that the copy never points at a key that does nothing.
  ok('  and the copy points at no key that no longer works',
     /'Look up a city'/.test(src)
     && !/tap a match/.test(src) && !/press enter/i.test(src));
  // Hiding the dropdown has to cancel the work still coming, or a response
  // that lands a moment after enter re-opens a list the driver dismissed.
  {
    const hs = src.slice(src.indexOf('function hideSuggest(field){'));
    const hsBody = hs.slice(0, hs.indexOf('\n}\n') + 3);
    ok('>>> hiding a dropdown cancels the pending debounce AND the in-flight fetch',
       /clearTimeout\(suggestDebounce\[field\]\);/.test(hsBody)
       && /suggestToken\[field\]\+\+;/.test(hsBody), hsBody);
  }
  {
    const ih = src.slice(src.indexOf("getElementById('searchInput').addEventListener('input'"));
    const ihBody = ih.slice(0, ih.indexOf('});') + 3);
    ok('  and typing NEVER triggers a lookup — only enter or a tapped suggestion',
       !/lookupPlace\(/.test(ihBody), ihBody);
    ok('  typing does ask for suggestions, but only in lookup mode',
       /if\(listIsOpen\(\)\) hideSuggest\('place'\); else queueSuggest\('place'\);/.test(ihBody), ihBody);
  }
  // The pin belongs to the text that made it: clearing one clears the other,
  // or a stale pin outlives the query it answered.
  const cb = src.slice(src.indexOf("getElementById('searchClearBtn').addEventListener"));
  ok('>>> clearing the search clears the pin with it',
     /clearPlace\(\);/.test(cb.slice(0, cb.indexOf('});') + 3)), cb.slice(0, 300));
  // v2.0.0 — the check asks for seven bytes, not 367 KB, and still never
  // reads from a cache.
  ok('>>> the update check fetches version.txt, not the whole page',
     /fetch\(new URL\('version\.txt', location\.href\) \+ '\?_cb=' \+ Date\.now\(\),/.test(src)
     && /ExtractVersion\.parseVersionFile/.test(src));
  ok('  relative to location.href, so the subpath deploy resolves',
     !/fetch\('\/version\.txt/.test(src));
  ok('  still cache-busted and never served from cache',
     /version\.txt[\s\S]{0,160}cache: 'no-store'/.test(src));
  ok('  and the HTML fallback is still there for a deploy that lost the file',
     /if\(live === null\)\{[\s\S]{0,260}ExtractVersion\.extractVersion\(text\);/.test(src));
  ok('  and the whole page is NOT fetched unless that fallback fires',
     src.indexOf("fetch(new URL('version.txt'") < src.indexOf('location.pathname + \'?_cb=\''));
  ok('  and the placeholder says which job is live, from the first paint',
     /function syncSearchMode\(\)\{/.test(src)
     && /'Look up a city'/.test(src) && /'City, state, exit'/.test(src)
     && /syncSearchMode\(\);\s*\nrender\(\);/.test(src));
  // v1.64.0 — the filter copy was cut off the same way the lookup copy was:
  // 139px of "Search city, state, exit…" in an 88px box, so the driver read
  // "Search city, state,…" and lost the field they were least likely to
  // guess. The verb goes because the magnifier icon already says it; the
  // three field names stay, because that is the half carrying information.
  ok('>>> the filter copy no longer leads with a verb the icon already says',
     !/Search city, state, exit/.test(src));
  ok('  and the two modes still say different things',
     /filtering \? 'City, state, exit' : 'Look up a city'/.test(src));
  // The markup's own placeholder is the FIRST paint, before syncSearchMode
  // runs. Left stale it would flash the old copy on every load.
  ok('  with the static markup carrying the same string, for the first paint',
     /id="searchInput"[^>]*placeholder="City, state, exit"/.test(html)
     && !/placeholder="Search city, state, exit/.test(html));
  // v1.47.0 — suggestions on the Stops box, and a centred view.
  ok('>>> the box is a combobox with its own dropdown',
     /id="searchInput"[^>]*role="combobox"[^>]*aria-controls="placeSuggest"/.test(html)
     && /id="placeSuggest"/.test(html));
  ok('  and the toolbar is unclipped only while that dropdown is open',
     /if\(field === 'place'\)\{\s*\n\s*document\.querySelector\('\.toolbar'\)\.style\.overflow = clipped \? '' : 'visible';/.test(src));
  ok('>>> city-like results are re-ordered first, and NOTHING is dropped',
     /function cityFirst\(items\)\{/.test(src)
     && /\.map\(x => x\.it\);/.test(src)
     && !/items\.filter\([^)]*resultType/.test(src));
  ok('  and renderSuggest actually APPLIES it to the place field',
     /if\(field === 'place'\) items = cityFirst\(items\);/.test(src));
  ok('  the sort is stable, so equal ranks keep the geocoder\'s own order',
     /rank\(a\.it\) - rank\(b\.it\) \|\| a\.i - b\.i/.test(src));
  ok('>>> a tapped suggestion pins its OWN position, with no second geocode',
     /if\(field === 'place'\)\{[\s\S]{0,400}showPlace\(cand\.lat, cand\.lng, cand\.label\);/.test(src));
  ok('>>> the map centres on the pin at a fixed zoom, never a fit',
     /const PLACE_ZOOM = 8;/.test(src)
     && /position: \{ lat: placeAnchor\.lat, lng: placeAnchor\.lng \},\s*\n\s*zoom: PLACE_ZOOM/.test(src)
     && !/fitPlaceAndNearest/.test(src));
  ok('  and pin, answer and centre happen in ONE place for both entry paths',
     /function showPlace\(lat, lng, label\)\{[\s\S]{0,200}dropPlacePin[\s\S]{0,80}renderNearMe\(\);[\s\S]{0,80}centreOnPlace\(\);/.test(src)
     && (src.match(/showPlace\(/g) || []).length === 3);
  // The pin is not network data: it must never be ranked, filtered or planned.
  ok('>>> the pin lives in its own group, apart from the stops',
     /placeGroup = new H\.map\.Group\(\);/.test(src)
     && /placeGroup\.setVisibility\(!route\);/.test(src));
  ok('  and a lookup never touches FUEL_STOPS or the filters',
     !/FUEL_STOPS\.push/.test(src) && !/placeGroup[\s\S]{0,80}markerGroup/.test(src));
}

console.log('=== the legend closes on any chrome change (v1.44.0) ===');
// It is a transient popover over the map, not a panel with state. The bug it
// replaces: `#listview.show ~ #legendCard{display:none}` HID the card while
// the list was up without clearing .show, so it sprang back the moment the
// list closed — and setMode only closed it on the way INTO route mode, so
// Route -> Stops left it open behind the switch.
{
  const codeOnlyL = html.replace(/\/\*[\s\S]*?\*\//g, '').split('\n')
    .filter(l => !/^\s*\/\//.test(l)).join('\n');
  // What it DOES, not only that it is called: a mutation that made
  // closeLegend add .show instead of removing it sailed past the call-site
  // pins below and was caught only by the browser run.
  {
    const cl = codeOnlyL.slice(codeOnlyL.indexOf('function closeLegend(){'));
    const clBody = cl.slice(0, cl.indexOf('\n}\n') + 3);
    ok('>>> closeLegend REMOVES the class — it closes, it does not toggle or open',
       /legendCard'\)\.classList\.remove\('show'\)/.test(clBody)
       && !/classList\.(add|toggle)\('show'\)/.test(clBody), clBody);
  }
  // Six: the five chrome toggles, plus the More button's own close (v2.1.2),
  // which goes through closeLegend so the scrim is released in one place.
  ok('>>> there is ONE closeLegend, and the toggles call it rather than repeat it',
     /function closeLegend\(\)\{/.test(codeOnlyL)
     && (codeOnlyL.match(/closeLegend\(\);/g) || []).length === 6,
     String((codeOnlyL.match(/closeLegend\(\);/g) || []).length));
  // Scoped to setMode's body: it must fire for BOTH directions, so it cannot
  // sit inside the if(route) branch that only runs on the way in.
  const sm = codeOnlyL.slice(codeOnlyL.indexOf('function setMode('));
  const smBody = sm.slice(0, sm.indexOf('\n}\n') + 3);
  ok('>>> setMode closes it before the route-only branch, so both directions fire',
     smBody.indexOf('closeLegend();') >= 0
     && smBody.indexOf('closeLegend();') < smBody.indexOf('if(route){'),
     JSON.stringify([smBody.indexOf('closeLegend();'), smBody.indexOf('if(route){')]));
  ok('  and the old route-only removal is gone from that branch',
     !/\$\('legendCard'\)\.classList\.remove\('show'\)/.test(smBody), smBody.slice(0, 400));
  // Each collapsible panel, by the function that owns its state — so a new
  // call site cannot be added that forgets it.
  for (const fn of ['setRoutebarOpen', 'setRrCollapsed', 'setNearMeExpanded']) {
    const f = codeOnlyL.slice(codeOnlyL.indexOf('function ' + fn + '('));
    const fBody = f.slice(0, f.indexOf('\n}\n') + 3);
    ok(`  ${fn} closes it, so collapse AND expand both dismiss`,
       /closeLegend\(\);/.test(fBody), fBody.slice(0, 300));
  }
  const lt = codeOnlyL.slice(codeOnlyL.indexOf("getElementById('listToggle').addEventListener"));
  ok('  the Stops hamburger closes it on both directions of its own toggle',
     /closeLegend\(\);/.test(lt.slice(0, 400)), lt.slice(0, 400));
}

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
ok('fitNetworkOnce decides WHETHER to fit and delegates the mechanics',
   /markerGroup\.getBoundingBox\(\)/.test(fnBody) && /fitBoundsWithMargin\(b\);/.test(fnBody));
ok('it is one-shot', /if\(networkFitDone\) return;/.test(fnBody) && /networkFitDone = true;/.test(fnBody));
// v1.46.0 moved the pad -> fit -> restore dance into fitBoundsWithMargin so
// the place fit could not carry its own copy of the ordering bug below. The
// assertions follow it there; there is now ONE site to get right.
const fbFn = html.slice(html.indexOf('function fitBoundsWithMargin('));
const fbBody = fbFn.slice(0, fbFn.indexOf('\n}\n') + 3);
const padIdx = fbBody.indexOf('setPadding(MAP_FIT_MARGIN + bleed.top, MAP_FIT_MARGIN, MAP_FIT_MARGIN + bleed.bottom, MAP_FIT_MARGIN)');
const fitIdx = fbBody.indexOf('setLookAtData({ bounds: b })');
ok('the margin is applied BEFORE the fit', padIdx >= 0 && padIdx < fitIdx,
   JSON.stringify({ padIdx, fitIdx }));
// THE BUG THIS PINS: restoring padding synchronously after setLookAtData
// cancels the pending view change, and the camera never moves. Measured
// against the real SDK — the stub cannot catch it, because it computes no
// zoom. Padding must be restored from the map's own settle event.
ok('>>> padding is restored on mapviewchangeend, NOT synchronously after the fit',
   /addEventListener\('mapviewchangeend', restorePadding\)/.test(fbBody)
   && /removeEventListener\('mapviewchangeend', restorePadding\)/.test(fbBody),
   fbBody.slice(-400));
const syncAfterFit = fbBody.indexOf('syncMapPadding();', fitIdx);
const listenerIdx = fbBody.indexOf('const restorePadding');
ok('  the only syncMapPadding after the fit is inside that listener',
   syncAfterFit > listenerIdx, JSON.stringify({ syncAfterFit, listenerIdx }));
{
  // A comment-stripped view, built here because codeOnly is declared further
  // down this file — the prose above describes the dance and would otherwise
  // be counted as a second site.
  const src = html.replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
  ok('  and exactly one site owns the dance, so the two fits cannot diverge',
     (src.match(/setPadding\(MAP_FIT_MARGIN/g) || []).length === 1,
     String((src.match(/setPadding\(MAP_FIT_MARGIN/g) || []).length));
}
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
// #map, not #mapwrap: the padding now includes the strip #map runs on
// behind the tab bar, and that strip is part of #map only. Measuring
// #mapwrap minus a padding that includes it would under-count by the bleed.
{
  const fa = html.slice(html.indexOf('function mapFreeArea('));
  const faBody = fa.slice(0, fa.indexOf('\n}\n') + 3);
  ok('  free area is measured from the map element minus padding',
     /getElementById\('map'\)/.test(faBody) && !/getElementById\('mapwrap'\)/.test(faBody), faBody);
}
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
ok('the cache key distinguishes exclusive, faded and closed variants',
   /const key = `\$\{cls\} \$\{exclClass\}\$\{faded\}\$\{closed\}`/.test(biBody), biBody.slice(0, 400));
// The invariant behind that literal, stated so it survives a reordering: the
// key IS the class list written into the pin, so anything that changes how a
// pin LOOKS is in the key by construction. Miss one and the first pin built
// for a brand wins the cache entry for every other pin of that brand — the
// v1.30.3 red dot would then appear or not depending on build order.
ok('>>> the key is exactly what gets written as the pin class list',
   /class="pin \$\{key\}"/.test(biBody), biBody.slice(0, 400));
ok('>>> every appearance variable buildIcon computes is in the key',
   ['cls', 'exclClass', 'faded', 'closed'].every(v => {
     const declared = new RegExp('(const|let) ' + v + '\\b').test(biBody);
     const inKey = new RegExp('\\$\\{' + v + '\\}').test(/const key = `[^`]*`/.exec(biBody)[0]);
     return declared && inKey;
   }), /const key = `[^`]*`/.exec(biBody)[0]);
ok('  and closed is read from the same set the planner and sheet read',
   /CLOSED_STOP_IDS\.has\(row\[0\]\)/.test(biBody), biBody.slice(0, 400));

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
// v1.51.0 bolded the CODE and left the label muted: on the results screen
// this is the string the driver keys into the truck, so it takes the weight
// and the ink colour while "Nav code" stays quiet. The colour is the point —
// bold alone inside .rr-meta would still have rendered grey.
ok('it renders a labelled, BOLD mono code in the ink colour',
   /class="rr-meta rr-nav">Nav code <b class="mono">\$\{row\[20\]\}<\/b>/.test(html)
   && /\.rr-nav b\{color:var\(--ink\);font-weight:800;\}/.test(html));
ok('it is unconditional — every stop reaching a card has a code',
   !/const navLine = row =>[^\n]*\?/.test(html), 'no empty-string branch on the result path');
// v1.33.0 removed the sheet's Nav code row; v1.33.1 put it back. The code now
// appears on the sheet, on the list row's exit line, and on the result cards —
// three different moments, deliberately, and navcode.test.js asserts all three
// together so removing any one is a deliberate act rather than a side effect.
ok('>>> the station sheet renders a Nav code row',
   /<div class="k">Nav code<\/div>/.test(html));
ok('  conditionally, because the HQ terminal has no code',
   /if\(nav\) html \+= `<div class="row"><div class="k">Nav code<\/div>/.test(html));
ok('  from the destructured column', /,scale,ulsd,nav\] = row;/.test(html));
ok('>>> and the RESULT CARDS still render theirs (the planning flow keeps it)',
   /class="rr-meta rr-nav">Nav code <b class="mono">\$\{row\[20\]\}<\/b>/.test(html));
// The sheet's own row is deliberately NOT bolded with it: there the code sits
// in a table of facts at the same weight as the rest, and making one row
// shout would be noise. Bold belongs on the screen the driver acts from.
ok('  while the sheet keeps its code at the weight of every other row',
   /<div class="k">Nav code<\/div><div class="v mono">\$\{nav\}<\/div>/.test(html));

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
ok('it says plainly that the stop is not planned',
   /not used for fuel planning/i.test(osBody0));
// Colour must not be the only carrier: a ✕ and the words do the work too.
// The headline is data now (v1.30.2), so the mark is pinned here and the
// words are pinned on the table below.
ok('>>> meaning does not rest on colour alone (a mark and a headline carry it)',
   /✕/.test(osBody0) && /\$\{info\.title[^}]*\}<\/b>/.test(osBody0));
// v1.30.2: two closures that do not read alike. A driver told "permanently
// closed" about TA Gary writes off a lot they could still park in overnight;
// one told "parking only" about TA Corning goes looking for a gate that isn't
// there. Both sentences must exist, and the renderer must pick between them
// by lookup rather than by an if on the station id.
ok('>>> the banner copy is looked up per station, not hardcoded in the renderer',
   /CLOSED_STOP_INFO\[id\]/.test(osBody0)
   && !/IN1/.test(osBody0), 'no station id may appear in openSheet');
const infoSrc = html.slice(html.indexOf('const CLOSED_STOP_INFO'));
const infoBody = infoSrc.slice(0, infoSrc.indexOf('\n};') + 3);
const entry = id => {
  const i = infoBody.indexOf(id + ': {');
  if (i < 0) return '';
  return infoBody.slice(i, infoBody.indexOf('\n  }', i));
};
// One entry since v1.31.0: TA Corning was deleted from DATA outright (it was
// never in the fuel book — a data-collection error), so its CLOSED_STOP_INFO
// entry went with it. The table keeps its per-station SHAPE deliberately: it
// was built for two, and the next closure should be a row added here rather
// than a renderer rewritten, which is what the lookup assertions below pin.
const IN1_E = entry('IN1');
ok('  the entry was actually found (not an empty string)',
   IN1_E.length > 40 && !IN1_E.includes('CA5'), JSON.stringify([IN1_E.length]));
ok('  and the deleted station has no entry left behind',
   entry('CA5') === '', entry('CA5'));
ok('>>> TA Gary says temporarily closed AND that parking is what is left',
   /title: 'Temporarily closed — parking only'/.test(IN1_E)
   && /The lot is open and taking trucks/.test(IN1_E), IN1_E);
ok('  the list chip for TA Gary reads "Parking only", not "Closed"',
   /tag: 'Parking only'/.test(IN1_E));
// The banner has to disown the amenity rows under it: those rows still read
// 14 showers and 6 bays, straight from the fuel book.
ok('  and it names what is closed, not just that something is',
   /showers/.test(IN1_E) && /service bays/.test(IN1_E), IN1_E);
ok('the banner uses theme custom properties, not a fixed light-mode red',
   /#sheet \.closedNote\{[^}]*var\(--danger-text\)/.test(html)
   && !/#sheet \.closedNote\{[^}]*background:#[0-9A-Fa-f]{6}/.test(html));
// An alternative is named only where one exists — TA Saginaw has no sibling
// and the sheet must not invent one.
ok('>>> the alternative is looked up, never hardcoded per station',
   /const alt = DATA\.find\(r => r\[0\] === info\.alt\)/.test(osBody0)
   && /\$\{alt \?/.test(osBody0));
ok('  the table names Petro Gary as TA Gary\'s alternative',
   /alt: 'IN2'/.test(IN1_E));
// Only ONE of the two alternatives is at the same exit — Petro Gary is at
// exit 9 against TA Gary's exit 6 — so the relationship cannot be a constant
// in the sentence. It was one before v1.30.2, and shipping the new row
// without this would have told drivers to look for Petro Gary at exit 6.
ok('>>> how the alternative relates to the stop is per-station, not "same exit"',
   /\$\{info\.altNote\}/.test(osBody0) && !/same exit \(/.test(osBody0));
ok('  and the entry says which it is', /altNote: '2\.5 mi east'/.test(IN1_E));
ok('the list row also carries a closed tag, worded per station',
   /CLOSED_STOP_IDS\.has\(row\[0\]\)\?`<span class="tag tag-closed">\$\{CLOSED_STOP_INFO\[row\[0\]\]\.tag\}<\/span>`/.test(html));

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
// Removal (v1.45.0): TWO conditions, not one. mapviewchangeend means the
// camera settled, which measured at ~854ms with nothing yet drawn — the tiles
// are a separate fetch. Retiring on the camera alone put the driver in front
// of a blank rectangle, and on a warm cache removed the indicator before it
// was ever painted. Both halves are pinned, because either one alone is the
// bug: camera-only is what shipped, tile-only would hang if the camera never
// settles.
ok('>>> removal needs the camera settled AND a base-map tile actually delivered',
   /cameraSettled = true; maybeRetire\(\);/.test(html)
   && /map\.addEventListener\('mapviewchangeend', onSettled\);/.test(html)
   && /tilesSeen = true;\s*\n\s*maybeRetire\(\);/.test(html)
   && /if\(retired \|\| !cameraSettled \|\| !tilesSeen\) return;/.test(html));
ok('  the tile host is the SDK\'s own vector template, not a guessed hostname',
   /const MAP_TILE_HOST = 'vector\.hereapi\.com';/.test(html));
// A tile REQUESTED is not a tile ARRIVED. A blocked fetch still writes a
// resource-timing entry, and the first cut of this cleared the overlay on
// exactly those — the browser suite caught it by aborting the tile host and
// watching the overlay vanish at 960ms anyway. responseStatus is what tells
// the two apart (200 served / 0 aborted, measured); every size field reads 0
// either way because the host sends no Timing-Allow-Origin.
ok('>>> a FAILED tile does not count — the status is checked, not just the name',
   /e\.responseStatus >= 200 && e\.responseStatus < 400/.test(html)
   && /e\.responseStatus === undefined/.test(html));
ok('  read from resource timing WITH buffered:true, so a tile that landed early counts',
   /observe\(\{ type: 'resource', buffered: true \}\)/.test(html));
ok('>>> a cap releases the TILE half only — blocked tiles must not trap the driver',
   /capTimer = setTimeout\(\(\) => \{ tilesSeen = true; maybeRetire\(\); \}, TILE_WAIT_CAP_MS\);/.test(html)
   && /const TILE_WAIT_CAP_MS = 6000;/.test(html));
ok('  and it is well under the 20s watchdog, so the two never collide',
   6000 < 20000 && /}, 20000\);/.test(html));
ok('  a browser without buffered resource timing falls back to the old behaviour',
   /catch\(e\) \{[\s\S]{0,400}tilesSeen = true;/.test(html));
ok('  it clears the watchdog and removes the element outright (startup only, never reattached)',
   /clearTimeout\(window\.__mapLoadTimer\);/.test(html)
   && (html.match(/getElementById\('mapLoading'\)/g) || []).length === 1);
ok('  exactly one removal site in the whole file',
   (html.match(/el\.remove\(\);/g) || []).length >= 1
   && (html.match(/retired = true;/g) || []).length === 1,
   String((html.match(/retired = true;/g) || []).length));

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
   /HYBRID_LAYERS = \{\s*light:\s*defaultLayers\.hybrid\.day\.raster,\s*dark:\s*defaultLayers\.hybrid\.night\.raster\s*\};/.test(jsOnly));
ok('both pairs are handed to nextBaseLayer as THEMED_LAYERS',
   /THEMED_LAYERS = \{ pairs: \[ROAD_LAYERS, HYBRID_LAYERS\] \};/.test(jsOnly) &&
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
// The markup's active class is hand-written, so it can disagree with
// DEFAULT_RANGE_TIER — and would then render one tier selected while planning
// on another. Read the constant rather than naming a tier here, so this pin
// cannot go stale the next time the default moves.
{
  const def = (codeOnly.match(/const DEFAULT_RANGE_TIER = '(\w+)';/) || [])[1];
  ok('>>> the DEFAULT tier is the one marked active in the initial markup',
     !!def && new RegExp(`data-tier="${def}"[^>]*class="active"`).test(tierSeg),
     JSON.stringify([def, (tierSeg.match(/data-tier="\w+" class="active"/g) || [])]));
}
ok('  and no other tier is', (tierSeg.match(/class="active"/g) || []).length === 1);
ok('each button shows its mile figure, not just a name',
   /600 mi/.test(tierSeg) && /750 mi/.test(tierSeg) && /900 mi/.test(tierSeg));
ok('and the stop-frequency tradeoff alongside it',
   /Most stops/.test(tierSeg) && /Fewer stops/.test(tierSeg) && /Fewest stops/.test(tierSeg));
// The constants behind them.
ok('DEFAULT_RANGE_TIER is max (v1.59.0)', /const DEFAULT_RANGE_TIER = 'max';/.test(codeOnly));
ok('>>> ROUTE_DEFAULT_RANGE is derived from the tier table, never hardcoded',
   /const ROUTE_DEFAULT_RANGE = RANGE_TIERS\[DEFAULT_RANGE_TIER\]\.miles;/.test(codeOnly));
ok('  so it can no longer be the old 875 by accident',
   !/const ROUTE_DEFAULT_RANGE = 875/.test(codeOnly));
ok('the three tier mile values are 600 / 750 / 900 (v1.57.0)',
   /regular:\s*\{ miles: 600/.test(codeOnly) && /long:\s*\{ miles: 750/.test(codeOnly)
   && /max:\s*\{ miles: 900/.test(codeOnly));
// The button labels must agree with the constants — they are written by hand
// in the markup, so nothing else keeps them honest.
ok('  and the buttons show those same figures',
   /data-tier="regular"[^>]*><b>Regular<\/b><span>600 mi<\/span>/.test(html) &&
   /data-tier="long"[^>]*><b>Long<\/b><span>750 mi<\/span>/.test(html) &&
   /data-tier="max"[^>]*><b>Max<\/b><span>900 mi<\/span>/.test(html));
ok('>>> Custom names the range it accepts rather than "Your own"',
   /data-tier="custom"[^>]*><b>Custom<\/b><span>300&ndash;1200<\/span>/.test(html) &&
   !/Your own/.test(html));

// Custom must keep the original input, clamping and all — a driver who knows
// their number must not lose it.
ok('the number input still exists, behind Custom',
   /id="rangeInput"/.test(html) && /id="rangeCustomWrap"[^>]*hidden/.test(html));
ok('>>> it keeps its min and max', /id="rangeInput"[^>]*min="300"[^>]*max="1200"/.test(html));
ok('  and RANGE_MIN/RANGE_MAX still clamp it in code',
   /Math\.min\(RANGE_MAX, Math\.max\(RANGE_MIN, n\)\)/.test(codeOnly));
ok('  Custom is what reveals it', /\$\('rangeCustomWrap'\)\.hidden = rangeTier !== 'custom';/.test(codeOnly));

// The reserve control is a SWITCH since v1.35.0 — one tap, on or off, with on
// meaning half a tank. The disclosure-plus-choices shape it replaced needed a
// reset-on-close contract (a raised reserve behind a collapsed field silently
// steered plans); a switch does not, because its state is visible on the
// control itself. What follows pins the switch semantics in that contract's
// place.
// v1.56.0 — THE SWITCH IS GONE. Spacing and the skip cost the driver nothing,
// so they run unconditionally; the reserve stopped being a tank fraction and
// became a distance to the delivery's nearest fuel, which the app works out for
// itself. There was no question left to ask.
ok('>>> no arrival switch survives anywhere in the page',
   !/arrivalToggle/.test(html) && !/setArrivalOn/.test(codeOnly)
   && !/ARRIVAL_DEFAULT_ON/.test(codeOnly) && !/arrivalTick/.test(codeOnly));
ok('  and its dead switch CSS went with it',
   !/rb-switchrow/.test(html) && !/\.rb-switch\{/.test(html));
// Sized from the DELIVERY, and through the model rather than a literal — a
// hardcoded 1.3 or 150 here is how the plan and the advice line drift into
// contradicting one another.
ok('>>> the reserve is sized from the delivery, through the gauge model',
   /FuelGauge\.reserveToReachFuel\(deliveryFuelMiles\)/.test(codeOnly));
ok('  measured once per load, from the delivery and not the route',
   /NearMe\.nearestStops\(\s*\n\s*delivery\.lat, delivery\.lng, FUEL_STOPS/.test(codeOnly));
ok('  and readRanges no longer computes one — it cannot know the delivery',
   !/const arrivalReserve = /.test(codeOnly));
// Neither spacing nor the skip may be gated by a ternary any more.
ok('>>> the fill target is unconditional',
   /const targetLeg = FuelGauge\.targetFillMiles\(\);/.test(codeOnly));
ok('  and so is the skip, with its thresholds still off the model',
   /creditMiles: FuelGauge\.CREDIT_MILES, withinMiles: FuelGauge\.SKIP_NEAR_RECEIVER_MI/.test(codeOnly)
   && !/skipShortFinal = arrivalOn\(\)/.test(codeOnly));
ok('>>> and the separate "aim" is gone from the app entirely',
   !/arrivalTarget/.test(codeOnly) && !/ARRIVAL_TARGET_TICK/.test(html));
// v1.40.0: the held-back band is a QUARTER, so any copy naming it has to ask
// the model rather than say "1/8". Three places said it; all three derive now.
ok('>>> no copy hardcodes the old 1/8 floor any more',
   !/bottom 1\/8/.test(codeOnly) && !/Gauge at 1\/8/.test(codeOnly)
   && !/At an 1\/8th tank/.test(codeOnly));
ok('  the switch, the shortfall caution and the floor panel all name it from the model',
   (codeOnly.match(/tickLabel\(FuelGauge\.RESERVE_TICKS\)/g) || []).length >= 3,
   String((codeOnly.match(/tickLabel\(FuelGauge\.RESERVE_TICKS\)/g) || []).length));
// The amber band is the driver-visible half of the floor change, and its
// width is computed from RESERVE_TICKS so it can never disagree with the
// planner about where the unplannable stretch ends.
ok('>>> the gauge paints a second, amber band below the floor',
   /class="gauge-warn"/.test(html) && /\.gauge-warn\{/.test(html));
ok('  and its width comes from RESERVE_TICKS, not a hardcoded 12.5%',
   /--gauge-band-warn[\s\S]{0,120}FuelGauge\.RESERVE_TICKS - 1/.test(codeOnly)
   || /RESERVE_TICKS - 1[\s\S]{0,120}gauge-band-warn/.test(codeOnly),
   (codeOnly.match(/gauge-band-warn[^\n]*/) || [''])[0]);
ok('  the old seg, choices array and disclosure are gone',
   !/arrivalSeg/.test(codeOnly) && !/ARRIVAL_TICK_CHOICES/.test(codeOnly)
   && !/setArrivalOpen/.test(codeOnly) && !/arrivalField/.test(codeOnly));
// v1.56.0 removed the switch, and with it the whole class of bug those two
// pins guarded: a default that disagreed with the markup, and a
// "has anything changed?" check measured against the wrong end of it.
ok('>>> nothing is left for Clear trip to reset about the reserve',
   !/setArrivalOn/.test(codeOnly) && !/arrivalChanged/.test(codeOnly));

// The reserve AND the target have to reach the planner, and the shortfall has
// to stay distinct from a dry gap all the way out to the shared trip text.
// Scoped to readRanges' own body. The help copy also mentions
// arrivalReserveMiles, so an unscoped pin kept passing with the reserve
// hardcoded to 0 — a switch that flips, announces itself, reads correctly in
// its own help line, and hands the planner nothing. That is the ARRIIVAL typo
// of v1.35.0 wearing a different hat; only the e2e caught it in a mutation run.
{
  const rr = codeOnly.slice(codeOnly.indexOf('function readRanges('));
  const rrBody = rr.slice(0, rr.indexOf('\n}\n') + 3);
  ok('>>> readRanges does NOT compute a reserve — it cannot know the delivery',
     !/arrivalReserve/.test(rrBody), rrBody.slice(0, 120));
  ok('  and the range at pickup comes from rangeForTick, likewise',
     /FuelGauge\.rangeForTick\(gaugeTick\)/.test(rrBody));
}
ok('>>> the reserve AND the fill target are passed into planAdaptive',
   /planAdaptive\([\s\S]{0,240}ranges\.arrivalReserve, ranges\.targetLeg, skipShortFinal\)/.test(codeOnly));
ok('  and into planBeyondGap the same way',
   /planBeyondGap\([\s\S]{0,240}ranges\.arrivalReserve, ranges\.targetLeg, skipShortFinal\)/.test(codeOnly));
ok('  readRanges returns the rest, reserve excepted',
   /return \{ maxRange, rangeAtPickup, startBurned,\s*\n\s*onBackupReserve, pickupFuelMiles, targetLeg, skipShortFinal \};/.test(codeOnly));

// v1.52.0 — the skip. Both thresholds must come off the gauge model; a literal
// 100 or 498 here is how the planner and the labels drift apart, and the drift
// would be invisible (the plan would simply skip a stop the labels call worth
// taking). Auto OFF must hand the planner null, not an object with zeroes:
// zeroes would still take the opt-in branch and the legality test would be the
// only thing standing between OFF and a changed plan.
ok('>>> the skip thresholds come from the gauge model, not literals',
   /creditMiles: FuelGauge\.CREDIT_MILES, withinMiles: FuelGauge\.SKIP_NEAR_RECEIVER_MI/.test(codeOnly));
// v1.53.0 — the near-delivery path. The flag has to be measured against the
// DELIVERY, once per load, and it must reach the planner: readRanges cannot
// know it (it sees settings, not the load), so planLoad adds it. A version
// that passed ranges.skipShortFinal straight through would silently lose it.
ok('>>> planLoad measures the network around the DELIVERY, not the route',
   /const deliveryFuel = delivery \? NearMe\.nearestStops\(\s*\n\s*delivery\.lat, delivery\.lng, FUEL_STOPS, FuelPlan\.haversine, 1\)\[0\] : null;/.test(codeOnly));
// v1.56.0: the near-delivery skip branch is no longer fed from the app. It
// cannot fire — the reserve stays zero until the delivery is 115 mi from fuel
// and the flag was only ever set under 50, so a true flag always meant a zero
// reserve, no forced stop, and nothing to skip.
ok('  and the unreachable near-delivery skip flag is no longer passed',
   !/fuelNearDelivery:/.test(codeOnly));
ok('>>> the planner is handed planLoad\'s object, not the one readRanges built',
   /ranges\.arrivalReserve, ranges\.targetLeg, skipShortFinal\);[\s\S]{0,400}ranges\.arrivalReserve, ranges\.targetLeg, skipShortFinal\);/.test(codeOnly)
   && !/ranges\.targetLeg, ranges\.skipShortFinal\)/.test(codeOnly));
// The note said "that close to the receiver" for every skip in v1.52.0, which
// is false for the 270-mi case the road reported. Each reason gets its own.
ok('>>> the skipped-stop note still names the distance the test turned on',
   /const wasNearReceiver = skipped\.milesFromDelivery <= FuelGauge\.SKIP_NEAR_RECEIVER_MI;/.test(codeOnly));
// Pinned as the JOINED expression, not as two facts that happen to both be
// present: a mutation that kept `wasNearReceiver` and the receiver wording but
// branched on a constant passed the looser version of this and was caught only
// by the browser suite.
ok('  and the receiver wording is chosen BY that test, not unconditionally',
   /const because = wasNearReceiver\s*\n\s*\? `, \$\{mi\(skipped\.milesFromDelivery\)\} mi before delivery/.test(codeOnly));
ok('  and nearDel is resolved BEFORE the note that names it',
   codeOnly.indexOf('nearDel = shortTrip.applies') < codeOnly.indexOf('const wasNearReceiver'),
   JSON.stringify([codeOnly.indexOf('nearDel = shortTrip.applies'),
                   codeOnly.indexOf('const wasNearReceiver')]));
// The skipped stop is the one decision the stop list cannot show — it is
// absent from it — so the note is the only place the driver learns of it.
ok('>>> a skipped stop is reported by name',
   /const skipped = result\.droppedFinal;/.test(codeOnly)
   && /class="rr-skipped">Auto skipped/.test(codeOnly));
ok('  the name is escaped like every other station name on the screen',
   /Esc\.escapeHtml\(skipped\.name\)/.test(codeOnly));
ok('>>> the nearest-fuel panel is offered whenever there is a delivery',
   /if\(!nearDel && delivery\)\{/.test(codeOnly));

// v1.41.0 — the backup reserve. The band between 1/8 and 1/4 is dipped into
// only when the reading is already at or under the planning floor, and the
// driver has to be TOLD, because it is fuel the app otherwise refuses to
// plan on. These pin the three places that must agree: the range handed to
// the planner, the readout the driver set it by, and the caution on the plan.
ok('>>> readRanges asks the model one question, not two scales',
   /const fromGauge = FuelGauge\.rangeForTick\(gaugeTick\);/.test(codeOnly)
   && /rangeAtPickup = pickupOpen \? fromGauge\.miles : maxRange/.test(codeOnly));
ok('  a closed disclosure never dips into the backup',
   /onBackupReserve = pickupOpen && fromGauge\.backup/.test(codeOnly));
ok('>>> the gauge readout names the backup rather than claiming 0 mi',
   /rangeForTick\(tick\)/.test(codeOnly) && /on backup reserve/.test(codeOnly));
{
  const guard = 'if(ranges.onBackupReserve){';
  ok('>>> a backup plan is captioned, on an unconditional guard',
     codeOnly.includes(guard)
     && new RegExp(guard.replace(/[(){}.]/g, '\\$&') + '[\\s\\S]{0,200}Planned on your backup reserve')
          .test(codeOnly),
     'the guard must be exactly ' + guard + ' — a && false in front of it disables the caution silently');
  const rp = codeOnly.slice(codeOnly.indexOf('function renderPlan('));
  const rpBody = rp.slice(0, rp.indexOf('\nfunction '));
  ok('  and it is emitted before the stop rows, so it reads as a caption',
     rpBody.indexOf('Planned on your backup reserve') >= 0
     && rpBody.indexOf('Planned on your backup reserve') < rpBody.indexOf('h += `<button class="rr-stop"'),
     JSON.stringify([rpBody.indexOf('Planned on your backup reserve'),
                     rpBody.indexOf('h += `<button class="rr-stop"')]));
}
ok('  and the caution names both floors from the model, no literals',
   /tickLabel\(FuelGauge\.BACKUP_RESERVE_TICKS\)/.test(codeOnly)
   && /tickLabel\(FuelGauge\.RESERVE_TICKS\)/.test(codeOnly));
ok('>>> the floor panel now names the untouchable band, not the planning floor',
   /const limpMiles = FuelGauge\.milesForTick\(FuelGauge\.BACKUP_RESERVE_TICKS\);/.test(codeOnly));
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

console.log('\n=== the corridor filter (v1.28.0, multi-select since v1.32.0) ===');
// The <select> became a disclosure over a checkbox list in v1.32.0. What the
// corridor filter IS has not changed — a DATA-derived list, one shared parser,
// a membership test — so those pins stay; only the control they describe moved.
// The multi-select semantics live in filtermulti.test.js.
ok('the corridor control exists and is STOPS-only, like the state one',
   /<div class="fm stops-only">[\s\S]{0,400}id="corridorToggle"/.test(html));
ok('  it summarises as All corridors when nothing is picked, mirroring All states',
   /id="corridorSummary">All corridors<\/span>/.test(html)
   && /id="stateSummary">All states<\/span>/.test(html));
ok('>>> its options are built from DATA, not hardcoded in the markup',
   /id="corridorList"[^>]*hidden><\/div>/.test(html) && /CORRIDOR_INDEX\.map/.test(codeOnly));
ok('  built through the shared parser, not a second regex in the page',
   /Corridors\.corridorIndex\(/.test(codeOnly) && !/I-\\d\+/.test(codeOnly));
// Derived ONCE. passes() runs over 146 rows per keystroke; a regex per row per
// keystroke is waste, and keying by row reference matches STOP_MARKERS.
ok('>>> each row\'s corridors are derived once into a Map keyed by row',
   /const ROW_CORRIDORS = new Map\(\s*DATA\.map\(r => \[r, Corridors\.corridorsForRow\(r\[0\], r\[7\]\)\]\)\);/.test(codeOnly));
ok('  and passes() only READS that map, never re-parses',
   /ROW_CORRIDORS\.get\(row\)/.test(codeOnly) &&
   !/corridorsForRow[\s\S]{0,80}function passes/.test(codeOnly));
// v2.0.0 — the rule moved to lib/stopfilter.js, so these test the BEHAVIOUR
// they were standing in for instead of its spelling.
{
  const SF = require('../lib/stopfilter.js');
  const base = { showersMany: 10 };
  const row = {};   // the predicate only reads indices, so a sparse row is fine
  ok('>>> the corridor test is membership, not equality — a stop on two roads'
     + ' is found under either',
     SF.stopPasses(row, { ...base, corridors: new Set(['I-20']), rowCorridors: ['I-20', 'I-59'] })
     && SF.stopPasses(row, { ...base, corridors: new Set(['I-59']), rowCorridors: ['I-20', 'I-59'] })
     && !SF.stopPasses(row, { ...base, corridors: new Set(['I-40']), rowCorridors: ['I-20', 'I-59'] }));
  ok('  two selected corridors return their union, and a stop on both once',
     SF.stopPasses(row, { ...base, corridors: new Set(['I-20', 'I-40']), rowCorridors: ['I-20', 'I-59'] }));
  ok('  and it is AND-combined with the other dimensions',
     !SF.stopPasses(['', '', 'n', '', 'c', 'OK', '', '', '', '', '', '', '', '', 0, '', '', '', '', '', ''],
                    { ...base, states: new Set(['TX']), corridors: new Set(['I-20']),
                      rowCorridors: ['I-20'] }),
     'matching the corridor must not rescue a row the state filter rejected');
  ok('  an empty corridor selection is no constraint',
     SF.stopPasses(row, { ...base, corridors: new Set(), rowCorridors: [] }));
}
ok('  and index.html hands the row its corridors rather than deriving them per keystroke',
   /rowCorridors: ROW_CORRIDORS\.get\(row\),/.test(codeOnly));
// Both of these were called out as easy to miss, and each leaves a filter the
// driver cannot see or cannot clear.
ok('>>> the corridor counts toward the filter badge',
   /state\.corridor\.size > 0/.test(codeOnly)
   && /function filtersActive\(\)/.test(codeOnly));
ok('>>> and reset clears both the set and the checkboxes',
   /state\[m\.key\]\.clear\(\);/.test(codeOnly)
   && /cb\.checked = false;/.test(codeOnly));
ok('the checkbox list has its own change handler wired to render()',
   /state\[m\.key\]\.add\(e\.target\.value\)[\s\S]{0,200}?render\(\);[\s\S]{0,40}?updateFilterBadge\(\);/.test(codeOnly));
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
// v1.29.1: the footer is FLUSH to the bottom and full width, and nothing is
// covered because everything above it is lifted instead. Covering HERE's
// attribution is a terms issue, so the lift rules are what carry that now.
// v2.1.2: anchored to the bottom of the map area as before, but drawn as a
// slim bubble inset like the tab bar, with no home-indicator padding (the
// bar below owns that now; here it was a band of empty panel).
ok('>>> the footer is anchored to the bottom of the map area',
   /#nearMe\{[^}]*left:0;right:0;bottom:0/.test(html), (/#nearMe\{[^}]*\}/.exec(html) || [''])[0]);
ok('>>> and drawn as a slim inset bubble, with no safe-area band under the text',
   /#nearMe\{left:(\d+)px;right:\1px;padding-bottom:0;[^}]*border-radius:22px;/.test(html));
// It lines up with the tab bar's side margin, whatever that is.
{
  const nm = /#nearMe\{left:(\d+)px;/.exec(html), tb = /#tabbar\{[^}]*margin:\d+px (\d+)px /.exec(html);
  ok('  and inset exactly as far as the tab bar', nm && tb && nm[1] === tb[1], JSON.stringify([nm && nm[1], tb && tb[1]]));
}
ok('  its tab row is slim but still a 44px target',
   /#nearMe \.rb-tab\{min-height:44px;/.test(html));
ok('>>> the map buttons are lifted by the footer height, not left underneath',
   /#mapwrap\.nm-on #locateBtn\{bottom:calc\(24px \+ var\(--nm-h,0px\)\);\}/.test(html));
ok('>>> HERE\'s scalebar and layer switcher lift with it (.H_ui)',
   /#mapwrap\.nm-on \.H_ui\{bottom:calc\(var\(--tab-h,0px\) \+ var\(--nm-h,0px\)\);\}/.test(html));
// !important because the SDK sets bottom inline on .H_imprint, which beats
// any selector — measured, after the copyright alone failed to lift.
ok('>>> and HERE\'s COPYRIGHT too — .H_imprint is a sibling of .H_ui, not inside it',
   /#mapwrap\.nm-on \.H_imprint\{bottom:calc\(var\(--tab-h,0px\) \+ var\(--nm-h,0px\)\) !important;\}/.test(html));
ok('  the height is published live rather than hardcoded per state',
   /new ResizeObserver\(/.test(codeOnly) && /setNearMeHeight\(/.test(codeOnly));
// contentRect omits the border and the safe-area padding — a one-pixel
// overlap on desktop, the whole home-indicator inset on an iPhone.
ok('  measured as the BORDER box, not contentRect',
   /setNearMeHeight\(el && !el\.hidden \? el\.getBoundingClientRect\(\)\.height : 0\)/.test(codeOnly) &&
   !/entries\[0\]\.contentRect/.test(codeOnly));
ok('  and reset to zero when the footer goes away',
   /wrap\.classList\.remove\('nm-on'\);\s*setNearMeHeight\(0\);/.test(codeOnly));
ok('  no stale hardcoded panel heights remain',
   !/bottom:92px|bottom:268px|nm-open/.test(html));
ok('  at z-index 400, level with the other map chrome',
   /#nearMe\{[^}]*z-index:400/.test(html));
ok('  with 44px touch targets, for gloved hands on the move',
   /#nearMe \.rb-tab\{[^}]*min-height:44px/.test(html) && /\.nm-row\{[^}]*min-height:44px/.test(html));

// The ranking must never see a filter. This is the invariant the brief calls
// out as most likely to be broken later.
ok('>>> the ranking is fed FUEL_STOPS, never the filtered set',
   /NearMe\.nearestStops\(anchor\.lat, anchor\.lng, FUEL_STOPS,/.test(codeOnly));
ok('  and never currentFiltered or passes()',
   !/nearestStops\([^)]*currentFiltered/.test(codeOnly) && !/nearestStops\([^)]*passes/.test(codeOnly));
ok('  the real haversine is what measures every mile',
   /FuelPlan\.haversine, NEAR_ME_COUNT\)/.test(codeOnly));
// One source of truth for "where is this measured from". v1.46.0 widened it
// from the live fix to an ANCHOR — the fix, or a place the driver looked up —
// but it is still exactly one value, resolved in one function, and the panel
// still appears if and only if there is one.
ok('>>> visibility keys off the anchor alone, with no second flag',
   /const anchor = nearAnchor\(\);\s*\n\s*if\(!anchor\)\{\s*\n?\s*el\.hidden = true;/.test(codeOnly));
ok('  and the anchor is a place OR the fix, in that order, from one function',
   /function nearAnchor\(\)\{[\s\S]{0,220}if\(placeAnchor\) return placeAnchor;[\s\S]{0,220}liveFix \?/.test(codeOnly));
ok('  a looked-up place still ranks against FUEL_STOPS, never the filtered set',
   !/nearestStops\([^)]*currentFiltered/.test(codeOnly));
ok('  and it re-renders on every fix update', /renderLocationDot\(\);\s*renderNearMe\(\);/.test(codeOnly));
ok('  and when location is switched off', /liveFix = null;[\s\S]{0,120}renderNearMe\(\);/.test(codeOnly));
// Movement threshold, so watchPosition jitter does not rebuild the DOM.
ok('>>> a movement threshold guards the rebuild',
   /const NEAR_ME_MOVE_MI = 0\.25;/.test(codeOnly)
   && /if\(isPlace \? moved === 0 : moved < NEAR_ME_MOVE_MI\) return;/.test(codeOnly));
// Switching between a pin and the GPS must ALWAYS rebuild, however close the
// two happen to be — otherwise dropping a pin beside the driver leaves the
// GPS rows on screen under a place heading.
ok('  and switching anchor kind always rebuilds, whatever the distance',
   /if\(nearMeLastFix && nearMeLastFix\.place === isPlace\)\{/.test(codeOnly)
   && /nearMeLastFix = \{ lat: anchor\.lat, lng: anchor\.lng, place: isPlace \};/.test(codeOnly));
// No drive time, ever.
ok('>>> the summary states miles and a direction, never a time',
   /\$\{Math\.round\(n\.miles\)\} mi \$\{n\.direction\}/.test(codeOnly) &&
   !/\bmin\b|minutes|hrs|hours/.test((/function nearMeDist[\s\S]{0,200}/.exec(codeOnly) || [''])[0]));
ok('  and the over-cap message still names the distance',
   /nothing nearby — nearest is \$\{Esc\.escapeHtml\(nearMeDist\(first\)\)\}/.test(codeOnly));
// v1.29.2: the line says what it IS, not just a distance and a name. v1.46.0:
// and WHERE from, when that is not the driver's own position — a place answer
// under the bare "Nearest Fuel Stop:" would read as "nearest to me", which is
// the one thing it is not.
ok('>>> the collapsed line is labelled, and names the place when there is one',
   /const lead = placeAnchor/.test(codeOnly)
   && /`Nearest to \$\{/.test(codeOnly)
   && /: 'Nearest Fuel Stop:';/.test(codeOnly));
ok('  and the label is escaped, since it is a geocoder string',
   /Nearest to \$\{Esc\.escapeHtml\(/.test(codeOnly));
ok('  the label is a smaller muted lead, so the stop keeps the width',
   /\.nm-lead\{font-size:11px;font-weight:600;color:var\(--sub\);\}/.test(html));
// Measured with an unclipped clone: the longest line needs 311px, and a 320px
// screen offers 278. The label is the part worth dropping there.
ok('  and it is dropped below 340px, where the name would ellipsis instead',
   /@media \(max-width: 340px\)\{ \.nm-lead\{display:none;\} \}/.test(html));
// The over-cap sentence is NOT labelled — it already contains "nearest".
ok('  the over-cap sentence is not double-labelled',
   !/nm-lead[^`]*No network stop nearby/.test(codeOnly));
// innerHTML now, so the station name must still be escaped.
ok('>>> the station name is escaped, since the line is innerHTML now',
   /nmSummary'\)\.innerHTML[\s\S]{0,200}Esc\.escapeHtml\(/.test(codeOnly));
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

console.log('\n=== the map runs under the tab bar (v2.1.1) ===');
// The bar stays in the layout flow, so #mapwrap's bottom edge (which the
// Near Me footer, the results panel and the route-fit padding all measure)
// does not move. Only the canvas and the full-cover overlays bleed down.
{
  const tabH = /#app\{--tab-h:calc\((\d+)px \+ (\d+)px \+ (\d+)px\);\}/.exec(html);
  const bar = /#tabbar\{[^}]*height:(\d+)px;[^}]*margin:(\d+)px \d+px (\d+)px;\}/.exec(html);
  ok('>>> --tab-h is declared as the bar\'s whole footprint', !!tabH, 'no #app{--tab-h:...} rule');
  ok('>>> and it adds up to the bar\'s real height + margins, so the bleed is exact',
     tabH && bar && (+tabH[1] + +tabH[2] + +tabH[3]) === (+bar[1] + +bar[2] + +bar[3]),
     JSON.stringify({ tabH: tabH && tabH.slice(1), bar: bar && bar.slice(1) }));
  // v2.1.4: as low as it can sit — a flat margin down into the home-indicator
  // strip, not stacked on top of the safe-area inset.
  ok('>>> the bar sits as low as it can: no safe-area inset under it',
     !/#tabbar\{[^}]*safe-area-inset-bottom/.test(html) && !/--tab-h:[^;]*safe-area/.test(html));
  ok('the bar is still in the flow, not floated over the map',
     /#tabbar\{position:relative;[^}]*flex-shrink:0/.test(html));
  ok('>>> the map canvas covers the whole screen; the list and loading cover run on behind the bar',
     /#map\{position:fixed;inset:0;\}/.test(html)
     && /#listview, #mapLoading\{bottom:calc\(-1 \* var\(--tab-h,0px\)\);\}/.test(html));
  ok('  and the list pads its end by the bar, so the last row scrolls clear',
     /#listview\{[^}]*padding-bottom:calc\(24px \+ var\(--tab-h,0px\)\);\}/.test(html));
  // Covering HERE's attribution is a terms issue. `bottom`, not a margin:
  // .H_ui is height:100%/top:auto in HERE's CSS, so a margin moved nothing —
  // measured, the copyright lifted and the zoom and scalebar stayed under.
  ok('>>> HERE\'s controls are lifted clear of the bar (.H_ui, by bottom)',
     /#mapwrap \.H_ui\{bottom:var\(--tab-h,0px\);\}/.test(html)
     && /body\.rr-tab-showing #mapwrap \.H_ui\{bottom:calc\(var\(--tab-h,0px\) \+ var\(--rr-h,0px\)\);\}/.test(html));
  ok('>>> and so is HERE\'s COPYRIGHT (.H_imprint, !important over the inline bottom)',
     /#mapwrap \.H_imprint\{bottom:calc\(var\(--tab-h,0px\) \+ var\(--rr-h,0px\)\) !important;\}/.test(html));
  const bleedFn = html.slice(html.indexOf('function mapBleed('));
  const bleedBody = bleedFn.slice(0, bleedFn.indexOf('\n}\n') + 3);
  ok('the bleed is MEASURED (#map bottom minus #mapwrap bottom), not a constant',
     /getElementById\('map'\)/.test(bleedBody) && /getElementById\('mapwrap'\)/.test(bleedBody)
     && /m\.bottom - w\.bottom/.test(bleedBody) && /w\.top - m\.top/.test(bleedBody), bleedBody);
  ok('>>> the hidden strip is viewport padding, so centring and fits use what is visible',
     /setPadding\(m \+ bleed\.top, m, h \+ m \+ bleed\.bottom, m\)/.test(html));
}

console.log('\n=== the layer button can open its menu (v2.1.1) ===');
// v2.1.0 put overflow:hidden on every .H_ctl to round the corners. The
// layer button's .H_ctl also holds its Map view / Satellite menu, which
// opens outside that 40px square — so the menu was clipped away entirely
// and the button looked dead.
{
  const ctlRule = /#mapwrap \.H_ui \.H_ctl:not\(\.H_scalebar\)\{([^}]*)\}/.exec(html);
  ok('>>> the shared .H_ctl rule does not clip', ctlRule && !/overflow/.test(ctlRule[1]),
     ctlRule ? ctlRule[0] : 'rule missing');
  ok('  only the zoom group clips (its two buttons need the rounded corners)',
     /#mapwrap \.H_ui \.H_ctl\.H_zoom\{overflow:hidden;\}/.test(html));
  ok('  and the single button rounds its own corners, not via :only-child (the menu is its sibling)',
     /#mapwrap \.H_ui \.H_ctl:not\(\.H_zoom\) > \.H_btn\{border-radius:14px;\}/.test(html)
     && !/\.H_btn:only-child/.test(html));
}

console.log('\n=== More is its own bubble and its own sheet (v2.1.2) ===');
{
  ok('>>> the bar is a row of two bubbles, not one capsule',
     /#tabbar\{position:relative;z-index:500;flex-shrink:0;display:flex;/.test(html)
     && /#tabbar #modeSeg\{flex:1;min-width:0;display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\);/.test(html)
     && /#tabbar #legendBtn\{flex:0 0 (\d+)px;\}/.test(html)
     && /#tabbar #legendBtn\{flex:0 0 (\d+)px;\}/.exec(html)[1] === /#tabbar\{[^}]*height:(\d+)px;/.exec(html)[1]);
  ok('  More still sits OUTSIDE #modeSeg, so setMode never treats it as a mode',
     /<\/div>\s*<button id="legendBtn"/.test(html.slice(html.indexOf('<nav id="tabbar"'))));
  // Inside #mapwrap it was capped at 80% of the map area — in Route mode, a
  // strip under the trip card, which hid theme and version off the end.
  ok('>>> the More sheet is sized by the screen, not the map area',
     /#legendCard\{position:fixed;max-height:calc\(100% - env\(safe-area-inset-top,0px\) - 12px\);\}/.test(html));
  ok('  and pads its end by the bar it runs behind',
     /#legendCard\{padding:8px 20px calc\(16px \+ var\(--tab-h,0px\)\);/.test(html));
  ok('>>> the bar rides above the sheet while it is open — More is how it closes',
     /#app:has\(#legendCard\.show\) #tabbar\{z-index:630;\}/.test(html));
  const cl = codeOnly.slice(codeOnly.indexOf('function closeLegend(){'));
  const clBody = cl.slice(0, cl.indexOf('\n}\n') + 3);
  ok('>>> closing More releases the scrim, but never while the station sheet owns it',
     /if\(!document\.getElementById\('sheet'\)\.classList\.contains\('show'\)\)\s*document\.getElementById\('scrim'\)\.classList\.remove\('show'\);/.test(clBody), clBody);
  ok('  opening More dims behind it',
     /const open = document\.getElementById\('legendCard'\)\.classList\.toggle\('show'\);\s*if\(open\) document\.getElementById\('scrim'\)\.classList\.add\('show'\);/.test(codeOnly));
  ok('  and a tap on the dimmed area closes it',
     /getElementById\('scrim'\)\.addEventListener\('click', closeLegend\);/.test(codeOnly));
}

console.log('\n=== the trip card is compact, and never zooms the page (v2.1.2) ===');
{
  // iOS Safari zooms the whole page into any focused input under 16px —
  // unless the viewport caps the scale at 1, which switches that zoom off.
  // v2.1.4 took the trip-card inputs to 15px on the strength of the cap, so
  // the two are held together: shrink the inputs, keep the cap.
  const inp = /\.rb-field input,\.rb-range-wrap input,\.vp-cell input\{([^}]*)\}/g;
  const sizes = [...html.matchAll(inp)].map(m => (/font-size:([\d.]+)px/.exec(m[1]) || [])[1]).filter(Boolean).map(Number);
  const capped = /<meta name="viewport" content="[^"]*maximum-scale=1\.0/.test(html);
  ok('>>> trip-card inputs under 16px only while the viewport caps zoom at 1',
     sizes.length > 0 && (capped || sizes.every(n => n >= 16)), JSON.stringify({ sizes, capped }));
  const plan = /#planBtn,#confirmBtn\{height:([\d.]+)px;/.exec(html);
  ok('  the card\'s buttons stay tappable: Plan is at least 40px',
     plan && +plan[1] >= 40, plan && plan[1]);
}

console.log('\n=== the locate button is the lower half of a pill with the layer button (v2.2.6) ===');
{
  // HERE's layer button: 40x40, 24px in from the right and 24px up (measured).
  // The stack rises 40px and the locate button takes the slot exactly.
  ok('>>> on Stops, HERE\'s bottom-right stack rises by one 40px button',
     /body:not\(\.route-mode\) #mapwrap \.H_l_bottom\.H_l_right\{bottom:56px;\}/.test(html));
  const lb = /#locateBtn\{bottom:(\d+)px;right:(\d+)px;left:auto;width:(\d+)px;height:(\d+)px;border-radius:0 0 14px 14px;/.exec(html);
  ok('>>> the locate button fills that slot: 40x40, 24px in, 24px up, square on top',
     lb && lb.slice(1).join() === '24,24,40,40', lb && lb[0]);
  ok('  and the layer button squares its bottom to meet it',
     /\.H_ctl:not\(\.H_zoom\):not\(\.H_scalebar\) > \.H_btn\{border-radius:14px 14px 0 0;\}/.test(html));
  // The button left the bottom-left corner, so HERE's logo needs no escape.
  ok('  HERE\'s logo is back in its own place — no override moving it',
     !/\.H_logo\{margin-left/.test(html));
  ok('  the button has the navigation-arrow icon, filled',
     /id="locateBtn"[^>]*>\s*<svg viewBox="0 0 24 24" fill="currentColor"/.test(html));
  ok('  and the copyright strip is shrunk, still shown',
     /#mapwrap \.H_copyright\{padding:1px 6px !important;font-size:9px !important;/.test(html)
     && !/\.H_copyright\{[^}]*display:none/.test(html));
}

console.log('\n=== the route results card: inset, no home-indicator band, HERE rides above it (v2.1.5) ===');
{
  // The base rule pads the card by env(safe-area-inset-bottom) from when it
  // met the bottom of the screen. Above the tab bar that was a 34pt band of
  // empty panel that scrolled content vanished into.
  ok('>>> the results card has no home-indicator padding under its scroll area',
     /#routeResults\{left:12px;right:12px;padding-bottom:0;/.test(html));
  ok('  and is inset exactly like the trip card above it',
     /#routebar\{margin:calc\(env\(safe-area-inset-top,0px\) \+ 6px\) 12px /.test(html));
  const rr = codeOnly.slice(codeOnly.indexOf('function setRouteResultsHeight(){'));
  const rrBody = rr.slice(0, rr.indexOf('\n}\n') + 3);
  ok('>>> its height is published live as --rr-h, and is 0 while it is hidden',
     /classList\.contains\('show'\) \? el\.getBoundingClientRect\(\)\.height : 0/.test(rrBody)
     && /setProperty\('--rr-h'/.test(rrBody)
     && /new ResizeObserver\(setRouteResultsHeight\)\.observe\(\$\('routeResults'\)\)/.test(codeOnly), rrBody);
}

console.log('\n=== the stop list is grouped by state (v2.1.6) ===');
{
  const rl = codeOnly.slice(codeOnly.indexOf('function renderList('));
  const rlBody = rl.slice(0, rl.indexOf('\n}\n') + 3);
  ok('>>> rows are grouped on the state code, row[5]',
     /sections\.has\(row\[5\]\)/.test(rlBody) && /sections\.get\(row\[5\]\)\.push\(row\)/.test(rlBody), rlBody.slice(0, 600));
  ok('>>> each section is a heading with the full name, then one card of rows',
     /head\.className = 'list-section';/.test(rlBody) && /head\.textContent = stateLabel\(code\);/.test(rlBody)
     && /card\.className = 'list-card';/.test(rlBody) && /card\.appendChild\(listRow\(row\)\)/.test(rlBody));
  // The heading is textContent, never innerHTML: it is data, not markup.
  ok('  the heading is set as text, not markup', !/head\.innerHTML/.test(rlBody));
  // Sorted by the NAME: by code, AR (Arkansas) comes before AZ (Arizona) and
  // MO (Missouri) before MS (Mississippi), which reads as out of order.
  ok('>>> sections run alphabetically by the name the driver reads, not the code',
     /\.sort\(\(a, b\) => stateLabel\(a\)\.localeCompare\(stateLabel\(b\)\)\)/.test(rlBody));
  ok('  an unknown code falls back to itself rather than a blank heading',
     /const stateLabel = code => STATE_NAMES\[code\] \|\| code;/.test(rlBody));
  ok('  the empty-result message survives the grouping',
     /No network stops match these filters\./.test(rlBody));

  // Every state the network actually covers has a real name.
  const { splitDataBlock, parseRowLine } = require('../tools/geocode.js');
  const DATA = splitDataBlock(html).rowLines.map(parseRowLine);
  const names = eval('(' + /const STATE_NAMES = (\{[\s\S]*?\});/.exec(html)[1] + ')');
  const codes = [...new Set(DATA.map(r => r[5]))];
  const missing = codes.filter(c => !names[c]);
  ok('>>> every state in the data has a full name', missing.length === 0, JSON.stringify(missing));
  ok('  and the table covers all 50 states and DC', Object.keys(names).length === 51, String(Object.keys(names).length));
  const order = codes.map(c => names[c]).sort((a, b) => a.localeCompare(b));
  ok('  Arizona comes before Arkansas, Mississippi before Missouri',
     order.indexOf('Arizona') < order.indexOf('Arkansas') && order.indexOf('Mississippi') < order.indexOf('Missouri'));
}

console.log('\n=== warning boxes and tier badges read as written (v2.2.1) ===');
{
  // The base rule blocks EVERY <b> in a warning box; only the title may be.
  // Without the override, "between mile 516 and mile 1,416" broke into
  // four lines inside the gap warning.
  ok('>>> only a warning box\'s first <b> (its title) sits on a line of its own',
     /\.rr-warn b:not\(:first-child\),\.rr-caution b:not\(:first-child\)\{display:inline;/.test(html));
  // …and every box that has a title really does lead with it.
  const boxes = [...codeOnly.matchAll(/class="rr-(?:warn|caution)">([^\n]*)/g)].map(m => m[1].trim());
  ok('  every titled warning box leads with its <b> title',
     boxes.length >= 6 && boxes.filter(b => /<b>/.test(b)).every(b => b.startsWith('<b>')), JSON.stringify(boxes));
  ok('>>> the caution box\'s link has a colour (was the browser default blue on amber)',
     /\.rr-caution a\{color:var\(--warn-text\);/.test(html));
  ok('>>> a tier badge never splits across lines', /\.badge-pill\{display:inline-block;white-space:nowrap;\}/.test(html));
}

console.log('\n=== the filter panel is a bubble like the results card (v2.2.2) ===');
{
  const fc = /#filterCard\{left:([\d.]+)px;right:([\d.]+)px;border-radius:(\d+)px;/.exec(html);
  const rr = /#routeResults\{left:([\d.]+)px;right:([\d.]+)px;padding-bottom:0;border-radius:(\d+)px;/.exec(html);
  ok('>>> the filter panel is inset and rounded on every corner, exactly like the results card',
     fc && rr && fc[1] === rr[1] && fc[2] === rr[2] && fc[3] === rr[3], JSON.stringify({ fc: fc && fc.slice(1), rr: rr && rr.slice(1) }));
  // Inset, it no longer covers HERE's copyright box completely: the attribution
  // rides above it instead, and what it covers anyway steps aside.
  ok('>>> HERE\'s attribution rides above the open filter bubble',
     /#mapwrap:has\(#filterCard\.show\) \.H_imprint\{bottom:calc\(var\(--tab-h,0px\) \+ var\(--fc-h,0px\)\) !important;\}/.test(html)
     && /new ResizeObserver\(setFilterCardHeight\)\.observe\(\$\('filterCard'\)\)/.test(codeOnly));
  ok('  and the controls it covers hide rather than peek out beside it',
     /#mapwrap:has\(#filterCard\.show\) \.H_ui, #mapwrap:has\(#filterCard\.show\) #locateBtn,\s*#mapwrap:has\(#filterCard\.show\) #locateHint, #mapwrap:has\(#filterCard\.show\) #locateError\{visibility:hidden;\}/.test(html));
}

console.log('\n=== filter and More dim and blur what is behind them (v2.2.3) ===');
{
  ok('>>> the scrim blurs as well as dims', /#scrim\{background:rgba\(0,0,0,\.35\);-webkit-backdrop-filter:blur\(\d+px\);backdrop-filter:blur\(\d+px\);\}/.test(html));
  ok('>>> the filter bubble shows the scrim while it is open', /#app:has\(#filterCard\.show\) #scrim\{opacity:1;pointer-events:auto;\}/.test(html));
  ok('>>> the tab bar stays sharp above the filter\'s scrim, as for More',
     /#app:has\(#filterCard\.show\) #tabbar\{z-index:630;\}/.test(html));
  // More opens over the stop list too: the list must not hide its sheet, or
  // the scrim comes up over nothing.
  ok('>>> the stop list does not hide the More sheet',
     !/#listview\.show ~ #legendCard/.test(html.replace(/\/\*[\s\S]*?\*\//g, '')
       .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n')));
  // A tap on the scrim must count as outside the bubble, or it would trap it.
  ok('  and a tap on the scrim closes it: the outside-tap dismiss tests containment, not target ids',
     /card\.classList\.contains\('show'\) && !card\.contains\(e\.target\)/.test(codeOnly));
}

console.log('\n=== the list button lights up while the list is open (v2.2.5) ===');
ok('>>> #listToggle takes the active tint while #listview is showing',
   /#app:has\(#listview\.show\) #listToggle\{color:var\(--navy-text\);\}/.test(html));

console.log('\n=== a long press on locate never taps what lands under the finger (v2.2.8) ===');
{
  // Turning location off hides Near Me mid-press; the pill drops and the
  // finger lifts over HERE's layer button. HERE acts on the raw release, not
  // on click — so the release events themselves are stopped, at WINDOW
  // capture, which runs before HERE's listeners. A click-only or
  // document-level swallow did not stop it (measured with a real touch hold).
  const sw = codeOnly.slice(codeOnly.indexOf('function swallowReleaseAfterHold(){'));
  const swBody = sw.slice(0, sw.indexOf('\n}\n') + 3);
  ok('>>> the hold swallows pointerup, touchend, mouseup AND click',
     /const HOLD_RELEASE_EVENTS = \['pointerup', 'touchend', 'mouseup', 'click'\];/.test(codeOnly));
  ok('  on window, in the capture phase, ahead of everything else',
     /window\.addEventListener\(t, swallow, true\)/.test(swBody) && /e\.stopImmediatePropagation\(\)/.test(swBody), swBody);
  ok('  and it disarms again (after the release, or on a safety timeout)',
     /window\.removeEventListener\(t, swallow, true\)/.test(swBody) && /setTimeout\(disarm, 400\)/.test(swBody)
     && /setTimeout\(disarm, 10000\)/.test(swBody));
  ok('>>> it is armed the moment the hold fires, before location changes',
     /locateHoldFired = true;\s*swallowReleaseAfterHold\(\);\s*setLocationOff\(!locationOff\);/.test(codeOnly));
}

console.log('\n=== the plan card does not repeat its title bar (v2.2.9) ===');
{
  // The card used to open with a big headline and a sub-line that repeated
  // the title bar right above them. The headline and miles are the title; the
  // range line is the title bar's second line; the card starts with content.
  ok('>>> a plan passes its range line to the title bar',
     /showRoutePanel\(h, `\$\{headline\} · \$\{mi\(routeMiles\)\} mi`, planDetail\);/.test(codeOnly));
  ok('  and the no-range screen does the same',
     /showRoutePanel\(h, head, '0 mi of range leaving the shipper'\);/.test(codeOnly));
  ok('>>> neither result card opens with its own headline any more',
     !/rr-head">\$\{headline\}/.test(codeOnly) && !/rr-head">\$\{head\}/.test(codeOnly));
  ok('  the title bar\'s second line is text, never markup',
     /\$\('rrDetail'\)\.textContent = detail \|\| '';/.test(codeOnly) && !/rrDetail'\)\.innerHTML/.test(codeOnly));
}

console.log('\n=== the locate button is blue only while location runs (v2.2.10) ===');
ok('>>> idle (every fresh launch) is plain ink, not blue',
   /#locateBtn\{bottom:24px;[^}]*color:var\(--ink\);/.test(html));
ok('  finding a fix is blue, a live fix fills blue',
   /#locateBtn\.locating\{color:var\(--navy-text\);\}/.test(html)
   && /#locateBtn\.locked\{background:var\(--accent-fill\);color:#fff;/.test(html));

console.log('\n=== the scale bar sits beside the copyright; the layer menu rounds evenly (v2.2.12) ===');
{
  // The scale bar stood in open map beside the layer button, under its menu.
  // It now rides in the copyright's strip, so every imprint lift carries it.
  const im = html.slice(html.indexOf('function installMapSettings('));
  const imBody = im.slice(0, im.indexOf('\n}\n') + 3);
  ok('>>> every layer-switcher rebuild re-docks it (addControl puts it back in the anchor)',
     /ui\.addControl\('scalebar', scalebar\);\s*dockScalebar\(\);/.test(imBody), imBody);
  ok('  it goes into the imprint, just before the copyright',
     /copy\.parentNode\.insertBefore\(bar, copy\)/.test(codeOnly)
     && /querySelector\('#mapwrap \.H_imprint > \.H_copyright'\)/.test(codeOnly));
  ok('>>> the imprint is a row, and the copyright gives up its inline absolute position',
     /#mapwrap \.H_imprint\{display:flex;[^}]*align-items:flex-end;\}/.test(html)
     && /#mapwrap \.H_imprint > \.H_copyright\{position:static !important;/.test(html));
  ok('  the bar takes back its tap from the pointer-events:none imprint',
     /#mapwrap \.H_imprint > \.H_scalebar\{[^}]*pointer-events:auto;/.test(html));
  ok('>>> the menu title rounds with the menu (16px), not HERE\'s 5px',
     /#mapwrap \.H_ui \.H_rdo_title\{[^}]*border-radius:16px 16px 0 0;/.test(html));
  const os = codeOnly.slice(codeOnly.indexOf('function openSheet(row){'));
  ok('>>> the station sheet has no ULSD row (every stop has it)',
     !/>ULSD</.test(os.slice(0, os.indexOf('\n}\n'))));
}

console.log('\n=== the Call button is a size smaller, still a full tap target (v2.2.13) ===');
ok('>>> 15px text in a 44px button (12 + 20 + 12)',
   /#sheet \.callbtn\{[^}]*font-size:15px;line-height:20px;[^}]*padding:12px;/.test(html));

console.log('\n=== the map buttons match the Call button (v2.2.14) ===');
ok('>>> Apple Maps / Google Maps: 44px, 15px on a 20px line, 12px corners',
   /#sheet \.navbtn\{[^}]*border-radius:12px;[^}]*font-size:15px;line-height:20px;[^}]*min-height:44px;padding:12px 8px;/.test(html));

console.log('\n=== locate waits for the map with HERE\'s buttons (v2.2.15) ===');
ok('>>> hidden while the loading SPINNER is up (not the cover: a failed map keeps the cover)',
   /#mapwrap:has\(#mapLoading \.mapLoadingSpin\) #locateBtn\{visibility:hidden;\}/.test(html));
ok('  and both ways the spinner goes still end it: the cover removed, or the spinner removed',
   /if\(el\) el\.remove\(\);/.test(html) && /if\(spin\) spin\.remove\(\);/.test(html) && /if \(s\) s\.remove\(\);/.test(html));

console.log('\n=== a list row opens its sheet OVER the list (v2.2.16) ===');
{
  const rl = codeOnly.slice(codeOnly.indexOf("item.addEventListener('click', ()=>{"));
  const click = rl.slice(0, rl.indexOf('\n  });') + 6);
  ok('>>> the row\'s tap no longer closes the list, so closing the sheet lands back on it',
     click.length > 40 && !/listview'\)\.classList\.remove\('show'\)/.test(click) && /openSheet\(row\);/.test(click), click);
  ok('  the sheet and its scrim sit over the list (600 / 550 over 350)',
     /#sheet\{[^}]*z-index:600;/.test(html) && /#scrim\{[^}]*z-index:550;/.test(html) && /#listview\{[^}]*z-index:350;/.test(html));
}

console.log('\n=== "Default" map style; the Fuel Dept line is one line (v2.2.17) ===');
ok('>>> the road layer\'s menu entry is "Default", not "Map view"',
   /\{ label: 'Default',\s+layer: theme === 'dark' \? ROAD_LAYERS\.dark/.test(codeOnly) && !/label: 'Map view'/.test(codeOnly));
ok('>>> More\'s note: the number shares the Fuel Dept line, with the approved wording',
   /Fuel only at network stops\.<br>Out-of-network Fuel: Call Fuel Dept <a href="tel:\$\{DRIVER_SUPPORT/.test(codeOnly));
ok('  and the number never splits at its hyphens',
   /#legendSupportNote a\{[^}]*white-space:nowrap;\}/.test(html));

console.log('\n=== the copyright is never cut off (v2.2.18); no translucent status bar (v2.2.19) ===');
// v2.2.18 asked iOS for a translucent status bar so the map ran up under
// it. In the home-screen app that left the tab bar blank (driver's
// screenshot) and was rolled back in v2.2.19; see README, Things not to undo.
ok('>>> no translucent status bar: it blanked the tab bar in the home-screen app',
   !/apple-mobile-web-app-status-bar-style/.test(html) && !/statusShade/.test(html));
ok('>>> the imprint WRAPS, so a long copyright takes its own line instead of running off the edge',
   /#mapwrap \.H_imprint\{display:flex;flex-wrap:wrap;justify-content:flex-end;align-items:flex-end;\}/.test(html)
   && /#mapwrap \.H_imprint > \.H_copyright\{position:static !important;max-width:100%;box-sizing:border-box;\}/.test(html));
ok('  nothing lets the copyright be pushed out: it is not flex-shrink:0 any more',
   !/\.H_copyright\{flex-shrink:0;\}/.test(html) && !/> \.H_copyright\{flex-shrink:0/.test(html));
ok('>>> once wrapped, the scale bar moves left by the logo (clear of the layer/locate pill)',
   /#mapwrap \.H_imprint\.sb-stacked > \.H_scalebar\{margin:0 auto 1px 8px;\}/.test(html)
   && /im\.classList\.toggle\('sb-stacked', copy\.getBoundingClientRect\(\)\.top >= bar\.getBoundingClientRect\(\)\.bottom\);/.test(codeOnly));
ok('  re-checked whenever the copyright or the strip changes size',
   /imprintObserver\.observe\(copy\.parentNode\);\s*imprintObserver\.observe\(copy\);/.test(codeOnly));

console.log(`\n${p} passed, ${f} failed`);
if (f) process.exitCode = 1;
