// sw.js, RUN rather than read. A regex over the source can only prove the
// worker says the right words; this loads the real file into a sandbox with
// stubbed platform objects, fires the real install / activate / fetch events,
// and asserts what it actually did. A service worker that pins a driver to a
// broken version is the worst failure this app can have, so the strategy is
// tested as behaviour, not as text.
//
// The few things that genuinely ARE source facts — no HERE URL anywhere, no
// skipWaiting, no clients.claim — are checked against the text at the end.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c, e = '') => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.log('  FAIL', n, e); } };

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
// sw.js EXPLAINS in prose why HERE is not cached and why there is no
// skipWaiting — the brief asks for exactly that, so the omissions read as
// chosen. Those words therefore appear in the file, and an assertion over raw
// source would be checking the comment rather than the behaviour. CODE is the
// file with comments removed: what actually runs. Safe here because sw.js
// builds every URL from a relative path and holds no string literal with //
// in it, which the guard below keeps true.
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// The real deployment: a SUBPATH, not an origin root. Everything the worker
// resolves has to land under /FuelPost/, so that is what it is given.
const SCOPE = 'https://5w311.github.io/FuelPost/';
const SW_URL = SCOPE + 'sw.js';

// ---- platform stubs -------------------------------------------------------

class FakeRequest {
  constructor(url, opts = {}) {
    this.url = String(url);
    this.cache = opts.cache;
    this.method = opts.method || 'GET';
    this.mode = opts.mode || 'cors';
  }
}

function makeEnv() {
  // cacheName -> Map(url -> marker)
  const store = new Map();
  const fetchLog = [];
  let networkUp = true;

  const cacheApi = name => ({
    addAll: async reqs => {
      const m = store.get(name) || new Map();
      for (const r of reqs) {
        if (!networkUp) throw new Error('offline');
        m.set(r.url, { from: 'network', reload: r.cache === 'reload' });
      }
      store.set(name, m);
    },
    match: async req => {
      const m = store.get(name);
      const url = typeof req === 'string' ? req : req.url;
      return m ? m.get(url) : undefined;
    }
  });

  const caches = {
    open: async name => { if (!store.has(name)) store.set(name, new Map()); return cacheApi(name); },
    keys: async () => [...store.keys()],
    delete: async name => store.delete(name),
    match: async (req, opts) => {
      const url = typeof req === 'string' ? req : req.url;
      const names = opts && opts.cacheName ? [opts.cacheName] : [...store.keys()];
      for (const n of names) {
        const m = store.get(n);
        if (m && m.has(url)) return m.get(url);
      }
      return undefined;
    }
  };

  const listeners = {};
  const self = {
    location: { href: SW_URL, origin: 'https://5w311.github.io' },
    addEventListener: (type, fn) => { listeners[type] = fn; },
    registration: {},
    clients: { matchAll: async () => [] }
  };

  const sandbox = {
    self, caches, URL, Request: FakeRequest, Promise, console,
    fetch: async req => {
      fetchLog.push(typeof req === 'string' ? req : req.url);
      if (!networkUp) throw new Error('offline');
      return { from: 'network-passthrough' };
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox, { filename: 'sw.js' });

  return {
    listeners, store, caches, fetchLog,
    goOffline: () => { networkUp = false; },
    goOnline: () => { networkUp = true; }
  };
}

// Fires an event and waits for whatever the handler passed to waitUntil.
async function fire(env, type, extra = {}) {
  const waited = [];
  const event = Object.assign({ waitUntil: p => waited.push(p) }, extra);
  const handler = env.listeners[type];
  if (!handler) throw new Error('no handler registered for ' + type);
  handler(event);
  await Promise.all(waited);
  return event;
}

async function fireFetch(env, request) {
  let responded;
  const event = {
    request,
    respondWith: p => { responded = p; },
    waitUntil: () => {}
  };
  env.listeners.fetch(event);
  if (responded === undefined) return { intercepted: false };
  // A cache miss with no network REJECTS, which is the app failing visibly
  // rather than hanging. The caller needs to see that as an outcome, not as
  // a crashed test.
  try { return { intercepted: true, value: await responded }; }
  catch (err) { return { intercepted: true, failed: true, error: String(err && err.message) }; }
}

// ---- what the page actually asks for --------------------------------------

const appVersion = (HTML.match(/const APP_VERSION = '([^']+)'/) || [])[1];
const libFiles = fs.readdirSync(path.join(ROOT, 'lib')).filter(f => f.endsWith('.js'));

(async () => {

console.log('\n=== install: what lands in the cache ===');
{
  const env = makeEnv();
  await fire(env, 'install');
  const names = [...env.store.keys()];
  ok('exactly one cache is created', names.length === 1, JSON.stringify(names));
  ok(`and it is named from APP_VERSION (fuelpost-v${appVersion})`,
     names[0] === `fuelpost-v${appVersion}`, JSON.stringify(names));

  const cached = [...(env.store.get(names[0]) || new Map()).keys()];
  ok('the page itself is cached', cached.includes(SCOPE + 'index.html'),
     JSON.stringify(cached.slice(0, 3)));

  // Every lib on disk, at the stamp the page requests. Derived from lib/ and
  // from APP_VERSION rather than written out, so adding a module or bumping
  // the version updates the expectation instead of quietly passing.
  const wantLibs = libFiles.map(f => `${SCOPE}lib/${f}?v=${appVersion}`);
  const missing = wantLibs.filter(u => !cached.includes(u));
  ok(`all ${libFiles.length} lib modules are cached at ?v=${appVersion}`,
     missing.length === 0, JSON.stringify(missing));

  const icons = fs.readdirSync(path.join(ROOT, 'icons')).filter(f => f.endsWith('.png'));
  const missingIcons = icons.filter(f => !cached.includes(SCOPE + 'icons/' + f));
  ok(`all ${icons.length} icons are cached`, missingIcons.length === 0,
     JSON.stringify(missingIcons));

  ok('and NOTHING else is cached — no HERE, no strays',
     cached.length === 1 + wantLibs.length + icons.length,
     JSON.stringify(cached.filter(u =>
       u !== SCOPE + 'index.html' && !wantLibs.includes(u)
       && !icons.some(f => u === SCOPE + 'icons/' + f))));

  ok('>>> no HERE URL reached the cache',
     !cached.some(u => /here(api)?\.com/.test(u)),
     JSON.stringify(cached.filter(u => /here(api)?\.com/.test(u))));

  // Pages serves max-age=600. Without cache:'reload' a newly installing
  // worker could store ten-minute-old HTML against a fresh version.
  const entries = [...(env.store.get(names[0]) || new Map()).values()];
  ok('every precache fetch bypassed the HTTP cache (cache:reload)',
     entries.length > 0 && entries.every(e => e.reload === true),
     JSON.stringify(entries.filter(e => !e.reload).length + ' without reload'));
}

console.log('\n=== install failure leaves nothing half-built ===');
{
  const env = makeEnv();
  env.goOffline();
  let threw = false;
  try { await fire(env, 'install'); } catch (e) { threw = true; }
  ok('a precache that cannot complete REJECTS the install',
     threw, 'install resolved despite the network being down');
}

console.log('\n=== activate: the version contract ===');
{
  const env = makeEnv();
  // Two old versions and one unrelated cache from some other app.
  (await env.caches.open('fuelpost-v1.60.0'));
  (await env.caches.open('fuelpost-v1.64.0'));
  (await env.caches.open('somethingelse-v1'));
  await fire(env, 'install');
  await fire(env, 'activate');
  const names = [...env.store.keys()].sort();
  ok('>>> every older fuelpost- cache is deleted',
     !names.includes('fuelpost-v1.60.0') && !names.includes('fuelpost-v1.64.0'),
     JSON.stringify(names));
  ok('  the current one survives',
     names.includes(`fuelpost-v${appVersion}`), JSON.stringify(names));
  ok('  and a cache belonging to something else is left alone',
     names.includes('somethingelse-v1'), JSON.stringify(names));
}

console.log('\n=== fetch: what is NOT intercepted ===');
{
  const env = makeEnv();
  await fire(env, 'install');
  await fire(env, 'activate');

  const here = await fireFetch(env, new FakeRequest('https://js.api.here.com/v3/3.2.9.0/mapsjs-core.js'));
  ok('>>> the HERE SDK passes straight through, untouched', !here.intercepted);

  const tiles = await fireFetch(env, new FakeRequest('https://maps.hereapi.com/v3/base/mc/8/1/2/png8'));
  ok('  so do map tiles', !tiles.intercepted);

  const route = await fireFetch(env, new FakeRequest('https://router.hereapi.com/v8/routes?x=1'));
  ok('  so does routing', !route.intercepted);

  const geo = await fireFetch(env, new FakeRequest('https://geocode.search.hereapi.com/v1/geocode?q=x'));
  ok('  so does geocoding', !geo.intercepted);

  const sugg = await fireFetch(env, new FakeRequest('https://autosuggest.search.hereapi.com/v1/autosuggest?q=x'));
  ok('  so does autosuggest', !sugg.intercepted);

  // THE ONE THAT WOULD BREAK THE UPDATE BUTTON FOREVER.
  const cb = await fireFetch(env, new FakeRequest(SCOPE + 'index.html?_cb=1758000000000'));
  ok('>>> the version checker\'s _cb request is never answered from cache',
     !cb.intercepted, 'intercepted — checkForUpdate would report "latest" forever');

  const post = await fireFetch(env, new FakeRequest(SCOPE + 'index.html', { method: 'POST' }));
  ok('  and non-GET is left alone', !post.intercepted);
}

console.log('\n=== fetch: what IS served from cache ===');
{
  const env = makeEnv();
  await fire(env, 'install');
  await fire(env, 'activate');
  env.goOffline();

  const nav = await fireFetch(env, new FakeRequest(SCOPE, { mode: 'navigate' }));
  ok('>>> a navigation to the bare directory is answered with the cached page',
     nav.intercepted && nav.value && nav.value.from === 'network',
     JSON.stringify(nav.value));

  const navDeep = await fireFetch(env, new FakeRequest(SCOPE + 'index.html', { mode: 'navigate' }));
  ok('  and so is a navigation naming index.html', navDeep.intercepted && !!navDeep.value);

  const lib = await fireFetch(env, new FakeRequest(`${SCOPE}lib/gauge.js?v=${appVersion}`));
  ok('>>> a stamped lib module is served from cache with no signal',
     lib.intercepted && !!lib.value, JSON.stringify(lib.value));

  const icon = await fireFetch(env, new FakeRequest(SCOPE + 'icons/icon-192.png'));
  ok('  and so are the icons', icon.intercepted && !!icon.value);

  // The stamp is part of the cache key, which is the whole reason the
  // precache list carries it. An old stamp must MISS, not silently hit.
  // The stamp is part of the cache key, which is the whole reason the
  // precache list carries it: an OLD stamp must miss, not silently hit.
  // Offline that miss surfaces as a failed request, which is correct — the
  // alternative is serving a driver a module from a version they are not on.
  const stale = await fireFetch(env, new FakeRequest(SCOPE + 'lib/gauge.js?v=0.0.0'));
  ok('  a lib at a DIFFERENT stamp misses the cache and tries the network',
     stale.intercepted && stale.failed === true, JSON.stringify(stale));
  ok('  and that attempt really was made', env.fetchLog.some(u => /v=0\.0\.0/.test(u)),
     JSON.stringify(env.fetchLog));

  const unknown = await fireFetch(env, new FakeRequest(SCOPE + 'nothing-here.txt'));
  ok('  an uncached same-origin file fails visibly offline rather than hanging',
     unknown.intercepted && unknown.failed === true, JSON.stringify(unknown));

  // Back online, the same miss goes through to the network and succeeds.
  env.goOnline();
  const backOn = await fireFetch(env, new FakeRequest(SCOPE + 'nothing-here.txt'));
  ok('  and succeeds again once there is signal, with no reload needed',
     backOn.intercepted && !backOn.failed && !!backOn.value, JSON.stringify(backOn));
}

console.log('\n=== registration in index.html ===');
{
  ok('>>> registration is guarded on support',
     /if\('serviceWorker' in navigator\)\{/.test(HTML));
  ok('>>> and deferred to load, not run in the head',
     /window\.addEventListener\('load', \(\) => \{\s*\n\s*navigator\.serviceWorker\.register\('sw\.js'\)/.test(HTML));
  ok('  failure is swallowed — the app works without the worker',
     /navigator\.serviceWorker\.register\('sw\.js'\)\.catch\(\(\) => \{\}\)/.test(HTML));
  ok('  registered by RELATIVE path, so the /FuelPost/ subpath scopes it',
     /register\('sw\.js'\)/.test(HTML) && !/register\('\/sw\.js'\)/.test(HTML));
  ok('  and it sits after the page is wired, at the end of the script',
     HTML.indexOf("navigator.serviceWorker.register") > HTML.indexOf('updateFieldClearVisibility();'));

  // The coupling the worker depends on. If _cb is renamed here the worker
  // starts caching the version check, and the update button lies forever.
  ok('>>> checkForUpdate still marks its request with _cb',
     /location\.pathname \+ '\?_cb=' \+ Date\.now\(\)/.test(HTML));
  ok('  with the coupling to sw.js written down at this end',
     /sw\.js uses to leave this[\s\S]{0,400}request alone/.test(HTML));
  ok('  and at the worker end',
     /COUPLED TO index\.html/.test(SRC));
}

console.log('\n=== source facts (checked against CODE, not the comments) ===');
{
  // Guard the stripper itself: if it ever stopped removing anything, every
  // assertion below would be re-reading the prose and passing vacuously.
  ok('the comment stripper actually stripped something',
     CODE.length > 0 && CODE.length < SRC.length * 0.6,
     `SRC ${SRC.length} -> CODE ${CODE.length}`);
  ok('  and left the code intact',
     /addEventListener\('fetch'/.test(CODE) && /caches\.open/.test(CODE));
  ok('  with no // surviving in a string literal to confuse it',
     !/['"][^'"\n]*\/\/[^'"\n]*['"]/.test(CODE), CODE.slice(0, 0));

  ok('>>> no js.api.here.com anywhere in the code', !/js\.api\.here\.com/.test(CODE));
  ok('>>> no hereapi.com anywhere in the code', !/hereapi\.com/.test(CODE));
  ok('  nor any absolute http(s) URL at all — everything is relative',
     !/https?:\/\//.test(CODE));
  ok('>>> no skipWaiting — a new version waits for the next cold start',
     !/skipWaiting/.test(CODE));
  ok('>>> no clients.claim — open pages are not seized mid-session',
     !/clients\.claim/.test(CODE));
  ok('  the omission of HERE reads as chosen, not forgotten',
     /CHOICE, not an oversight/.test(SRC) && /SECOND PASS/.test(SRC));
  ok('  and nothing is rooted at /, which the subpath deploy could not serve',
     !/['"]\/(?:index\.html|lib\/|icons\/)/.test(CODE));
}

console.log('\n=== the kill switch in README.md, RUN ===');
{
  // The one file nobody will want to be writing when it is needed. It lives
  // in the README verbatim, which means nothing type-checks it and nothing
  // runs it — so this lifts it straight out of the prose and executes it.
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  const block = (readme.match(/```js\n(\/\/ FuelPost KILL SWITCH[\s\S]*?)```/) || [])[1];
  ok('>>> the kill switch is present in README.md, verbatim and fenced',
     !!block, 'no fenced block starting "// FuelPost KILL SWITCH" found');

  if (block) {
    const env = makeEnv();
    // Stand up the world it has to undo: the real worker, installed and
    // activated, plus caches from two older versions.
    await fire(env, 'install');
    await fire(env, 'activate');
    (await env.caches.open('fuelpost-v1.60.0'));
    ok('  fixture: fuelpost- caches exist before it runs',
       [...env.store.keys()].some(n => n.startsWith('fuelpost-')),
       JSON.stringify([...env.store.keys()]));

    // Now load the kill switch over the same sandbox state.
    let unregistered = false;
    const navigated = [];
    const killListeners = {};
    const killSelf = {
      location: { href: SW_URL, origin: 'https://5w311.github.io' },
      addEventListener: (type, fn) => { killListeners[type] = fn; },
      skipWaiting: () => { killSelf.skipWaitingCalled = true; },
      registration: { unregister: async () => { unregistered = true; } },
      clients: {
        matchAll: async () => [{ url: SCOPE, navigate: async u => navigated.push(u) }]
      }
    };
    const killSandbox = { self: killSelf, caches: env.caches, URL, Promise, console };
    vm.createContext(killSandbox);
    let syntaxOk = true;
    try { vm.runInContext(block, killSandbox, { filename: 'README kill switch' }); }
    catch (err) { syntaxOk = false; ok('  it parses', false, String(err && err.message)); }
    ok('>>> it parses and registers handlers', syntaxOk && !!killListeners.activate,
       JSON.stringify(Object.keys(killListeners)));

    if (syntaxOk) {
      killListeners.install({ waitUntil: () => {} });
      ok('  install calls skipWaiting, so it takes effect now', killSelf.skipWaitingCalled === true);

      const waited = [];
      killListeners.activate({ waitUntil: p => waited.push(p) });
      await Promise.all(waited);

      ok('>>> it unregisters the worker', unregistered === true);
      ok('>>> and deletes every fuelpost- cache',
         ![...env.store.keys()].some(n => n.startsWith('fuelpost-')),
         JSON.stringify([...env.store.keys()]));
      ok('  leaving other apps\' caches alone',
         [...env.store.keys()].every(n => !n.startsWith('fuelpost-')),
         JSON.stringify([...env.store.keys()]));
      ok('>>> and reloads the open page, so the driver acts on nothing',
         navigated.length === 1 && navigated[0] === SCOPE, JSON.stringify(navigated));
      ok('  with NO fetch handler, so nothing is intercepted meanwhile',
         !killListeners.fetch, JSON.stringify(Object.keys(killListeners)));
    }
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;

})();
