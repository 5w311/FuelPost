// Brief 02: confirm HERE's reference flexible-polyline decoder (lib/flexible-polyline.js,
// vendored unmodified from github.com/heremaps/flexible-polyline) decodes HERE's
// published test vector. If HERE ever changes the format version, this fails loudly
// instead of silently producing coordinates in the wrong hemisphere.

const { decode, encode, ELEVATION, ABSENT } = require('../lib/flexible-polyline.js');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name, extra); }
};

// Published example from the flexible-polyline README ("## Example"):
// the coordinates below encode, at precision 5, to this exact string.
const HERE_VECTOR = 'BFoz5xJ67i1B1B7PzIhaxL7Y';
const HERE_EXPECTED = [
  [50.10228, 8.69821],
  [50.10201, 8.69567],
  [50.10063, 8.69150],
  [50.09878, 8.68752],
];

console.log('\n=== HERE published test vector ===');
const res = decode(HERE_VECTOR);

ok('header: precision 5', res.precision === 5, res.precision);
ok('header: no third dimension', res.thirdDim === ABSENT, res.thirdDim);
ok('vertex count is 4', res.polyline.length === 4, res.polyline.length);
ok('decodes to the published coordinates',
   JSON.stringify(res.polyline) === JSON.stringify(HERE_EXPECTED),
   JSON.stringify(res.polyline));

// Per-vertex, so a failure names the vertex that drifted.
HERE_EXPECTED.forEach(([lat, lng], i) => {
  ok(`  vertex ${i} = ${lat}, ${lng}`,
     res.polyline[i][0] === lat && res.polyline[i][1] === lng,
     JSON.stringify(res.polyline[i]));
});

ok('round-trips back to the published string',
   encode({ polyline: HERE_EXPECTED, precision: 5 }) === HERE_VECTOR,
   encode({ polyline: HERE_EXPECTED, precision: 5 }));

console.log('\n=== lat/lng ordering (not lng/lat) ===');
ok('first value is latitude ~50 (Frankfurt), not longitude ~8',
   res.polyline[0][0] > 49 && res.polyline[0][0] < 51, res.polyline[0][0]);
ok('second value is longitude ~8', res.polyline[0][1] > 8 && res.polyline[0][1] < 9,
   res.polyline[0][1]);

// HERE routing can return elevation-bearing polylines. index.html builds its
// [[lat,lng],...] array by taking only pts[i][0] and pts[i][1] — prove that
// stays correct when a third dimension is present.
console.log('\n=== third dimension does not shift lat/lng ===');
{
  const with3d = [
    [50.10228, 8.69821, 10],
    [50.10201, 8.69567, 20],
    [50.10063, 8.69150, 30],
  ];
  const enc3d = encode({ polyline: with3d, precision: 5, thirdDim: ELEVATION, thirdDimPrecision: 0 });
  const dec3d = decode(enc3d);
  ok('third dim flag round-trips as ELEVATION', dec3d.thirdDim === ELEVATION, dec3d.thirdDim);
  ok('each vertex carries 3 values', dec3d.polyline.every(p => p.length === 3),
     JSON.stringify(dec3d.polyline[0]));
  const latLng = dec3d.polyline.map(p => [p[0], p[1]]);
  ok('taking [0],[1] still yields the right lat/lng pairs',
     JSON.stringify(latLng) === JSON.stringify(with3d.map(p => [p[0], p[1]])),
     JSON.stringify(latLng));
}

console.log('\n=== realistic route shape ===');
{
  // A long polyline decodes to the same vertex count it was built from — guards
  // against truncation on the multi-thousand-vertex polylines HERE returns for
  // cross-country truck routes.
  const long = [];
  for (let i = 0; i < 2500; i++) long.push([35 + i * 0.001, -90 - i * 0.002]);
  const dec = decode(encode({ polyline: long, precision: 5 }));
  ok('2500-vertex polyline survives round-trip', dec.polyline.length === 2500, dec.polyline.length);
  ok('  last vertex intact',
     Math.abs(dec.polyline[2499][0] - long[2499][0]) < 1e-5 &&
     Math.abs(dec.polyline[2499][1] - long[2499][1]) < 1e-5,
     JSON.stringify(dec.polyline[2499]));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
