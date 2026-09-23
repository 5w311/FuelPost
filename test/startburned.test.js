// Brief 02 (revised): the RANGE AT PICKUP input maps to planFuel's startBurned as
//   startBurned = max(0, maxRange - rangeAtPickup)
// Tests the formula itself and the plan behaviour it drives. The clamp matters:
// a negative startBurned would hand the planner more reach than the truck has.

const { planFuel } = require('../lib/fuelplan.js');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name, extra); }
};

// Mirrors readRanges() in index.html.
const startBurnedFor = (maxRange, rangeAtPickup) => Math.max(0, maxRange - rangeAtPickup);

console.log('\n=== startBurned formula ===');
ok('rangeAtPickup == maxRange -> startBurned 0', startBurnedFor(800, 800) === 0, startBurnedFor(800, 800));
ok('rangeAtPickup 600 of 800 -> startBurned 200', startBurnedFor(800, 600) === 200, startBurnedFor(800, 600));
ok('rangeAtPickup 450 of 800 -> startBurned 350', startBurnedFor(800, 450) === 350, startBurnedFor(800, 450));

console.log('\n=== rangeAtPickup above maxRange clamps to 0, never negative ===');
ok('rangeAtPickup 1000 of 800 -> 0 (not -200)', startBurnedFor(800, 1000) === 0, startBurnedFor(800, 1000));
ok('rangeAtPickup 1200 of 300 -> 0 (not -900)', startBurnedFor(300, 1200) === 0, startBurnedFor(300, 1200));
ok('never negative across the whole input range',
   [300, 500, 800, 1200].every(max =>
     [0, 25, 300, 800, 1200].every(rp => startBurnedFor(max, rp) >= 0)));

console.log('\n=== a clamped startBurned gives no extra reach ===');
{
  // Stops every 100 mi on a 2000 mi run.
  const grid = [];
  for (let m = 100; m <= 1900; m += 100) grid.push({ id: 'S' + m, mile: m, detour: 1, tier: 'prim' });

  const full = planFuel(2000, grid, 800, startBurnedFor(800, 800));
  const over = planFuel(2000, grid, 800, startBurnedFor(800, 1000));
  ok('rangeAtPickup > maxRange plans identically to a full tank',
     JSON.stringify(over.plan.map(s => s.mile)) === JSON.stringify(full.plan.map(s => s.mile)),
     JSON.stringify({ full: full.plan.map(s => s.mile), over: over.plan.map(s => s.mile) }));
  ok('  first stop is still 800, not past it', over.plan[0].mile === 800, over.plan[0].mile);
  ok('  no leg exceeds maxRange',
     over.plan.every(s => s.legMiles <= 800) && over.finalLegMiles <= 800);
}

console.log('\n=== partial range at pickup moves the first fuel earlier ===');
{
  // The brief's verified I-40 lane: 946 mi, TA Holbrook at mile 220,
  // TA Amarillo at mile 706. Full tank fuels once at Amarillo; leaving the
  // shipper with 600 mi moves the first fuel back to Holbrook.
  const lane = [
    { id: 'AZ4', name: 'TA Holbrook', mile: 220, detour: 1.0, tier: 'excl' },
    { id: 'TX1', name: 'TA Amarillo', mile: 706, detour: 1.2, tier: 'prim' },
  ];
  const ROUTE = 946, MAX = 800;

  const full = planFuel(ROUTE, lane, MAX, startBurnedFor(MAX, 800));
  ok('full tank -> single stop', full.ok && full.plan.length === 1, JSON.stringify(full.plan.map(s => s.mile)));
  ok('  and it is TA Amarillo at mile 706', full.plan[0].id === 'TX1' && full.plan[0].mile === 706,
     JSON.stringify(full.plan[0] && [full.plan[0].id, full.plan[0].mile]));

  const partial = planFuel(ROUTE, lane, MAX, startBurnedFor(MAX, 600));
  ok('600 mi at pickup -> first fuel moves to TA Holbrook mile 220',
     partial.plan[0].id === 'AZ4' && partial.plan[0].mile === 220,
     JSON.stringify(partial.plan.map(s => [s.id, s.mile])));
  ok('  first leg is within the 600 mi actually available',
     partial.plan[0].legMiles <= 600, partial.plan[0].legMiles);
  ok('  still completes the lane legally',
     partial.ok && partial.plan.every(s => s.legMiles <= MAX) && partial.finalLegMiles <= MAX,
     JSON.stringify({ stops: partial.plan.map(s => s.mile), final: partial.finalLegMiles }));
  ok('  same lane, different answer than the full tank',
     JSON.stringify(full.plan.map(s => s.mile)) !== JSON.stringify(partial.plan.map(s => s.mile)));

  // Too little range at pickup to reach even the first stop -> gap, not a plan.
  const stranded = planFuel(ROUTE, lane, MAX, startBurnedFor(MAX, 150));
  ok('150 mi at pickup cannot reach mile 220 -> gap, no plan',
     stranded.ok === false && stranded.plan.length === 0, JSON.stringify(stranded));
  ok('  gap starts at mile 0 and dies at mile 150',
     stranded.gap.fromMile === 0 && stranded.gap.deadMile === 150, JSON.stringify(stranded.gap));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
