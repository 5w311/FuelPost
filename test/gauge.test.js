const G = require('../lib/gauge.js');
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

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
