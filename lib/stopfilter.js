// Which stops survive the filters. Pure: no DOM, no globals, no network.
//
// This lived inside index.html as `passes(row)`, reading `state` directly, so
// the only way to test it was through the browser or by asserting on its
// source text. It is the predicate every one of the 144 rows goes through on
// every keystroke and every filter tap, and its edge cases are real — a stop
// on two interstates, a nav code matched by bare digits, a gym that is coded
// O and not F. None of those were covered by a test that could name them.
//
// The caller still holds the state; this takes it as an argument.

// DATA's column order, named once rather than spelled as magic indices at
// each use — which is what the inline version did. test/stopfilter.test.js
// asserts these against the real DATA, so a fuel book that reshapes a column
// fails the build here instead of silently filtering on the wrong field.
const COL = {
  name: 2,
  city: 4,
  state: 5,
  exit: 7,
  showers: 14,
  amenities: 16,
  nav: 20
};

// Amenities are a comma-separated code list. SPLIT, never includes(): a bare
// includes('R') would match a future 'BR', and no code being a substring of
// another today is luck, not a guarantee.
function hasAmenCode(row, code) {
  return String(row[COL.amenities] || '').split(',').some(c => c.trim() === code);
}

// The haystack a text query is matched against: name, city, state, exit and
// the nav code. Lowercased, so matching is case-insensitive, and joined with
// spaces so a query cannot span two fields by accident.
function searchHaystack(row) {
  return [row[COL.name], row[COL.city], row[COL.state], row[COL.exit], row[COL.nav]]
    .join(' ').toLowerCase();
}

/* One row against one set of criteria.
 *
 *   states        Set of state codes. Empty means no state filter.
 *   corridors     Set of corridor ids. Empty means no corridor filter.
 *   rowCorridors  The corridors THIS row sits on, as an array. Passed in
 *                 rather than derived, because the caller computes it once at
 *                 startup for all 144 rows instead of per keystroke.
 *   query         Already-lowercased search text. Empty means no text filter.
 *   showers       Require many showers (see showersMany).
 *   gym           Require a fitness room.
 *   restaurant    Require a sit-down restaurant.
 *   showersMany   The threshold `showers` tests against.
 *
 * HOW THE DIMENSIONS COMBINE: within a dimension the selections are OR — TX
 * or OK returns stops in either. Across dimensions everything is AND.
 */
function stopPasses(row, criteria) {
  const c = criteria || {};

  if (c.states && c.states.size && !c.states.has(row[COL.state])) return false;

  // Corridor is set-intersects-set, not equality: 25 stops sit on two or more
  // interstates (TA Tuscaloosa is on both I-20 and I-59 and must be findable
  // under either). The row passes if ANY of its corridors is selected, so two
  // selected corridors return their union and a stop on both appears once.
  if (c.corridors && c.corridors.size) {
    const on = c.rowCorridors || [];
    if (!on.some(id => c.corridors.has(id))) return false;
  }

  // Name, city, state, exit and — since v1.33.0 — the NAV CODE, so a driver
  // holding a code off a dispatch message or a fuel receipt can look the stop
  // up. A lowercased substring match, which gives DIGITS-ONLY search for free
  // and that is the point: a driver reads the number off a card, not the CVEN
  // prefix. "260" finds CVENTA260, and so do "ta260" and the whole code.
  //
  // Short numeric queries do match broadly — "20" matches every I-20 stop
  // through the exit field and every code containing 20. That is inherent to
  // substring search and is deliberately not special-cased.
  if (c.query) {
    if (!searchHaystack(row).includes(c.query)) return false;
  }

  if (c.showers && !(Number(row[COL.showers]) >= c.showersMany)) return false;
  // F or O: the outdoor variant is only two rows, but NEITHER also carries F,
  // so testing F alone would silently hide those two from a gym search.
  if (c.gym && !(hasAmenCode(row, 'F') || hasAmenCode(row, 'O'))) return false;
  if (c.restaurant && !hasAmenCode(row, 'R')) return false;

  return true;
}

module.exports = { stopPasses, hasAmenCode, searchHaystack, COL };
