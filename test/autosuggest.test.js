const S = require('../lib/autosuggest.js');
let pass = 0, fail = 0;
const ok = (n, c, e = '') => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.log('  FAIL', n, e); } };

console.log('=== query threshold ===');
ok('too short, no fire', S.shouldFireQuery('20') === false);
ok('empty, no fire', S.shouldFireQuery('') === false);
ok('whitespace only, no fire', S.shouldFireQuery('   ') === false);
ok('3 chars fires', S.shouldFireQuery('200') === true);
ok('real partial address fires', S.shouldFireQuery('2000 Dist') === true);
ok('non-string input does not throw', S.shouldFireQuery(undefined) === false);

console.log('\n=== candidateFromSuggestItem — shapes based on HERE\'s documented examples ===');

// Documented example shape: resultType "place", position present directly
const placeItem = {
  title: 'Resort Mark Brandenburg',
  id: 'here:pds:place:276u33j5-6ad49082b9ed4e7bbb88c011d7e8babe',
  resultType: 'place',
  address: { label: 'Resort Mark Brandenburg, An der Seepromenade 20, 16816 Neuruppin, Germany' },
  position: { lat: 52.924, lng: 12.81321 }
};
const c1 = S.candidateFromSuggestItem(placeItem);
ok('place-type item: usable immediately, no lookup needed', c1.needsLookup === false);
ok('place-type item: position carried through correctly', c1.lat === 52.924 && c1.lng === 12.81321);
ok('place-type item: uses address.label, not raw title', c1.label === placeItem.address.label);

// Documented example shape: resultType "categoryQuery", no position, has an href for follow-up
const categoryItem = {
  title: 'restaurant',
  id: 'here:cm:ontology:restaurant',
  resultType: 'categoryQuery',
  href: 'https://autosuggest.search.hereapi.com/v1/discover?q=restaurant...'
};
const c2 = S.candidateFromSuggestItem(categoryItem);
ok('categoryQuery item: flagged as needing lookup, not treated as ready', c2.needsLookup === true);
ok('categoryQuery item: falls back to title as label (no address.label present)', c2.label === 'restaurant');

// A plain address-type result with no address.label at all (edge case)
const bareItem = { title: '123 Main St', id: 'here:af:x', position: { lat: 40.1, lng: -75.2 } };
const c3 = S.candidateFromSuggestItem(bareItem);
ok('item with position but no address.label falls back to title', c3.label === '123 Main St');
ok('still usable without needing lookup', c3.needsLookup === false);

console.log('\n=== malformed / unexpected input does not throw ===');
ok('null item returns null, not a throw', S.candidateFromSuggestItem(null) === null);
ok('item missing title returns null', S.candidateFromSuggestItem({ id: 'x' }) === null);
ok('empty object returns null', S.candidateFromSuggestItem({}) === null);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
