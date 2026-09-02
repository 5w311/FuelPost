const { haversine, projectStops, planFuel, cumulativeMiles } = require('../lib/fuelplan.js');
// The reserve reaches planFuel as MILES; the tank scale that produces those
// miles lives in the gauge. Importing the real converter here rather than
// hardcoding 0/150/300/450 means this file fails if the two ever disagree,
// which is the whole reason planFuel takes miles instead of ticks.
const { arrivalReserveMiles: gaugeArrivalMiles, RESERVE_TICKS: FLOOR_TICK,
        ARRIVAL_TOGGLE_TICK: SWITCH_TICK } = require('../lib/gauge.js');
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

// ===================== ARRIVAL RESERVE (v1.27.0) =====================
// The planner gained a fifth parameter: how many miles of unused range the
// driver wants LEFT when they get there. It works by planning against a
// destination that far beyond the real one.

console.log('\n=== arrival reserve: THE REGRESSION GUARD — 0 changes nothing ===');
// This is the most important block in this file. 1/8 maps to a reserve of 0
// (the bottom eighth was ALWAYS held back), so every plan a driver has ever
// got must come back byte for byte. Run every fixture above through both call
// shapes and deep-compare: not just stop counts, but legMiles, finalLegMiles,
// gap objects and key order. If this ever fails, existing plans changed and
// nobody asked for that.
{
  const fixtures = [
    ['grid 2000/800',        [2000, grid, 800]],
    ['grid exact 800',       [800, grid, 800]],
    ['grid 801',             [801, grid, 800]],
    ['startBurned 500',      [1000, grid, 800, 500]],
    ['gappy desert',         [2000, gappy, 800]],
    ['no stops at all',      [2000, [], 800]],
    ['irregular 1600/700',   [1600, irr, 700]],
    ['short 300/800',        [300, grid, 800]],
  ];
  let same = 0;
  for (const [name, args] of fixtures) {
    const before = JSON.stringify(planFuel(...args));
    const after  = JSON.stringify(planFuel(...args, 0));
    // and the value the app actually passes at the default tick
    const viaGauge = JSON.stringify(planFuel(...args, gaugeArrivalMiles(1)));
    if (before === after && before === viaGauge) same++;
    else ok(`${name}: identical with a zero reserve`, false, `\n   was: ${before}\n   now: ${after}`);
  }
  ok(`all ${fixtures.length} existing fixtures plan identically at 1/8`, same === fixtures.length,
     `${same}/${fixtures.length}`);
}

console.log('\n=== arrival reserve: THE REPORTED CASE — a route that planned zero stops ===');
// 870 mi on the old 875 default planned NOTHING and put the driver at the
// delivery on the bottom reserve. The only fix available was lying to the app
// about the truck. Now the reserve is the honest way to say it.
{
  const dense = [];
  for (let m = 100; m <= 860; m += 20) dense.push({ id: 'm' + m, mile: m, detour: 1 });
  const zero = planFuel(870, dense, 875, 0, 0);
  ok('at the bare floor (0 reserve) it still plans zero stops — the reported behaviour',
     zero.ok && zero.plan.length === 0, JSON.stringify(zero.plan.map(s => s.mile)));
  // The switch's own tick, read from the gauge rather than written as a
  // number: it is one tick above the floor by construction, and v1.40.0 moved
  // it from 1/4 to 3/8 when the floor rose. Hardcoding "2" here would have
  // asserted a zero reserve and passed for the wrong reason.
  const quarter = planFuel(870, dense, 875, 0, gaugeArrivalMiles(SWITCH_TICK));
  ok('>>> one tick above the floor, a stop appears before delivery',
     quarter.ok && quarter.plan.length === 1,
     JSON.stringify({ ok: quarter.ok, miles: quarter.plan.map(s => s.mile) }));
  ok('  and the floor tick itself asks for nothing, so it plans nothing',
     planFuel(870, dense, 875, 0, gaugeArrivalMiles(FLOOR_TICK)).plan.length === 0);
  const half = planFuel(870, dense, 875, 0, gaugeArrivalMiles(4));
  ok('>>> at 1/2 as well', half.ok && half.plan.length === 1,
     JSON.stringify({ ok: half.ok, miles: half.plan.map(s => s.mile) }));
  // The reserve is a THRESHOLD, not a dial on the arrival amount, and this is
  // where that becomes visible: the planner still takes the FURTHEST stop it
  // can reach, so the switch tick and 1/2 both land on mile 860 — the last —
  // and both arrive with the same 865 mi unused. Raising the setting further
  // does not push the stop earlier; it only decides WHETHER a stop is needed
  // at all. Asserting a strictly rising arrival here would be asserting a
  // fewest-stops planner behaves like a smoothest-fuel-curve one, which it is
  // not and is not meant to be.
  const left = r2 => 875 - r2.finalLegMiles;
  ok('  crossing the threshold is what changes the arrival, and it is a jump',
     left(zero) === 5 && left(quarter) === 865 && left(half) === 865,
     JSON.stringify([left(zero), left(quarter), left(half)]));
  ok('  every setting is met or beaten, which is the actual contract',
     left(zero) >= gaugeArrivalMiles(FLOOR_TICK) && left(quarter) >= gaugeArrivalMiles(SWITCH_TICK)
     && left(half) >= gaugeArrivalMiles(4),
     JSON.stringify([left(quarter), gaugeArrivalMiles(SWITCH_TICK), left(half), gaugeArrivalMiles(4)]));
}

console.log('\n=== arrival reserve: the extra-mileage arithmetic is exact ===');
// One stop at mile 500 and nothing else; a 1000 mi route with 600 mi range.
// The loop must stop planning exactly when maxRange - finalLeg >= reserve.
{
  // Reserve in miles for each tick, straight off the tank scale:
  // (t - RESERVE_TICKS) * 150, and RESERVE_TICKS is 2 since v1.40.0 — so the
  // bottom TWO ticks both ask for nothing and range starts at 3/8.
  const expect = { 1: 0, 2: 0, 3: 150, 4: 300 };
  for (const t of [1, 2, 3, 4]) {
    ok(`tick ${t} -> ${expect[t]} mi of reserve`, gaugeArrivalMiles(t) === expect[t],
       String(gaugeArrivalMiles(t)));
  }
  // A route of exactly 700 with 700 of range needs no stop at 1/8...
  const s = [{ id: 'mid', mile: 400, detour: 1 }];
  ok('700mi/700 range at 1/8 -> zero stops', planFuel(700, s, 700, 0, 0).plan.length === 0);
  // ...but at 1/4 the target becomes 825, so it must plan the mile-400 stop.
  const q = planFuel(700, s, 700, 0, 125);
  ok('700mi/700 range at 1/4 -> the mile-400 stop', q.ok && q.plan.length === 1 && q.plan[0].mile === 400,
     JSON.stringify(q.plan.map(x => x.mile)));
  ok('  and it arrives with 400 mi unused, comfortably over the 125 asked',
     q.finalLegMiles === 300 && 700 - q.finalLegMiles === 400, JSON.stringify(q));
  // Boundary: reserve exactly equal to the slack must NOT force a stop.
  ok('reserve exactly equal to the leftover range plans nothing (>= not >)',
     planFuel(600, s, 700, 0, 100).plan.length === 0);
  ok('one mile more of reserve does force the stop',
     planFuel(600, s, 700, 0, 101).plan.length === 1);
}

console.log('\n=== arrival reserve: with a non-zero startBurned ===');
// Both ends bind at once: less in the tank leaving, more wanted on arrival.
{
  const dense = [];
  for (let m = 100; m <= 900; m += 50) dense.push({ id: 'm' + m, mile: m, detour: 1 });
  const base = planFuel(1000, dense, 800, 300, 0);
  const withRes = planFuel(1000, dense, 800, 300, 375);
  ok('startBurned still caps the FIRST leg regardless of reserve',
     base.plan[0].mile <= 500 && withRes.plan[0].mile <= 500,
     JSON.stringify([base.plan[0].mile, withRes.plan[0].mile]));
  // 300 already burned leaves 500 of reach, so both plans open with the mile
  // 500 stop. The reserve then adds a SECOND stop the base plan never needed:
  // proof the two settings act on opposite ends of the route and compose.
  ok('the reserve adds a stop at the END, leaving the first one alone',
     withRes.plan.length === base.plan.length + 1
     && withRes.plan[0].mile === base.plan[0].mile, JSON.stringify(
       { base: base.plan.map(s => s.mile), withRes: withRes.plan.map(s => s.mile) }));
  ok('  every leg still respects the range',
     withRes.ok && withRes.plan.every(s => s.legMiles <= 800) && withRes.finalLegMiles <= 800);
  ok('  and the 375 mi reserve is met at the far end',
     800 - withRes.finalLegMiles >= 375, String(800 - withRes.finalLegMiles));
}

console.log('\n=== arrival reserve: unmeetable is a SHORTFALL, not a dry gap ===');
// The failure mode that must not be mislabelled. Here the last stop sits at
// mile 300 of a 900 mi route: the truck reaches the delivery comfortably, so
// nothing is "dry" — it simply cannot arrive holding 375 mi in reserve.
{
  const far = [{ id: 'only', mile: 300, detour: 1 }];
  const r3 = planFuel(900, far, 800, 0, 375);
  ok('reports not-ok rather than a silently-worse plan', r3.ok === false);
  ok('>>> flagged as a reserve shortfall', r3.gap.reserveShortfall === true, JSON.stringify(r3.gap));
  ok('  the dead mile is at or past the destination — proof nothing is stranded',
     r3.gap.deadMile >= 900, JSON.stringify(r3.gap));
  ok('  the partial plan is still a real, drivable plan',
     r3.plan.length === 1 && r3.plan[0].mile === 300);
  ok('  and the truck genuinely reaches the delivery from the last stop',
     800 >= 900 - r3.plan[0].mile, '800 range vs ' + (900 - r3.plan[0].mile) + ' mi remaining');
  // The contrast case: a REAL dry gap must not wear the shortfall flag.
  const dry = planFuel(2000, gappy, 800, 0, 375);
  ok('>>> a genuine dry gap is NOT flagged as a shortfall',
     dry.ok === false && dry.gap.reserveShortfall === undefined, JSON.stringify(dry.gap));
  ok('  and its dead mile falls short of the destination, as it always did',
     dry.gap.deadMile < 2000, JSON.stringify(dry.gap));
  // And with no reserve asked for, the flag can never appear at all.
  ok('the flag is absent from every zero-reserve gap',
     planFuel(2000, gappy, 800).gap.reserveShortfall === undefined &&
     planFuel(2000, [], 800).gap.reserveShortfall === undefined);
}

console.log('\n=== arrival reserve: defensive ===');
ok('a negative reserve is treated as none, never as extra reach',
   JSON.stringify(planFuel(2000, grid, 800, 0, -500)) === JSON.stringify(planFuel(2000, grid, 800)));
ok('an omitted reserve is the same as zero',
   JSON.stringify(planFuel(1600, irr, 700)) === JSON.stringify(planFuel(1600, irr, 700, 0, 0)));

console.log('\n=== the arrival reserve is a MINIMUM, never a target to land on (v1.42.0) ===');
// v1.38.0-v1.41.0 re-picked the final stop to land the arrival CLOSEST to a
// target, counting an arrival above it as just as wrong as one below. On a
// real Dallas->Carteret run that cost the driver fuel: at 700 mi range the
// switch ON arrived with 350 mi of range where OFF arrived with 566, and at
// 900, where one stop covers the run, it could not re-pick at all and did
// nothing. Both faults are gone with the target; what replaces them is the
// invariant below, which is the property a driver actually cares about.
{
  const dense = [];
  for (let m = 100; m <= 900; m += 100) dense.push({ id: 'd' + m, name: 'd' + m, mile: m, detour: 2 });
  const arrival = (r, range) => range - r.finalLegMiles;

  // THE INVARIANT. Asking for fuel at delivery may add a stop or push one
  // later; it may never leave the driver with LESS than not asking. Swept
  // across routes, ranges and reserves rather than asserted on one fixture,
  // because the case that broke it was one nobody had thought to try.
  let worse = null, moved = 0;
  for (const routeMiles of [500, 700, 900, 1100, 1300, 1500]) {
    for (const range of [500, 700, 900]) {
      for (const ask of [150, 300, 450]) {
        const off = planFuel(routeMiles, dense, range, 0, 0);
        const on = planFuel(routeMiles, dense, range, 0, ask);
        if (!off.ok || !on.ok) continue;
        if (arrival(on, range) < arrival(off, range) - 0.001) {
          worse = { routeMiles, range, ask, off: arrival(off, range), on: arrival(on, range) };
        }
        if (arrival(on, range) > arrival(off, range) + 0.001) moved++;
      }
    }
  }
  ok('>>> asking for fuel at delivery NEVER arrives with less than not asking',
     worse === null, JSON.stringify(worse));
  ok('  and on some of those it arrives with more — the switch does something',
     moved > 0, String(moved));

  // THE REPORTED CASE, in miniature: one stop covers the run, so the old
  // re-pick had nothing it was allowed to touch and the switch was inert.
  // As a minimum it adds the late stop and the arrival jumps.
  {
    // The shape that matters, taken from the real route: stops cluster early,
    // then thin out, so the furthest stop reachable from the shipper still
    // leaves a long run to the delivery. `dense` cannot show it — its stops
    // reach far enough that one hop already arrives full.
    const sparse = [];
    for (let m = 100; m <= 800; m += 100) sparse.push({ id: 'e' + m, name: 'e' + m, mile: m, detour: 2 });
    for (const m of [1000, 1100, 1200, 1300]) sparse.push({ id: 'l' + m, name: 'l' + m, mile: m, detour: 2 });
    const route = 1500, range = 900;
    const off = planFuel(route, sparse, range, 0, 0);
    const on = planFuel(route, sparse, range, 0, 300);
    ok('>>> the Max case: OFF plans one stop and arrives low',
       off.plan.length === 1 && arrival(off, range) < 300,
       JSON.stringify([off.plan.map(s => s.mile), arrival(off, range)]));
    ok('>>> ON adds a later stop and clears the asked minimum',
       on.plan.length === 2 && arrival(on, range) >= 300,
       JSON.stringify([on.plan.map(s => s.mile), arrival(on, range)]));
    ok('  and the added stop is the FURTHEST reachable, so the arrival is as full as it gets',
       on.plan[on.plan.length - 1].mile === 1300,
       JSON.stringify(on.plan.map(s => s.mile)));
    ok('  the switch bought real fuel here: 200 mi at delivery becomes 700',
       Math.round(arrival(off, range)) === 200 && Math.round(arrival(on, range)) === 700,
       JSON.stringify([arrival(off, range), arrival(on, range)]));
  }

  // The minimum is met or beaten, never merely approached — the contract the
  // shortfall flag exists to report when it cannot be.
  for (const ask of [150, 300, 450]) {
    const r = planFuel(1000, dense, 700, 0, ask);
    ok(`  a ${ask} mi ask is met or beaten (${Math.round(arrival(r, 700))} mi)`,
       r.ok && arrival(r, 700) >= ask - 0.001, JSON.stringify(r.plan.map(s => s.mile)));
  }

  // Old call shapes are untouched: a plain 4-arg call and an explicit zero
  // reserve are the same plan, and a negative reserve cannot add reach.
  const a = planFuel(1000, dense, 700, 0);
  const b = planFuel(1000, dense, 700, 0, 0);
  ok('>>> a 4-arg call and an explicit zero reserve are identical',
     JSON.stringify(a) === JSON.stringify(b));
  ok('>>> a negative reserve cannot hand the planner extra reach',
     JSON.stringify(planFuel(1000, dense, 700, 0, -50)) === JSON.stringify(b));
  // Zero-stop trips stay zero-stop when the reserve is already satisfied.
  const short = planFuel(400, dense, 700, 0, 300);
  ok('>>> a zero-stop trip that already clears the minimum stays zero-stop',
     short.ok && short.plan.length === 0, JSON.stringify(short.plan));
  // ...but a zero-stop trip that does NOT clear it gains one, which is the
  // whole point of the switch and the case v1.27.0 was built for.
  const forced = planFuel(650, dense, 700, 0, 300);
  ok('>>> a zero-stop trip that falls short gains a stop',
     forced.ok && forced.plan.length === 1 && arrival(forced, 700) >= 300,
     JSON.stringify([forced.plan.map(s => s.mile), arrival(forced, 700)]));
}

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
