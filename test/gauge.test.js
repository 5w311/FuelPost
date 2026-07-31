const G = require('../lib/gauge.js');
const FuelPlan = require('../lib/fuelplan.js');
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name, extra); }
};

console.log('=== tick <-> miles ===');
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

console.log('\n=== miles -> nearest tick (for display / migrating old values) ===');
ok('0 mi -> tick 0', G.tickForMiles(0) === 0);
ok('1000 mi -> tick 8', G.tickForMiles(1000) === 8);
ok('500 mi -> tick 4', G.tickForMiles(500) === 4);
ok('600 mi (old default) -> nearest tick 5 (625mi)', G.tickForMiles(600) === 5);
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

console.log('\n=== edge cases ===');
ok('clamps below 0', G.plannableMilesForTick(-5) === 0);
ok('clamps above 8', G.plannableMilesForTick(20) === 875);
ok('never negative even at the boundary', G.plannableMilesForTick(0) === 0);

console.log('\n=== interaction with computeStartBurned (unchanged function) ===');
ok('full plannable (875) vs 625 policy -> no burn assumed',
   G.computeStartBurned(625, G.plannableMilesForTick(8)) === 0);
ok('1/8 floor (0 plannable) vs 625 policy -> burned = full policy',
   G.computeStartBurned(625, G.plannableMilesForTick(1)) === 625);
ok('half-ish (5/8=500) vs 625 policy -> burned 125',
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

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
