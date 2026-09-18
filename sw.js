/* FuelPost service worker — OWN FILES ONLY.
 *
 * WHY THIS EXISTS. Every open re-downloads index.html and all 17 lib modules.
 * On cell that is the visible wait before the map fills in, and with no signal
 * the app does not open at all — which is exactly the situation where a driver
 * most needs to know where the network fuel is. The Stops tab needs nothing
 * but its own files: DATA is inline, and filtering, search, corridors,
 * amenities, nav codes and the list are all local. Cached, that whole tab
 * works with zero bars.
 *
 * WHAT IS DELIBERATELY NOT CACHED: anything from js.api.here.com or any
 * hereapi.com endpoint. Not the SDK, not the stylesheet, not tiles, not
 * routing, geocoding or autosuggest. This is a CHOICE, not an oversight.
 * HERE's scripts are loaded without crossorigin, so a worker fetching them
 * gets opaque responses — status 0, contents uninspectable, cache.addAll
 * rejects on them, and they are padded heavily against the storage quota.
 * Caching them needs no-cors fetch plus cache.put plus a quota strategy, and
 * a failure there is indistinguishable from success until the map silently
 * stops rendering. Leaving HERE on the network means everything cached here
 * is code we wrote and can test, the map behaves exactly as it does today,
 * and the offline win — the whole Stops tab — still lands. Caching HERE is a
 * possible SECOND PASS once this one is trusted in the truck.
 *
 * THE VERSION CONTRACT. The cache is named from VERSION, and on activate
 * every fuelpost- cache that is not the current one is deleted. That single
 * rule is what makes a stale-version lock impossible: a new APP_VERSION means
 * a new cache name, a full refetch, and the old cache dropped. VERSION must
 * equal APP_VERSION in index.html — test/cachebust.test.js fails the build if
 * it drifts, and so does a lib stamp that does not match.
 *
 * FROM v1.65.0 ON, EVERY DEPLOY BUMPS APP_VERSION AND THIS VERSION TOGETHER.
 *
 * IF THIS GOES WRONG: README.md carries a kill-switch sw.js, verbatim, that
 * unregisters and clears every fuelpost- cache. Browsers revalidate this file
 * independently of the caches it controls, so publishing that file reaches
 * every driver without them doing anything.
 */

// The ONE place the version is written in this file. Everything below derives
// from it, so a bump cannot half-apply: the cache name and all 17 lib stamps
// move together or not at all.
const VERSION = '1.65.0';
const CACHE_PREFIX = 'fuelpost-';
const CACHE = CACHE_PREFIX + 'v' + VERSION;

// The 17 lib modules, by bare name. index.html loads 15 via <script src> and
// two (fuelplan-adaptive, shorttrip) via fetch() into a function scope, but
// both mechanisms request the same stamped URL, so the worker does not care
// which is which. cachebust.test.js checks this list against lib/ on disk, so
// a module added there and forgotten here fails the build.
const LIB_MODULES = [
  'autosuggest',
  'baselayer',
  'corridors',
  'escape',
  'extract-version',
  'flexible-polyline',
  'fuelplan-adaptive',
  'fuelplan',
  'gauge',
  'location',
  'memocache',
  'navlinks',
  'nearme',
  'routerank',
  'shorttrip',
  'triptext',
  'vehicleprofile'
];

// The lib URLs carry their ?v= stamps because the query is PART OF THE CACHE
// KEY. A precache list that omitted ?v= would store keys the page never asks
// for: every module would miss and silently fall through to network-only —
// working, but pointless.
const PRECACHE_PATHS = [
  'index.html'
].concat(
  LIB_MODULES.map(name => 'lib/' + name + '.js?v=' + VERSION)
).concat([
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-1024.png'
]);

// Resolved against this worker's own URL rather than left relative, so the
// keys are exactly what the page requests and the same file can be reasoned
// about (and tested) off a page. The app is served from a SUBPATH on Pages
// (/FuelPost/), so nothing here may be rooted at /.
const absolute = path => new URL(path, self.location.href).href;
const PRECACHE = PRECACHE_PATHS.map(absolute);
// Navigations are answered with this, whatever path they asked for: a
// navigation to /FuelPost/ does not request /FuelPost/index.html, so matching
// the request itself would miss on the one file the app cannot start without.
const INDEX_URL = absolute('index.html');

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache =>
      // cache:'reload' bypasses the HTTP cache for every precache fetch.
      // Pages serves max-age=600, so without it a newly installing worker
      // could store a ten-minute-old index.html against a fresh version —
      // the exact HTML/lib skew the ?v= stamps were added to stop.
      //
      // addAll and not individual puts: it rejects if ANY file fails, so a
      // half-populated cache can never become the active one. A failed
      // install leaves the previous worker (or no worker) in charge, which
      // is the correct outcome — the app works without this file.
      cache.addAll(PRECACHE.map(url => new Request(url, { cache: 'reload' })))
    )
  );
  // No skipWaiting: a new version taking over on the next COLD START is what
  // the version contract above assumes. Seizing pages mid-session is a
  // separate decision with separate risk, and is not made here.
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names => Promise.all(
      names
        .filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE)
        .map(name => caches.delete(name))
    ))
  );
  // No clients.claim, for the same reason there is no skipWaiting.
});

self.addEventListener('fetch', event => {
  const request = event.request;

  // Everything below decides whether to intercept AT ALL. Where the answer is
  // no, the handler returns without calling respondWith, and the request goes
  // to the network exactly as it would with no worker installed — not through
  // a pass-through fetch() that could alter it.

  // Only GET is cacheable, and only same-origin is ours.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // HERE — the SDK, the stylesheet, tiles, routing, geocoding, autosuggest.
  // Untouched, on purpose. See the header comment.
  if (url.origin !== self.location.origin) return;

  // THE VERSION CHECKER. checkForUpdate() in index.html fetches
  // location.pathname with ?_cb=<timestamp> and cache:'no-store' to read the
  // LIVE APP_VERSION out of the served HTML. Answering that from cache would
  // break the feature in the worst possible way: it would tell the driver
  // they are on the latest version forever, including when they are pinned to
  // a broken one. The cache-buster already marks these requests uniquely, so
  // it is the signal used here rather than a new one.
  //
  // COUPLED TO index.html: if the _cb parameter is ever renamed or dropped
  // there, this line must change with it. Neither is safe to edit alone.
  if (url.searchParams.has('_cb')) return;

  // Navigations: the cached page, falling back to the network on a miss.
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match(INDEX_URL, { cacheName: CACHE })
        .then(hit => hit || fetch(request))
    );
    return;
  }

  // Everything else of ours: cache-first, network on a miss. A miss offline
  // rejects exactly as it does today — the request fails visibly instead of
  // hanging, which is what the map does when it cannot reach HERE.
  event.respondWith(
    caches.match(request, { cacheName: CACHE })
      .then(hit => hit || fetch(request))
  );
});
