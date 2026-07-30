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

## Version history

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

## HERE API key

The key in `index.html` is a client-side key and is visible in source, which is
normal for a browser map app. It must stay **domain-locked to
`5w311.github.io`** in the HERE console — Route mode puts two more paid endpoints
(Geocoding and Routing) behind it. A locked key returns
`401 Unauthorized. The request is not from an authorized source.` anywhere other
than the allowlisted domain, which is the expected behavior.
