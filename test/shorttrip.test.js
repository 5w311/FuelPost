const { shortTripOptions } = require('../lib/shorttrip.js');
let p=0,f=0; const ok=(n,c,e='')=>{c?(p++,console.log('  PASS',n)):(f++,console.log('  FAIL',n,e));};
const stops=[{id:'A',name:'TA A',lat:30.3,lng:-81.6},{id:'B',name:'TA B',lat:31.9,lng:-81.3}];
const proj=[{id:'A',name:'TA A',mile:107,detour:0.2,tier:'prim'}];

console.log('=== scope: long trips are untouched ===');
ok('any required stop -> applies:false, returns nothing else',
   shortTripOptions({routeMiles:900,projected:proj,maxRange:875,plannedStopCount:2,allStops:stops}).applies === false);
ok('one required stop -> still false',
   shortTripOptions({routeMiles:900,projected:proj,maxRange:875,plannedStopCount:1,allStops:stops}).applies === false);

console.log('\n=== the target case: zero required stops ===');
let r = shortTripOptions({routeMiles:241,projected:proj,maxRange:875,startBurned:0,
  plannedStopCount:0,allStops:stops,delivery:{lat:31.94,lng:-81.30}});
ok('applies', r.applies === true);
ok('arrival range = 875 - 241', r.arrivalRange === 634, r.arrivalRange);
ok('lists the on-route stop', r.onRoute.length === 1 && r.onRoute[0].name === 'TA A');
ok('computes miles before delivery', r.onRoute[0].milesFromDelivery === 134);
ok('last chance is the final on-route stop', r.lastChance.id === 'A');
ok('finds nearest stop to delivery', r.nearestToDelivery.name === 'TA B');
ok('  and its distance is ~0 (B is at the delivery)', r.nearestToDelivery.miles < 5, r.nearestToDelivery.miles);

console.log('\n=== partial tank shrinks arrival range ===');
r = shortTripOptions({routeMiles:241,projected:proj,maxRange:875,startBurned:500,
  plannedStopCount:0,allStops:stops,delivery:{lat:31.94,lng:-81.30}});
ok('875 - 500 burned - 241 route = 134', r.arrivalRange === 134, r.arrivalRange);
ok('never goes negative', shortTripOptions({routeMiles:900,projected:[],maxRange:875,startBurned:800,
   plannedStopCount:0,allStops:stops}).arrivalRange === 0);

console.log('\n=== no network stops on the route at all ===');
r = shortTripOptions({routeMiles:120,projected:[],maxRange:875,plannedStopCount:0,
  allStops:stops,delivery:{lat:31.94,lng:-81.30}});
ok('flagged as none on route', r.noneOnRoute === true);
ok('lastChance is null, not undefined', r.lastChance === null);
ok('still reports nearest to delivery (the useful part)', r.nearestToDelivery.name === 'TA B');

console.log('\n=== defensive ===');
ok('no delivery given -> nearestToDelivery null, no throw',
   shortTripOptions({routeMiles:100,projected:[],maxRange:875,plannedStopCount:0,allStops:stops}).nearestToDelivery === null);
ok('empty stop list -> null, no throw',
   shortTripOptions({routeMiles:100,projected:[],maxRange:875,plannedStopCount:0,allStops:[],delivery:{lat:1,lng:1}}).nearestToDelivery === null);
ok('does not mutate projected', (()=>{const c=JSON.stringify(proj);
   shortTripOptions({routeMiles:241,projected:proj,maxRange:875,plannedStopCount:0,allStops:stops});
   return JSON.stringify(proj)===c;})());

console.log(`\n${p} passed, ${f} failed`);
if (f) process.exitCode = 1;
