const { haversine, projectStops, planFuel, cumulativeMiles } = require('../lib/fuelplan.js');
let pass = 0, fail = 0;
const ok = (name, cond, extra='') => { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name, extra); } };
const near = (a,b,tol) => Math.abs(a-b) <= tol;

console.log('\n=== haversine sanity ===');
// LA to NYC ~2445 mi great circle
ok('LAX->JFK ~2450mi', near(haversine(33.9425,-118.4081, 40.6413,-73.7781), 2450, 30),
   haversine(33.9425,-118.4081,40.6413,-73.7781).toFixed(0));
ok('zero distance', haversine(35,-90,35,-90) === 0);
// 1 degree latitude ~69 mi
ok('1 deg lat ~69mi', near(haversine(35,-90,36,-90), 69, 1));

console.log('\n=== cumulativeMiles ===');
const line = [[35,-90],[36,-90],[37,-90]];
const cum = cumulativeMiles(line);
ok('starts at 0', cum[0] === 0);
ok('monotonic increasing', cum[1] > cum[0] && cum[2] > cum[1]);
ok('~138mi total', near(cum[2], 138, 2), cum[2].toFixed(1));

console.log('\n=== projectStops: detour filter + mile marker ===');
// straight north-south route along lng -90, 35N to 40N (~345 mi)
const poly = [];
for (let i = 0; i <= 50; i++) poly.push([35 + i*0.1, -90]);
const routeMiles = cumulativeMiles(poly).at(-1);
const stops = [
  { id:'ON_ROUTE_MID', lat:37.5, lng:-90.0 },      // dead on the line, halfway
  { id:'NEAR_3MI',     lat:36.0, lng:-89.945 },    // ~3 mi east
  { id:'FAR_40MI',     lat:38.0, lng:-89.3 },      // ~38 mi east — should be dropped
  { id:'OFF_ROUTE',    lat:44.0, lng:-80.0 },      // nowhere near
];
const proj = projectStops(poly, stops, 5);
ok('drops far + off-route stops', proj.length === 2, JSON.stringify(proj.map(p=>p.id)));
ok('keeps on-route + near', proj.map(p=>p.id).sort().join()==='NEAR_3MI,ON_ROUTE_MID');
const mid = proj.find(p=>p.id==='ON_ROUTE_MID');
ok('midpoint mile ~half route', near(mid.mile, routeMiles/2, 5), `${mid.mile.toFixed(1)} vs ${(routeMiles/2).toFixed(1)}`);
ok('on-route detour ~0', mid.detour < 0.5, mid.detour.toFixed(2));
const near3 = proj.find(p=>p.id==='NEAR_3MI');
ok('3mi stop detour ~3', near(near3.detour, 3, 0.7), near3.detour.toFixed(2));
ok('sorted by mile', proj[0].mile < proj[1].mile);

console.log('\n=== planFuel: core cases ===');
// synthetic corridor: 2000 mi, a stop every 100 mi
const grid = []; for (let m = 100; m <= 1900; m += 100) grid.push({ id:'S'+m, mile:m, detour:1, tier:'prim' });

let r = planFuel(2000, grid, 800);
ok('2000mi @800 range -> 2 stops', r.plan.length === 2, JSON.stringify(r.plan.map(p=>p.mile)));
ok('  picks furthest each leg (800, 1600)', r.plan[0].mile===800 && r.plan[1].mile===1600);
ok('  final leg within range', r.finalLegMiles <= 800, r.finalLegMiles);
ok('  ok=true', r.ok === true);

r = planFuel(300, grid, 800);
ok('short trip -> zero stops', r.plan.length === 0 && r.ok);

r = planFuel(800, grid, 800);
ok('trip exactly == range -> zero stops', r.plan.length === 0 && r.ok);

r = planFuel(801, grid, 800);
ok('trip 1mi over range -> 1 stop', r.plan.length === 1);

console.log('\n=== planFuel: startBurned (partial tank at origin) ===');
r = planFuel(1000, grid, 800, 0);
ok('full tank, 1000mi -> 1 stop', r.plan.length === 1 && r.plan[0].mile === 800);
r = planFuel(1000, grid, 800, 500);
ok('300mi left at start -> first stop <=300', r.plan[0].mile <= 300, r.plan[0].mile);
ok('  picks furthest reachable (300)', r.plan[0].mile === 300);

console.log('\n=== planFuel: GAP detection (the dangerous case) ===');
// stops stop at mile 500, then nothing until 1500 — a 1000mi desert
const gappy = [{id:'A',mile:200,detour:1},{id:'B',mile:500,detour:1},{id:'C',mile:1500,detour:1}];
r = planFuel(2000, gappy, 800);
ok('detects unreachable gap', r.ok === false && r.gap !== null, JSON.stringify(r));
ok('  gap starts at last reachable stop (500)', r.gap.fromMile === 500, JSON.stringify(r.gap));
ok('  reports dead mile 1300', r.gap.deadMile === 1300, JSON.stringify(r.gap));
ok('  returns partial plan up to the gap', r.plan.length === 1 && r.plan[0].mile === 500);

// no stops at all on a long route
r = planFuel(2000, [], 800);
ok('no stops at all -> gap from mile 0', r.ok === false && r.gap.fromMile === 0);

console.log('\n=== planFuel: leg mileage accounting ===');
r = planFuel(2000, grid, 800);
const legs = r.plan.map(p=>p.legMiles);
ok('leg miles correct (800, 800)', legs[0]===800 && legs[1]===800, JSON.stringify(legs));
ok('legs + final == route', near(legs.reduce((a,b)=>a+b,0) + r.finalLegMiles, 2000, 0.5));
ok('no leg exceeds max range', r.plan.every(p=>p.legMiles<=800) && r.finalLegMiles<=800);

console.log('\n=== planFuel: irregular spacing (realistic) ===');
const irr = [{id:'a',mile:145},{id:'b',mile:390},{id:'c',mile:612},{id:'d',mile:790},
             {id:'e',mile:1105},{id:'f',mile:1240},{id:'g',mile:1490}].map(s=>({...s,detour:2}));
r = planFuel(1600, irr, 700);
ok('irregular: all legs within range', r.ok && r.plan.every(p=>p.legMiles<=700) && r.finalLegMiles<=700,
   JSON.stringify({stops:r.plan.map(p=>p.mile), final:r.finalLegMiles}));
ok('irregular: minimal stop count (2)', r.plan.length === 2, JSON.stringify(r.plan.map(p=>p.mile)));

console.log(`\n${pass} passed, ${fail} failed`);


// appended: cluster tiebreak
console.log('\n=== planFuel: cluster tiebreak (co-located stops) ===');
{
  let p2=0,f2=0; const ok2=(n,c,e='')=>{c?(p2++,console.log('  PASS',n)):(f2++,console.log('  FAIL',n,e));};
  const cluster = [
    {id:'far_detour',  mile:706.4, detour:5.3, tier:'prim'},
    {id:'near_detour', mile:705.7, detour:1.2, tier:'prim'},
    {id:'early',       mile:400.0, detour:0.5, tier:'excl'},
  ];
  const r = planFuel(950, cluster, 800);
  ok2('picks lower-detour of the co-located pair', r.plan[0].id==='near_detour', r.plan[0].id);
  ok2('still only 1 stop (count unchanged)', r.plan.length===1);
  // stops >15mi apart are NOT clustered — true furthest must win
  const spread = [{id:'a',mile:600,detour:0.1},{id:'b',mile:790,detour:6.0}];
  const r2 = planFuel(1500, spread, 800);
  ok2('does NOT sacrifice range for detour beyond cluster', r2.plan[0].id==='b', r2.plan[0].id);
  console.log(`  ${p2} passed, ${f2} failed`);
  if(f2) process.exitCode = 1;
}
