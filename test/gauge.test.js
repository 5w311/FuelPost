const G = require('../lib/gauge.js');
const FuelPlan = require('../lib/fuelplan.js');
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name, extra); }
};

console.log('=== tick <-> miles (1200-mi tank since v1.36.0) ===');
// The fleet's 2025 Cascadias: 8.5 mpg on dual 100-gal tanks, ~1200 mi
// comfortable full-to-empty. 1200 over 8 eighths = 150 a tick.
ok('full tank constant is 1200', G.FULL_TANK_MILES === 1200);
ok('150 mi per eighth', G.MILES_PER_TICK === 150);
ok('tick 0 (E) = 0 mi', G.milesForTick(0) === 0);
ok('tick 8 (F) = 1200 mi', G.milesForTick(8) === 1200);
ok('tick 4 (1/2) = 600 mi', G.milesForTick(4) === 600);
ok('tick 2 (1/4) = 300 mi', G.milesForTick(2) === 300);
ok('tick 7 (7/8) = 1050 mi', G.milesForTick(7) === 1050);
ok('out-of-range tick clamps low', G.milesForTick(-3) === 0);
ok('out-of-range tick clamps high', G.milesForTick(99) === 1200);
ok('fractional tick rounds', G.milesForTick(4.6) === 750, G.milesForTick(4.6));

console.log('\n=== miles -> nearest tick (for display / migrating old values) ===');
ok('0 mi -> tick 0', G.tickForMiles(0) === 0);
ok('1200 mi -> tick 8', G.tickForMiles(1200) === 8);
ok('600 mi -> tick 4 (exactly half the tank now)', G.tickForMiles(600) === 4);
ok('700 mi (the Long tier) -> nearest tick 5 (750mi)', G.tickForMiles(700) === 5);
ok('over 1200 clamps to tick 8', G.tickForMiles(5000) === 8);
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
ok('half gauge (600) vs 800 policy -> burned 200', G.computeStartBurned(800, G.milesForTick(4)) === 200);
ok('never goes negative', G.computeStartBurned(500, G.milesForTick(8)) === 0);

console.log('\n=== plannableMilesForTick matches both stated numbers exactly ===');
ok('F (tick 8) = 1050 mi', G.plannableMilesForTick(8) === 1050);
ok('1/8 (tick 1) = 0 mi', G.plannableMilesForTick(1) === 0);

console.log('\n=== full table is linear and matches the reserve rule ===');
const expect = {0:0,1:0,2:150,3:300,4:450,5:600,6:750,7:900,8:1050};
Object.entries(expect).forEach(([t,m]) => ok(`tick ${t} -> ${m} mi`, G.plannableMilesForTick(+t) === m));

console.log('\n=== the withheld reserve is exactly the "limp" figure ===');
ok('milesForTick(8) - plannableMilesForTick(8) == 150', G.milesForTick(8) - G.plannableMilesForTick(8) === 150);
ok('milesForTick(1) - plannableMilesForTick(1) == 150', G.milesForTick(1) - G.plannableMilesForTick(1) === 150);

console.log('\n=== edge cases ===');
ok('clamps below 0', G.plannableMilesForTick(-5) === 0);
ok('clamps above 8', G.plannableMilesForTick(20) === 1050);
ok('never negative even at the boundary', G.plannableMilesForTick(0) === 0);

console.log('\n=== interaction with computeStartBurned (unchanged function) ===');
ok('full plannable (1050) vs 625 policy -> no burn assumed',
   G.computeStartBurned(625, G.plannableMilesForTick(8)) === 0);
ok('1/8 floor (0 plannable) vs 625 policy -> burned = full policy',
   G.computeStartBurned(625, G.plannableMilesForTick(1)) === 625);
ok('half-ish (5/8=600) vs 625 policy -> burned 25',
   G.computeStartBurned(625, G.plannableMilesForTick(5)) === 25);

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

console.log('\n=== arrival reserve: a TOGGLE since v1.35.0 ===');
// One switch, two states. The control narrowed release by release as the real
// choice got clearer: v1.27.0 offered a 1/8-1/2 dial, v1.30.1 dropped 1/8
// (nobody arrives on an eighth by choice), and v1.35.0 collapsed the rest —
// the fleet's read was that a driver who wants fuel at delivery wants HALF A
// TANK, and 1/4 / 3/8 were gradations nobody picked. What planFuel receives is
// pinned here at its exact mile value, so a silent change cannot move every
// plan without a test noticing.
{

  ok('>>> the toggle tick is 4 — half a tank', G.ARRIVAL_TOGGLE_TICK === 4,
     String(G.ARRIVAL_TOGGLE_TICK));
  ok('>>> ON adds exactly 450 mi of reserve (half the 1200 tank, above the floor)',
     G.arrivalReserveMiles(G.ARRIVAL_TOGGLE_TICK) === 450,
     String(G.arrivalReserveMiles(G.ARRIVAL_TOGGLE_TICK)));
  ok('  and its label is the gauge\'s own "1/2", never a second string',
     G.tickLabel(G.ARRIVAL_TOGGLE_TICK) === '1/2');
  // OFF and the toggle tick are the pair that carries the whole intent.
  ok('>>> OFF is RESERVE_TICKS, adding exactly zero miles',
     G.arrivalReserveMiles(G.RESERVE_TICKS) === 0);
  ok('  and the toggle tick is not the floor — ON must actually do something',
     G.ARRIVAL_TOGGLE_TICK !== G.RESERVE_TICKS
     && G.arrivalReserveMiles(G.ARRIVAL_TOGGLE_TICK) > 0);
  // THE CEILING REASONING, pinned so "or higher" stays a decision: at 5/8 the
  // reserve alone (600 mi) eats a Long tier's 700 almost whole and gaps most
  // plans. If the fleet raises the toggle past 1/2, this line is the one to
  // change knowingly.
  ok('  one tick higher would already hold back 600 of Long\'s 700 mi',
     G.arrivalReserveMiles(G.ARRIVAL_TOGGLE_TICK + 1) === 600);
  ok('  the old choices array is gone from the module',
     !('ARRIVAL_TICK_CHOICES' in G));
  // Still pinned even though 1/8 is no longer selectable: the planner reads
  // this value every time the driver leaves the reserve alone.
  ok('1/8 -> 0 mi (the standard reserve, no longer a button)',
     G.arrivalReserveMiles(1) === 0, String(G.arrivalReserveMiles(1)));
  ok('1/4 -> 150 mi', G.arrivalReserveMiles(2) === 150, String(G.arrivalReserveMiles(2)));
  ok('3/8 -> 300 mi', G.arrivalReserveMiles(3) === 300, String(G.arrivalReserveMiles(3)));
  ok('1/2 -> 450 mi', G.arrivalReserveMiles(4) === 450, String(G.arrivalReserveMiles(4)));

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
  ok('clamped above at the full tank minus the floor', G.arrivalReserveMiles(99) === 1050);
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
  // The tick-scale claim, FOURTH revision (v1.36.0 moved the tank to 1200, a
  // tick to 150): now only MAX is on the scale. Regular held it for exactly
  // one release. This block reads the real table precisely because the claim
  // will not sit still.
  ok('Max is exactly 6 ticks — three quarters of the 1200 tank',
     T.max === 6 * G.MILES_PER_TICK);
  ok('Regular is NOT a whole tick (3.33) — a road-practice number',
     T.regular % G.MILES_PER_TICK !== 0);
  ok('Long is NOT a whole tick either (4.67)',
     T.long % G.MILES_PER_TICK !== 0);
  // The v1.35.0 oddity is GONE: Max 900 sat 25 mi past the old 875 plannable
  // full and leaned on a startBurned debit for its first leg. At the 1200
  // tank, plannable-full is 1050 and Max fits back inside with 150 to spare —
  // no debit, no special case, and this pins that it stays that way.
  ok('>>> Max 900 fits INSIDE plannable-full (1050) again, 150 to spare',
     G.plannableMilesForTick(G.TICKS) - T.max === 150,
     String(G.plannableMilesForTick(G.TICKS) - T.max));
  ok('  so a full tank on Max carries no startBurned debit',
     G.computeStartBurned(T.max, G.plannableMilesForTick(G.TICKS)) === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
