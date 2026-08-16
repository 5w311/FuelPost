// Which highway corridors does a stop sit on? Pure string work over the DATA
// exit field — no DOM, no network.
//
// WHY THIS IS DERIVED AND NOT STORED. A corridor column in DATA would mean
// touching FIELD_COUNT, tools/geocode.js and every row-shape test, and it
// would be a second copy of something the exit field already says. Derivation
// keeps one source of truth; the cost is that this parser has to be careful,
// which is what the rest of this comment is about.
//
// WHY ONLY INTERSTATES ARE PARSED. The exit field is human-entered and uses at
// least four separator conventions:
//
//   "I-20/I-59, Exit 77"                 slash
//   "I-95, SR 261, Exit 119"             comma
//   "I-35 & US 77, Exit 471"             ampersand
//   "I-40, Exit 280 / I-55, Exit 4"      a full repeat of the whole pattern
//
// A comma-splitting parser reads "Exit 119" as a corridor. Worse, the
// route-type prefixes cannot be trusted: GA4 reads "Hwy 36", which is Georgia
// SR 36, not US 36 — normalising it produces a road that does not exist.
// "I-" followed by digits, on the other hand, is unambiguous in every row, so
// that is the only pattern parsed. Everything else is hand-mapped below.
//
// The E/W suffix folds into the parent route. TX7 reads "I-35E, Exit 374" and
// OK2 reads "I-40E/I-35, Exit 127 / I-40W, Exit 154"; a driver filtering I-35
// or I-40 expects to find both. (The brief for this feature called TX7 the
// only suffixed row — OK2 is a second one, and folding handles it for free.)
// The station sheet still shows the literal exit text, so the distinction the
// driver actually needs at the ramp is never lost.
const INTERSTATE_RE = /\bI-(\d+)[EW]?\b/g;

function corridorsForExit(exit) {
  const out = [];
  for (const m of String(exit == null ? '' : exit).matchAll(INTERSTATE_RE)) {
    const c = 'I-' + m[1];
    if (!out.includes(c)) out.push(c);   // "I-40E ... I-40W" is one corridor
  }
  return out;
}

// The three stops whose ONLY corridor is not an interstate. Same shape and
// spirit as CLOSED_STOP_IDS: a short explicit map, kept next to the parser
// that would otherwise have to guess, with the reason written down.
//
// Parsing was declined for these because the field says "Hwy" where the road
// is signed "US" (TX6 "Hwy 59, Exit 522E", TX14 "Hwy. 281, Exit FM 2812"), and
// because CA1's "SR 99" is a state route whose prefix happens to be right in a
// field where that prefix is NOT reliable elsewhere. Three hand-written pairs
// are cheaper and more honest than a normaliser that is wrong on GA4.
//
// Tests assert every id here exists in DATA, so a renumbered or deleted row
// cannot leave a dangling override.
const CORRIDOR_OVERRIDES = {
  CA1:  'SR 99',    // TA Livingston   — "SR 99, Exit 203"
  TX6:  'US 59',    // TA Ganado       — "Hwy 59, Exit 522E"
  TX14: 'US 281'    // TA Edinburg     — "Hwy. 281, Exit FM 2812"
};

// SECONDARY non-interstate designations are deliberately NOT corridors.
// Seven stops carry one — GA1/GA3 US441, GA4 Hwy 36, IN3 SR 50, OH2 US 42,
// SC4 SR 261, TX15 US 77 — and every one of them is already reachable through
// its interstate. Giving each a dropdown entry would add seven single-stop
// rows to a control whose whole job is to be scannable. Text search still
// matches the exit field verbatim, so a driver looking for SR 261 finds SC4.
function corridorsForRow(id, exit) {
  const parsed = corridorsForExit(exit);
  if (parsed.length) return parsed;
  const mapped = CORRIDOR_OVERRIDES[id];
  return mapped ? [mapped] : [];
}

// Interstates in NUMERIC order, then everything else alphabetically after
// them. Lexical order puts I-10 before I-4, which is wrong for the one thing
// this control is scanned for: a route number.
function compareCorridors(a, b) {
  const na = /^I-(\d+)$/.exec(a), nb = /^I-(\d+)$/.exec(b);
  if (na && nb) return +na[1] - +nb[1];
  if (na) return -1;      // interstates first
  if (nb) return 1;
  return a.localeCompare(b);
}

// Every corridor in the network, ordered for the dropdown, with how many stops
// sit on each. rows is [[id, exit], ...].
function corridorIndex(rows) {
  const counts = new Map();
  for (const [id, exit] of rows) {
    for (const c of corridorsForRow(id, exit)) counts.set(c, (counts.get(c) || 0) + 1);
  }
  return [...counts.keys()].sort(compareCorridors).map(c => ({ corridor: c, count: counts.get(c) }));
}

module.exports = {
  INTERSTATE_RE, CORRIDOR_OVERRIDES,
  corridorsForExit, corridorsForRow, compareCorridors, corridorIndex
};
