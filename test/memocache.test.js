const { createMemoCache, cacheKey } = require('../lib/memocache.js');
let pass = 0, fail = 0;
const ok = (n, c, e = '') => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.log('  FAIL', n, e); } };

console.log('=== basic get/set/has ===');
const c = createMemoCache();
ok('miss before set', c.get('a') === undefined && !c.has('a'));
c.set('a', [1,2,3]);
ok('hit after set, same reference back', c.get('a').length === 3 && c.has('a'));
c.set('a', 'replaced');
ok('overwrite works', c.get('a') === 'replaced');

console.log('\n=== cacheKey normalization ===');
ok('case-insensitive', cacheKey('Memphis TN') === cacheKey('memphis tn'));
ok('trims and collapses whitespace', cacheKey('  memphis   tn  ') === cacheKey('memphis tn'));
ok('multi-part keys join distinctly', cacheKey('geo','memphis') !== cacheKey('geomemphis'));
ok('numbers stringify fine', cacheKey('at', 40.7395, -111.993) === cacheKey('at', '40.7395', '-111.993'));
ok('different queries stay different', cacheKey('memphis tn') !== cacheKey('memphis tx'));

console.log('\n=== FIFO cap eviction ===');
const small = createMemoCache(3);
small.set('k1', 1); small.set('k2', 2); small.set('k3', 3);
ok('at cap, all present', small.has('k1') && small.has('k2') && small.has('k3'));
small.set('k4', 4);
ok('inserting past cap evicts the oldest (k1)', !small.has('k1'));
ok('newer entries survive', small.has('k2') && small.has('k3') && small.has('k4'));
ok('size never exceeds cap', small.size === 3);

console.log('\n=== falsy values are legitimate cached results ===');
const c2 = createMemoCache();
c2.set('empty', []);
ok('empty array is a valid hit (a no-results geocode IS an answer worth caching)',
   c2.has('empty') && Array.isArray(c2.get('empty')));
c2.set('nul', null);
ok('has() distinguishes a cached null from a miss', c2.has('nul') && c2.get('nul') === null);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
