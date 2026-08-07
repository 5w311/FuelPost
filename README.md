# FuelPost

Covenant network fuel stop finder for drivers. Single-page app, no build step,
deployed to GitHub Pages.

Two modes:

- **Stops** — map and list of all 146 Covenant network locations, filterable by
  brand, tier, state and free text search. Works with no signal once loaded.
- **Route** — enter the pickup and delivery addresses off a dispatch, get a truck
  route from HERE and a fuel plan: which network stops to fuel at, at what mile
  marker, with the fewest stops possible.

## Layout

```
index.html                  the app — markup, styles, DATA array, map + UI wiring
icons/                      favicon / home-screen icon PNGs
lib/fuelplan.js             pure fuel-planning logic (no DOM, no network)
lib/fuelplan-adaptive.js    widens the detour search before declaring a gap
lib/triptext.js             formats a plan as plain text for share / save
lib/location.js             GPS fix labeling and precision checks (no DOM, no network)
lib/gauge.js                fuel-gauge tick <-> miles math (no DOM, no network)
lib/autosuggest.js          query threshold + suggestion-item parsing for the address dropdowns
lib/baselayer.js            pure nextBaseLayer() — which road layer (if any) a theme change applies
lib/memocache.js            session-only memo cache for repeat HERE lookups (no DOM, no network)
lib/routerank.js            orders alternative routes by fuel viability (no DOM, no network)
lib/vehicleprofile.js       vehicle dimensions/weight/hazmat -> HERE vehicle[...] params (no DOM, no network)
lib/escape.js               HTML-escapes external strings before they reach innerHTML (no DOM, no network)
lib/extract-version.js      pulls APP_VERSION out of fetched page source for the update check
lib/flexible-polyline.js    HERE's reference polyline decoder, vendored unmodified (MIT)
test/*.test.js              plain-node tests, no framework
test/run.js                 runs every test file and reports a combined total
tools/geocode.js            one-off script that geocoded the 146 station coordinates
tools/geocode-report.txt    output of that run
```

`lib/` and `tools/` are CommonJS so the tests run under plain `node` with no
install and no build step. `index.html` loads the `lib/` files as classic
scripts behind a three-line `module.exports` shim.

## Fuel stop selection

The rule is **fewest stops**: from each position, push to the furthest network
stop still in range. That is provably minimal for stop count. Station tier
(Exclusive vs Primary) is informational only and does not influence selection —
it shows as a badge on each result.

Two inputs shape the plan:

- **Fuel before you hit** — the distance at which the driver must have fueled.
  Because the rule is fewest-stops, only this maximum matters; a
  "don't stop before X" value would have no effect.
- **Range leaving shipper** — how far the truck can go when it rolls out of the
  pickup. Maps to `startBurned = max(0, maxRange - rangeAtPickup)`.

Selection uses `lib/fuelplan-adaptive.js`'s `planAdaptive`, which tries stops
within 8 miles of the route first and only widens to 15, then 30, if the tight
search would strand the driver — most routes solve at 8 and are never widened.
When the search still comes up short even at 30 miles, `stopsNearPickup` looks
for a network stop within 50 miles of the pickup in any direction (not just
along the route) before the app calls it a dead end: a station near the
shipper — off to the side, behind, wherever — is worth naming as a top-off
option even though it isn't on the route.

Covenant has **no network stops in New Mexico**, which leaves a ~490 mile run on
I-40 between TA Holbrook AZ and TA Amarillo TX with nothing on it. When no
network stop is reachable at all — not on the widened route search, and not
near the pickup either — the app shows the partial plan and names the gap
rather than returning a plan that strands the driver. Out-of-network fuel needs
Driver Support approval first: 423-463-3680.

## Tests

```
node test/run.js          # everything
node test/fuelplan.test.js  # just the planning logic
```

No dependencies, no install step.

## Two version strings, on purpose

They answer different questions and must not be conflated:

- **`FUEL_BOOK_REV`** (`Rev 01-2026`) — which edition of the Covenant fuel book
  the 146 stations in `DATA` came from. Shown in the **header**, because when the
  book is reissued stations join and leave the network, and fueling at a station
  that has left it is a compliance violation. A driver cannot tell stale station
  data from current station data without it. Bump this only when the station data
  is re-sourced from a new book.
- **`APP_VERSION`** (`1.3.0`) — the code. Shown in the **legend card** as a
  support detail. Bumped for every shipped change.

## Persisted settings (localStorage)

`fuelpost.theme.v1` (dark mode, v1.7.0) is the first thing this app persists,
and the pattern it set is the one every future persisted setting should
follow, not just this one:

- Version the key itself — `fuelpost.<setting>.v1`, never a bare
  `fuelpost.<setting>`.
- Store only genuinely explicit choices. If "unset" already has a sensible
  meaning (e.g. "follow system"), don't invent a stored value for it —
  absence already encodes it.
- Treat anything read back that isn't one of the expected values (corrupted,
  from a future format) as absent, falling back to the same default an
  actually-absent key would get. Never throw, never fall back to a fixed
  value that ignores the real default.
- If a later change alters what the *default* logic does — not just adds a
  new valid stored value, but changes what "unset" resolves to — bump to
  `.v2` and treat `.v1` values as absent. Don't reuse a versioned key for a
  changed meaning; an old stored choice under new default semantics can
  silently produce a result the driver never chose.

## Version history

### v1.19.2

**The available-stop marker is now a faded station pin, not a dashed
circle.** v1.19.1's abstract circle read as "tiny cloud" — an abstract
shape carries no meaning on a map. Available stops now render as the
Stops-mode pin the driver already knows — same teardrop, same TA blue /
Petro green, same T / P letter, the Exclusive gold star included — at
0.65 opacity, via an optional `faded` flag on the shared `buildIcon()`
(every existing caller passes one argument and renders exactly as
before).

0.65 was measured, not guessed: the white letter clears legibility on
both tile styles (T on TA fill: 3.7:1 day, 9.8:1 night) while staying
visibly subordinate next to a full-opacity pin. The pin keeps its full
28px — it doubles as the tap target — and separation from planned stops
never depended on weight anyway: planned stops are round, gold and
numbered; station pins are teardrops with letters. Opacity is what
marks one as not-in-your-plan.

Nothing else about v1.19.1 moves: the available counts in the summary
lines, the panel list, draw order (planned things still sit on top),
the bounds fit, and the planning logic are all unchanged. Stops-mode
pins render at full opacity exactly as before.

### v1.19.1

**Available network stops now appear on the map, and every "no stop
needed" line counts them.** Two additions to v1.19.0's no-required-stop
case, from driver feedback; the scope boundary does not move — plans
with required stops draw exactly as before.

On the map, each available stop gets a small dashed marker: 20px vs the
plan pins' 30px, no number inside (numbers mean driving order within a
plan; these aren't a sequence), drawn beneath anything planned so
endpoints sit on top where they overlap. The white fill is fixed,
deliberately not themed: the marker sits on HERE map tiles, not app
chrome, and white-fill-plus-grey-dashed-border is the only measured
pairing where something always carries the shape (border 4.4:1 on
near-white day tiles, fill 16.5:1 on near-black night tiles —
`--surface` in dark mode measures 1.0:1 there and would vanish).
Tapping a marker opens the same station sheet. The bounds fit is
unchanged — every available stop is within detour tolerance of the
polyline, so it's already on screen.

The three "no stop needed" strings now carry the count ("No fuel stop
needed — 2 available"): the expanded headline, the collapsed tab
summary (which reuses the headline string, so no duplication), and —
most usefully — each route option card, so two short routes can be
compared on the fuel dimension instead of reading identically. Zero
available stays plain; "0 available" is noise.

To serve all three consumers (map, panel, cards) without repeated work,
`shortTripOptions()` is now computed once per route option when the
load is planned and cached on the option object — only for options
whose own plan is empty, honouring v1.19.0's rule that long plans never
pay the projection cost, and route switching stays pure re-render.

### v1.19.0

**A plan with zero required stops now shows the fuel options instead of
a dead end.** "No fuel stop needed" answers a question about the tractor
— but some loads require arriving full (a reefer running through
detention, a receiver's own rule), and the app can't know that. And the
Covenant network is sparse enough — 9 states with zero network stops,
8 more with exactly one — that topping off near a stop is often right
even when this load doesn't demand it. So on this one case the app stops
gatekeeping and shows what's available, letting the driver apply the
constraint it can't see:

- the range you arrive with,
- every network stop on the route (mile marker, miles before delivery,
  miles off route), presented as *available*, not recommended — rows tap
  through to the existing station sheet, and a dense lane collapses to
  the last-chance stop with the rest behind an "N more" line,
- and the nearest network stop to the delivery itself, searched across
  ALL stops, not just on-route ones — shown even (especially) when the
  route has none. The same "no fuel required" plan means something very
  different delivering near Atlanta (42 mi to fuel) than into North
  Dakota (364 mi), and only the app knows which one you're in.

Share trip carries the arrival range and the nearest-to-delivery figure
on these plans. These stops are deliberately NOT drawn on the map as
plan markers — that would read as a plan the driver didn't ask for; the
station pins already exist in Stops mode.

The logic is `lib/shorttrip.js` (`shortTripOptions()`, pure, 17 tests),
loaded through the same function-scope fetch shim as
`fuelplan-adaptive.js` and for the same reason (its `require` of
fuelplan.js would collide with the classic-script globals).
**Long-trip planning is deliberately unchanged** — the
`plannedStopCount` guard returns `applies:false` for any plan with
required stops, and the required-stops path renders exactly as before
(browser-tested). Don't go looking for an algorithm change; there
isn't one.

### v1.18.2

**The pickup field's locate button now takes its own one-shot fix,
instead of refusing when map tracking is switched off.** Tapping it with
tracking off answered *"Location is off — turn it on from Stops, or type
the address"*, which sent the driver to a different screen to enable a
continuous background feature they had deliberately turned off, purely
to fill in one box.

Those are two different things, and they are no longer wired together.
The locate button on the map governs *continuous tracking* — the watch,
the dot, the battery drain — and that is what the press-and-hold toggle
switches off. Filling the pickup address is a single explicit tap asking
for one position, once. It now calls `getCurrentPosition()` directly.

It never starts the watch, never draws the map dot, and deliberately
never writes `liveFix` — `setLocationOff()` clears `liveFix` precisely so
"off" means off for everything keyed on it (the station sheet's "From
you" row), and writing a fix back from here would quietly resurrect
that. The toggle itself is left untouched by using the button.

Real geolocation failures are still reported, inline beside the field
and in the caller's own words (permission denied, timed out), with the
button re-enabled so a second tap retries. A tracking failure on the map
no longer posts an error into the route form, which was possible before
when the two shared a failure path.

### v1.18.1

**Fixed the layers button moving to the bottom centre of the map.**
v1.18.0's custom map settings control landed in the right *anchor* but
the wrong *slot* within it. `alignment` only picks which anchor a
control joins; position inside that anchor is DOM child order — and
HERE's bottom-right anchor is a horizontal row shared by the scale bar
and the layers button. `createDefault` leaves it as
`[scale bar, button]`, which puts the button hard against the right
edge. Removing and re-adding only the button made it
`[button, scale bar]`, sliding it left to roughly the centre of a phone
screen. Re-adding the scale bar after the button restores the original
order, and with it the original position.

The zoom control lives in a separate, vertical anchor and was never
affected. Verified by measuring real geometry against the vendored HERE
build — every control returns to `createDefault`'s pixel positions, and
stays there across repeated theme rebuilds. Also confirmed the scale
bar still reads in miles after being re-added, since
`ui.setUnitSystem(IMPERIAL)` runs before the swap.

The v1.18.0 check that missed this trusted the control's own
`getAlignment()` report instead of measuring where it actually rendered.

### v1.18.0

**Traffic removed, and the map settings control is now built by this app
from public API.** Traffic was never part of what FuelPost does, and it
had caused two bugs in a row. Both traffic entries are gone from the
layers control; only Map view and Satellite remain.

The removal is the durable fix rather than a fifth patch.
`H.ui.MapSettingsControl` accepts a config object naming its own
`baseLayers`, and *omitting* its optional `layers` array is what drops
the traffic checkboxes. Because the app now names the entries, the "Map
view" entry carries the themed road layer — `mapnight` in dark mode —
*before* it is ever tapped. That is the actual root cause retired: every
fix from v1.11.6 through v1.17.5 reacted *after* HERE's default control
had already changed the base layer, and each left the control's internal
selection bookkeeping further out of sync (on-device, taps on "Map view"
eventually started landing on Satellite). A theme change now rebuilds
the control instead of writing to `.Ke[0].layer`, an internal minified
property — the standing liability two earlier fixes worked around.

`lib/trafficlayer.js` and its 14 tests are deleted along with the
overlay wiring. The `baselayerchange` listener stays, restored to its
pre-v1.17.5 shape as a cheap backstop via `nextBaseLayer()`; with the
control pointing at the right layer up front it is expected never to
fire a correction.

Verified against the vendored HERE build rather than assumed: the config
form constructs, omitting `layers` renders no traffic entries, the
default control is already bottom-right so nothing moves, a real tap on
a dark-configured "Map view" lands on `mapnight`, and rebuilding the
control while the map is on Satellite neither moves the base layer nor
mis-highlights the entry.

Note for a future HERE usage review: **traffic API usage now drops to
zero.** Real-Time Traffic and Traffic Vector Tile will stop appearing in
the usage report. That is this change working, not a regression.

### v1.17.5

**Traffic is now an overlay, not a base layer — fixing the traffic
toggle forcing the map light in dark mode.** HERE 3.1's
`vector.normal` collection ships `traffic` and `trafficincidents` base
layers in the light style only (3.0's `trafficnight` was dropped), so
when HERE's settings control toggled traffic it set the map onto a
light base with nothing dark to correct to. The structural change:
the app never lets traffic BE the base. When either traffic toggle
fires, the base is forced back to the themed road layer and traffic is
drawn as the transparent `vector.traffic.map` flow overlay on top —
HERE's own documented recommendation — which composes with either
theme (and with Satellite). Toggling traffic off removes the overlay.

The policy lives in `lib/trafficlayer.js` (`trafficCorrection()`, pure,
14 tests), applied by the `baselayerchange` listener — which also
subsumes the old satellite-era "light map in dark mode" correction.
One repair to the wiring as originally specified: the listener now
ignores base-layer changes the app itself scheduled (marked in
`setNormalBaseLayer()`, consumed on the same synchronous dispatch).
Without that, the listener's own deferred correction re-entered it,
read "on a road layer" as "traffic is off," and stripped the overlay
~60ms after adding it — in both themes — and a theme switch with
traffic on did the same. Verified the SDK dispatches `baselayerchange`
synchronously against the real vendored build.

### v1.17.4

**Fixed the dead black band under the map after reopening with Custom
vehicle selected.** HERE's canvas only re-measures on a real window
resize or an explicit `resize()` call — it can't see its own container
change height. Reopening the app with Custom restored meant the map
initialized while the drawer was tall; tapping Standard then shrank the
drawer and grew `#mapwrap`, but nothing told the canvas, leaving an
unselectable black strip where the map should have extended.

Rather than hand-wiring a fourth `resize()` call at the vehicle toggle
(and a fifth at the error block, a sixth at the hazmat placard list —
every drawer section that changes height moves the map's edge), a
`ResizeObserver` on `#mapwrap` now covers the whole class: any change
to the map area's size settles the canvas, debounced 120ms so the
drawer's 250ms collapse animation resizes once at its final size
instead of re-rendering the vector map every frame. The old hand-wired
260ms `setTimeout` in `setRoutebarOpen()` is superseded and removed.

### v1.17.3

Two follow-up fixes to the greyed range placeholder from v1.17.2, both
reported from real use.

**Clear trip no longer refills the range with 875, and an empty range
no longer summons the Clear-trip button.** Clearing the trip now empties
the range box so the greyed 875 placeholder returns, instead of writing
a literal black-text 875. And `routeHasSomethingToClear()` was treating
a blank box as "changed" — `Number('')` is `0`, which is not
`ROUTE_DEFAULT_RANGE`, so the bare inequality lit the Clear-trip button
the instant the field was empty. It now counts the range as changed only
when a value is typed *and* differs from the default.

**The range clear x now appears only for a non-default value, and sits
right beside "mi".** Previously the x's slot was always reserved,
leaving dead space next to "mi" whenever the x was hidden. The x is now
offered only when the box holds something other than 875 (a blank box or
one holding exactly 875 is already at default, with nothing to clear).
When the x is absent, "mi" sits at the edge; a `.has-clear` class
widens the padding and shifts "mi" left so the x takes the edge right
next to it only when it's actually shown.

### v1.17.2

Two fields brought in line with how the custom vehicle inputs already
behave.

**The range field ("how far do you run between fuel stops?") now shows
875 as a greyed placeholder** instead of holding it as a real value. A
blank box with the default showing greyed reads honestly — it hasn't
been set, and the default is visible without pretending the driver
chose it. `readRanges()` treats blank as `ROUTE_DEFAULT_RANGE`, and —
the load-bearing part — no longer writes the default back into the box,
which would have refilled it with black-text 875 on the first plan and
lost the placeholder for the session. A genuinely out-of-range *typed*
value (say 50) still clamps to 300 and writes that back, because seeing
the correction is useful. Clearing the field now empties it so the
placeholder returns, rather than resetting it to a literal 875.

**Each of the four custom vehicle inputs got its own clear button**,
matching pickup, delivery, range, and search. Tapping one empties that
field back to its greyed standard value (a blank vehicle field already
means "use the standard"), updates the profile summary, and leaves the
other three untouched. The buttons wire into the same
`updateFieldClearVisibility()` refresh path as every other field.

### v1.17.1

First-load work reduction. Reported as 5–8s to a visible map; four
causes were identified, and this addresses the two that are contained.

**Connection hints.** The first contact with `js.api.here.com` was a
render-blocking stylesheet in `<head>`, so DNS + TCP + TLS to a
third-party origin all resolved before any map code began downloading.
A `preconnect` (with `crossorigin` — without it the socket is not
reused and the hint does nothing) plus a `dns-prefetch` fallback now
start that handshake immediately.

**Less work at startup.** `render()` is split: `renderMarkers()` always
runs, `renderList()` only when the list panel is actually on screen.
The 146 markers go in via one `addObjects()` call instead of 146
`addObject()` calls, and list rows are built into a `DocumentFragment`
attached once rather than appended individually. `#listview` starts
`display:none` and may never be opened, so its rows are now built on
first open and marked stale on filter changes instead of being rebuilt
behind a hidden panel on every keystroke.

The count is deliberately set in `render()` itself, never in
`renderList()` — a count that only updated when the list happened to be
open was the specific regression risk in this split, and
`test/renderstructure.test.js` pins it.

Measured app-side (HERE stubbed, so this isolates our code from network
and the map engine): `render()` **2.7 ms → 1.0 ms**, DOM nodes built at
first paint **1,209 → 304**, list DOM at startup **907 → 0**. That is
the (d) component only; total cold load is dominated by the serial
script chain and the vector engine, neither of which this touches — so
treat these as the work removed, not as the end-to-end result.

**Not done, on purpose.** Adding `defer` to the `lib/` scripts would
silently break the app: the inline shims between them are *not*
deferred, so each shim would capture `module.exports` while still
empty and every lib module would become `{}` with no error thrown
anywhere. Any future script-loading work must replace the shim pattern
first. `test/renderstructure.test.js` now fails if `defer` or `async`
appears on a lib script. The vector engine also stays — raster paints
sooner, but vector is required for the satellite and theme switching
fixed in v1.11.x.

### v1.17.0

**Amenity filters.** The morning question is "where do I fuel"; the
evening question is "where do I fuel AND park AND shower". Every field
needed was already on each row and shown in the station sheet — only
the filter was missing. Four toggles now sit in the Filters popover
under "What do you need tonight?", AND-combined with each other and
with the existing brand/type/state filters through the same single
`passes()` path. The Filters badge counts them, so a driver who left
one on can see why stops are missing, and a zero-result combination now
says "No network stops match these filters" on **both** the map and the
list instead of showing a blank screen.

**Two thresholds were retuned against the real data before shipping.**
The filters were specified as simple has/doesn't-have checks, but
measured against `DATA` that would have produced two dead controls:
*every* stop has showers (all 146, minimum 4) and effectively every
fuel stop has a CAT scale (144 — only the two Covenant terminals lack
one). A toggle that changes nothing reads as broken and costs trust in
the whole filter row. So showers and service became thresholds, each a
named constant, chosen from the actual spread:

- `PARKING_LARGE = 100` — spaces run 45–725, median 156; keeps 116/146
- `SHOWERS_MANY = 10` — the median; keeps 76/146, roughly a half split
- `BAYS_MANY = 4` — the line between one bay and a real shop; keeps 102/146
- CAT scale stays binary and near-universal: honest, if rarely selective

`test/amenityfilter.test.js` asserts these counts against the live
`DATA` array and **parses the thresholds out of the source** rather than
repeating them, so retuning a constant updates the test automatically
while a data refresh that turns a filter into a no-op fails loudly.

**Accessibility.** The theme selector is now a proper `radiogroup` with
`aria-checked` tracking the selection; the version button carries
`aria-live="polite"` and an action-describing label so its "Checking…"
/ "Update available" states are announced; and the address suggestion
dropdown uses the standard combobox shape — `role="combobox"` +
`aria-autocomplete` + `aria-controls` + `aria-expanded` on the input,
`role="listbox"`/`option` with `aria-selected` on the list. Arrow-key
navigation was deliberately left out, as specified.

One audited item needed no work: the fuel gauge already had
`role="slider"`, `aria-valuemin`/`max`/`now` **and** `aria-valuetext`
("5/8 — about 500 mi"), all updated inside `renderGauge()`. That part of
the audit was out of date; verified rather than re-added.

### v1.16.4

Post-release sweep finding: the two floating map chips — `#locateError`
and `#locateHint` — were never included in the rules that hide the map
chrome. They are appended to `#mapwrap` at runtime, so they are
following siblings of `#listview` exactly like `#locateBtn`, but only
the buttons were listed. The result: a location hint or error would
float over the list-view overlay, and would hang over the route panel
in ROUTE mode pointing at a locate button that isn't even displayed
there.

Both now hide with the rest of the chrome in both contexts. The error
chip case is pre-existing — it predates the hint entirely — and was
only found by walking a real mode-switch journey rather than testing
each feature in isolation.

### v1.16.3

**Security: external strings are now escaped before they reach
`innerHTML`.** Address labels from HERE's geocoding and autosuggest
responses — which include POI and business names this app neither
controls nor can vouch for — were being interpolated into markup
unescaped. A label containing HTML would have been parsed as HTML
rather than shown as text, running in a page that holds the API key,
the driver's live position and the trip addresses.

`lib/escape.js` adds one `escapeHtml()` (ampersand first, so nothing
double-encodes; `null`/`undefined` become `''`). It is applied at every
site that renders an externally-sourced or driver-typed string: the
autosuggest dropdown, both geocode candidate pickers, the matched-address
and "you entered" lines, the plan panel's pickup/delivery addresses, and
the alternative-route option labels.

Two of those were **not** on the original list and were found by
re-auditing every interpolation rather than trusting it: the route-option
labels (added in v1.13.0 — they carry HERE's `routeLabels` text) and the
match-kind line, whose fallback echoes HERE's raw `resultType`. Sites
that interpolate only app-controlled values or committed `DATA` were
left alone; wrapping those adds noise without adding safety.

Real addresses are unaffected — "O'Fallon, MO" and "Sears & Roebuck
Dist Ctr" round-trip and display normally, with no visible entity
artifacts.

### v1.16.2

Two refinements to the location toggle:

**Turning it back on is just a tap.** v1.16.0 required a press-and-hold
in both directions, on the reasoning that a stray tap shouldn't undo a
deliberate choice. That was the wrong trade: getting location *back* is
the common case and shouldn't need a gesture, while switching it *off*
is the direction where an accident actually costs something. So: hold
to turn off, tap to turn on. The off-state hint and button label name
tap accordingly.

**The hint box hugs its text** instead of spanning the map edge to
edge — one short line reading as a banner looked heavier than it is.
`width:max-content` with a `max-width` guard, so a longer message still
wraps on screen rather than running off it.

### v1.16.1

Press-and-hold was invisible: nothing on screen said the gesture
existed, and a button's `title` never surfaces on touch. Every tap of
the locate button now names it — "Hold to turn location off" when
tracking is on, "Hold to turn location on" when it's off — and both
toggle confirmations name the reverse gesture too ("Location off — hold
to turn on", "Location on — hold to turn off"). Short lines, no
instructions to read in a moving truck.

Hints moved into their own `#locateHint` element rather than sharing
`#locateError`: the GPS success handler calls `hideLocateError()` on
every fix, so a hint in that slot was wiped the instant a position
arrived — exactly when the driver is looking at it. A real error still
outranks and clears a hint, so the two never stack. Hints auto-dismiss
after 4s. The route pickup message got the same trim: "Location is off
— turn it on from Stops, or type the address."

### v1.16.0

**Press and hold the locate button to switch location off.** No watch
running, no dot on the map, no stored fix — the button shows a slashed
crosshair and a neutral note says how to undo it. Another press-and-hold
turns it back on and re-acquires.

Decisions worth stating, because they're what make it trustworthy:

- **It persists** (`fuelpost.locate.v1`). Silently re-enabling something
  a driver deliberately switched off is the one behaviour that would
  make this feature untrustworthy, so an explicit choice survives
  reloads.
- **A stray tap can't undo it.** While off, tapping the button shows
  "press and hold to turn it back on" rather than re-enabling — a
  deliberate choice shouldn't fall to a mis-tap on a 40px target in a
  moving truck.
- **`startWatch()` is the single choke point.** The visibility-change
  resume, the pickup GPS button and first-fix retries all route through
  it, so nothing can restart tracking behind the driver's back.
- **`liveFix` is cleared, not just hidden.** The station sheet's "From
  you" distance and the route pickup button both read it, so clearing
  it is what makes "off" actually mean off.
- **No dead ends.** Route mode's "use my location" doesn't silently
  override the choice from another screen — it says location is off,
  names the gesture that restores it, and points at typing the address.

600 ms hold, with the trailing click swallowed so releasing can't also
fire the recenter underneath it, and the OS text-callout menu
suppressed on the button.

### v1.15.2

The Stops-tab search box clears like the route fields do: an × appears
inside the box whenever there's text, and tapping it empties the box,
restores the full stop list, and refocuses the input for the next
search. Same `rb-clear-field-btn` pattern the pickup/delivery/range
fields established — one clearing gesture everywhere. (The magnifier
rule needed scoping to the wrap's direct child so it stopped grabbing
the ×'s own icon.)

### v1.15.1

Tapping a station — map pin or list row, Stops tab or a plan's stop
list — now shows how far the truck currently is from it: a "From you"
row at the top of the station sheet, in plain miles (one decimal under
10 mi). Straight-line, the same measure as every other "X mi from"
figure in the app, computed from the live GPS fix. The row only exists
once a PRECISE fix does — the same `GeoLib.isPreciseFix` bar (300 m)
the pickup GPS flow uses, so a coarse fix (Precise Location off,
IP-derived) never renders a confidently wrong "2.3 mi from you". The
locate button remains the one thing that asks for location; without a
precise fix the sheet is exactly what it was before.

### v1.15.0

Two driver reports off the same ID → FL load, both addressed:

**The trip drawer was clipping its own buttons.** The v1.14.0 vehicle
section pushed the drawer content past `.rb-body`'s old 560px cap, and
`overflow:hidden` quietly cut off the bottom — Clear trip half-visible,
Plan cramped against the vehicle help text. The cap is now 75vh with
`overflow-y:auto`, so on short screens the drawer scrolls instead of
eating its buttons, and the plan/clear buttons got real margins.

**A gapped route now shows what lies past the dry line.** The report:
"I feel like you can get more fuel stops on that route" — looking at a
route whose plan said "1 fuel stop, then a gap" while the map showed it
running straight through Amarillo, Lubbock and Dallas. The driver was
right that the fuel exists; it's all past the mile where the truck runs
dry, and the plan ending at "gap" read as if the whole remainder were
empty — a different and wrong claim.

`planBeyondGap()` (in `lib/fuelplan-adaptive.js`) now continues the
plan past a gap: assume the driver clears the dry stretch on approved
out-of-network fuel, anchor at the first network stop past the dead
line, and run the normal fewest-stops planner from there. The plan
panel renders it under "After the gap — if approved out-of-network fuel
gets you through that stretch, the rest of the run fuels on network:",
with numbering continuing from the reachable stops, faded dashed map
pins so a gapped route never looks routine at a glance, and a second
gap further on reported honestly when there is one. Share/save carries
the same section ("AFTER THE GAP (needs the approved out-of-network
fuel above first)").

This is information for the Fuel Dept approval call, not permission:
the red/amber gap warning and its phone number are unchanged, the
option row still says "no network fuel", and completable plans are
untouched — the continuation only ever exists alongside a gap.

### v1.14.1

**Detour tiers widened to [8, 15, 30, 50]** after a driver report that a
partial tank made every alternative show "no network fuel." Investigated
before changing anything: the v1.14.0 wiring was NOT broken —
`readRanges`, the planner and the option ranking all behave exactly per
the gauge's numbers. What the driver hit is real arithmetic: with little
range leaving the shipper the FIRST stop must come early, and when no
network stop within 30 mi of the route is that close, every alternative
gaps — honestly, but unhelpfully. The plan panel does show why ("375 mi
of range leaving the shipper · 500 mi already burned"), yet the effect
reads as "alternatives broke."

The new 50-mile tier is the escape hatch for exactly that case.
Guardrails, unchanged: `planAdaptive` still tries 8/15/30 first and only
escalates when the plan otherwise gaps; the caution banner names the
widened figure ("uses stops up to 50 miles off route"); and routerank
still prefers routes that complete at tighter tiers. 50 deliberately
equals `NEAR_PICKUP_RADIUS_GAP` — the app's own definition of "reachable
near the shipper at all."

Verified with a 948-mile corridor built to sit 40 mi from exactly one
real station (TA Holbrook) and ≥30 mi from every other: it gaps on the
old tiers and completes through Holbrook on the new ones, with the
caution naming 50. The genuinely-unfuelable fixture (the Pacific-arc
route in the alternatives suite) still gaps at 50 — the wider net
rescues loads a real stop can save, and cannot conjure range: a tank too
low to reach ANY along-route stop still gaps, where the near-pickup
top-off guidance already applies.

### v1.14.0

**Until this version the app applied no vehicle dimensions and no hazmat
restrictions at all.** Earlier entries here said `transportMode=truck`
"respects height, weight and hazmat restrictions." That was wrong. The
shipped code sent `transportMode=truck` and no vehicle parameters, and
HERE's documentation is explicit about what that means: absent vehicle
parameters default to "0 or none," so general truck access restrictions
applied — no car-only roads, no residential shortcuts — and nothing
dimensional. Low bridges, posted weight limits and every hazmat
restriction were invisible to it. A 13'6" truck could be routed under a
12' bridge. This is not a refinement of something that worked; it is the
first version where those restrictions exist.

Three profiles, in the trip drawer under **Vehicle**:

- **Standard** (default) — 13'6" × 8'6" × 70 ft, 80,000 lb, the federal
  maximums for a 5-axle rig. A driver who never opens this control now
  gets full dimensional routing.
- **Hazmat** — same dimensions plus declared hazard classes.
- **Custom** — your own height/width/length/gross weight; blanks fall
  back to the standard value, so changing one number doesn't mean typing
  four.

Notes on decisions that look like details but aren't:

**Conversions round UP, never to nearest.** HERE wants centimeters and
kilograms; drivers think in inches and pounds. Under-declaring makes
HERE believe the truck fits where it doesn't; over-declaring at worst
costs a slightly longer legal route. Those errors are not symmetric.
102 in ceils to 260 cm — which is exactly the 2.6 m that 23 CFR 658.15
itself names as the metric equivalent of the 102-inch limit, so
rounding to nearest would under-declare against the regulation's own
wording.

**Hazmat is a class multi-select, not a toggle, and defaults to all
classes on.** HERE does not infer between classes — its docs state that
declaring combustible or gas does not exclude roads prohibited for
flammable materials. A blanket "hazmat: yes" therefore cannot route
correctly. All classes start selected because over-declaring yields a
longer legal route while under-declaring yields one the truck is barred
from; deselecting the last remaining class re-selects them all rather
than silently sending none.

**The 400 fallback never drops the vehicle profile.** `truckRoute()`
retries without `alternatives`/`routeLabels` on a 400. The vehicle
params are appended to *both* request variants deliberately: a retry
that dropped them would return a route with no dimensional or hazmat
restriction applied, rendered as an ordinary successful plan, with
nothing on screen saying it was illegal for that truck. There is no
third fallback that strips the profile — failing loudly beats routing
an unrestricted truck. The two URLs look redundantly similar for this
reason; do not "simplify" them.

Validation (sanity rails, not legal limits — the app does not pretend to
know every state's permit rules) blocks planning outright rather than
warning, since a typo'd height is exactly the input that produces a
confident illegal route. Profile and values persist under
`fuelpost.vehicle.v1`; anything malformed falls back to Standard without
throwing. Non-Standard profiles are named in the plan panel and in
Share/save, so two pasted plans for one lane explain why their roads
differ.

The `shippedHazardousGoods` enum was checked against HERE's live
OpenAPI spec at implementation time (all 11 values, exact match), as
were the `vehicle[height|width|length]` centimeter and
`vehicle[grossWeight]` kilogram units.

Standard's numbers are federal maximums for typical equipment — correct
for most Covenant freight, but assumptions, not a measurement of any
specific tractor-trailer. The UI says so, and points heavy-haul,
oversize or permitted equipment at Custom.

### v1.13.3

The header badge is the gauge now, not "FP" on a blue-green gradient —
so the app introduces itself the same way on the home screen and once
you're inside. The SVG is inlined in `index.html` (~600 bytes) rather
than referenced as a file: no render-blocking request for something in
the first viewport, and no empty flash on a cold load.

It is a **badge-optimized variant** of the icon, not the same artwork,
and that difference is load-bearing. At 34px the icon's own needle is
about 1.7px wide and antialiases into the navy; the needle pointing at F
is the whole idea of the mark, so the badge thickens the strokes (arc
96→150, hub 62→95, dial radius 340→380) and brightens the red
(`#D93025`→`#FF3B30`) to survive at size. **Do not repoint this at
`icons/icon-192.png`** — that's the un-thickened art.

Measured rather than eyeballed, and worth recording how: an inline SVG
rasterizes at *device* resolution, so a phone at DPR 3 paints this 34px
box with 102 device pixels. Counting needle pixels with the hub disc
masked out (the hub survives at any size and otherwise flatters the
result): **78 needle pixels at DPR 3**, and still non-zero at a 1x
34-pixel floor. Red zone and green F-cap both read at 1x too. Needle
angle computes to 30.0° against an F-cap at 33.9° — pointing at F,
inside the arc band.

The navy field is fixed in both themes deliberately: the header is
`var(--navy)` in light and dark alike, so a navy-field badge sits
correctly on it either way and matches the light-mode app icon. CSS owns
the corner rounding via `overflow:hidden` — the artwork has no `rx` of
its own, so the badge follows if the radius ever changes.

### v1.13.2

Dark-mode readability fix found in a post-release sweep: danger-red text
sitting directly on the theme backgrounds was nearly invisible in dark
mode — `#8A1C1C` manages ~1.9:1 contrast on `#0D1117`/`#161B22`, far
below the 4.5:1 floor the dark palette elsewhere holds to. Two spots
were affected: the gauge's reserve note (pre-existing) and the new
route switcher's "no network fuel" marking on a gapped option — the one
place a driver must absolutely be able to read in the cab at night,
since it's what tells them an option strands the truck.

New `--danger-text` variable, same pattern as `--navy-text`: `#8A1C1C`
in light mode (unchanged appearance), `#F2555A` in dark (5.6:1 on
`--bg`, 5.1:1 on `--surface`). The `#8A1C1C` inside the fixed
light-pink chips (`.rr-warn`, `.geo-error`, `#locateError`) stays
hardcoded — those chips keep their light background in both themes, so
their red always reads. Verified by computed style in a real browser in
both themes.

### v1.13.1

**Re-lands the label fix that v1.13.0 shipped without.** The deployed
v1.13.0 showed every route option as `via [object Object], [object
Object]` — the exact bug the pre-merge double-check had caught and
fixed. The fix commit was pushed to the PR branch minutes before the
merge, but the merge went through at the pre-fix head, so main (and the
Pages deploy) got the feature without it. This entry exists so the
changelog matches what actually deployed: broken labels went out as
v1.13.0; this version is the extractor fix (unwrap HERE's nested
`{name:{language,value}}` label shape), the switcher selection-visibility
fix, and the 400-fallback in `truckRoute()` — the full contents of that
orphaned commit, cherry-picked onto the merged main.

One real finding from the broken deploy, worth keeping: the driver's
screenshot showed three distinct truck-route alternatives, deduped,
ranked with the completable one selected — and **two labels per route**,
proving HERE does return `routeLabels` for `transportMode=truck`. The
feature works; only the label text was mangled. With this fix those same
rows read "via ‹road›, ‹road›".

### v1.13.0

**Alternative routes, ranked by whether they can actually be fueled.**
HERE is now asked for two alternatives alongside the optimal route
(`alternatives=2&return=…,routeLabels`); every route that comes back is
fuel-planned on identical settings, and `lib/routerank.js` orders them
by what this app knows and a mapping app doesn't: a route the truck can
complete on network fuel beats a shorter one that strands it. Miles only
break ties among routes that all work. That reordering is the feature —
a route 150 mi longer that fuels cleanly beats a short one that dies in
New Mexico.

**This costs no additional API calls.** `alternatives=N` is one request
returning N routes, not N requests, and the fuel planning that ranks
them is pure client-side math against the `DATA` array. Switching
between options is a re-render from data already in hand — no refetch,
which also means it still works after the signal drops. Anyone reading
this later and assuming alternatives multiplied our call volume against
the shared key: they didn't.

One exception to "one request": if HERE answers the richer request with
a **400**, `truckRoute()` retries once with the exact parameters this
app has always sent (`transportMode=truck&return=polyline,summary`). A
400 means HERE rejected the *request*, not the road — an unsupported
return-attribute would otherwise take routing down for every load and
leave drivers unable to plan anything at all. The retry turns that into
plain single-route behaviour. It also fires on a genuine "no truck route
exists" 400, where the retry fails identically and the driver sees the
same message as before; one wasted call on an already-failing plan is a
fair price for not being able to break routing outright.

With two or more distinct options a compact switcher sits above the
plan: label (`via I-40`, from HERE's own `routeLabels`), miles, and the
fuel outcome. A gapped option is marked **in the list** — a driver must
never have to tap one to find out it strands the truck — and is ranked
last rather than hidden. When the top pick isn't the shortest *and* the
shortest gaps, one plain line says so. Near-identical alternatives
(within 2% length and the same fuel stops) collapse to one row.
Share/save names the selected route when there was a choice.

Honest limits: correct ordering and honest labeling is what this
guarantees — **not** that an alternative always exists to rescue a bad
load. Where the network hole is wide enough, every route gaps and the
app says so. Labels come from `routeLabels` when HERE sends them and
fall back to `Route 2` / `Route 3` when it doesn't; a plain ordinal is
better than a guessed highway. With a single route returned, nothing
changes at all — no switcher, and the shared text is byte-identical to
before.

On the label shape specifically: HERE nests the text for localisation —
`{"label_type":"Name","name":{"language":"en","value":"I-40"}}` — so the
readable string is one level down. Reading `.name` directly hands back an
object and renders **"via [object Object]"** on the driver's screen; the
extractor unwraps `.value` and yields `''` for anything it doesn't
recognise, which then falls through to the ordinal. The browser test
fixture uses HERE's documented nested shape rather than a convenient flat
string, precisely so this stays caught.

### v1.12.6

The "how far do you run between fuel stops" help text now suggests the
default: "Set this once. Most drivers leave it alone. (Recommend: 875)"
— 875 matches `ROUTE_DEFAULT_RANGE`, the value the field already opens
with. Copy only; no behavior change.

### v1.12.5

**Cache-bust the lib scripts — a driver's phone ran a build that existed
in no commit.** After v1.12.4 deployed, a screenshot showed the shared
trip text with a `Generated by FuelPost v1.12.4` footer AND the Range
line v1.12.4 had just removed. Both can't come from the same commit: the
version string lives in `index.html`, the Range text lived in
`lib/triptext.js`. The phone had fetched fresh HTML but reused a cached
copy of the old lib file — GitHub Pages serves everything with
`cache-control: max-age=600`, so a browser may revalidate the HTML while
still holding any `lib/*.js` for up to 10 minutes (longer in practice on
iOS). Every deploy risked this skew, and the in-app update check made it
worse: its reload fetches fresh HTML but happily reuses cached libs.

Every `lib/*.js` reference (nine `<script src>` tags plus the
`fuelplan-adaptive.js` fetch) now carries `?v=<APP_VERSION>`. A new HTML
always names lib URLs the browser has never seen, so it can never pair
with stale scripts; an old cached HTML keeps naming the old URLs and
stays internally consistent. No server config, no build step.

The stamps are hardcoded copies of the version by design, so
`test/cachebust.test.js` enforces them: all ten references present, all
stamped, all equal to `APP_VERSION` — bumping the version without the
stamps (or vice versa) fails the suite. `header.test.js`'s "version
literal appears only once" guard now strips the stamps before counting,
keeping its original job of catching any *other* stray hardcoded copy.

### v1.12.4

Dropped the Range line from the shared/saved trip text
(`lib/triptext.js`) — a driver saving or texting a plan doesn't need
`Range: fuel before 800 mi | 500 mi leaving the shipper` repeated back
to them; the fuel stop list is the actionable part. The on-screen route
panel is untouched — it still shows range figures where they're useful
for building the plan, this only trims the copy/share output.

### v1.12.3

**Completes the v1.12.1 autosuggest fix, which was incomplete.** v1.12.1
diagnosed the right disease — HERE's autosuggest requires a location
context, and `at` only existed after a GPS fix — but shipped half the
cure. It added `in=countryCode:USA` to every call, reasoning that country
filters and position biases combine. They do combine, but countryCode is
not itself an accepted context: HERE's own 400 for a context-free call
enumerates exactly what is — "One of mutual exclusive parameters 'at',
'in=bbox', 'in=circle', 'in=ring' should be present". countryCode is a
filter that rides alongside one of those; alone it doesn't satisfy the
requirement. So pre-GPS autosuggest still went out context-free in HERE's
eyes and still looked dead until the locate button happened to supply an
`at` — the changelog below shouldn't be read as v1.12.1 having resolved
what it didn't.

Now `at` is unconditional: the GPS fix when one exists (4-decimal), else
`SUGGEST_FALLBACK_AT` (39.5000,-98.3500) — the network's geographic
center, deliberately the same point the map itself opens on.
`in=countryCode:USA` stays for the real filtering work it does (the
Tijuana-suggestions complaint). Accepted tradeoff: pre-permission
suggestions are biased from the center of the US rather than the truck —
irrelevant for full street addresses, imperfect ranking for short
queries, strictly better than no suggestions at all, and it snaps to the
truck the moment a fix lands. The permission ask stays tied to the
driver's own explicit locate actions.

The memo cache key dropped its `'noat'` branch — with a constant
fallback, "no at" can no longer occur.

Why v1.12.1's test didn't catch this: its stub returned 200 for any
parameters, so it verified the request shape changed, not that HERE
accepts it. The regression stub now enforces HERE's contract — no `at`
means a 400 with HERE's verbatim error — and asserts `at` is present on
every call (not "at or in"), that it's the fallback with no fix and the
fix's coordinates with one, and that a re-typed query hits the memo
cache. Run against v1.12.1 unmodified, that test now fails 5 checks and
reproduces the reported symptom exactly; against this fix it passes.

### v1.12.2

Wired in an app icon: `icons/icon-192.png`, `icons/icon-512.png`, and
`icons/icon-180.png` (apple-touch-icon), linked from `index.html`'s
`<head>` with relative paths (the app is served from a `/FuelPost/`
subpath on GitHub Pages, so absolute `/icons/...` paths would 404).

The brief called for two variants — a theme-switching SVG favicon (navy
`#0B2340` for light mode, `#0D1117` for dark, via a `prefers-color-scheme`
media query inside the SVG) plus matching light/dark PNG sets. Only one
PNG set (1024/512/192/180, dark field) made it through as attachments;
the SVG source and the light/navy PNG set couldn't be transferred. Rather
than freehand a replacement for a vector file with brief-specified pixel
geometry (an exact needle angle verified against a 30° target) that was
never actually seen, this ships the dark set alone for every icon role —
`#0D1117` is the app's own dark-mode `--bg`, close enough to navy that
brand identity doesn't shift, and reads as effectively neutral chrome on
both light and dark browser/OS surfaces. No `<link rel="icon"
type="image/svg+xml">` tag yet; add it once the SVG arrives.

No web app manifest, no `theme-color` meta tag — out of scope for this
change, deferred with the rest of the PWA work.

### v1.12.1

Reported: address autosuggest did nothing on **either** the pickup or the
delivery field until the driver tapped the pickup "use my location" button,
after which both started working.

That "both fields, fixed by one unrelated tap" shape points at shared
state, and the only thing that tap changes for autosuggest is `liveFix` —
which is the sole source of the `at` parameter. The autosuggest request was
going out with **no location context at all** before a GPS fix landed:
no `at`, and unlike `geocodeCandidates()` — which has always sent
`in=countryCode:USA` — no `in` either. It was the one search call in the
app missing a location context, which is exactly why it only started
working once `at` appeared.

`in=countryCode:USA` is now sent on every autosuggest call, with `at` still
riding along when a fix exists (country filters, position biases — they
combine). Side benefit: it also stops the US-only fuel network suggesting
addresses in Mexico, which was visible in an earlier report's screenshot.

Worth noting how this was found, since it shaped the fix: the existing test
stub returned `200` regardless of query parameters, so it could never
reproduce this — the app looked correct locally while failing on-device.
The regression test now asserts every autosuggest call carries `at` or
`in`, rather than only asserting that a call was made.

### v1.12.0

Three maintenance items from a review of v1.11.10.

**Fuel Dept rename finished.** Two gap warnings in the plan results still
said "Driver Support" — the highest-stress moments in the app and the worst
place for a stale department name. Both now say "call the Fuel Dept",
matching the legend card, gauge floor note and floor-gap message. The
`DRIVER_SUPPORT` constant and every `tel:` link are unchanged — the
constant's name is internal, renaming it buys nothing visible and risks a
missed reference.

**README drift fixed.** The Layout block listed six `lib/` files against
nine on disk; `autosuggest.js`, `baselayer.js` and `extract-version.js` were
missing, and `memocache.js` below makes ten. The loader sentence also still
said "the two `lib/` files" — now count-free so it can't drift again.

**Repeat HERE lookups are cached for the session.** Re-planning the same
load, retyping the same address, or the autosuggest debounce landing on the
same text twice all re-fired byte-identical requests against a shared,
fleet-wide API key for answers the page already had. `lib/memocache.js` adds
a small FIFO-capped memo in front of four lookups: geocode, reverse-geocode,
autosuggest, and lookup-by-id.

The scope limits are considered decisions, not an unfinished job:

- **In-memory only, no `localStorage`.** A reload is the natural freshness
  boundary. Persisting responses would raise staleness and versioning
  questions this deliberately avoids — don't "finish" it into persistent
  storage without reopening that call.
- **Routing is deliberately not cached.** Truck routes can legitimately
  differ over time (traffic-aware routing), the response is large, and a
  driver re-planning has usually changed an input. The update-check fetch
  isn't cached either — bypassing caches is its entire purpose.
- **Only successful responses are stored.** A failed lookup stays uncached
  so the next attempt is a real retry. An *empty* result from a successful
  response is a legitimate answer and does cache, which is why every call
  site gates on `has()` rather than the truthiness of `get()`.

One deviation from the brief worth recording: it asked that a cache hit
return before touching the autosuggest request token. The token *comparison*
is indeed skipped on that path — there's no `await` to race across — but the
counter still advances. The debounce is 300 ms and a slow fetch can outlive
it, so an older in-flight request would otherwise still match the current
token when it lands and overwrite the fresher cache-rendered result.

### v1.11.10

In Satellite view, changing the theme (Light/Dark/System, or a live system
preference change) kicked the map off Satellite and back onto the road map.
It now stays on Satellite — only the app's chrome changes.

Worth stating plainly for whoever reads this history next: **v1.11.6 through
v1.11.9 all treated this area as a `setBaseLayer()` timing/race problem** and
kept adding deferral, idempotency guards, and internal bookkeeping to manage
it. That was the wrong diagnosis. The actual defect was one missing
conditional — `switchTheme()` called `setNormalBaseLayer()` unconditionally,
never asking what the map was currently showing, on the assumption it was
always one of the two themed road layers. It isn't: HERE's own layer
switcher also offers Satellite and Terrain. No amount of additional
deferral could fix that, which is why four rounds of it didn't.

The decision now goes through `lib/baselayer.js`'s pure `nextBaseLayer()`,
which returns "no change at all" both when the map is on a layer that isn't
ours to touch (Satellite/Terrain/anything HERE adds later) and when it's
already correct for the theme. The deferral machinery from the earlier
patches stays exactly as it was — it was never the bug, and it still earns
its keep on the road-layer transitions that do happen. The
`baselayerchange` listener already checked the specific layer before
correcting, so it never had this bug either.

### v1.11.9

A screen recording of v1.11.8 confirmed the Satellite/dark-mode symptom was
still there, and revealed why: HERE's own built-in layer switcher (behind
the layers icon) keeps its own internal record of "what's currently
selected," and every correction this app has made so far (v1.11.6–v1.11.8)
changed the *map's* layer directly without that control ever finding out —
each one left it a little more out of sync with reality, to the point where
the recording shows tapping its own "Map view" entry landing on Satellite
instead of either map style, not just the wrong one.

Rather than reacting after HERE's control does something, this keeps its
own "Normal Map" entry pointed at whichever of the light or dark layer
matches the current theme *before* it's ever tapped — on load and on every
theme switch — so there's nothing left to react to and it's correct the
first time. This reaches past HERE's public API into an internal,
version-dependent property (verified against this app's actual loaded
`mapsjs-ui.js`, wrapped defensively so a future HERE build with a different
internal shape just no-ops instead of breaking); the existing v1.11.6–8
correction logic stays in place unchanged underneath it as a fallback.
Given the depth of undocumented internals involved, this is a best-effort
fix rather than a guaranteed one — flag it again if the recording's
specific symptom (tapping Map view lands on the wrong layer, or on
Satellite) is still reproducible after this ships.

### v1.11.8

Reported: from Satellite view, switching directly to this app's own Dark or
Light toggle (not going through HERE's own "Map" entry first) landed on the
dark map layer either way, regardless of which was tapped. v1.11.6/v1.11.7
already found and fixed one race in this same family — a driver's own
theme switch landing right after this app's Satellite-exit correction could
stack a second `setBaseLayer()` call before HERE's engine settled from the
first — but that fix only deferred the *correction's* own call, not
`switchTheme()`'s. This report is the same category of race on the other
call site: `switchTheme()` was still applying its layer change immediately,
so a theme switch straight off Satellite could hit the identical timing
problem. Both now go through one shared, deferred, idempotent
`setNormalBaseLayer()` — `switchTheme()`'s own layer change and the
Satellite-exit correction alike — so a `setBaseLayer()` call can no longer
land back-to-back with another one regardless of which path triggered it.
Note: this exact interaction couldn't be reproduced in the test harness
(which mocks HERE's engine synchronously, so the underlying race never
occurs there in the first place) — the fix generalizes the same defensive
pattern already confirmed to fix the analogous, verified case, and the new
tests cover switching directly from Satellite to Dark, to Light, and a
rapid Dark→Light double-tap with no gap, all landing correctly. Worth a
recheck on a real device to confirm the actual reported symptom is gone.

### v1.11.7

Fixes a follow-on from v1.11.6's Satellite→Map dark-mode correction: doing
that switch and then immediately tapping the app's own light-mode toggle
left the map visually stuck, needing an extra dark→light round trip to
recover. v1.11.6's correction ran its own `setBaseLayer()` call synchronously
and re-entrantly, from inside HERE's own handling of the very base-layer
change that triggered it — landing a second `setBaseLayer()` in the same
tick as a driver's own follow-up switch was one too many stacked calls for
the map engine to settle between. The correction now runs after a short
deferred beat instead (`setTimeout`, cleared and rescheduled on every new
`baselayerchange` so only the latest one applies), and re-checks the theme
fresh at that point — a light-mode switch landing in that window reads
correctly and the correction backs off rather than fighting it. Also now
preserves center/zoom around its own `setBaseLayer()` call, same as
`switchTheme()` already does elsewhere, per HERE's own documented guidance
that neither carries over on a base-layer change automatically.

### v1.11.6

Fixes the map dropping back to light mode, even with dark mode on, after
using HERE's own built-in layer switcher (bottom-right) to pick Satellite
and then Map again. Confirmed straight from HERE's own UI module source:
its "Map" entry is hardcoded to the light `vector.normal.map` layer, with
no awareness this app also has a `.mapnight` variant or is currently in
dark mode — nothing in HERE's control lets it be handed a dark alternative.
Fixed by listening for the map's own `baselayerchange` event (fired for
every base-layer change, this app's own theme toggle included) and
correcting back to `.mapnight` whenever it fires while resolved theme is
dark and HERE just set the light layer — self-terminating, since the
correction's own `setBaseLayer()` call re-fires the same listener but by
then the layer already matches, so it's a no-op the second time.

### v1.11.5

Three small route-bar/map-chrome fixes:

- The pickup field's locate button used to sit permanently in its
  "shifted-in" position (with the input's padding reserving room to match),
  whether or not the clear ("x") button next to it was actually showing —
  leaving a dead gap when the field was empty. The locate button's position
  and the input's padding are now conditional on a `.has-clear` class that
  toggles alongside the clear button's own visibility, so the locate button
  sits close to the field's edge until there's actually something to clear.
- The cruising-range field's clear button used "differs from the 875
  default" as its show/hide rule, unlike pickup and delivery's own "field
  is non-empty" rule — inconsistent, and looked broken (875 visibly in the
  box, no x showing). Range now uses the same "is there something here to
  clear" rule as the other two fields. Its click behavior is unchanged —
  still resets to 875.
- HERE's built-in scale bar defaulted to metric (km); `H.ui.UI` is now
  explicitly set to `H.ui.UnitSystem.IMPERIAL`, so it reads in miles like
  the rest of the app (routing, gauge, plan text). **Scale bar sharpness**
  (reported blurry next to the crisp zoom/layers controls) was investigated
  but not changed: inspecting HERE's own UI module source directly shows
  the scale bar renders via an inline SVG string (`innerHTML = '<svg
  height="12">...'`), not a `<canvas>` element — the only `<canvas>` usage
  anywhere in that module is in an unrelated map-capture/export function.
  SVG is resolution-independent, so the "canvas backing store needs
  devicePixelRatio scaling" bug this was suspected to be doesn't apply to
  this control. Whatever's actually causing the blur (if it's still visible
  after this release — the units change doesn't touch it either way) has a
  different root cause that needs on-device inspection to identify; treat
  this as open, not resolved.

### v1.11.4

The "tap to check for update" flow only ever ran when a driver happened to
open the legend card and tap it — closing the app and reopening it later
landed straight back on whatever stale `index.html` the OS/browser's own
HTTP cache served for that fresh launch, with nothing surfacing that a
newer version existed even though the live site had already moved on (no
service worker here, so nothing runs before that first stale paint either).
The same cache-busted self-check now also runs automatically on load and
every time the app returns to the foreground (`visibilitychange`), so a
real update is detected and ready to show the next time the legend is
opened, instead of only after remembering to tap "check for update"
manually. Silent by design — no "Checking…" flash or note for a check
nobody asked for, and still never reloads on its own; only the explicit
second tap on "Update available" does that, same as before.

### v1.11.3

Fixes the Legend button and the Recenter (locate) button floating on top of
the STOPS list view when it's open, overlapping list entries — both sit at
a higher z-index than the list itself (needed to stay above the map they
normally float over), and the list being a separate sibling rather than
something that visually contains them meant nothing was hiding them once
it covered the map underneath. They (and the legend popover card, if it
happened to be open) now hide via CSS while the list is showing and
reappear as soon as it closes — Recenter and Legend both act on the map,
which isn't what's on screen while the list is up.

### v1.11.2

Fixes the STOPS search box ("Search city, state, exit…") rendering typed
text in the browser's default input color instead of the app's own
theme-aware `--ink`, which every other input field already used. In light
mode that default happens to be close enough to readable; in dark mode it's
a dark color on the search bar's own dark background, so typed text was
nearly invisible. Search now sets `color:var(--ink)` like the rest of the
app's inputs.

### v1.11.1

Fixes the legend card's "tap to check for update" button piling up a
duplicate "You're on the latest" note under itself every time it was
tapped, instead of showing just the latest one — each tap's `showNote()`
call inserted its own note with its own independent 2-second removal
timer and never cleared whatever note a previous tap had left behind, so
tapping it a few times in a row (well within that 2-second window each)
stacked several identical notes and made the card grow taller with every
tap. `showNote()` (shared with the "Copied" note on Share trip) now
replaces its anchor's existing note instead of adding another one next to
it, so at most one is ever showing.

### v1.11.0

Pickup, delivery, and the cruising-range input ("How far do you run between
fuel stops?") each get their own small "x" button at the far right of the
field to clear just that one field, separate from the existing whole-form
"Clear trip" button below them. Each is hidden until there's actually
something on that field to clear — typed or selected text for the address
fields, a value other than the 875mi default for the range field — and
clearing pickup or delivery also drops any GPS/autosuggest pre-confirmed
state on it and closes its suggestion dropdown if one's open, the same as
editing the field by hand would. On pickup, the existing "use my location"
button shifts one slot left to make room; on the range field, the "mi" unit
label does the same.

### v1.10.3

v1.10.1 and v1.10.2 both tried to patch the autosuggest dropdown's
`position:fixed` + JS-computed-coordinates approach to stop it drifting out
of sync with its field on iOS, and neither actually landed — real-device
testing after v1.10.2 still showed the dropdown covering the field, worse
than before. Replaces that whole approach: the dropdown is now
`position:absolute`, positioned by plain CSS (`top:100%` under its field,
`.rb-field` as the containing block) instead of any JS-computed screen
coordinates. It shares the input's own coordinate space, so it now pans
correctly with the field for free — no `visualViewport` math to get right.
`#routebar`/`.rb-body`'s `overflow:hidden` (needed for the collapse-to-tab
animation) would otherwise clip it, so that's now lifted only while a
dropdown is actually open and restored the moment it closes. Also shrunk
the dropdown's max height (220px → 160px) so it can't cover as much of the
map/other fields even when it is open, on top of the scrolling it already
had for lists longer than that.

### v1.10.2

v1.10.1's fix for the autosuggest dropdown overlapping its field on iOS
addressed the wrong half of the problem — re-syncing on `visualViewport`
events did nothing because the position it kept recomputing was itself
wrong. The actual mismatch: `getBoundingClientRect()` reports coordinates
relative to the *layout* viewport, but iOS anchors `position:fixed` to the
*visual* viewport, and the on-screen keyboard opening pans one relative to
the other by `visualViewport.offsetTop`/`offsetLeft`. The dropdown now
subtracts that offset when computing its position, so it actually lands
under the field instead of over it. The resync-on-event listener from
v1.10.1 stays — the offset itself changes live as the keyboard animates
open, and it still needs to be re-applied as that happens.

### v1.10.1

Fixes the autosuggest dropdown (v1.10.0) overlapping the field it belongs to
on iOS. `html,body` are `overflow:hidden` in this app, so the page itself
never scrolls — when the on-screen keyboard opens, iOS instead pans the
*visual* viewport to keep the focused field visible above it, which fires
`visualViewport` resize/scroll events, not `window` ones. The dropdown's
`position:fixed` coordinates were only computed once, when it opened, so
that pan left them stale and the dropdown ended up drawn over the input
instead of under it. It now re-syncs its position on `visualViewport`
resize/scroll while open.

### v1.10.0

Pickup and delivery fields now show a live address-suggestion dropdown as the
driver types, backed by HERE's Autosuggest API. Tapping a suggestion fills
the field and pre-confirms that end — same treatment "use my location"
already gave a GPS-filled pickup — so plan submission skips forward
geocoding (and any disambiguation) for that field entirely. Queries are
debounced 300ms and require a 3-character minimum before firing, and
stale/out-of-order responses are discarded via a per-field request token, to
keep call volume sane on a shared key. Suggestions lacking a position
(category/chain-type results) resolve through a follow-up Lookup call before
being used; if that also fails, the field just falls back to normal typed-
address handling. Two new HERE endpoints are now in call rotation alongside
the existing geocode/route ones — Autosuggest on every qualifying keystroke,
Lookup only for the occasional suggestion that needs it — worth knowing if
API dashboard volume looks different going forward.

### v1.9.1

Copy fix, no logic changed. The gauge-floor gap message ("No network stop
is reachable at this fill level," shown when the tank reads 1/8 with no
plannable range) now says "call the Fuel Dept:" in place of "Driver
Support," matching the wording already used for the legend card and the
gauge's own 1/8-tank note. Also drops its trailing "Raising the gauge
above 1/8, or topping off before you roll, will let this load plan"
sentence — redundant with the driver already being the one who set the
gauge there.

### v1.9.0

The build number in the legend card ("FuelPost v1.9.0") is now tappable —
a manual "check for and force an update" for when ordinary browser/CDN
HTTP caching serves a stale `index.html` longer than expected. No service
worker involved; this app has none, and adding one (real offline support,
install-to-home-screen, its own cache-bump-per-deploy discipline) is a
deliberately separate, bigger decision for another day — this solves the
actual immediate problem ("let me force a real check right now") with a
plain cache-busted `fetch(location.pathname + '?_cb=' + Date.now(),
{cache:'no-store'})`, nothing heavier.

Tap while idle: "Checking…" immediately, then the fetched source is
compared against the running `APP_VERSION` via `lib/extract-version.js`'s
`extractVersion()` — a pure function, no DOM, no network, regex-anchored to
a line start so a `//` comment that happens to mention `const APP_VERSION
= ...` (this codebase writes exactly that kind of explanatory comment
above several constants) can't shadow the real declaration below it and
report a fake version. A fetch failure or unparseable response shows
"Couldn't check for updates" via a transient note and returns to the
normal version text; a match shows "You're on the latest (v...)" the same
way; a real mismatch switches the text itself (persists, not transient) to
"Update available (v...) — tap to reload". That second tap is required —
detecting a new version never auto-reloads, since a driver could be
mid-plan with typed pickup/delivery text an unprompted reload would wipe
with no warning. The reload itself is cache-busted too, so it can't land
back on the same stale copy that triggered the check. A boolean in-flight
guard (backed by disabling the button itself, belt and suspenders) ignores
a second tap while a check is already running.

The small "show a message, then remove it after a couple seconds" pattern
Share trip's own "Copied" confirmation already used was pulled out of
`shareTrip()` into a shared `showNote(anchorEl, msg, ms=2000)`, now used by
both, instead of a second copy of the same four lines.

### v1.8.5

Reworked how the fuel-stop results panel avoids covering HERE's own zoom +
map-settings controls when collapsed (v1.8.3's fix) — the driver preferred
the controls sitting above a full-width collapsed bar over a narrower bar
squeezed beside them. `#routeResults.rr-collapsed` no longer pulls its own
right edge in; instead, `body.rr-tab-showing` (toggled from JS exactly when
the panel is both `.show` and `.rr-collapsed`) shifts HERE's own
`.H_l_bottom.H_l_right` control column up via its own `bottom` CSS
property, clear of the tab beneath it, using the `transition:all` HERE's
own CSS already ships on that element so it animates smoothly. Confirmed
`map.getViewPort().setPadding()` does *not* reposition these controls
before choosing this approach — it only affects the map's own
panning/centering reference, not the CSS-anchored UI. Expanded is
untouched, same as before. The body class is recomputed (not just set once
per toggle) from every place `#routeResults`' own `.show` state changes
outside `setRrCollapsed` — `setMode()` switching back to Stops, and
`clearTrip()` — so it can't get stuck shifting the controls up in Stops
mode after a session that ended collapsed.

### v1.8.4

Fixed Clear trip resetting "How far do you run between fuel stops?" to 625
mi — a stale value nobody meant to keep. `ROUTE_DEFAULT_RANGE`, the
constant Clear trip and the range-validation fallback both read, was never
updated when the field's own HTML default moved to 850 mi in a previous
change; it was still hardcoded to the original 625. The same staleness
had a second, quieter effect: the Clear trip button would show itself on a
completely untouched fresh page load, since `routeHasSomethingToClear()`
compares the field's live value against this same constant, and
850 (the real default) never equalled 625 (the stale one). Both spots now
read `ROUTE_DEFAULT_RANGE`, one source of truth again instead of a second
hardcoded number drifting out of sync.

While fixing that, the default itself moved again — 850 mi → 875 mi — to
match the fuel gauge's own F reading exactly (`FULL_TANK_MILES` reserve
math already lands F at 875 plannable miles; the two numbers now agree
instead of a driver seeing 850 in one place and 875 in the other for
what's meant to be the same "full tank" concept). Updated in both the
`rangeInput` HTML default and `ROUTE_DEFAULT_RANGE` together, so this
exact drift can't recur.

### v1.8.3

Fixed HERE's own zoom + map-settings controls (bottom-right corner)
staying hidden even after collapsing the fuel-stop results panel — the
whole reason collapsing exists is to hand the map back, and this corner
never actually came back. Root cause, confirmed by walking the actual
parent chain in a real browser: `.H_l_bottom{z-index:390}` (declared to
keep HERE's controls above the map) lives *inside* `#map`, but `#map`
itself has no z-index of its own — a descendant's z-index only competes
against other elements within the nearest ancestor that actually
establishes a stacking context, so that 390 never reaches up to outrank
`#routeResults` (z-index:360) at the `#mapwrap` sibling level. `#map`'s
entire subtree, regardless of any z-index used inside it, just stacks by
plain DOM order underneath `#routeResults` — measured, the collapsed tab
(full width, flush to the bottom) genuinely overlapped that control column
by 14px. Rather than trying to out-rank a z-index that structurally can't
be reached from outside `#map` without restructuring the DOM, the fix
pulls the collapsed panel's own right edge in (`right:70px`) past that
column, leaving the corner uncovered. Expanded is untouched — still
full-width, still covering that corner, same as before this fix and same
as `#sheet` or `#routebar` legitimately covering other floating buttons
while they're open; only the collapsed sliver was ever claiming to have
given the map back.

### v1.8.2

Two more fixes to the fuel-stop results panel introduced in v1.8.0's
collapsible-panel change.

Once a stop list's content actually exceeded the panel's 62% cap, there was
no way to scroll to the bottom — the Share trip button and the last stop
could be entirely unreachable. Root cause: `.rr-body-wrap` (the collapsible
wrapper added in v1.8.0) is a plain block, and while it does get correctly
flex-shrunk by its own parent (`#routeResults`) to fit the available space,
that shrunk *rendered* size isn't a definite `height` a block child's
percentage/flex sizing can resolve against — only being a flex container
itself makes a parent's height available to its children that way. Without
that, `.rr-body` just grew to its own full content height instead of the
actually-available space, so its `scrollHeight` and `clientHeight` came out
equal (nothing registered as scrollable) and the wrapper's own
`overflow:hidden` silently clipped whatever didn't fit, with no way to
reach it. Fixed by making `.rr-body-wrap` a flex column itself and giving
`.rr-body` `flex:1;min-height:0` — the standard nested-flex-scroll pattern,
where every level in the chain needs to be a flex container for internal
`overflow-y:auto` to work correctly at the innermost level.

Separately, the collapsed tab sat flush against the very bottom of the
screen with zero clearance, which on a phone with a home indicator collides
with that gesture area — the app had no safe-area handling anywhere. Added
`viewport-fit=cover` to the meta viewport tag (required for
`env(safe-area-inset-*)` to resolve to anything nonzero on a notched/
gesture-bar device) and `padding-bottom: env(safe-area-inset-bottom, 0px)`
on `#routeResults`, so the collapsed tab — and the last item when scrolled
to the end while expanded — gets real clearance from the bottom edge
instead of sitting right against it. The `0px` fallback is a no-op on
devices without one.

### v1.8.1

Two approved-copy fixes, no logic changed. The legend card's out-of-network
note now reads "Fuel only at network stops. / Out-of-network fuel: call Fuel
Dept / 423-463-3680" on three lines instead of one dense sentence, and the
gauge's 1/8-tank floor note says "Fuel Dept" and "out-of-network fuel stop"
in place of "Driver Support" and "emergency fuel stop". Both still render
the number from `DRIVER_SUPPORT` as a `tel:` link, same as before — only the
label text and line breaks changed, not the underlying constant or how it's
linked. The three other "Driver Support" mentions elsewhere (the network-gap
and doesn't-clear results, the floor-gap card) are untouched — this request
only named these two spots.

### v1.8.0

Three Route-mode fixes, found testing on a real phone.

The map stayed visibly cut off — a blank gap where tiles should be — after
collapsing the trip-details drawer with nothing else done. Collapsing the
drawer changes `#mapwrap`'s height, but HERE's own canvas doesn't detect
that on its own; only a real window resize or an explicit
`map.getViewPort().resize()` call does, and `setRoutebarOpen()` was calling
neither. It now does, 260ms after toggling — long enough for the drawer's
own 250ms CSS collapse/expand transition to actually finish before resizing
to the settled size rather than one that's mid-animation.

The address-confirmation card ("Check the address") rendered while the
trip-details drawer was still fully expanded above it, squeezed into
whatever sliver of map was left in between — cramped, with a chunk of
visible map wasted for no reason. `renderConfirmStep()` now collapses the
drawer the same way a finished plan or gap result already did (`renderPlan`,
`renderFloorGap`), so the confirmation card gets the same full space. Tapping
"edit address" on a candidate reopens the drawer first, since the field
being edited lives inside it.

The fuel-stop results panel had no way to collapse — a long stop list could
own most of the screen with no way back to just the map short of leaving
Route mode entirely. `#routeResults` gets the same tab/collapsible-body
mechanic the trip-details drawer already uses (`#rrTab`, `.rr-body-wrap`,
`setRrCollapsed()`), offered only on the final plan/gap result — every other
state (loading notes, errors, the confirm-address card) keeps the tab hidden
since there's nothing worth collapsing there.

### v1.7.2

Three dark-mode visual fixes on top of v1.7.0, none of them logic changes.
The legend card's Light/Dark/System toggle was overflowing past the card's
own edge — its three buttons had no `min-width:0`, so flexbox's default
`min-width:auto` held them to their full content width ("System") instead of
actually shrinking to fit three-across; fixed by widening `#legendCard`
(198px → 224px) and giving the toggle's buttons `min-width:0` with tighter
padding/font-size. The gauge track's tick marks used a hardcoded
navy-tinted `rgba(11,35,64,...)`, which all but disappeared against the new
dark track background — now driven by `--gauge-tick`/`--gauge-tick-minor`
variables, navy-tinted in light mode (unchanged) and white-tinted in dark.
And "Trip details" (and a couple of other spots — the Legend button, the
Share trip button) used `var(--navy)` as *text* color, which stayed
just as dark in dark mode and read as almost invisible against the also-dark
chrome behind it; introduced `--navy-text` (equal to `--navy` in light mode,
a lighter `#6EA8FE` in dark) for every place navy is a text/border color
rather than a filled pin/badge/header background — those keep using `--navy`
directly and are unaffected. Also gave the legend card's Driver Support
`<a>` its own color (it was inheriting the browser's default link blue
instead of the theme, left over from the v1.7.1 tel: link fix). Light mode
is unchanged in all four cases — confirmed programmatically, not just by
eye.

### v1.7.1

Two copy/markup fixes, no logic changed. The gauge's 1/8-tank floor note has
new approved wording — still computes its mile figure from
`FuelGauge.milesForTick(FuelGauge.RESERVE_TICKS)` rather than a hardcoded
125, so it stays correct if the reserve math ever changes. The legend card's
Driver Support number was the one remaining plain-text phone number in the
app; it's now a `tel:` link built from the same `DRIVER_SUPPORT` constant
every other mention already used, rendered from JS (`#legendSupportNote`)
the same way `#appVer` next to it already is, since the number needed the
JS-side constant rather than a second hardcoded string in static markup.

### v1.7.0

Dark theme, covering both the UI chrome and the map tiles themselves. Two new
CSS variables drive it — `--surface` (the 10 places that used to hardcode
`background:#fff` now read `background:var(--surface)`) and a
`html[data-theme="dark"]` override block for `--bg`, `--surface`, `--ink`,
`--sub` and `--line`. Brand/marker colors (navy, TA blue, Petro green, gold,
the location dot) are unchanged in dark mode — they're filled shapes on the
map, not on this chrome, and contrast was checked (WCAG relative luminance)
against both `--bg` and `--surface` before shipping. The map itself switches
HERE's real vector night layer (`defaultLayers.vector.normal.mapnight`) via
`map.setBaseLayer()`, not a CSS filter — center and zoom are preserved
explicitly across the switch since HERE doesn't carry them over on its own.
Defaults to the phone's `prefers-color-scheme` and keeps following it live
via a `matchMedia` change listener, until the driver taps the new Light /
Dark / System control in the Legend card — that becomes an explicit stored
choice, and "System" is how they get back to following the OS again. A
blocking script at the top of `<head>`, before the stylesheet, resolves and
sets the theme ahead of first paint so there's no light-then-dark flash on
load.

This is the app's first localStorage usage, so it's also the first use of
the versioned-key discipline future persisted settings should follow: the
key is `fuelpost.theme.v1`, not a bare `fuelpost.theme`. Only the two
explicit values (`'light'` / `'dark'`) are ever stored — no stored value
already means "follow system," so there's nothing to encode for that state.
Anything else found under the key (corrupted, from a future format) is
treated as absent rather than thrown on or defaulted to a fixed theme. If a
later brief changes what the default logic does (a scheduled
night-mode-after-dark feature, say), bump to `fuelpost.theme.v2` and treat
`v1` values as absent — never reuse a versioned key for a changed meaning.

### v1.6.5

The default value for "How far do you run between fuel stops?" increased from
625 mi to 850 mi, reflecting a more typical highway-segment planning distance
for Covenant drivers.

### v1.6.4

Every marker on the map — all 146 station pins, the current-location dot,
and the pickup/delivery/fuel-stop markers on a planned route — was rendering
visually offset from its true coordinate, always toward the bottom-right.
Root cause: `H.map.DomIcon` (HERE's DOM-element icon class) has no anchor
option, unlike Leaflet's `iconAnchor` that the original build used before
migrating to HERE Maps — that setting had no direct equivalent and was
dropped rather than replaced. HERE's default is to place an icon element's
own top-left corner at the coordinate, not any visual center or tip.
Measured in a real browser: 16px right, 16px down for every marker before
this fix. Fixed with a CSS `translate()` on a wrapper sized to each marker's
own box — `translate(-50%,-100%)` (bottom-center) for the rotated teardrop
station pins, `translate(-50%,-50%)` (dead center) for the circular location
dot and route markers, which have no rotation and measure an exact 0px error
both ways. The pins have one small, understood residual — about 6px, from
how a 45°-rotated square's corner pokes past its own un-rotated edge — left
as-is rather than chasing an exact fix tied to the pin's current pixel
dimensions; going from 16px to 6px, in one direction only, is the fix that
actually matters for reading the map. One implementation wrinkle worth
recording: HERE writes its own inline `transform: matrix(...)` directly onto
whatever element is handed to `DomIcon`, which silently overwrites a CSS
transform declared on that same element — every marker's HTML needed one
extra neutral wrapper level so HERE's own positioning and this fix's anchor
offset land on different elements instead of fighting over one `transform`.
No logic changed — `passes()`, `render()`, `drawRoute()`, group membership
and marker tap handlers are all untouched; only where within each marker's
own box the anchor point sits.

### v1.6.3

The state select ("All states") moved into the Filters popover from v1.6.2,
alongside brand and type — one more toolbar control tucked away, and one
more filter the Filters button's badge now accounts for (badge shows if
brand, type, *or* state isn't "all"). Same reasoning as the other two: state
is rarely touched, so it doesn't need to cost width on every screen.
Filtering behavior is unchanged; `render()` and `passes()` don't know or
care where the control that sets `state.st` lives.

### v1.6.2

Brand (All/TA/Petro) and type (All types/Exclusive/Primary) filters moved
behind a single Filters button in the STOPS toolbar, following the same
button-toggles-a-popover-card pattern as the existing Legend button. They
were the two least-touched controls in a toolbar that was packing mode
switch, brand, type, state, search and list view into one horizontally-
scrolling row — most sessions never leave "All", so they're the right ones
to tuck behind a tap rather than pay their width on every screen. A small
dot badge appears on the Filters button whenever brand or type isn't "all",
so a driver can tell a filter is applied without opening the popover — same
"don't lose context when collapsed" principle as the route panel's summary
line. The popover closes on a second tap, a tap outside it, or switching to
Route mode. No filtering behavior changed: `passes()` and `render()`, and
the two segmented controls' own click handlers, are untouched — only where
they live moved.

### v1.6.1

Fixed the STOPS locate button: the first tap started the location watch and
drew the dot, but never moved the map to it — only a *second* tap (once a fix
was already in hand) actually recentered and zoomed, because that logic lived
solely in the button's click handler, not in the watch's first-fix callback.
A driver tapping once and expecting to see themselves on the map got nothing
until they tapped again. The first fix from a fresh watch now recenters and
zooms (to 11) exactly once, the same as an already-in-hand fix does on
tap; later position updates from the ongoing watch do not keep forcing the
map back, so panning around afterward still works normally.

### v1.6.0

The gauge's numbers were wrong in a specific way: reading "F" as 1000 mi
implied the whole tank is plannable range, when in practice the bottom 1/8
(125 mi, the existing `MILES_PER_TICK`) should never be routed on — it's the
margin a driver limps toward a stop on, not miles to plan a leg with. The
gauge now reports **plannable** range via `plannableMilesForTick` in
`lib/gauge.js`: `max(0, (tick - 1) * 125)`, so **F reads as 875 mi**, not
1000, and each tick down is still 125 mi apart. The floor also moves — tick 1
(1/8 tank) is now selectable, one notch below the old floor of tick 2 (1/4
tank); only E (tick 0) remains off the gauge. At the new floor the readout is
honestly **0 plannable miles**: `planLoad()` recognizes `rangeAtPickup === 0`
and skips the routing call entirely — the outcome is already determined, and
feeding 0 through the real planner always lands on the same degenerate
`{fromMile: 0, deadMile: 0}` gap, which is why that state gets its own
message (`renderFloorGap`) instead of the generic "between mile X and mile
Y" gap copy, worded around the honest ~125 mi of physical range still left to
limp toward a stop, with the Driver Support number. `milesForTick` (the raw,
non-reserve conversion) and `EMERGENCY_TICK_CEILING`/`isEmergencyZone` are
unchanged and still used elsewhere — only what the UI treats as *plannable*,
and how low the needle can go, changed. Also, "How far do you run between
fuel stops?" now defaults to **625 mi**, down from 800; still editable,
still bounded 300-1200.

### v1.5.1

Two fixes to the location feature from v1.4.0. The live position dot now
renders in its own color (`--you-are-here`, a vivid magenta) instead of
`var(--ta)` — it was the exact same blue as every TA station pin, so it got
lost in a cluster of them at a zoomed-out view. It also gets a second ring:
a fixed 30px CSS ring with a subtle opacity pulse, always the same pixel
size regardless of zoom, purely so the dot stays easy to spot at a glance —
separate from (and layered under) the real accuracy circle, which correctly
keeps its true meter-based radius and shrinks toward invisible at low zoom;
that one is unchanged. Also, the STOPS-mode recenter button no longer shows
in Route mode, which has its own "use my location" entry point on the
pickup field already — a redundant second location button in the corner was
never the intent. The dot itself, and the watch that drives it, keep
running across both modes exactly as before; only the STOPS recenter
button's visibility changed.

### v1.5.0

"Range leaving shipper" is now a tappable fuel gauge instead of a mile-number
input, in the "Not leaving with a full tank?" disclosure — E to F in eighths,
matching how a driver reads a dash gauge instead of asking them to estimate
and type a figure. Full tank is a fixed fleet-wide `FULL_TANK_MILES = 1000`
(`lib/gauge.js`), giving 125 mi per tick. Tap or drag the track to move the
needle; both snap to the nearest tick. The track's E-to-1/8 segment is a
permanent red danger marking, like a tachometer redline — not tied to needle
position — but the needle itself can't land there: selection is clamped to
ticks 2-8 (1/4 tank through F), with a static note explaining why and a
Driver Support number for the real emergency case. Opening (or closing) the
disclosure now resets the needle to F — "assume full unless told otherwise"
— replacing the old behavior of mirroring whatever the policy range number
happened to be, which is a real behavior change from v1.4.x. Leaving the
disclosure closed is unaffected: still assumes a full tank relative to
policy range, `startBurned` 0. Nothing here persists across page loads.

### v1.4.1

Route mode's pickup/delivery/range fields collapse into a drawer once a plan
or gap result is showing, so the map and the fuel stop list get the screen
instead of permanently-visible input fields. A tab row (compact summary +
chevron) stays visible and tappable in either state — tapping it toggles the
drawer, and it's the only affordance needed to reach a collapsed Clear trip
button, so that's never more than one tap away. Auto-collapses the moment a
plan or gap renders; auto-expands again on a validation or geocoding
failure, or when Clear trip resets the fields. Switching Stops → Route
restores whichever state fits the current result — expanded if nothing's
planned yet, collapsed with the summary intact if a plan is still showing.
Layout only: no change to how a plan is computed.

### v1.4.0

Precise location, shared by both modes through one `navigator.geolocation`
watch — permission is asked once, and whichever feature is tapped first
reuses the fix for the other rather than prompting again. **Stops** gets a
live position dot (own `H.map.Group`, so STOPS filter re-renders never touch
it) with an accuracy ring and a recenter button; the dot renders only when
`lib/location.js`'s `isPreciseFix` says the fix is good enough — an
exact-looking dot on a bad fix is worse than just the ring. **Route**'s
pickup field gets a "use my location" button that reverse-geocodes the fix
(HERE Reverse Geocoding v7, falling back to `formatGpsFallbackLabel`'s
coordinate label if that fails) and drops it straight into the existing
single-candidate fast path — no disambiguation step, same as a clean typed
match today. Editing a GPS-filled field afterward clears it back to normal
typed-address handling. Permission denied, position unavailable and
insecure-context failures all show a plain message with the button left
tappable to retry. Nothing here is persisted — `liveFix` lives in memory
only, gone on reload.

### v1.3.0

**Clear trip** resets the route planner to a blank first-open state — inputs,
both range values, geocode candidates, the results panel, and the route drawn
on the map. **Share / save trip** hands the plan to the phone's native share
sheet via `navigator.share`, so it can land in Notes, Messages, Mail or AirDrop
in one native flow, falling back to a clipboard copy and then to a selectable
textarea. The text comes from `formatTripText` in `lib/triptext.js`. Nothing is
persisted — no `localStorage`, no saved-trips list, so no `PRESET_VERSION`
question. The header no longer repeats "100% compliance required"; the legend
card already carries the compliance note and the Driver Support number.

### v1.2.0

Two changes to Route mode. First, the fuel planner no longer declares a gap
the moment nothing is within 8 miles of the route — `planAdaptive`
(`lib/fuelplan-adaptive.js`) widens to 15, then 30 miles before giving up, and
`stopsNearPickup` checks for a network stop within 50 miles of the pickup in
any direction (not just along the route) before the app calls it a true dead
end. A widened search shows a plain note above the plan; a gap that has a
real near-pickup alternative names it instead of just telling the driver to
call Driver Support. Second, "Look up addresses" and "Plan fuel for this load"
are now one button. Two high-confidence matches route straight through with a
"not right?" affordance on each address; the picker only reappears for an end
that's actually ambiguous — more than one candidate, or a match that isn't an
exact street address.

### v1.1.2

Fixed a blank map on load and the greyed-out entries in the map settings control.
The app now loads `mapsjs-harp.js` and runs on the HARP engine, with the engine
type set in **both** `createDefaultLayers()` and the `H.Map` options — either one
alone leaves the map half-working. The base layer moved from
`raster.normal.map` to `vector.normal.map`, which is also what makes the settings
control's active entry match the layer the map was actually built with. Satellite,
Traffic conditions and Show traffic incidents are now selectable.

### v1.1.1

Restored the fuel book revision to the header, where v1.1.0 had replaced it with
the app version, and moved the app version into the legend card. Both now render
from their own named constant. Route mode's two side-by-side range inputs are now
one input — "How far do you run between fuel stops?" — with range-at-pickup
demoted to an optional disclosure, since it is the exception rather than a
routine field. Collapsing that disclosure resets it to mirror the main range, so
a hidden field can never sit on a value that is quietly changing the plan.

### v1.1.0

Route mode. Pickup and delivery addresses geocoded via HERE Geocoding v7 with a
confirmation step (matched address shown, alternate candidates selectable, poor
matches flagged) before anything is routed; truck route from HERE Routing v8;
fuel plan from `lib/fuelplan.js` with a fewest-stops selection, mile markers, leg
mileage and an explicit warning when the route cannot be run on network fuel.
Range-at-pickup input for a truck that does not leave the shipper full. Stops
mode is unchanged and keeps working with no signal.

### v1.0.0

Stops mode: map and list of all 146 Covenant network locations with filters,
search, detail cards and legend. Station coordinates geocoded from their street
addresses via the HERE Geocoding API (see `tools/geocode-report.txt`).
