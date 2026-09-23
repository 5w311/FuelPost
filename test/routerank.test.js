const { rankRouteOptions, dedupeOptions } = require('../lib/routerank.js');
let p=0,f=0; const ok=(n,c,e='')=>{c?(p++,console.log('  PASS',n)):(f++,console.log('  FAIL',n,e));};
const opt = (label, miles, okFlag, stops, detour=8, ids=null) => ({
  label, routeMiles: miles, poly: [],
  result: { ok: okFlag, detourMax: detour, finalLegMiles: 10,
            gap: okFlag ? null : {fromMile:1,deadMile:2},
            plan: (ids || Array.from({length:stops},(_,i)=>'S'+i)).map(id=>({id, mile:100, name:id})) }
});

console.log('=== THE CORE RULE: a route that works beats a shorter one that gaps ===');
let r = rankRouteOptions([ opt('short-but-gaps',1400,false,1), opt('longer-works',1550,true,2) ]);
ok('completable route ranks first even though it is 150mi longer', r[0].label === 'longer-works');
ok('the gapped route is still listed, not dropped', r.length === 2 && r[1].label === 'short-but-gaps');

console.log('\n=== among working routes: fewer stops wins ===');
r = rankRouteOptions([ opt('three-stops',1500,true,3), opt('two-stops',1560,true,2) ]);
ok('fewer fuel stops wins over 60 fewer miles', r[0].label === 'two-stops');

console.log('\n=== equal stops: tighter detour tier wins ===');
r = rankRouteOptions([ opt('wide-detour',1500,true,2,30), opt('tight-detour',1520,true,2,8) ]);
ok('8mi tier beats 30mi tier at equal stop count', r[0].label === 'tight-detour');

console.log('\n=== equal stops and detour: shortest wins ===');
r = rankRouteOptions([ opt('longer',1600,true,2,8), opt('shorter',1500,true,2,8) ]);
ok('shortest breaks the final tie', r[0].label === 'shorter');

console.log('\n=== all gapped: shortest first, order still deterministic ===');
r = rankRouteOptions([ opt('g-long',1700,false,0), opt('g-short',1500,false,0) ]);
ok('shortest gapped route listed first', r[0].label === 'g-short');

console.log('\n=== stability / purity ===');
const input = [ opt('a',1500,true,2), opt('b',1400,true,2) ];
const copy = JSON.stringify(input);
rankRouteOptions(input);
ok('does not mutate its input array', JSON.stringify(input) === copy);
ok('single option returns unchanged', rankRouteOptions([opt('only',1,true,0)]).length === 1);
ok('empty input does not throw', rankRouteOptions([]).length === 0);

console.log('\n=== dedupe near-identical alternatives ===');
const a1 = opt('A',1500,true,2,8,['TA1','TA2']);
const a2 = opt('B',1505,true,2,8,['TA1','TA2']);   // 0.3% longer, same stops
const a3 = opt('C',1800,true,2,8,['TA9','TA8']);   // clearly different
let d = dedupeOptions([a1,a2,a3]);
ok('collapses a 0.3%-different route with identical fuel stops', d.length === 2);
ok('keeps the genuinely different route', d.some(o => o.label === 'C'));
ok('keeps the first of the duplicate pair', d[0].label === 'A');
const b1 = opt('X',1500,true,2,8,['TA1','TA2']);
const b2 = opt('Y',1505,true,2,8,['TA3','TA4']);   // same length, DIFFERENT stops
ok('same length but different fuel stops is NOT a duplicate', dedupeOptions([b1,b2]).length === 2);

console.log(`\n${p} passed, ${f} failed`);
