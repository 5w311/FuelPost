const G = require('../lib/gauge.js');
const FuelPlan = require('../lib/fuelplan.js');
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name, extra); }
};

console.log('=== tick <-> miles (1000-mi tank since v1.39.0) ===');
// The fleet asked for an EVEN tank: F reads a round 1,000 and every eighth
// steps down by the same 125. 1000 over 8 eighths = 125 a tick, and the whole
// gauge is a number a driver can do in their head — 1000, 875, 750, 625, 500,
// 375, 250, 125, E. (v1.36.0-v1.38.0 ran a 1200 tank at 150 a tick.)
ok('full tank constant is 1000', G.FULL_TANK_MILES === 1000);
ok('125 mi per eighth', G.MILES_PER_TICK === 125);
ok('tick 0 (E) = 0 mi', G.milesForTick(0) === 0);
ok('tick 8 (F) = 1000 mi', G.milesForTick(8) === 1000);
ok('tick 4 (1/2) = 500 mi', G.milesForTick(4) === 500);
ok('tick 2 (1/4) = 250 mi', G.milesForTick(2) === 250);
ok('tick 7 (7/8) = 875 mi', G.milesForTick(7) === 875);
ok('out-of-range tick clamps low', G.milesForTick(-3) === 0);
ok('out-of-range tick clamps high', G.milesForTick(99) === 1000);
ok('fractional tick rounds', G.milesForTick(4.6) === 625, G.milesForTick(4.6));
// EVEN is the whole point of this model, so it is asserted as a property and
// not just as a table: every step down the gauge is the same size. A tank
// whose eighths were uneven could still satisfy every literal above.
ok('>>> every eighth is the same step — the gauge decreases evenly',
   [1,2,3,4,5,6,7,8].every(t => G.milesForTick(t) - G.milesForTick(t-1) === G.MILES_PER_TICK));
ok('  and the eight steps add up to exactly the full tank',
   G.MILES_PER_TICK * G.TICKS === G.FULL_TANK_MILES);
ok('  every reading is a whole number of miles — nothing to round on the dial',
   [0,1,2,3,4,5,6,7,8].every(t => Number.isInteger(G.milesForTick(t))));

console.log('\n=== miles -> nearest tick (for display / migrating old values) ===');
ok('0 mi -> tick 0', G.tickForMiles(0) === 0);
ok('1000 mi -> tick 8', G.tickForMiles(1000) === 8);
ok('500 mi -> tick 4 (exactly half the tank)', G.tickForMiles(500) === 4);
ok('700 mi (the Long tier) -> nearest tick 6 (750mi)', G.tickForMiles(700) === 6);
ok('over 1000 clamps to tick 8', G.tickForMiles(5000) === 8);
ok('round-trip is stable for exact ticks', G.tickForMiles(G.milesForTick(3)) === 3);

console.log('\n=== emergency zone (below 1/4 tank) ===');
ok('tick 0 (E) is emergency', G.isEmergencyZone(0) === true);
ok('tick 1 (1/8) is emergency', G.isEmergencyZone(1) === true);
ok('tick 2 (1/4, the floor) is NOT emergency', G.isEmergencyZone(2) === false);
ok('tick 8 (F) is not emergency', G.isEmergencyZone(8) === false);

console.log('\n=== tick labels ===');
ok('label E', G.tickLabel(0) === 'E');
ok('label 1/4', G.tickLabel(2) === '1/4');
ok('label 1/2', G.tickLabel(4) === '1/2');
ok('label F', G.tickLabel(8) === 'F');

console.log('\n=== startBurned wiring unchanged ===');
ok('full gauge vs 800 policy -> no burn assumed', G.computeStartBurned(800, G.milesForTick(8)) === 0);
ok('half gauge (500) vs 800 policy -> burned 300', G.computeStartBurned(800, G.milesForTick(4)) === 300);
ok('never goes negative', G.computeStartBurned(500, G.milesForTick(8)) === 0);

console.log('\n=== plannableMilesForTick matches both stated numbers exactly ===');
ok('F (tick 8) = 875 mi', G.plannableMilesForTick(8) === 875);
ok('1/8 (tick 1) = 0 mi', G.plannableMilesForTick(1) === 0);

console.log('\n=== full table is linear and matches the reserve rule ===');
const expect = {0:0,1:0,2:125,3:250,4:375,5:500,6:625,7:750,8:875};
Object.entries(expect).forEach(([t,m]) => ok(`tick ${t} -> ${m} mi`, G.plannableMilesForTick(+t) === m));

console.log('\n=== the withheld reserve is exactly the "limp" figure ===');
ok('milesForTick(8) - plannableMilesForTick(8) == 125', G.milesForTick(8) - G.plannableMilesForTick(8) === 125);
ok('milesForTick(1) - plannableMilesForTick(1) == 125', G.milesForTick(1) - G.plannableMilesForTick(1) === 125);
ok('  and the withheld slice is exactly one tick, whatever a tick is worth',
   G.milesForTick(8) - G.plannableMilesForTick(8) === G.RESERVE_TICKS * G.MILES_PER_TICK);

console.log('\n=== edge cases ===');
ok('clamps below 0', G.plannableMilesForTick(-5) === 0);
ok('clamps above 8', G.plannableMilesForTick(20) === 875);
ok('never negative even at the boundary', G.plannableMilesForTick(0) === 0);

console.log('\n=== interaction with computeStartBurned (unchanged function) ===');
ok('full plannable (875) vs 625 policy -> no burn assumed',
   G.computeStartBurned(625, G.plannableMilesForTick(8)) === 0);
ok('1/8 floor (0 plannable) vs 625 policy -> burned = full policy',
   G.computeStartBurned(625, G.plannableMilesForTick(1)) === 625);
ok('5/8 (500 plannable) vs 625 policy -> burned 125',
   G.computeStartBurned(625, G.plannableMilesForTick(5)) === 125);

console.log('\n=== the 1/8 floor feeds the real planner into an immediate zero-width gap ===');
{
  const maxRange = 625;
  const rangeAtPickup = G.plannableMilesForTick(1); // the new selectable floor
  const startBurned = G.computeStartBurned(maxRange, rangeAtPickup);
  const result = FuelPlan.planFuel(300, [], maxRange, startBurned);
  ok('plan is empty', Array.isArray(result.plan) && result.plan.length === 0, JSON.stringify(result));
  ok('gap is {fromMile:0, deadMile:0}', result.gap && result.gap.fromMile === 0 && result.gap.deadMile === 0, JSON.stringify(result.gap));
  ok('ok is false', result.ok === false);
}

console.log('\n=== arrival reserve: a TOGGLE since v1.35.0, floor + aim since v1.38.0 ===');
// One switch, two states — and since v1.38.0, TWO numbers behind the ON
// state. The control narrowed release by release as the real choice got
// clearer: v1.27.0 offered a 1/8-1/2 dial, v1.30.1 dropped 1/8, v1.35.0
// collapsed the rest to one switch, v1.37.0 pushed it to 5/8, and v1.38.0
// split it: never arrive UNDER 1/4 (the floor, a hard constraint), and land
// the last stop so arrival sits CLOSEST to 1/2 (the aim, a preference).
// Both values are pinned at their exact miles so a silent change cannot move
// every plan without a test noticing.
{

  ok('>>> the toggle tick is 2 — the 1/4 FLOOR, down from 5/8 in v1.38.0',
     G.ARRIVAL_TOGGLE_TICK === 2, String(G.ARRIVAL_TOGGLE_TICK));
  ok('>>> ON requires at least 125 mi of range at delivery',
     G.arrivalReserveMiles(G.ARRIVAL_TOGGLE_TICK) === 125,
     String(G.arrivalReserveMiles(G.ARRIVAL_TOGGLE_TICK)));
  ok('  and the floor\'s label is the gauge\'s own "1/4", never a second string',
     G.tickLabel(G.ARRIVAL_TOGGLE_TICK) === '1/4');
  ok('>>> the target tick is 4 — aim to land nearest 1/2 a tank',
     G.ARRIVAL_TARGET_TICK === 4, String(G.ARRIVAL_TARGET_TICK));
  ok('>>> the aim is 375 mi of range at delivery',
     G.arrivalReserveMiles(G.ARRIVAL_TARGET_TICK) === 375,
     String(G.arrivalReserveMiles(G.ARRIVAL_TARGET_TICK)));
  ok('  and the aim\'s label is the gauge\'s own "1/2"',
     G.tickLabel(G.ARRIVAL_TARGET_TICK) === '1/2');
  // The aim must sit strictly above the floor: equal would make the re-pick
  // a no-op by its own guard, and below would aim at a forbidden arrival.
  ok('  the aim sits strictly above the floor',
     G.ARRIVAL_TARGET_TICK > G.ARRIVAL_TOGGLE_TICK);
  // OFF and the toggle tick are the pair that carries the whole intent.
  ok('>>> OFF is RESERVE_TICKS, adding exactly zero miles',
     G.arrivalReserveMiles(G.RESERVE_TICKS) === 0);
  ok('  and the toggle tick is not the floor tick — ON must actually do something',
     G.ARRIVAL_TOGGLE_TICK !== G.RESERVE_TICKS
     && G.arrivalReserveMiles(G.ARRIVAL_TOGGLE_TICK) > 0);
  // WHAT THE 1/4 FLOOR COSTS, pinned so the number stays a decision. The
  // final leg may be at most range−125: 375 on Regular 500, 575 on Long 700,
  // 775 on Max 900 — satisfiable on every tier, which is exactly why the
  // fleet backed off 5/8 (on the old 1200 tank Regular could never meet 600). The AIM costs
  // nothing: it only chooses WHICH reachable stop is last, never whether one
  // exists, so it can't create a shortfall the floor didn't already have.
  ok('  against Long 700 the final leg may be at most 575 mi',
     700 - G.arrivalReserveMiles(G.ARRIVAL_TOGGLE_TICK) === 575);
  ok('>>> against Regular 500 the floor is satisfiable — the v1.37.0 wall is gone',
     G.arrivalReserveMiles(G.ARRIVAL_TOGGLE_TICK) < 500
     && 500 - G.arrivalReserveMiles(G.ARRIVAL_TOGGLE_TICK) === 375);
  ok('  even the AIM (450) fits inside Regular\'s 500',
     G.arrivalReserveMiles(G.ARRIVAL_TARGET_TICK) < 500);
  {
    // Regular + the new floor, dense stops everywhere: ON now plans clean on
    // the smallest tier — the exact case v1.37.0's 5/8 could not serve.
    const dense = [];
    for (let m = 50; m < 900; m += 50) dense.push({ id: 'S' + m, name: 'S' + m, mile: m, detourMi: 1 });
    const floor = G.arrivalReserveMiles(G.ARRIVAL_TOGGLE_TICK);
    const aim = G.arrivalReserveMiles(G.ARRIVAL_TARGET_TICK);
    const r = FuelPlan.planFuel(900, dense, 500, 0, floor, aim);
    ok('>>> Regular + switch ON completes cleanly with the 1/4 floor',
       r.ok === true && r.gap === null, JSON.stringify(r.gap));
    ok('  and the final leg honours the floor',
       r.plan.length > 0 && 900 - r.plan[r.plan.length - 1].mile <= 500 - floor,
       JSON.stringify(r.plan.map(s => s.mile)));
    // The honest-degradation contract still holds for any oversized reserve —
    // no longer reachable via the switch, but planFuel takes raw miles and
    // must TERMINATE and flag reserveShortfall, never fake a dry gap or hang.
    const over = FuelPlan.planFuel(900, dense, 500, 0, 600);
    ok('>>> an oversized reserve (600 > Regular 500) still degrades to a flagged shortfall',
       over.ok === false && over.gap && over.gap.reserveShortfall === true, JSON.stringify(over.gap));
    ok('  with every drivable stop still planned, nothing stranded',
       over.plan.length > 0 && over.gap.deadMile >= 900, JSON.stringify(over.plan.map(s => s.mile)));
  }
  ok('  the old choices array is gone from the module',
     !('ARRIVAL_TICK_CHOICES' in G));
  // Still pinned even though 1/8 is no longer selectable: the planner reads
  // this value every time the driver leaves the reserve alone.
  ok('1/8 -> 0 mi (the standard reserve, no longer a button)',
     G.arrivalReserveMiles(1) === 0, String(G.arrivalReserveMiles(1)));
  ok('1/4 -> 125 mi', G.arrivalReserveMiles(2) === 125, String(G.arrivalReserveMiles(2)));
  ok('3/8 -> 250 mi', G.arrivalReserveMiles(3) === 250, String(G.arrivalReserveMiles(3)));
  ok('1/2 -> 375 mi', G.arrivalReserveMiles(4) === 375, String(G.arrivalReserveMiles(4)));

  // The toggle value is a whole number of ticks above the floor, by
  // construction — the same arithmetic the dial had.
  ok('ON is exactly (tick - floor) ticks of miles',
     G.arrivalReserveMiles(G.ARRIVAL_TOGGLE_TICK)
       === (G.ARRIVAL_TOGGLE_TICK - G.RESERVE_TICKS) * G.MILES_PER_TICK);
  // Same arithmetic as the gauge's own plannable-miles reading, deliberately:
  // one question asked from the two ends of the trip. If they ever diverge,
  // the tank has two different floors and one of them is wrong.
  ok('agrees with plannableMilesForTick at every tick',
     [0,1,2,3,4,5,6,7,8].every(t => G.arrivalReserveMiles(t) === G.plannableMilesForTick(t)));

  // Defensive, same shape as the rest of this module: clamped, never negative.
  ok('clamped below', G.arrivalReserveMiles(-3) === 0);
  ok('clamped above at the full tank minus the floor', G.arrivalReserveMiles(99) === 875);
}

console.log('\n=== the range tiers against the tank scale ===');
// READ FROM index.html, not restated as literals. The old version of this
// block asserted arithmetic about the numbers 875 and 675 directly — claims
// that stay true forever no matter what RANGE_TIERS actually says — and when
// v1.35.0 moved the tiers to 500/700/900 it went on passing without a
// murmur, silent about exactly the drift it existed to catch. Its own
// comment warned that the tick-scale claim "silently stops being true";
// the assertion had the same disease.
{
  const fs = require('fs');
  const path = require('path');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const tier = k => Number((html.match(new RegExp(k + ":\\s*\\{ miles: (\\d+)")) || [])[1]);
  const T = { regular: tier('regular'), long: tier('long'), max: tier('max') };
  ok('the tier table was actually parsed', T.regular > 0 && T.long > 0 && T.max > 0,
     JSON.stringify(T));
  ok('>>> the tiers are 500 / 700 / 900 (v1.35.0)',
     T.regular === 500 && T.long === 700 && T.max === 900, JSON.stringify(T));
  // The tick-scale claim, FIFTH revision (v1.39.0 evened the tank to 1000, a
  // tick to 125): the whole-tick tier is REGULAR now, and it lands on the
  // roundest possible spot — exactly half the tank. Max held the title for
  // three releases; before that Regular held it for one, and Long before
  // that. This block reads the real table precisely because the claim will
  // not sit still, and it is written as a search rather than a guess so the
  // NEXT tank change reports the truth instead of failing blind.
  ok('Regular is exactly 4 ticks — half the 1000 tank',
     T.regular === 4 * G.MILES_PER_TICK);
  ok('Long is NOT a whole tick (5.6) — a road-practice number',
     T.long % G.MILES_PER_TICK !== 0);
  ok('Max is NOT a whole tick either (7.2)',
     T.max % G.MILES_PER_TICK !== 0);
  ok('  exactly one tier sits on the tick scale',
     Object.values(T).filter(m => m % G.MILES_PER_TICK === 0).length === 1,
     JSON.stringify(Object.entries(T).map(([k, m]) => k + ':' + (m / G.MILES_PER_TICK))));
  // THE COST OF EVENING THE TANK, stated rather than buried. Plannable-full
  // drops from 1050 to 875, and Max 900 no longer fits inside it — the same
  // 25-mi overhang the app carried on the v1.35.0 1000-mi tank. It is not a
  // bug and needs no special case: a driver who picks Max AND says the tank
  // is full is claiming 900 mi of plannable range from a gauge that tops out
  // at 875, so computeStartBurned docks the difference off the first leg.
  // The arithmetic is the honest one; what's pinned here is that it stays
  // SMALL and stays visible.
  ok('>>> Max 900 overhangs plannable-full (875) by 25 mi on the evened tank',
     T.max - G.plannableMilesForTick(G.TICKS) === 25,
     String(T.max - G.plannableMilesForTick(G.TICKS)));
  ok('  so a full tank on Max carries a 25-mi startBurned debit, not zero',
     G.computeStartBurned(T.max, G.plannableMilesForTick(G.TICKS)) === 25);
  ok('  and the debit is under one tick — a rounding-sized dock, not a lost stop',
     G.computeStartBurned(T.max, G.plannableMilesForTick(G.TICKS)) < G.MILES_PER_TICK);
  ok('  Regular and Long still fit inside plannable-full with no debit at all',
     G.computeStartBurned(T.regular, G.plannableMilesForTick(G.TICKS)) === 0
     && G.computeStartBurned(T.long, G.plannableMilesForTick(G.TICKS)) === 0);
  {
    // What the debit actually DOES to a plan, proved with the real planner
    // rather than asserted as arithmetic: on a 900-mi run with one stop at
    // mile 880, Max + full tank cannot reach it (875 < 880) and says so.
    const debit = G.computeStartBurned(T.max, G.plannableMilesForTick(G.TICKS));
    const far = [{ id: 'X', name: 'X', mile: 880, detourMi: 1, detour: 1 }];
    const r = FuelPlan.planFuel(900, far, T.max, debit);
    ok('  the debit is REAL: a stop at 880 is out of reach on a full Max tank',
       r.ok === false && r.plan.length === 0, JSON.stringify(r.gap));
    const near = [{ id: 'Y', name: 'Y', mile: 870, detourMi: 1, detour: 1 }];
    ok('  and a stop 5 mi closer is reachable — the dock is 25 mi, not a wall',
       FuelPlan.planFuel(900, near, T.max, debit).ok === true);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
