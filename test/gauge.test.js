const G = require('../lib/gauge.js');
const FuelPlan = require('../lib/fuelplan.js');
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name, extra); }
};

console.log('=== tick <-> miles (1200-mi tank, 900 of it plannable, since v1.40.0) ===');
// v1.39.0 evened the whole tank to 1000; v1.40.0 moved the evenness to where
// it is actually READ — the plannable span — by holding back the bottom
// quarter and sizing the tank so what's left is a round 900. The dial is
// still even end to end at 150 a tick: 1200, 1050, 900, 750, 600, 450, 300,
// 150, E. The plannable half of that story is asserted further down.
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
ok('1200 mi -> tick 8', G.tickForMiles(1200) === 8);
ok('600 mi -> tick 4 (exactly half the tank)', G.tickForMiles(600) === 4);
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
// THE HEADLINE NUMBER of v1.40.0: a full tank plans a round 900, which is
// also exactly the Max tier — the most range a driver can ask for is the
// most a full tank gives, with nothing left over and nothing short.
ok('>>> F (tick 8) = 900 mi — the plannable span, round by construction',
   G.plannableMilesForTick(8) === 900, String(G.plannableMilesForTick(8)));
ok('  and it is six even ticks of it, not a rounded figure',
   G.plannableMilesForTick(8) === (G.TICKS - G.RESERVE_TICKS) * G.MILES_PER_TICK
   && G.TICKS - G.RESERVE_TICKS === 6);
ok('1/8 (tick 1) = 0 mi', G.plannableMilesForTick(1) === 0);
ok('>>> 1/4 (tick 2) = 0 mi too — E through 1/4 is unplannable now',
   G.plannableMilesForTick(2) === 0, String(G.plannableMilesForTick(2)));
ok('  which is exactly RESERVE_TICKS being 2, not a coincidence of arithmetic',
   G.RESERVE_TICKS === 2 && G.plannableMilesForTick(G.RESERVE_TICKS) === 0);
ok('  and the first tick ABOVE the floor is where range starts',
   G.plannableMilesForTick(G.RESERVE_TICKS + 1) === G.MILES_PER_TICK);

console.log('\n=== full table is linear and matches the reserve rule ===');
const expect = {0:0,1:0,2:0,3:150,4:300,5:450,6:600,7:750,8:900};
Object.entries(expect).forEach(([t,m]) => ok(`tick ${t} -> ${m} mi`, G.plannableMilesForTick(+t) === m));

console.log('\n=== the withheld reserve is exactly the "limp" figure ===');
ok('milesForTick(8) - plannableMilesForTick(8) == 300', G.milesForTick(8) - G.plannableMilesForTick(8) === 300);
ok('milesForTick(2) - plannableMilesForTick(2) == 300', G.milesForTick(2) - G.plannableMilesForTick(2) === 300);
ok('  and the withheld slice is exactly RESERVE_TICKS ticks, whatever a tick is worth',
   G.milesForTick(8) - G.plannableMilesForTick(8) === G.RESERVE_TICKS * G.MILES_PER_TICK);
ok('>>> the limp figure is a QUARTER tank now — 300 physical mi below the floor',
   G.milesForTick(G.RESERVE_TICKS) === 300, String(G.milesForTick(G.RESERVE_TICKS)));

console.log('\n=== edge cases ===');
ok('clamps below 0', G.plannableMilesForTick(-5) === 0);
ok('clamps above 8', G.plannableMilesForTick(20) === 900);
ok('never negative even at the boundary', G.plannableMilesForTick(0) === 0);

console.log('\n=== interaction with computeStartBurned (unchanged function) ===');
ok('full plannable (900) vs 625 policy -> no burn assumed',
   G.computeStartBurned(625, G.plannableMilesForTick(8)) === 0);
ok('1/8 floor (0 plannable) vs 625 policy -> burned = full policy',
   G.computeStartBurned(625, G.plannableMilesForTick(1)) === 625);
ok('5/8 (450 plannable) vs 625 policy -> burned 175',
   G.computeStartBurned(625, G.plannableMilesForTick(5)) === 175);

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
// state: a FLOOR (no plan may land under it) and an AIM (among final stops
// respecting the floor, land closest to 1/2). The control narrowed release by
// release: v1.27.0 offered a 1/8-1/2 dial, v1.30.1 dropped 1/8, v1.35.0
// collapsed the rest to one switch, v1.37.0 pushed it to 5/8, v1.38.0 split
// it into floor 1/4 + aim 1/2, and v1.40.0 moved the floor up one tick
// because the APP'S floor rose underneath it.
{
  // THE TRAP THIS RELEASE CREATED, pinned first because it is the one that
  // fails silently. Every figure on this scale is measured above
  // RESERVE_TICKS, so raising the app's floor to a quarter made "never arrive
  // under 1/4" cost exactly nothing — a switch that still flips, still
  // announces itself, and changes no plan. The floor is DERIVED from
  // RESERVE_TICKS for that reason, and these three assertions are what stop a
  // future floor change from re-opening the hole.
  ok('>>> the switch floor is never the app floor — ON must cost real range',
     G.ARRIVAL_TOGGLE_TICK > G.RESERVE_TICKS
     && G.arrivalReserveMiles(G.ARRIVAL_TOGGLE_TICK) > 0,
     JSON.stringify([G.ARRIVAL_TOGGLE_TICK, G.RESERVE_TICKS]));
  ok('>>> and it is exactly one tick above it, wherever the floor moves',
     G.ARRIVAL_TOGGLE_TICK === G.RESERVE_TICKS + 1);
  ok('  so ON always costs exactly one tick of range',
     G.arrivalReserveMiles(G.ARRIVAL_TOGGLE_TICK) === G.MILES_PER_TICK);

  ok('>>> the toggle tick is 3 — the 3/8 FLOOR, up from 1/4 in v1.40.0',
     G.ARRIVAL_TOGGLE_TICK === 3, String(G.ARRIVAL_TOGGLE_TICK));
  ok('>>> ON requires at least 150 mi of range at delivery',
     G.arrivalReserveMiles(G.ARRIVAL_TOGGLE_TICK) === 150,
     String(G.arrivalReserveMiles(G.ARRIVAL_TOGGLE_TICK)));
  ok('  and the floor\'s label is the gauge\'s own "3/8", never a second string',
     G.tickLabel(G.ARRIVAL_TOGGLE_TICK) === '3/8');
  ok('>>> the target tick is 4 — aim to land nearest 1/2 a tank',
     G.ARRIVAL_TARGET_TICK === 4, String(G.ARRIVAL_TARGET_TICK));
  ok('>>> the aim is 300 mi of range at delivery',
     G.arrivalReserveMiles(G.ARRIVAL_TARGET_TICK) === 300,
     String(G.arrivalReserveMiles(G.ARRIVAL_TARGET_TICK)));
  ok('  and the aim\'s label is the gauge\'s own "1/2"',
     G.tickLabel(G.ARRIVAL_TARGET_TICK) === '1/2');
  // The aim must sit strictly above the floor: equal would make the re-pick
  // a no-op by its own guard, and below would aim at a forbidden arrival.
  // They are one tick apart now (were two before the floor rose).
  ok('  the aim sits strictly above the floor',
     G.ARRIVAL_TARGET_TICK > G.ARRIVAL_TOGGLE_TICK);
  // OFF and the toggle tick are the pair that carries the whole intent.
  ok('>>> OFF is RESERVE_TICKS, adding exactly zero miles',
     G.arrivalReserveMiles(G.RESERVE_TICKS) === 0);
  // WHAT THE 3/8 FLOOR COSTS, pinned so the number stays a decision. The
  // final leg may be at most range−150: 350 on Regular 500, 550 on Long 700,
  // 750 on Max 900 — satisfiable on every tier, as it has been since v1.38.0
  // backed off the 5/8 floor. The AIM costs nothing: it only chooses WHICH
  // reachable stop is last, never whether one exists.
  ok('  against Long 700 the final leg may be at most 550 mi',
     700 - G.arrivalReserveMiles(G.ARRIVAL_TOGGLE_TICK) === 550);
  ok('>>> against Regular 500 the floor is still satisfiable',
     G.arrivalReserveMiles(G.ARRIVAL_TOGGLE_TICK) < 500
     && 500 - G.arrivalReserveMiles(G.ARRIVAL_TOGGLE_TICK) === 350);
  ok('  and so is the AIM (300) inside Regular\'s 500',
     G.arrivalReserveMiles(G.ARRIVAL_TARGET_TICK) < 500);
  {
    // Regular + the floor, dense stops everywhere: ON plans clean on the
    // smallest tier.
    const dense = [];
    for (let m = 50; m < 900; m += 50) dense.push({ id: 'S' + m, name: 'S' + m, mile: m, detourMi: 1 });
    const floor = G.arrivalReserveMiles(G.ARRIVAL_TOGGLE_TICK);
    const aim = G.arrivalReserveMiles(G.ARRIVAL_TARGET_TICK);
    const r = FuelPlan.planFuel(900, dense, 500, 0, floor, aim);
    ok('>>> Regular + switch ON completes cleanly with the 3/8 floor',
       r.ok === true && r.gap === null, JSON.stringify(r.gap));
    ok('  and the final leg honours the floor',
       r.plan.length > 0 && 900 - r.plan[r.plan.length - 1].mile <= 500 - floor,
       JSON.stringify(r.plan.map(s => s.mile)));
    // ON has to still be able to FORCE a late stop — that is the half of the
    // switch the aim cannot do on its own, and the half a collapsed floor
    // would have quietly deleted. One stop at 400 on a 700-mi run with 700 of
    // range: OFF needs nothing, ON must plan it.
    const one = [{ id: 'mid', name: 'mid', mile: 400, detourMi: 1, detour: 1 }];
    ok('>>> ON still FORCES a late stop where OFF plans none',
       FuelPlan.planFuel(700, one, 700, 0, 0, 0).plan.length === 0
       && FuelPlan.planFuel(700, one, 700, 0, floor, aim).plan.length === 1,
       JSON.stringify(FuelPlan.planFuel(700, one, 700, 0, floor, aim).plan.map(s => s.mile)));
    // The honest-degradation contract still holds for any oversized reserve —
    // not reachable via the switch, but planFuel takes raw miles and must
    // TERMINATE and flag reserveShortfall, never fake a dry gap or hang.
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
  ok('1/8 -> 0 mi (inside the standard reserve, no longer a button)',
     G.arrivalReserveMiles(1) === 0, String(G.arrivalReserveMiles(1)));
  ok('1/4 -> 0 mi (the floor itself, no range above it)', G.arrivalReserveMiles(2) === 0, String(G.arrivalReserveMiles(2)));
  ok('3/8 -> 150 mi', G.arrivalReserveMiles(3) === 150, String(G.arrivalReserveMiles(3)));
  ok('1/2 -> 300 mi', G.arrivalReserveMiles(4) === 300, String(G.arrivalReserveMiles(4)));

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
  ok('clamped above at the full tank minus the floor', G.arrivalReserveMiles(99) === 900);
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
  // The tick-scale claim, SIXTH revision (v1.40.0 sized the tank so the
  // PLANNABLE span is 900): Max is on the scale again, and this time on the
  // scale that matters — it is exactly a full tank's plannable range, not
  // merely a whole number of ticks. Long is 4.67 ticks, Regular 3.33. The
  // block reads the real table because this claim will not sit still.
  ok('Max is exactly 6 ticks — the whole plannable span',
     T.max === 6 * G.MILES_PER_TICK);
  ok('Regular is NOT a whole tick (3.33) — a road-practice number',
     T.regular % G.MILES_PER_TICK !== 0);
  ok('Long is NOT a whole tick either (4.67)',
     T.long % G.MILES_PER_TICK !== 0);
  ok('  exactly one tier sits on the tick scale',
     Object.values(T).filter(m => m % G.MILES_PER_TICK === 0).length === 1,
     JSON.stringify(Object.entries(T).map(([k, m]) => k + ':' + (m / G.MILES_PER_TICK))));
  // THE POINT OF THE v1.40.0 SIZING, and the end of a wart that has come and
  // gone twice: the biggest range a driver can pick is exactly the range a
  // full tank gives. No overhang (v1.35.0 and v1.39.0 each had Max sitting 25
  // mi past plannable-full and leaning on a startBurned debit), and nothing
  // left on the table either.
  ok('>>> Max 900 IS plannable-full — no overhang, no shortfall, exactly equal',
     T.max === G.plannableMilesForTick(G.TICKS),
     JSON.stringify([T.max, G.plannableMilesForTick(G.TICKS)]));
  ok('  so a full tank on Max carries no startBurned debit at all',
     G.computeStartBurned(T.max, G.plannableMilesForTick(G.TICKS)) === 0);
  ok('  and no tier does — every one of them fits inside a full tank',
     Object.values(T).every(m => G.computeStartBurned(m, G.plannableMilesForTick(G.TICKS)) === 0));
  {
    // Proved with the real planner rather than left as arithmetic: on a
    // 900-mi run with one stop at mile 880, Max + a full tank reaches the
    // delivery outright — the debit that used to strand it is gone.
    const debit = G.computeStartBurned(T.max, G.plannableMilesForTick(G.TICKS));
    const far = [{ id: 'X', name: 'X', mile: 880, detourMi: 1, detour: 1 }];
    const r = FuelPlan.planFuel(900, far, T.max, debit);
    ok('  a full Max tank now covers a 900-mi run with no stop at all',
       r.ok === true && r.plan.length === 0, JSON.stringify(r.gap));
    ok('  and one mile further than the tank plans is honestly a gap',
       FuelPlan.planFuel(901, [], T.max, debit).ok === false);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
