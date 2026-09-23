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
ok('700 mi -> nearest tick 5 (750mi)', G.tickForMiles(700) === 5);
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

console.log('\n=== the BACKUP reserve: 1/8 to 1/4, dipped into only from below ===');
// The change this exists for: a driver sitting on a quarter tank used to get
// a blank panel — no routing call, no stops, nothing. Refusing to PLAN on the
// bottom quarter and refusing to LOOK are different things, and that is the
// moment they most need to see what's near them.
{
  ok('>>> the untouchable band is the bottom eighth, not the planning floor',
     G.BACKUP_RESERVE_TICKS === 1 && G.BACKUP_RESERVE_TICKS < G.RESERVE_TICKS,
     JSON.stringify([G.BACKUP_RESERVE_TICKS, G.RESERVE_TICKS]));
  ok('  so the backup band is exactly one tick wide — 150 mi',
     (G.RESERVE_TICKS - G.BACKUP_RESERVE_TICKS) * G.MILES_PER_TICK === 150);
  ok('  and it is exactly the amber stretch the gauge paints',
     G.backupMilesForTick(G.RESERVE_TICKS) === 150
     && G.backupMilesForTick(G.BACKUP_RESERVE_TICKS) === 0);

  // THE HEADLINE: a quarter tank now has something to plan with.
  const quarter = G.rangeForTick(2);
  ok('>>> at 1/4 the app plans on 150 mi of backup, flagged as backup',
     quarter.miles === 150 && quarter.backup === true, JSON.stringify(quarter));
  // ...and the floor below it still refuses, which is what keeps the limp
  // band a real promise rather than a slogan.
  const eighth = G.rangeForTick(1);
  ok('>>> at 1/8 there is nothing left, backup included — still a hard 0',
     eighth.miles === 0 && eighth.backup === false, JSON.stringify(eighth));
  ok('  and E is 0 too', G.rangeForTick(0).miles === 0);

  // THE INVARIANT THAT KEEPS v1.40.0 INTACT: an ordinary plan never spends
  // the backup. A driver at 3/8 gets the 150 mi above the quarter-tank floor,
  // NOT the 300 the backup scale would hand them — otherwise this release
  // would have quietly restored the old 1/8 floor for everyone.
  ok('>>> above the floor, nothing dips into the backup',
     [3,4,5,6,7,8].every(t => {
       const r = G.rangeForTick(t);
       return r.backup === false && r.miles === G.plannableMilesForTick(t);
     }), JSON.stringify([3,4,5,6,7,8].map(t => G.rangeForTick(t))));
  ok('  3/8 in particular still plans 150, not the backup scale\'s 300',
     G.rangeForTick(3).miles === 150 && G.backupMilesForTick(3) === 300);
  ok('  and a full tank is untouched — still the round 900',
     G.rangeForTick(8).miles === 900 && G.rangeForTick(8).backup === false);

  // Same clamping discipline as the rest of the module.
  ok('backupMilesForTick clamps below', G.backupMilesForTick(-4) === 0);
  ok('  and above, at the full tank minus the untouchable eighth',
     G.backupMilesForTick(99) === 1050);

  {
    // Proved with the real planner: at a quarter tank the app now REACHES a
    // stop 140 mi out that it previously could not see at all, and still
    // refuses one at 160 — the backup is 150 mi, not a blank cheque.
    const tier = 700;
    const r = G.rangeForTick(2);
    const burned = G.computeStartBurned(tier, r.miles);
    const near = [{ id: 'N', name: 'N', mile: 140, detourMi: 2, detour: 2 }];
    const far = [{ id: 'F', name: 'F', mile: 160, detourMi: 2, detour: 2 }];
    ok('>>> a stop 140 mi out is now reachable on the backup reserve',
       FuelPlan.planFuel(600, near, tier, burned).plan.length === 1,
       JSON.stringify(FuelPlan.planFuel(600, near, tier, burned).gap));
    ok('  and one at 160 is still out of reach — 150 mi is the whole band',
       FuelPlan.planFuel(600, far, tier, burned).plan.length === 0);
    // The old behaviour, kept honest: at 1/8 the planner still returns the
    // degenerate zero-width gap the floor panel is written for.
    const spent = G.computeStartBurned(tier, G.rangeForTick(1).miles);
    const none = FuelPlan.planFuel(600, near, tier, spent);
    ok('>>> at 1/8 it is still the degenerate {0,0} gap — the floor panel case',
       none.ok === false && none.plan.length === 0
       && none.gap.fromMile === 0 && none.gap.deadMile === 0, JSON.stringify(none.gap));
  }
}

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
  // THE RESERVE IS SIZED TO THE DELIVERY (v1.56.0), not to a tank fraction.
  // The flat half tank held back 300 mi whether fuel was across the street or
  // 200 miles away — over 84 real plans, sizing it to the delivery dropped a
  // stop from 47 and added one to none.
  ok('>>> the flat half-tank toggle is gone from the module',
     !('ARRIVAL_TOGGLE_TICK' in G));

  // The circuity factor is the one number here that could strand someone, so
  // it inflates the straight line rather than hoping about it.
  ok('straight-line miles are inflated to road miles', G.DELIVERY_DETOUR_FACTOR === 1.3);
  ok('  and roadMilesToFuel applies it', Math.round(G.roadMilesToFuel(100)) === 130);
  ok('  a nonsense distance is zero, never negative',
     G.roadMilesToFuel(-5) === 0 && G.roadMilesToFuel(0) === 0);

  // THE ARITHMETIC, stated as the thing it has to satisfy rather than as a
  // table of outputs: reserve X means X + the quarter-tank floor sits in the
  // tank, of which the never-spent eighth is not available to go find fuel.
  {
    let broken = null;
    for (const d of [1, 5, 19, 26, 42, 80, 115, 116, 150, 194, 202, 300, 400]) {
      const reserve = G.reserveToReachFuel(d);
      const arrival = reserve + G.milesForTick(G.RESERVE_TICKS);
      if (!G.canReachFuelAfter(arrival + 0.001, d)) broken = { d, reserve, arrival };
    }
    ok('>>> holding the reserve it asks for always reaches the fuel it sized for',
       broken === null, JSON.stringify(broken));
  }
  ok('>>> fuel close to the delivery costs NOTHING — the untouched eighth covers it',
     G.reserveToReachFuel(19) === 0 && G.reserveToReachFuel(42) === 0
     && G.reserveToReachFuel(100) === 0,
     JSON.stringify([19, 42, 100].map(d => G.reserveToReachFuel(d))));
  ok('  which is the common case: the median delivery is ~26 mi from fuel',
     G.reserveToReachFuel(26) === 0);
  ok('>>> a remote delivery costs real range',
     Math.round(G.reserveToReachFuel(194)) === 102
     && Math.round(G.reserveToReachFuel(202)) === 113,
     JSON.stringify([G.reserveToReachFuel(194), G.reserveToReachFuel(202)]));
  ok('  and it rises with distance, never falls',
     [1,50,100,150,200,300,400].every((d,i,a) => i===0
       || G.reserveToReachFuel(d) >= G.reserveToReachFuel(a[i-1])));
  ok('  no delivery given -> no reserve, rather than a throw',
     G.reserveToReachFuel(null) === 0 && G.reserveToReachFuel(undefined) === 0
     && G.reserveToReachFuel(0) === 0);

  // canReachFuelAfter is the same question asked of a finished plan, and the
  // two must agree or the advice line contradicts the plan that produced it.
  ok('>>> the reported run: 439 mi in the tank reaches fuel 19 mi out',
     G.canReachFuelAfter(439, 19));
  ok('  and the quarter-tank floor alone does NOT reach fuel 202 mi out',
     !G.canReachFuelAfter(G.milesForTick(G.RESERVE_TICKS), 202));
  ok('  the never-spent eighth is excluded from what is available',
     !G.canReachFuelAfter(G.milesForTick(G.BACKUP_RESERVE_TICKS) + 10, 20));

  {
    // The honest-degradation contract for a reserve no route can meet.
    const dense = [];
    for (let m = 100; m <= 900; m += 100) dense.push({ id: 'd' + m, name: 'd' + m, mile: m, detour: 2 });
    const over = FuelPlan.planFuel(900, dense, 500, 0, 600);
    ok('>>> an oversized reserve (600 > a 500-mi range) degrades to a flagged shortfall',
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

  // Same arithmetic as the gauge's own plannable-miles reading, deliberately:
  // one question asked from the two ends of the trip. If they ever diverge,
  // the tank has two different floors and one of them is wrong.
  ok('agrees with plannableMilesForTick at every tick',
     [0,1,2,3,4,5,6,7,8].every(t => G.arrivalReserveMiles(t) === G.plannableMilesForTick(t)));

  // Defensive, same shape as the rest of this module: clamped, never negative.
  ok('clamped below', G.arrivalReserveMiles(-3) === 0);
  ok('clamped above at the full tank minus the floor', G.arrivalReserveMiles(99) === 900);
}

// WHAT THE PUMP TAKES (v1.58.0) — the fill, not the leg burned getting there.
{
  const FULL = G.FULL_TANK_MILES;
  ok('>>> a later stop pumps exactly its leg: it left the last stop full',
     G.fillMilesAt(1, 400, G.milesForTick(5)) === 400
     && G.fillMilesAt(3, 250, G.milesForTick(3)) === 250,
     JSON.stringify([G.fillMilesAt(1, 400, G.milesForTick(5)),
                     G.fillMilesAt(3, 250, G.milesForTick(3))]));
  ok('  and the start reading cannot touch a later stop, whatever it says',
     [8,7,6,5,4,3,2].every(t => G.fillMilesAt(2, 300, G.milesForTick(t)) === 300));
  ok('>>> leaving FULL, the first stop pumps its leg too',
     G.fillMilesAt(0, 400, FULL) === 400);
  ok('>>> leaving part-full, the first stop also replaces what was missing',
     G.fillMilesAt(0, 304, G.milesForTick(5)) === 754,
     String(G.fillMilesAt(0, 304, G.milesForTick(5))));
  // THE REPORTED RUN. Midland at 5/8, 304 mi to Petro El Paso: the leg reads
  // 37 gal and looks 23 short, the real fill is ~91 and clears the line.
  ok('  which turns the reported "23 gal short" into a credit',
     !G.earnsCredit(304) && G.earnsCredit(G.fillMilesAt(0, 304, G.milesForTick(5))));
  // The identity that makes the whole thing checkable: whatever you arrive
  // with plus what you pump is a full tank.
  {
    let broken = null;
    for (const t of [8,7,6,5,4,3]) {
      const start = G.milesForTick(t);
      for (const leg of [50, 120, 300, 450, 600, 750, 900]) {
        if (leg > start) continue;
        const fill = G.fillMilesAt(0, leg, start);
        if (Math.abs((start - leg) + fill - FULL) > 1e-9) broken = { t, leg, fill };
      }
    }
    ok('>>> arriving fuel + fill always comes to exactly one tank',
       broken === null, JSON.stringify(broken));
  }
  ok('  and a fill can never exceed the tank',
     [0,1,2].every(i => [0, 300, 900, 5000].every(l =>
       G.fillMilesAt(i, l, 0) <= FULL)));
}

// WHERE THE NEEDLE SITS (v1.59.0). Flooring never over-stated but understated
// by up to a whole mark; this says the position and still never over-states.
{
  const at = mi => G.needleReading(mi / G.MILES_PER_TICK);
  ok('>>> the reported case: 439 mi reads as just under 3/8, not as 1/4',
     at(439) === 'just under 3/8', at(439));
  ok('  on a mark, it says so plainly', at(450) === 'about 3/8' && at(600) === 'about 1/2',
     JSON.stringify([at(450), at(600)]));
  ok('  midway, it names both marks', at(521) === 'between 3/8 and 1/2', at(521));
  ok('  and the ends behave', at(1200) === 'about F' && at(0) === 'about E',
     JSON.stringify([at(1200), at(0)]));
  // THE PROPERTY WORTH KEEPING from the flooring it replaces.
  {
    let overstated = null;
    for (let m = 0; m <= G.FULL_TANK_MILES; m += 7) {
      const r = at(m);
      const named = r.replace(/^(about|just under|between .* and) /, '');
      const claimed = ['E','1/8','1/4','3/8','1/2','5/8','3/4','7/8','F'].indexOf(named)
                      * G.MILES_PER_TICK;
      // "about X" claims at least X; "just under Y" and "between X and Y" claim
      // less than the upper mark. Neither may promise fuel that is not there.
      if (r.startsWith('about') && m + 1e-9 < claimed) overstated = { m, r };
      if (!r.startsWith('about') && m >= claimed) overstated = { m, r };
    }
    ok('>>> no reading ever promises more fuel than the tank holds',
       overstated === null, JSON.stringify(overstated));
  }
  ok('  out-of-range input is clamped, not thrown on',
     G.needleReading(-3) === 'about E' && G.needleReading(99) === 'about F');
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
  ok('>>> the tiers are 600 / 750 / 900 (v1.57.0)',
     T.regular === 600 && T.long === 750 && T.max === 900, JSON.stringify(T));
  // THE TICK-SCALE CLAIM, SEVENTH REVISION — and the first one that is a
  // property rather than a coincidence. Every tier is now a whole number of
  // marks, so each names the reading the driver pulls IN at. The old pin
  // asserted the opposite (exactly one on the scale, the other two kept off it
  // on purpose); asserting that now would pin a design that is gone.
  ok('Max is exactly 6 ticks — the whole plannable span',
     T.max === 6 * G.MILES_PER_TICK);
  ok('>>> every tier is a whole number of gauge marks',
     Object.values(T).every(m => m % G.MILES_PER_TICK === 0),
     JSON.stringify(Object.entries(T).map(([k, m]) => k + ':' + (m / G.MILES_PER_TICK))));
  ok('  and they are consecutive marks — 4, 5, 6',
     T.regular / G.MILES_PER_TICK === 4 && T.long / G.MILES_PER_TICK === 5
     && T.max / G.MILES_PER_TICK === 6);
  // The claim a driver can act on: run a tier out and this is what the needle
  // reads when you pull in. Derived from the tank, never restated.
  ok('>>> each tier lands the driver at 1/2, 3/8 and 1/4 respectively',
     G.tickLabel((G.FULL_TANK_MILES - T.regular) / G.MILES_PER_TICK) === '1/2'
     && G.tickLabel((G.FULL_TANK_MILES - T.long) / G.MILES_PER_TICK) === '3/8'
     && G.tickLabel((G.FULL_TANK_MILES - T.max) / G.MILES_PER_TICK) === '1/4',
     JSON.stringify(Object.entries(T).map(([k, m]) =>
       k + ':' + G.tickLabel((G.FULL_TANK_MILES - m) / G.MILES_PER_TICK))));
  // Every tier now reaches the credit line on a full leg, which the 500-mi
  // Regular did not: 500 mi is 60.3 gal at 8.5 mpg but only 57.6 at a real
  // 8.9, so it sat on the wrong side of the coin toss the mpg note describes.
  ok('  and every tier can earn a credit on a full leg',
     Object.values(T).every(m => G.earnsCredit(m)),
     JSON.stringify(Object.values(T).map(m => Math.round(G.combinedGallons(m)))));
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
