// Parsing and matching for the amenity audit (tools/amenityparse.js).
//
// Runs entirely against saved fixtures in test/fixtures — no network, ever.
// The fixtures are real TA location pages with <script>, <style> and <svg>
// stripped (the JSON-LD block is kept, since the parser reads it).
//
// The three were chosen for what they exercise, not at random:
//   ta-tuscaloosa  a single recreation code, and a known-answer stop
//   ta-vero-beach  four codes at once, and the walking-trail absence
//   petro-salina   the O/F trap — "STAYFIT Outdoor Fitness Room" contains
//                  "STAYFIT Fitness Room" as a substring

const fs = require('fs');
const path = require('path');
const P = require('../tools/amenityparse.js');

let p = 0, f = 0;
const ok = (n, c, e = '') => { c ? (p++, console.log('  PASS', n)) : (f++, console.log('  FAIL', n, e)); };
const fixture = n => fs.readFileSync(path.join(__dirname, 'fixtures', n + '.html'), 'utf8');

const TUSC = fixture('ta-tuscaloosa');
const VERO = fixture('ta-vero-beach');
const SALINA = fixture('petro-salina');

console.log('=== amenity codes parse off the STAYFIT list ===');
ok('a single-amenity stop parses to one code', P.parseAmenityCodes(TUSC) === 'T', P.parseAmenityCodes(TUSC));
ok('a multi-amenity stop parses to all of them, in CODE_ORDER',
   P.parseAmenityCodes(VERO) === 'FHBT', P.parseAmenityCodes(VERO));
ok('codes come back in a stable order regardless of page order',
   P.sortCodes(['T', 'B', 'F']).join('') === 'FBT', P.sortCodes(['T', 'B', 'F']).join(''));

console.log('\n=== THE TRAP: "Outdoor Fitness Room" contains "Fitness Room" ===');
// A naive includes() scan reports BOTH O and F for an outdoor-only stop,
// which would invent a fitness room at every such location. Petro Salina
// lists the outdoor variant and nothing else.
ok('>>> an outdoor-only stop parses to O and NOT F',
   P.parseAmenityCodes(SALINA) === 'O', P.parseAmenityCodes(SALINA));
ok('  a synthetic page with BOTH listed still yields both',
   P.parseAmenityCodes('<li>STAYFIT Fitness Room</li><li>STAYFIT Outdoor Fitness Room</li>') === 'FO');
ok('  a bare fitness room alone yields F only',
   P.parseAmenityCodes('<li>STAYFIT Fitness Room</li>') === 'F');
ok('the trailing guard stops a partial-word match',
   P.parseAmenityCodes('<li>STAYFIT Horseshoe Pitching Contest</li>') === '');

console.log('\n=== laundry and the other-amenities list ===');
ok('laundry is detected from the Other Amenities list', P.parseLaundry(TUSC) === true);
ok('the full other-amenities list comes back', P.parseOtherAmenities(TUSC).includes('CAT Scale'),
   JSON.stringify(P.parseOtherAmenities(TUSC).slice(0, 4)));
ok('a page with no such list yields an empty array, not a throw',
   Array.isArray(P.parseOtherAmenities('<html><body>nothing here</body></html>')));

console.log('\n=== numeric fields ===');
ok('service bays parse off the labelled value', P.parseBays(TUSC) === 6, String(P.parseBays(TUSC)));
ok('parking parses out of the About paragraph', P.parseParking(TUSC) === 151, String(P.parseParking(TUSC)));
ok('parking handles a thousands separator',
   P.parseParking('park in one of our 1,200 truck parking spaces') === 1200);
// TA publishes no shower count anywhere; the audit reports the column as
// uncollectable rather than silently comparing nothing. Pinned so that if
// TA ever starts publishing it, this test fails and says so.
ok('>>> shower count is absent from TA pages (source limitation, not a bug)',
   P.parseShowers(TUSC) === null && P.parseShowers(VERO) === null,
   `${P.parseShowers(TUSC)} / ${P.parseShowers(VERO)}`);
ok('  but a labelled shower count would be picked up if it appeared',
   P.parseShowers('<td>Showers:</td><td>12</td>') === 12);

console.log('\n=== restaurants stay verbatim and unclassified ===');
ok('brands parse off the food cards', P.parseRestaurants(VERO).join(', ') === 'Popeyes, Subway',
   JSON.stringify(P.parseRestaurants(VERO)));
ok('an apostrophe entity is decoded, not left as &#x27;',
   P.parseRestaurants('<p class="text-right my-0"><strong>Arby&#x27;s</strong></p>')[0] === "Arby's");
ok('no sit-down / quick-serve classification leaks into the parser',
   !/sit.?down|quick.?serve/i.test(fs.readFileSync(path.join(__dirname, '..', 'tools', 'amenityparse.js'), 'utf8')
     .replace(/^\s*\/\/.*$/gm, '')));

console.log('\n=== JSON-LD gives address, coords and the site number ===');
const ld = P.parseJsonLd(TUSC);
ok('street, city and state parse', ld.street === '3501 Buttermilk Road' && ld.city === 'Tuscaloosa' && ld.state === 'AL',
   JSON.stringify(ld));
ok('the site number parses off the name', ld.siteNumber === 16, String(ld.siteNumber));
// DATA's nav code encodes the same number, which is what lets the audit
// corroborate an address match: CVENTA016 <-> "TA Tuscaloosa #0016".
ok('>>> DATA nav code yields the same site number', P.siteNumberFromNav('CVENTA016') === 16);
ok('  and works for Petro rows', P.siteNumberFromNav('CVENPE505') === 505);
ok('  a malformed nav code yields null, not NaN', P.siteNumberFromNav('') === null
   && P.siteNumberFromNav('NOTACODE') === null);

console.log('\n=== address matching ignores names entirely ===');
// Names are not comparable between sources: the fuel book files TA
// Tuscaloosa under Cottondale, and TA's own site calls the Tampa stop
// "TA Express Tampa". Matching therefore runs on street + city + state,
// and must succeed even when the two names have nothing in common.
ok('>>> a match succeeds when the DATA name differs completely from the page name',
   P.sameAddress({ street: '3501 Buttermilk Road', state: 'AL' }, ld) && ld.name === 'TA Tuscaloosa #0016',
   ld.name);
ok('abbreviations normalize both ways (N.HWY 281 vs North Highway 281)',
   P.sameAddress({ street: '8301 N.HWY 281', state: 'TX' }, { street: '8301 North Highway 281', state: 'TX' }));
ok('Street/St and Road/Rd normalize', P.sameAddress(
   { street: '2125 North 9th Street', state: 'KS' }, { street: '2125 N 9th St', state: 'KS' }));
ok('a different house number on the same street does NOT match',
   !P.sameAddress({ street: '3501 Buttermilk Road', state: 'AL' }, { street: '3600 Buttermilk Road', state: 'AL' }));
ok('a different state never matches, however similar the street',
   !P.sameAddress({ street: '100 Main St', state: 'AL' }, { street: '100 Main St', state: 'GA' }));
ok('an empty street never matches', !P.sameAddress({ street: '', state: 'AL' }, { street: '', state: 'AL' }));

console.log('\n=== pages with nothing to parse degrade, never crash ===');
ok('>>> a page with no location block parses to null (caller flags it unmatched)',
   P.parseLocation('<html><body><h1>Locations in Alabama</h1></body></html>') === null);
ok('an empty string parses to null', P.parseLocation('') === null);
ok('malformed JSON-LD parses to null rather than throwing',
   P.parseJsonLd('<script type="application/ld+json">{ not json </script>') === null);
ok('a location page with no amenity section yields empty codes, not a throw',
   P.parseAmenityCodes('<html><body>no amenities listed</body></html>') === '');

console.log('\n=== the full record hangs together ===');
const salina = P.parseLocation(SALINA);
ok('parseLocation returns every collected field',
   salina.siteNumber === 536 && salina.codes === 'O' && salina.laundry === true
   && salina.bays === 4 && typeof salina.parking === 'number' && Array.isArray(salina.restaurants),
   JSON.stringify(salina).slice(0, 200));
ok('known answers reproduce: Tuscaloosa 151 parking / 6 bays / T / laundry',
   (() => { const t = P.parseLocation(TUSC);
     return t.parking === 151 && t.bays === 6 && t.codes === 'T' && t.laundry === true; })());
ok('known answers reproduce: Vero Beach 162 parking / 6 bays / laundry',
   (() => { const v = P.parseLocation(VERO);
     return v.parking === 162 && v.bays === 6 && v.laundry === true; })());
// The brief's hand check lists a walking trail at Vero Beach. TA's page
// does not, and no page fetched during this work mentions one. Pinned as a
// source fact so a future run that finds one is noticed.
ok('>>> Vero Beach lists no walking trail on TA (contradicts the hand check)',
   !P.parseAmenityCodes(VERO).includes('W') && !/walking\s+trail/i.test(VERO));

console.log('\n=== THE PROMISE: the audit tool is read-only ===');
// This is the tool's whole design premise and the reason it departs from
// geocode.js, which does rewrite index.html. Amenity disagreements have no
// plausibility test — a code on one source and not the other can mean the
// fuel book is stale or that TA's listing is incomplete — so the human
// decides and a later brief applies the decisions. Pinned structurally so
// nobody quietly adds a write path to the app's data.
const auditSrc = fs.readFileSync(path.join(__dirname, '..', 'tools', 'amenity-audit.js'), 'utf8');
const auditCode = auditSrc.split('\n').map(l => l.replace(/^\s*\/\/.*$/, '')).join('\n');
const writes = [...auditCode.matchAll(/(?:writeFileSync|appendFileSync|createWriteStream)\s*\(\s*([A-Za-z_$][\w$]*)/g)]
  .map(m => m[1]);
ok('>>> every write target is the report or the page cache — never INDEX_PATH',
   writes.length > 0 && writes.every(w => w === 'REPORT_PATH' || w === 'f'), JSON.stringify(writes));
ok('  INDEX_PATH is only ever read', !/writeFileSync\s*\(\s*INDEX_PATH/.test(auditCode)
   && /readFileSync\(INDEX_PATH/.test(auditCode));
ok('  the parser module touches no filesystem at all',
   !/require\(['"]fs['"]\)|writeFileSync|readFileSync/.test(
     fs.readFileSync(path.join(__dirname, '..', 'tools', 'amenityparse.js'), 'utf8')));
ok('  and reaches no network',
   !/require\(['"](?:https?|net|undici)['"]\)|fetch\(/.test(
     fs.readFileSync(path.join(__dirname, '..', 'tools', 'amenityparse.js'), 'utf8')));

console.log(`\n${p} passed, ${f} failed`);
if (f) process.exitCode = 1;
