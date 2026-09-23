# FuelPost

> **Design test build.** This repo tries out an iOS-style redesign of FuelPost.
> The planner, data, filters and every rule behind them are the live app's,
> unchanged; only the look and the placement of the controls differ.

**Finds Covenant network fuel stops, and plans where to fuel on a load.**

Type in where you're picking up and where you're delivering. FuelPost works out
the truck route and tells you which network stops to fuel at, at what mile, using
as few stops as it can.

It's a web page, not an app store download. Once it's loaded it keeps working
with no signal — you'll only need bars for the map picture and for planning a new
route.

**Two tabs:**

- **Stops** — every one of the 144 network locations on a map and in a list.
  Search, filter, or look up a city to see what fuel is near it.
- **Route** — paste the addresses off your dispatch and get a fuel plan.

---

# Planning a load

## How it picks your stops

**It uses as few stops as possible.** From wherever you are, it goes to the
furthest network stop you can still reach, then does it again from there.

Exclusive and Primary stops are both used — the badge tells you which is which,
but it doesn't change the plan.

## How far you run between stops

Pick the one that matches how you run:

| | Miles | You pull in at | |
|---|---|---|---|
| Regular | 600 | **1/2 a tank** | Most stops |
| Long | 750 | **3/8** | Fewer stops |
| **Max** | **900** | **1/4** | Fewest stops — the default |
| Custom | 300–1200 | — | Type your own |

Each tier is a whole number of gauge marks, so it names the reading you'll pull
in at. Pick the one that matches how low you like to run.

**Max (900) is everything a full tank gives you.** The app treats a full tank as
1,200 miles and holds back the bottom quarter — 300 miles — as yours, not to be
planned on. That leaves 900.

This setting resets every time you open the app, because it's about the truck
you're in today.

## What the gauge is for

Tell it where your needle sits leaving the shipper, and it plans from there
instead of assuming you're full.

| Needle | What it plans on |
|---|---|
| 3/8 and up | Normal — 150 miles at 3/8, up to 900 at F |
| **1/4** | **150 miles of backup**, and it warns you |
| 1/8 | Nothing. It shows you the floor message instead |

The bottom eighth is never touched at all. The stretch between 1/8 and 1/4 is
backup — the app will dig into it if you're already down there and need to see
what's nearby, but a normal plan never spends it.

## What the planner does for you

Three things, all automatic — there's nothing to switch on.

**1 · It spaces your stops so each fill is worth stopping for.** A stop that
pumps 40 gallons costs you the same time as one that pumps 75. The target is
**60+ combined gallons (diesel and DEF)** — a shower credit.

It aims to have you pull in at about **half a tank**, which is roughly 600 miles
of driving and about 72 gallons. That clears the credit with room to spare.

Every stop in your results tells you what it's worth: *~68 gal · shower credit*,
or *~44 gal · 16 gal short of a credit*.

That figure is **what the pump will take**, not what you burned getting there.
Those are the same number at every stop except the first — you leave each stop
full, so what's missing is exactly the leg you just drove. But if you rolled out
of the shipper part-full, your first fill also replaces whatever was already
gone.

> **⚠ The gallon numbers read a little high.** The app plans on 8.5 mpg. If
> you're really getting 8.9, you'll pump *less* than it says — a leg it calls 60
> gallons is closer to 57. **If it says you're within about 3 gallons of a
> credit, treat it as a coin toss.** 8.5 is kept because it's the safe number for
> working out *range*; it just can't be the safe number for gallons at the same
> time.

**Being honest about the spacing:** on 39 real runs it improved the worst fill
twice, changed nothing on 37, and never made anything worse. On 18 of those 39,
*no* arrangement of stops could earn a credit at every stop — the network just
isn't dense enough. So the real value here is that each stop now tells you what
it's worth, not the shuffling.

**2 · It leaves you enough fuel to reach the next stop after you deliver.** Not a
flat half tank — that held back 300 miles whether fuel was across the street or
200 miles away, and cost a stop on a fifth of all loads. It now works out how
far network fuel actually is from *your* delivery and holds back that much.

Most deliveries have fuel close by — the median is 26 miles — so most of the
time this costs you nothing at all. Deliver somewhere remote and it will plan
the stop you need.

**You can never arrive below 1/4 of a tank.** That's built in and always was:
the planner only spends the top three quarters, so there's always 300 miles
sitting there when you pull in.

**3 · It skips a stop that isn't worth taking.** Sometimes holding fuel back for
the receiver forces a stop right near the end that only pumps 50-odd gallons —
no credit, and a full pull-in for it. It will skip that stop when:

- you can reach the receiver without it, **and**
- it wouldn't earn a credit, **and**
- either it's inside the last 100 miles, or there's network fuel within 50 miles
  of your delivery.

**You can't end up stranded doing this**, for the same reason as above — the
worst case is arriving at 1/4 with 300 real miles in the tank. When it skips
one, it tells you which stop and why.

## What your results tell you

For each stop: the mile marker, how far off route it is, roughly what you'll
pump and whether that earns a credit, the exit, and the nav code in bold.

At the bottom: your final leg, and **where the needle will sit when you pull
in** — *"just under 3/8 — roughly 139 mi of range left"*. The mileage is the
same plannable range the pickup gauge quotes, so 3/8 means 150 mi in both
places.

Then it answers the question that actually matters at the door: *TA Ontario is
19 mi away, so you can fuel after you drop* — or *nearest network fuel is 260 mi
away, so fuel before you deliver.*

## When it can't make a plan

**"You arrive with less than you asked for"** — the route works and every leg is
drivable, you just can't hold the cushion you wanted. Not a fuel gap.

**A real gap** — no network fuel reachable. It looks for stops within 8 miles of
the route, then widens to 15, 30 and 50 if it has to, then checks within 50 miles
of your pickup in any direction. Covenant has **no stops in New Mexico**, which
leaves about 490 miles of I-40 with nothing on it.

**Out-of-network fuel needs approval first: 423-463-3680.**

---

# Finding stops

**Search** matches the name, city, state, exit and nav code. Just the digits work
— `260`, `ta260` and `CVENTA260` all find TA Lincoln.

**Look up a city** — with the menu closed, type a city and tap a match. It drops
a pin and shows you the nearest fuel. With the menu open, that same box filters
the list instead.

**The locate button** centres on you and zooms out far enough to show the three
closest stops.

**The nearest-fuel bubble**, just above the tabs at the bottom, answers "where's
the nearest fuel" — tap it to see the nearest four.

- Distances are **straight line, not driving miles**, so they're honest about
  what they are. Sixty straight-line miles might be fifty minutes or ninety.
- Each one has a compass direction, so you know if fuel is ahead or behind.
- **It ignores your filters on purpose.** If you filtered to sit-down restaurants
  an hour ago, you shouldn't be told the nearest fuel is 200 miles away.
- Past 200 miles it stops offering a stop and just tells you how far the nearest
  one is.

**Corridor filter** — pick I-40 and get I-40. Plain search can't do that: typing
`I-5` also brings back I-55, I-57 and I-59, which quietly shows you stops on
roads you're not on. 25 stops sit on two or more interstates and show up under
either.

**Filters** — state, corridor and amenities, all applied together. Reset clears
them but leaves your search text alone.

**Amenities:** 10+ showers, fitness room, sit-down restaurant. Others were tried
and dropped for being useless — every single stop has a CAT scale, so filtering
on it removed nothing.

**Satellite view** shows the raw imagery with road labels drawn on top, rather
than labels baked into the picture. That matters when you're sizing up a lot at
3am — the baked version painted over the parking stripes.

---

# If the map won't load

The map needs a signal. The station list does not.

If the map can't load — no bars, a truck stop's sign-in wifi, or the map
service having a bad day — the app now says so and keeps going. The station
list, search, the filters, exits and nav codes all still work. Tap the ☰
button to open the list.

Before, a map that couldn't load took the whole app with it: the screen came
up and nothing on it did anything. That's fixed.

Route planning still needs a signal, because the roads and the mileages come
from the map service. When the signal comes back, the map loads on its own.

---

# About the station list

**144 stops. 142 you can be routed to** — one is the Covenant yard, one is
closed.

**The header shows which fuel book the list came from** (`Rev 01-2026`). This
matters: when the book is reissued, stops join and leave the network, and
**fuelling at a stop that has left it is a compliance violation.** If the book on
your side is newer than the one in the header, the list is stale.

**TA Gary is closed for fuel — parking only.** The lot is open and taking trucks,
but there's no fuel, showers or service. It's still on the map and in the list so
you can find it and see what happened, and it still has Call and Navigate,
because you can still go park there. It's just never used in a plan. Its sheet
points you at Petro Gary, which is a **different station** 2.5 miles away at a
different exit — not the same place renamed.

**A closed stop is never quietly deleted.** If it's in the fuel book, it stays
visible with an explanation. Rows only get removed when the book never had them
in the first place.

**On the amenity data**, so you know what to trust: the sit-down restaurant flag
is current and complete. The fitness room flag is mostly right but probably
missing a few. **The walking trail flag is over-claimed** — the list says 95
stops have one and TA's own data says none do. Nothing was ever invented to fill
a gap.

---

# For developers

Everything below is implementation detail.

```
index.html                markup, styles, DATA, map + UI wiring
lib/fuelplan.js           pure planning logic
lib/fuelplan-adaptive.js  widens the detour search before declaring a gap
lib/shorttrip.js          context for the zero-stops case
lib/gauge.js              tank model: ticks, miles, gallons, credits
lib/nearme.js             nearest-stop ranking
lib/corridors.js          parses interstates out of the exit field
lib/triptext.js           plan → text for share / save
lib/location.js           GPS fix labelling and precision
lib/autosuggest.js        query threshold + suggestion parsing
lib/baselayer.js          which layer a theme change applies to
lib/memocache.js          session memo for repeat HERE lookups
lib/routerank.js          orders routes by fuel viability
lib/vehicleprofile.js     dimensions/weight/hazmat → HERE params
lib/escape.js             escapes external strings
lib/navlinks.js           station → map-app URLs
lib/extract-version.js    APP_VERSION out of fetched source
lib/flexible-polyline.js  HERE's decoder, vendored (MIT)
test/*.test.js            plain-node tests · test/run.js runs all
tools/geocode.js          one-off station geocoder
```

CommonJS, so `node test/run.js` needs no install. Classic scripts behind a
`module.exports` shim; `fuelplan-adaptive.js` and `shorttrip.js` are fetched into
a function scope, because their `require` would collide with those globals. The
run summary reports `· N CRASHED`, since a crashing file prints no `FAIL` line.

**Conventions.** Pure logic in `lib/`, no DOM or network — the planner takes
miles, never ticks. One place per decision: `rangeForTick()`, `FUEL_STOPS`,
`resetFilters()`, `filtersActive()`, `ARRIVAL_DEFAULT_ON`. Counts and lists are
derived, not stored. Escape everything external. localStorage keys are versioned
(`fuelpost.<setting>.v1`), store only explicit choices, treat anything unexpected
as absent, and bump to `.v2` if what "unset" resolves to changes.

**Releasing:** bump `APP_VERSION`, **all 18 `?v=` stamps and `version.txt`**, add a version
entry (a test requires one matching `APP_VERSION`, another requires
`FUEL_BOOK_REV`), get `node test/run.js` green, PR. Browser checks live in a
scratchpad Playwright harness with the real vendored SDK and HERE intercepted —
never against the live key.

**Where it is served:** `fuelpostios.figari.dev`, GitHub Pages behind a Cloudflare
CNAME (DNS only, grey cloud — proxying it stops GitHub issuing the certificate).
`CNAME` in the repo root is what points it there, and
`5w311.github.io/FuelPost-iOS/` redirects to it. Everything in the app resolves
relative to `location.href`, so it serves correctly from a subpath or a root.
`fuelpost.figari.dev` is the separate, original FuelPost repo — not this one.

**Moving it to a new address breaks the map until the key allows it.** HERE
refuses a referrer that is not on the key's list (see below), so the list, the
line above and `CNAME` change together. In v2.1.2 `CNAME` moved first and the
map went blank while everything else kept working.

### The HERE key

It is in client-side JS (`index.html`, `HERE_API_KEY`) and therefore public.
Anyone can read it off the served page. What limits it is an **allowed-referrer
list** on the key in HERE Platform, currently `fuelpostios.figari.dev`,
`fuelpost.figari.dev` and `5w311.github.io`. Keep an old origin listed while
anyone might still be on it.

**What that does and does not do**, because the difference matters:

- It **stops the realistic abuse** — someone pasting the key into their own web
  page. Their browser sends their real origin, HERE sees a domain that is not on
  the list, and refuses.
- It **cannot stop a script.** `Referer` is set by the client, so curl or a
  small server sends whatever it likes. No setting on HERE's side changes that;
  it is the ceiling of referrer restrictions everywhere, not a misconfiguration.

So the control that actually bounds exposure is a **spend or transaction cap on
the key**, not the referrer list. Treat the list as the thing that stops casual
copying and the cap as the thing that stops a bill.

**Do not conclude the key is unrestricted because curl gets a 200.** That test
cannot distinguish "no allowlist configured" from "allowlist configured, and not
applicable to a request this client made" — it returns 200 either way. This was
gotten wrong once, confidently, from exactly that evidence. The only test that
can tell is a real browser on a domain that is NOT on the list.

### Surviving a missing map SDK

`index.html` loads HERE from four `<script>` tags. Until v2.0.0 it then built
the map at the **top level** of the main script, so a missing SDK threw on the
first `H.` reference and killed the whole script — 630 lines before `state` was
declared. Measured in Chromium with the tags aborted: the page loaded, `DATA`'s
144 rows were present, and nothing was wired to anything.

Two pieces now:

- **`MAP_SDK`** — `typeof H !== 'undefined' && !!(H && H.Map)`. Every map
  construction sits inside `if(MAP_SDK){ ... }`, in its original position, so
  with the SDK present the order of startup is byte-for-byte what it was.
- **`mapLive()`** — reads `map !== null`, not the flag, so a construction that
  failed part-way reads as no map rather than a half-built one. Every function
  touching a map object guards on it.

Functions that do map work *and* app work are guarded **line by line**, never
wrapped: `switchTheme` still sets the app-wide `data-theme` and updates the
toggle, and `clearPlace` still clears `placeAnchor`, the token and the Near Me
panel. Wrapping either would break dark mode or leave a stale pin anchor.

With no SDK the loading overlay is retired immediately and replaced with a
message naming what still works, rather than leaving the 20-second watchdog
spinning over a map that is never coming.

`test/nomap.test.js` is a scope walk, not a regex sweep: it strips comments and
strings, then tracks whether each line is inside a function and inside a guard,
and fails on any unguarded top-level map construction. It also injects a
violation and checks the walker still catches it, so a broken walker cannot
pass silently. `scratchpad/pw-nomap.js` drives the real page in Chromium with
the four HERE scripts aborted and exercises the whole Stops tab, then repeats
every check with the SDK present and asserts the two agree.

**Still coupled, deliberately:** the map is built at startup when the SDK is
there, not lazily when the map is first shown. Lazy construction would cut
2.3 MB off the startup path, but it changes online behaviour and belongs in its
own change.

### Where the logic lives, and what tests it

`lib/*.js` is pure logic with no DOM and no network, unit-tested under plain
node. `index.html` holds the markup, the CSS, `DATA` and the wiring, and is
tested by `renderstructure.test.js` and friends — which read its **source
text** and assert against it.

**Source pins are a proxy, and their ceiling is real.** Three times this
project has watched a matcher aimed at code match the sentence describing it
instead. A pin can check that a line is spelled a certain way; it cannot check
that the line is right.

So the direction of travel is to move decision logic into `lib/` where it can
be run. Most of it already has: `readRanges` now mostly delegates to
`FuelGauge`, and the planner, the gauge model, the trip text and the corridor
lookup are all libs with their own tests. **Measured before starting v2.0.0,
only 247 of the inline script's 4,924 lines were pure enough to lift out
unchanged** — the rest is DOM assembly, which is what it should be.

`passes()` was the exception worth taking: the predicate every one of the 144
rows goes through on every keystroke, impure only because it read `state`
directly. It is `lib/stopfilter.js` now.

**What that bought, concretely:** two test files carried a hand-written copy
of `passes()` plus source pins to stop the copy drifting. One said so in its
own header — *"every semantic assertion below is only worth what those source
pins are worth."* Both mirrors are gone. Their assertions now run against the
real function, and the pins that policed them were replaced by pins on the one
thing `index.html` still decides: which state it hands the rule, and that the
search box's two jobs stay separate.

**One thing this release taught, the hard way:** the libs load as classic
scripts, so a lib's top-level names are globals. Wiring `lib/stopfilter.js` in
with a convenience alias in `index.html` was a redeclaration that killed the
whole main script — and the node suite passed 1,383 assertions while the app
was dead in Chromium. `test/libglobals.test.js` closes that gap, because the
hazard grows with every function that moves into `lib/`.

**Still source-pinned, and fine for now:** the renderers. `renderPlan` is 456
lines of DOM assembly, and what it produces is checked end-to-end by the
Playwright suites rather than by unit tests. Those suites are the real
behavioural coverage for `index.html`, and they live in a scratchpad outside
the repo — moving them in would mean vendoring HERE's 2.3 MB SDK, which is a
decision worth making deliberately rather than as a side effect.

### CI

`.github/workflows/tests.yml` runs `node test/run.js` on every pull request and
every push to `main`. That is the whole job — no install step, because the
suite is plain Node with no dependencies, and adding one would be the first
build step this project has ever had.

It matters because the release discipline lives in the suite: `APP_VERSION`
against all 18 `?v=` stamps and `version.txt`, a README entry for the current
version, the structural pins on `index.html`, the scope walk that keeps the app
alive without the map SDK. All of that used to be enforced only when someone
remembered to run it.

`test/ci.test.js` checks the workflow still runs the **whole** suite on pull
requests. The failure to worry about is not CI breaking loudly — it is someone
narrowing it to one file, or to pushes only, and nobody noticing that PRs
stopped being checked.

**Not in CI:** the Playwright suites. They live in a scratchpad, need a browser
and a vendored copy of the HERE SDK, and are run by hand before a release.

### The update check

`checkForUpdate` runs on load **and on every `visibilitychange` to visible** —
so every time a driver comes back from their nav app. Until v2.0.0 it fetched
`index.html`, **367 KB**, to read one string out of it. It now fetches
`version.txt`, which is seven bytes and says the same thing.

- Resolved with `new URL('version.txt', location.href)`, never rooted at `/`,
  because the app is served from a subpath on Pages.
- `?_cb=` and `cache: 'no-store'` stay. This is the one request in the app that
  must never be answered from anything but the live server.
- `parseVersionFile` is **strict**: only a bare dotted number is accepted. A
  404 page, a captive-portal login, or `index.html` served by mistake are all
  "text that came back 200", and a loose parse would report one of them to the
  driver as a version.
- **The HTML fallback is kept on purpose.** If `version.txt` is missing or
  unparseable, it reads the version out of the page as before. Losing the
  update check entirely is a worse failure than paying for the big fetch once.
- `test/cachebust.test.js` fails the build if `version.txt` drifts from
  `APP_VERSION`. A wrong file here tells a driver they are up to date when
  they are not.

### Things not to undo

- **The tier test reads `RANGE_TIERS` from source, never literals.** Which tiers
  sit on the tick scale has changed seven times; an earlier version asserted
  arithmetic about the numbers themselves — claims that stay true whatever the
  table says — and sailed through the v1.35.0 change silently, the exact drift it
  existed to catch. The button labels are hand-written markup, so a pin checks
  they still match the table.
- **The reserve is sized from the delivery, through `reserveToReachFuel()`.** A
  hardcoded circuity factor or floor here is how the plan and the arrival advice
  drift into contradicting each other.
- **The nearest stop to the delivery is resolved once, above `lastTrip`.** While
  the panel resolved it for itself, `lastTrip` could only copy `shortTrip`'s
  copy, which exists on a no-stop plan and nowhere else — so the shared text
  was silent about it on every plan that had stops. Two readers, one value.
- **Nothing may construct a HERE object at the top level of the main script.**
  Everything map-shaped is built inside `if(MAP_SDK)`, and every function that
  touches a map object guards on `mapLive()`. Until v2.0.0 the map was built
  at the top level, so a missing SDK threw before `state` was even declared and
  took the whole app with it — the driver got a page that looked alive and did
  nothing. `test/nomap.test.js` walks the script and fails the build on any
  unguarded top-level construction; it is a scope walk, not a regex, because a
  regex cannot tell top-level code from a function body.
- **`switchTheme` and `clearPlace` are guarded line-by-line, not wrapped.**
  Both do map work AND app work — `data-theme` for the whole app, and the
  place pin's state. An early return in either quietly breaks dark mode or
  leaves a stale pin anchor on a page with no map.
- **`version.txt` is bumped with `APP_VERSION`, and `parseVersionFile` stays
  strict.** The update check reads that file and nothing else; a drifted value
  tells a driver they are on the latest when they are not, and a loose parse
  reports a captive-portal page as a version number. Both are tested.
- **An empty `Set` is truthy and never equals `'all'`** — guards test `.size`, or
  the filter badge pins on permanently.
- **Split amenity codes on comma; never `includes()`.** `includes('R')` would
  match a future `BR`. No code is a substring of another *today* — that's luck.
- **Test `F` or `O`** for the gym filter; the two outdoor rows carry no `F`.
- **HERE's bottom chrome is two sibling containers.** Lifting one leaves the
  copyright behind, and **covering HERE's attribution is a terms issue**.
  `.H_imprint` needs `!important`; the resize observer must read
  `getBoundingClientRect()`, not `contentRect`.
- **The map runs under the tab bar; `#mapwrap` does not.** Only `#map`,
  `#listview` and `#mapLoading` bleed down by `--tab-h`, so everything that
  measures `#mapwrap`'s bottom edge stays put. HERE's `.H_ui` and `.H_imprint`
  are lifted by the same `--tab-h`, using `bottom` (`.H_ui` is `height:100%` with
  `top:auto`, so a margin moves nothing), and `mapBleed()` goes into the
  viewport's bottom padding so centring and fits ignore the hidden strip.
  `--tab-h` is the bar's height plus both margins; a test adds them up.
- **Trip-card inputs under 16px need the viewport's `maximum-scale=1.0`.** iOS
  Safari zooms the whole page into any focused input smaller than 16px unless
  the scale is capped. v2.1.4 took them to 15px on the strength of that cap; a
  test fails if the inputs shrink while the cap is gone.
- **The trip card and tab bar are sized to a reference, x 0.936.** v2.1.4
  matched them to a screenshot shown at 93.6% inside a 14pt border, so each
  size is the v2.1.2 value x 0.936 and each side margin is 14 + old x 0.936.
  Resize them together, not one value at a time.
- **`#map` is `position:fixed; inset:0` — the whole screen, on every tab.**
  `#mapwrap` keeps its real edges (the trip card above it on the Route tab, the
  bar below), so everything that measures it is unchanged; `mapBleed()` returns
  the covered strip at the top AND the bottom and both go into the viewport
  padding. The canvas never resizes on a tab switch or a card collapse.
- **The locate button is the lower half of a pill with HERE's layer button.**
  On Stops, `.H_l_bottom.H_l_right` rises 40px and `#locateBtn` (40x40, 24px in,
  24px up — the layer button's own measurements) fills the slot. It moved off
  the bottom-left corner, so HERE's logo needs no override; don't put the button
  back there without moving the logo clear of it again.
- **`#routeResults` has `padding-bottom:0`.** The base rule's
  `env(safe-area-inset-bottom)` was for when the card met the bottom of the
  screen; above the tab bar it was a 34pt band of empty panel under the scroll
  area. A test fails if it comes back.
- **HERE's attribution rides above the results card (`--rr-h`), its controls
  only while the card is collapsed.** Same pattern as `--nm-h`. Lifting `.H_ui`
  over the OPEN card floats the zoom buttons mid-map on top of the delivery pin,
  so `body.rr-tab-showing` gates that half.
- **The filter bubble lifts HERE's attribution too (`--fc-h`).** Inset like the
  results card, it no longer covers the copyright box completely, so while it is
  open the imprint rides above it and what it covers anyway (`.H_ui`, the locate
  button and its hint chips) is hidden rather than peeking out in slivers.
- **Petro Amarillo's coordinates are hand-set, not geocoded.** HERE's place
  database files it as "8500 S Lakeside Dr", four miles south of the station;
  that is where its pin sat until v2.2.7. The street address, 8500 E I-40,
  geocodes correctly (35.1920,-101.7431), confirmed by a driver in the lot. A
  re-run of `tools/geocode.js` could pull the bad point back — a test in
  `datastops.test.js` fails if it does.
- **The tab bar's bottom margin is a flat 8px, not the safe-area inset.** It
  sits down in the home-indicator strip on purpose; `--tab-h` has no safe-area
  term to match. A test fails if the inset comes back.
- **More is `position:fixed`, not a sheet inside `#mapwrap`.** Inside the map
  area it was capped at 80% of whatever the map had left, which on the Route tab
  is a strip under the trip card. It shares `#scrim` with the station sheet, so
  `closeLegend()` releases the scrim only when the station sheet isn't up, and
  `#tabbar` is raised over both while More is open, since More is how it closes.
- **Never `overflow:hidden` on the layer button's `.H_ctl`.** Its Map view /
  Satellite menu is a child of that control and opens outside it, so clipping
  the control for its rounded corners clipped the menu away and the button
  looked dead (v2.1.0). Only `.H_zoom` clips.
- **The vector satellite layer is inserted at index 1**, never appended, or it
  draws over the pins and route.
- **A lib's top-level names are GLOBALS, so they must not collide with
  `index.html`'s.** The libs load as classic scripts through the module shim,
  which share one global lexical scope: a lib declaring `hasAmenCode` and
  `index.html` declaring it too is a redeclaration that kills the **entire**
  main script at parse time — no state, no list, no search. That happened
  wiring up `lib/stopfilter.js`, and the node suite passed 1,383 assertions
  while the app was dead in a browser. `test/libglobals.test.js` now catches
  it, and the hazard grows every time logic moves into `lib/`.
- **Don't add `defer` to the lib scripts** — the inline shims aren't deferred, so
  each would capture an empty `module.exports` and every module would silently
  become `{}`. A test fails if `defer` or `async` appears.
- **Don't repoint the header badge at `icons/icon-192.png`** — the badge is a
  thickened variant that survives at 34px; the icon art isn't.
- **Don't "simplify" the two route URLs in `truckRoute()`** — the 400 fallback
  must keep the vehicle profile, or a retry returns an unrestricted route
  rendered as a normal plan.
- **Don't chase satellite resolution** — already `size=512`, capped at z20, no
  native detail past z17; USGS 404s above z16 and measures softer.

### Updating this README

Written for a driver, not a developer. Keep it that way.

- **The guide above comes first, in plain words.** No code identifiers, no
  variable names, no file paths in it. Say "the app holds back the bottom quarter
  of the tank", not the name of the constant that does it.
- **Everything technical lives down here**, under this heading.
- **Short.** Tables and bullets over paragraphs. State the fact, skip the
  reasoning about why the wording is good.
- **Keep the honest caveats in the driver's half** — the gallon estimates reading
  high, the over-claimed walking-trail flag, the fuel-book revision. Those cost
  someone something if they're buried.
- **Every release gets one line** in the version history, newest first. A release
  that taught us something worth not relearning gets its warning added to *Things
  not to undo* instead of a longer entry.

### How this project tests

Several entries below record a test that passed for the wrong reason.

- **Measure against the real system.** More than once the measurement was itself
  the bug.
- **Mutation-test every release** — repeatedly this exposed tests weaker than
  their names.
- **Guarantee the geography a fixture needs.** A real-corridor test can be inert
  for the very feature it's named after.
- **Assertion evidence must be safe to build when the assertion is false**, or a
  failure becomes a crash that swallows the rest of the file.

---

# Version history

Newest first, one line each. The full reasoning for any release is in its commit
and in the code comments. Nothing below is needed to use the app.

Three releases shipped as v1.65.0, v1.66.0 and v2.0.0 on the same day and are
one entry here. The commits keep their own titles, so git log names two versions
this list does not.

### v2.2.7
Petro Amarillo's pin is where the station is — on I-40 at Lakeside Drive, Exit 75.
It sat about four miles south, so its distance in the nearest-fuel list and how far
off route it showed in a plan were both wrong.

### v2.2.6
The cards and the bubbles at the bottom are a little wider, with a strip of map
still showing down each side. The locate button now sits under the map-style
button as one piece, with an arrow icon, and HERE's credit line is smaller. On the trip card, "Vehicle" now reads "Vehicle Routing" and
"Standard" reads "Non-Hazmat".

### v2.2.5
The list button at the top right turns blue while the list of stops is open, the
same way the tabs do.

### v2.2.4
The tabs at the bottom stay sharp while the filters are open, and tapping one
closes the filters and goes straight there.

### v2.2.3
Opening the filters or More now blurs and darkens the screen behind them; tap the
dimmed part to close. More also opens while you're looking at the list of stops,
where before it only darkened the screen.

### v2.2.2
The filter panel is a rounded bubble like the fuel plan card, instead of a sheet
running edge to edge.

### v2.2.1
The fuel-gap warnings read as one paragraph again — the mileages in them no
longer break onto lines of their own — and the Fuel Dept number in the amber
warning is readable. The Exclusive badge stays in one piece beside a long
station name.

### v2.2.0
Route results are cards now. Each fuel stop sits on its own card with a badge
that matches its pin on the map — gold and numbered for a planned stop, PU and
DEL for pickup and delivery — and the mile it falls at on the right. How much
fuel you pull in with gets its own green card, red when it runs short. The
station nearest your delivery is a card too. Every number is worked out
exactly as before.

### v2.1.7
A new app icon: a fuel gauge. To see it on your home screen, remove the old
FuelPost icon and add it again from Safari.

### v2.1.6
The list of stops is split by state, A to Z by state name, each under its own
heading.

### v2.1.5
The fuel plan card matches the trip details card — same width, same size of text —
and the empty band at its bottom that the list scrolled into is gone. The map's
credit line now sits just above the card instead of hidden behind it.

### v2.1.4
The map fills the whole screen on the Route tab too, right up to the top behind
the trip details card. That card and the tabs at the bottom are a touch smaller
and narrower, the tabs sit as low on the screen as they can go, and the locate
button sits just above them.

### v2.1.3
A new map key. Nothing else changes.

### v2.1.2
The nearest-fuel strip is now a slim bubble just above the tabs, without the
empty space under it. The trip details card takes up less of the screen. More has
its own round button beside Stops and Route, and opens over everything — on the
Route tab too, where before it was squeezed under the trip card with half of it
out of reach.

### v2.1.1
The map now fills the whole screen, right down behind the bar at the bottom,
and the bar is a little slimmer. The button under the zoom that switches between
map and satellite works again — since v2.1.0 its menu opened out of sight.

### v2.1.0
A new look, and nothing else. The map runs edge to edge with the search box and
buttons floating over it. Stops, Route and a new More tab — the legend, theme and
version — sit in a bar at the bottom where your thumb is. Station details, filters
and More open as sheets from the bottom. Every plan, filter and number is worked
out exactly as before.

### v2.0.0
If the map can't load, the app now says so and keeps going — the station list,
search, filters and nav codes all still work, where before a failed map took
the whole app down with it. Checking for updates no longer re-downloads the
whole app to read one line, which adds up because it runs every time you come
back. And the rule deciding which stops your filters keep is now real, tested
code rather than something the tests could only describe.

### v1.64.0
When the stop list is open, the search box now says "City, state, exit" — the
old wording ran off the edge of the box and hid the last one.

### v1.63.0
The city search box just says "Look up a city" now. The rest of the line was
cut off on a phone anyway.

### v1.62.0
The top-off tip above your pickup — the one naming a station near the shipper
— is bold now, and the station's name is a link, so it reads as something to
tap rather than a footnote.

### v1.61.0
The top-off tip above your pickup is now tappable, like every other station the
app names — it told you a station was nearby and left you with no way to see
its hours, amenities or nav code.

### v1.60.0
The nearest-fuel-to-your-delivery row now shows the exit and nav code like every
other stop, instead of being the one you had to tap into, and a shared plan
carries all three — before, it named that station only on trips that needed no
fuel stop at all. The top-off tip about your pickup moved above the pickup row,
where it is advice rather than hindsight.

### v1.59.0
**Max is the default tier.** The arrival reading now says where the needle sits — "just under 3/8" — instead
of flooring to the mark below, which printed 439 mi as "1/4" and hid 139 mi of
fuel. Its mileage is now plannable range, the same scale the pickup gauge uses,
so 3/8 means 150 mi in both places. Leg and off-route figures are bold.

### v1.58.0
Fixed the gallons figure at the first stop when you don't leave the shipper
full. It showed what you burned on the leg instead of what the pump takes, so a
Midland run at 5/8 read "~37 gal, 23 short of a credit" on a fill that actually
takes ~91 and clears the credit easily. Wrong on 43 of 65 test plans, and
backwards as advice. Also fixed post-gap stops rendering their fill row twice.

### v1.57.0
Range tiers move to 600 / 750 / 900. All three are whole gauge marks now, so each
names what the needle reads when you pull in — 1/2, 3/8 and 1/4. Every tier can
also earn a shower credit on a full leg, which the old 500-mi Regular could not.

### v1.56.0
The reserve is now sized to your delivery instead of being a flat half tank —
measured over 84 real plans, that drops a stop from 47 of them and adds one to
none. The arrival line shows miles beside the gauge mark and says outright
whether you can reach fuel after dropping. The Auto switch is gone: spacing and
the skip cost nothing so they always run, and the reserve is no longer a
preference the app has to ask about.

### v1.55.0
Tidied the results panel: the final leg now sits inside the delivery box, the
skipped-stop note is one short sentence, and the green "fewest-stop plan" line is
gone as redundant.

### v1.54.0
Trimmed the skipped-stop note.

### v1.53.0
Auto now also skips a credit-less stop when there's fuel within 50 mi of the
delivery, not just when the stop itself is near the receiver — reported from a
Coppell → Redlands run where it added a 59-gal stop 270 mi out while TA Ontario
sat 19 mi from the door. Also recorded that the mpg assumption was documented
backwards: 8.5 makes gallon estimates read *high*, not low.

### v1.52.0
Auto can decline a reserve-forced stop near the receiver that wouldn't earn a
credit. Mutation testing found a real gap (the re-spacing pass kept a constraint
it had just given up) and a test-harness bug (a crashing file printed no `FAIL`
line, so the summary read clean).

### v1.51.0
**Auto.** The app learned gallons and shower credits, labels every stop with what
it will pump, reports arrival as a tank reading, and spaces stops to fill at
about half a tank. Measured: spacing helps rarely, and on 18 of 39 runs no
arrangement earns every credit — the labelling is the real value.

### v1.50.0
Locate frames the three closest stops instead of two.

### v1.49.0
Locate frames the truck and its two closest stops instead of a fixed zoom. A
first attempt "corrected" for Mercator and made it 16× worse — measure pixels for
a pixel question.

### v1.48.0
Only a tapped suggestion pins a place; Enter used to geocode whatever was typed.

### v1.47.0
City suggestions on the Stops search box, and a found place centres at a fixed
zoom instead of being framed with the nearest stop.

### v1.46.0
Look up a city on the Stops map and get the nearest fuel stop. Fixed the city
being dropped from HERE's address labels.

### v1.45.0
The loading message now waits for a tile to actually arrive, not just for the
camera to settle.

### v1.44.0
The legend closes itself when you switch tabs or open any panel.

### v1.43.0
The arrival reserve is on by default; every release since v1.27.0 had shipped it
off.

### v1.42.0
The reserve became a minimum instead of a target. The old version could leave you
with *less* fuel at the delivery than switching it off — measured at 216 mi worse
on one real run, and inert on another.

### v1.41.0
The 1/8–1/4 band became a backup reserve, so a driver already down there can see
what's nearby instead of getting a blank panel.

### v1.40.0
The unplannable band grew to a quarter tank, the gauge marks it amber, and a full
tank plans a round 900. Raising the floor silently made the arrival switch worth
zero miles, so it's now derived from the floor rather than written down.

### v1.39.0
The tank evened out to 1,000 miles at 125 a mark.

### v1.38.0
The arrival switch split into a floor and an aim. *(The aim was deleted in
v1.42.0.)*

### v1.37.0
The arrival value rose to 5/8, which made Regular unsatisfiable — it degrades
honestly as a shortfall rather than a fake gap.

### v1.36.0
Tank model moved to the fleet's Cascadias: 1,200 miles at 150 a mark.

### v1.35.0
The reserve became a switch and tiers moved to 500/700/900. A typo in one
constant produced a working-looking switch feeding nonsense into every plan —
only a test that runs the planner caught it.

### v1.34.0
The nav code joined the Near Me footer. Measurement corrected both the overflow
estimate and the first layout.

### v1.33.1
The nav code returned to the station sheet.

### v1.33.0
The nav code moved onto the list row and into search, digits included. A test
mirror had silently drifted from the real function.

### v1.32.0
Filter card rework: brand and tier removed, state and corridor became
multi-select, reset moved into the card.

### v1.31.0
Two rows deleted that were never in the fuel book (146 → 144), establishing that
closed is not the same as deleted. The Covenant yard verified unreachable from
every code path.

### v1.30.3
Closed stops got a red dot on their pin — being behind another pin is invisible
unless two overlap.

### v1.30.2
TA Gary marked closed, parking only. The alternative-stop wording became data,
because the old sentence said "same exit" and Petro Gary isn't.

### v1.30.1
1/8 dropped from the reserve choices, but kept in the model.

### v1.30.0
Tiers to 500/675/875, and the Near Me line says what it is.

### v1.29.1
Near Me became a flush footer with the map controls lifted above it.

### v1.29.0
**Near Me** — the nearest network fuel, on the Stops tab.

### v1.28.0
Corridor filter. One stop's exit field was empty and had it on no corridor at
all; corrected.

### v1.27.0
**Range tiers, and a planner that can leave you fuel at the receiver.** The old
range box defaulted to the fewest-stops setting, and the planner would happily
put you at the door on the bottom reserve.

### v1.26.0
Satellite stopped painting road labels over the lot.

### v1.25.1
A loading state over the map instead of an empty rectangle, with a watchdog if
the map never loads.

### v1.25.0
HERE Maps upgraded 3.1 → 3.2. One real incompatibility despite the migration
guide saying there'd be none.

### v1.24.1
The map stylesheet stopped blocking first paint — 1588ms to 84ms. Honest caveat:
the page paints sooner but isn't interactive sooner.

### v1.24.0
The filter row was inverted relative to the data — CAT scale matched every single
stop. Replaced with the two most selective amenities.

### v1.23.0
Sit-down restaurant flag added to 70 stops; four fitness rooms corrected.

### v1.22.2
A closed station was drawing on top of the open one 0.43 mi away.

### v1.22.1
**Correction: TA Saginaw is not closed.** v1.22.0 made an open station
unroutable — it's listed under a different name. Absence under an old name is not
evidence of closure.

### v1.22.0
Two stations excluded from planning but kept visible with an explanation.

### v1.21.0
The nav code rides on every result card and in the shared text.

### v1.20.2
Two map-zoom fixes, both found by measuring the actual camera instead of the
calls made — including a startup fit that had never worked at all.

### v1.20.1
Long station sheets stopped scrolling inside a box with room to spare.

### v1.20.0
Navigate to a stop from its sheet, handing the nav app coordinates rather than a
street address that often geocodes to the wrong side of the interchange.

### v1.19.6
The first view fits the whole network instead of a hardcoded zoom.

### v1.19.5
Map pins are built once and shown or hidden, instead of rebuilt on every
keystroke.

### v1.19.4
Route fits zoom out slightly, on driver feedback.

### v1.19.3
Routes centre in the part of the map you can actually see, not behind the results
panel.

### v1.19.2
Available stops became faded station pins — the abstract circle read as "tiny
cloud".

### v1.19.1
Available stops appear on the map, and every "no stop needed" line counts them.

### v1.19.0
A plan needing no stops now shows what fuel is available anyway, including the
nearest stop to the delivery — some loads require arriving full and the app can't
know that.

### v1.18.2
The pickup locate button takes its own one-shot fix instead of demanding you turn
tracking back on.

### v1.18.1
The layers button had moved to the middle of the map.

### v1.18.0
Traffic removed, and the map settings control rebuilt from public API — the
durable fix after four patches to the same area.

### v1.17.5
Traffic became an overlay rather than the base layer, so it stopped forcing the
map light in dark mode.

### v1.17.4
Fixed a dead black band under the map after the drawer changed height.

### v1.17.3
Clear trip stopped refilling the range box, and an empty box stopped summoning
the Clear button.

### v1.17.2
The range field shows its default greyed out rather than pretending you chose it.

### v1.17.1
First-load work cut roughly in half.

### v1.17.0
**Amenity filters.** Two thresholds were retuned against the real data first —
as specified they'd have been dead controls, since every stop has showers and
almost every one has a CAT scale.

### v1.16.4
Two floating map chips could hang over the list and the route panel.

### v1.16.3
**Security:** address text from HERE is now escaped before being put on the page.

### v1.16.2
Hold to turn location off, single tap to turn it back on.

### v1.16.1
The press-and-hold gesture is now named on screen — nothing had said it existed.

### v1.16.0
Location can be switched off, and the choice sticks across reloads.

### v1.15.2
The Stops search box got a clear button.

### v1.15.1
The station sheet shows how far you currently are from that stop.

### v1.15.0
The trip drawer stopped clipping its own buttons, and a gapped route now shows
what fuel lies past the dry stretch.

### v1.14.1
Detour search widened to 50 miles for a low tank. Investigated first — the old
behaviour wasn't broken, just unhelpful.

### v1.14.0
**Vehicle dimensions and hazmat routing.** Until this release the app applied
neither — a 13'6" truck could be routed under a 12' bridge. Earlier notes claiming
otherwise were wrong.

### v1.13.3
The header badge became the fuel gauge.

### v1.13.2
Red warning text was nearly invisible in dark mode — including the one line that
tells you a route strands the truck.

### v1.13.1
Re-lands a fix v1.13.0 shipped without: route labels had gone out reading
"[object Object]".

### v1.13.0
**Alternative routes, ranked by whether they can actually be fuelled** — a route
150 miles longer that fuels cleanly beats a short one that dies in New Mexico. No
extra API calls.

### v1.12.6
Copy: the range help text names its default.

### v1.12.5
A phone ran a build that existed in no commit — fresh page, cached scripts. Every
script now carries a version stamp.

### v1.12.4
Dropped the range line from shared trip text.

### v1.12.3
Completes v1.12.1, which fixed the right problem the wrong way. The test stub had
accepted anything, so it verified the request changed rather than that HERE
accepts it.

### v1.12.2
App icons wired in.

### v1.12.1
Address suggestions did nothing until an unrelated button was tapped.

### v1.12.0
Repeat address lookups cached for the session; a stale department name fixed.

### v1.11.10
Satellite survives a theme change. **v1.11.6 through v1.11.9 all misdiagnosed
this as a timing problem** and kept adding deferral — the actual bug was one
missing check.

### v1.11.9
Kept HERE's own layer switcher in sync; best-effort, since it needs an internal
property.

### v1.11.8
The same race on the other code path.

### v1.11.7
The correction was running re-entrantly inside the event that triggered it.

### v1.11.6
The map dropped to light mode after using HERE's own layer switcher.

### v1.11.5
Three route-bar fixes; the scale bar reads in miles. Its blurriness was
investigated and is *not* what it looked like — still open.

### v1.11.4
The update check runs on load and on returning to the app, silently.

### v1.11.3
The Legend and Recenter buttons floated over the stop list.

### v1.11.2
Search text was nearly invisible in dark mode.

### v1.11.1
Tapping "check for update" repeatedly stacked duplicate notes.

### v1.11.0
Per-field clear buttons.

### v1.10.3
Replaced the suggestion dropdown's positioning outright — **v1.10.1 and v1.10.2
both tried to patch it and neither worked.**

### v1.10.2
v1.10.1 had fixed the wrong half of the problem.

### v1.10.1
First attempt at the dropdown covering its own field on iOS.

### v1.10.0
Address suggestions as you type.

### v1.9.1
Copy fix on the gauge floor message.

### v1.9.0
The version number in the legend is tappable to force an update check. It never
reloads on its own — that would wipe a half-typed plan.

### v1.8.5
The collapsed results panel lifts HERE's controls instead of squeezing beside
them.

### v1.8.4
Clear trip was resetting the range to a stale number.

### v1.8.3
HERE's map controls stayed hidden after collapsing the results panel.

### v1.8.2
A long stop list couldn't be scrolled to the bottom, and the collapsed tab sat
under the home indicator.

### v1.8.1
Approved copy for the legend and gauge notes.

### v1.8.0
Three fixes found on a real phone, including the map staying visibly cut off
after collapsing the drawer.

### v1.7.2
Dark-mode fixes: the theme toggle overflowed its card, and navy text stayed
invisible.

### v1.7.1
The gauge floor note computes its own figure rather than hardcoding it.

### v1.7.0
**Dark theme**, including the map itself. First stored setting, and the origin of
the key-versioning rule.

### v1.6.5
Default range raised to 850 miles.

### v1.6.4
**Every pin on the map was drawing 16 pixels off its real position.**

### v1.6.3
The state filter moved into the Filters popover.

### v1.6.2
Brand and type filters moved behind a Filters button.

### v1.6.1
The locate button needed two taps to actually move the map.

### v1.6.0
The gauge reports *plannable* range, so F reads 875 rather than 1000 — the bottom
eighth is margin to limp on, not miles to plan with.

### v1.5.1
The location dot got its own colour; it was the same blue as every TA pin.

### v1.5.0
Range-at-pickup became a tappable gauge in eighths.

### v1.4.1
Route inputs collapse into a drawer once a plan is showing.

### v1.4.0
**Location**, shared by both tabs through one permission prompt.

### v1.3.0
Clear trip, and Share/save via the phone's share sheet.

### v1.2.0
The planner widens its detour search before declaring a gap, and look-up and plan
became one button.

### v1.1.2
Fixed a blank map on load.

### v1.1.1
Fuel book revision restored to the header, app version moved to the legend.

### v1.1.0
**Route mode**: address confirmation, truck routing, and the fuel plan.

### v1.0.0
**Stops mode**: map, list, filters, search and legend over 146 locations.
