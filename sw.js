/* FuelPost service worker — offline STOPS mode.
 *
 * ============================ THE VERSIONING RULE ============================
 * The cache name MUST change on every deploy, or installed phones keep serving
 * stale code forever with no way to know. Rather than asking a human to
 * remember two numbers, this file DERIVES its version from its own URL:
 * index.html registers `sw.js?v=<APP_VERSION>`, and the version is read back
 * out below. APP_VERSION and the cache name therefore cannot drift — there is
 * one number, and changing the registration URL is itself what makes the
 * browser install a new worker.
 *
 * test/serviceworker.test.js enforces the registration carries APP_VERSION,
 * that the precache list covers every lib file and icon, and that the
 * update-check bypass below still exists.
 * ===========================================================================
 */
const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE = 'fuelpost-' + VERSION;

/* Precached with their ?v= stamps, matching exactly how index.html requests
 * them. This is deliberate and load-bearing: the stamp makes the version part
 * of the cache KEY, so after a deploy the new page's `lib/x.js?v=1.18.0`
 * simply misses the old cache and goes to the network. An ignoreSearch match
 * would instead hand new HTML the OLD library files — the mixed-version bug
 * that makes service workers infamous. */
const SHELL = [
  'index.html',
  ...[
    'fuelplan.js', 'fuelplan-adaptive.js', 'triptext.js', 'location.js',
    'gauge.js', 'extract-version.js', 'autosuggest.js', 'baselayer.js',
    'memocache.js', 'routerank.js', 'vehicleprofile.js', 'escape.js',
    'flexible-polyline.js'
  ].map(f => `lib/${f}?v=${VERSION}`),
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // addAll is atomic — one 404 would leave the whole install failed and the
    // old worker in place, which is the safe direction. Precache individually
    // instead so a single missing optional asset (an icon) can't block an
    // otherwise good update from shipping.
    await Promise.all(SHELL.map(async url => {
      try { await cache.add(new Request(url, { cache: 'reload' })); }
      catch (e) { /* asset unavailable at install; fetch handler falls back to network */ }
    }));
    // Take over promptly. Safe here precisely because of the stamped keys
    // above: a page running the old build asks for old-stamped URLs, which
    // miss this new cache and fall through to the network rather than being
    // answered with mismatched files.
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names.filter(n => n.startsWith('fuelpost-') && n !== CACHE)
           .map(n => caches.delete(n))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  /* ---- NEVER intercept the update path. ----
   * checkForUpdate() fetches `?_cb=<now>` and the "tap to reload" navigation
   * uses the same cache-busted URL. Their entire purpose is to defeat caching.
   * If this worker ever answers one from cache, the update check silently
   * reports "you're on the latest" forever and the reload lands back on the
   * same stale build — the app becomes un-updatable in the field with no
   * symptom a driver could report. This bypass is why that can't happen. */
  if (url.searchParams.has('_cb')) return;

  /* Cross-origin — HERE map tiles, routing, geocoding, autosuggest, and
   * HERE's own mapsjs libraries. Network-only, never cached: their terms
   * govern reuse, tile volume is unbounded, and pinning someone else's
   * library to a cached copy is how you get stranded on a broken version.
   * Offline these simply fail, which the app already handles. */
  if (url.origin !== self.location.origin) return;

  // Navigations: serve the cached shell so the app opens with no signal.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cached = await caches.match('index.html');
      if (cached) return cached;
      try { return await fetch(req); }
      catch (e) { return new Response('Offline and no cached copy of FuelPost yet.',
        { status: 503, headers: { 'Content-Type': 'text/plain' } }); }
    })());
    return;
  }

  // Same-origin assets: cache-first, exact match (see the SHELL note above).
  // Correctness comes from the version bump, not from revalidation.
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const res = await fetch(req);
      // Only same-origin, successful, basic responses are worth keeping.
      if (res && res.ok && res.type === 'basic') {
        const copy = res.clone();
        const cache = await caches.open(CACHE);
        cache.put(req, copy);
      }
      return res;
    } catch (e) {
      return cached || Response.error();
    }
  })());
});
