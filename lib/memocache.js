// Session-only memo cache for HERE lookups. In-memory Map, no storage, no
// TTL — a page load is the lifetime, which is the right scope: station data
// and addresses don't move within one session, and nothing here should
// outlive a reload where fresher code/data may apply.
//
// Capped so a long session of autosuggest typing can't grow it unbounded —
// simple FIFO eviction (Map preserves insertion order), which is plenty
// here; this is a duplicate-call absorber, not an LRU tuned for hit rate.
function createMemoCache(maxEntries = 200) {
  const store = new Map();
  return {
    get(key) { return store.get(key); },
    has(key) { return store.has(key); },
    set(key, value) {
      if (store.size >= maxEntries) {
        const oldest = store.keys().next().value;
        store.delete(oldest);
      }
      store.set(key, value);
    },
    get size() { return store.size; }
  };
}

// One normalization for every text-keyed lookup, so "Memphis TN", "memphis
// tn " and "MEMPHIS  TN" collapse to one cache entry — the same trivial
// variations a driver retyping an address actually produces.
function cacheKey(...parts) {
  return parts.map(p => String(p).trim().toLowerCase().replace(/\s+/g, ' ')).join('|');
}

module.exports = { createMemoCache, cacheKey };
