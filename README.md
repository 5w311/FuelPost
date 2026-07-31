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
lib/fuelplan.js             pure fuel-planning logic (no DOM, no network)
lib/fuelplan-adaptive.js    widens the detour search before declaring a gap
lib/triptext.js             formats a plan as plain text for share / save
lib/location.js             GPS fix labeling and precision checks (no DOM, no network)
lib/gauge.js                fuel-gauge tick <-> miles math (no DOM, no network)
lib/flexible-polyline.js    HERE's reference polyline decoder, vendored unmodified (MIT)
test/*.test.js              plain-node tests, no framework
test/run.js                 runs every test file and reports a combined total
tools/geocode.js            one-off script that geocoded the 146 station coordinates
tools/geocode-report.txt    output of that run
```

`lib/` and `tools/` are CommonJS so the tests run under plain `node` with no
install and no build step. `index.html` loads the two `lib/` files as classic
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
