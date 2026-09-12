// v1.51.0 — what a fuel stop is WORTH, and where the stops go so that it is
// worth something. Two things the app had no concept of until now: gallons,
// and a minimum useful leg.
//
// This file exists because a mutation run found the gap it fills. The browser
// suite drives Auto over a real corridor — and on that corridor the spacing
// pass is INERT, because nothing between mile 430 and 622 exists to balance
// the legs. So disabling the pass entirely, and flipping its penalty to the
// two-sided version that measurably made plans worse, both sailed through
// every test there was. Behaviour that only shows on some geographies needs
// fixtures that guarantee the geography.

const G = require('../lib/gauge.js');
const { planFuel, spaceFills } = require('../lib/fuelplan.js');
let pass = 0, fail = 0;
const ok = (n, c, e = '') => { c ? (pass++, console.log('  PASS', n)) : (fail++, console.log('  FAIL', n, e)); };

const gal = mi => G.combinedGallons(mi);
const legsOf = plan => { let prev = 0; return plan.map(s => { const l = s.mile - prev; prev = s.mile; return l; }); };
const worstFill = plan => Math.min(...legsOf(plan).map(gal));
const dense = (step, to) => {
  const out = [];
  for (let m = step; m <= to; m += step) out.push({ id: 's' + m, name: 'm' + m, mile: m, detour: 1 });
  return out;
};

console.log('=== gallons: the assumptions, stated and pinned ===');
ok('8.5 mpg — under the measured 8.9 on purpose, so a claimed credit is real',
   G.MPG === 8.5);
ok('DEF rides at 2.5% of diesel volume', G.DEF_RATIO === 0.025);
ok('the credit is 60 COMBINED gallons', G.CREDIT_GALLONS === 60);
ok('>>> a 600-mi leg — half a tank — pumps ~72 combined gal',
   Math.round(gal(600)) === 72, String(gal(600)));
ok('>>> and the credit line sits at ~498 mi, just under half a tank',
   Math.round(G.CREDIT_MILES) === 498, String(G.CREDIT_MILES));
ok('  so the target leg clears the credit with room, not by a hair',
   G.earnsCredit(G.targetFillMiles())
   && gal(G.targetFillMiles()) - G.CREDIT_GALLONS > 10,
   String(gal(G.targetFillMiles()) - G.CREDIT_GALLONS));
ok('  a 458-mi leg is short, and by ~5 gal — the case that started this',
   !G.earnsCredit(458) && Math.round(G.CREDIT_GALLONS - gal(458)) === 5, String(gal(458)));
ok('the credit boundary is exact at CREDIT_MILES',
   G.earnsCredit(G.CREDIT_MILES) && !G.earnsCredit(G.CREDIT_MILES - 1));

console.log('\n=== the tanks cannot pump more than they hold ===');
// Dual 100s at 90%. Nothing on a real route approaches it — this is here so a
// long leg, or a future change to MPG, cannot print a number the pump would
// refuse. A mutation removing the cap escaped every other test.
ok('usable capacity is 180 gal', G.USABLE_GALLONS === 180);
ok('>>> a leg longer than the tanks can cover reports the CEILING, not the arithmetic',
   gal(4000) === 180 && 4000 / G.MPG * 1.025 > 400, String(gal(4000)));
ok('  and the cap never interferes below it',
   Math.abs(gal(600) - 600 / G.MPG * 1.025) < 1e-9);
ok('  180 gal at 8.5 mpg is 1530 mi — well past the 1200-mi planning tank',
   G.USABLE_GALLONS * G.MPG === 1530 && G.FULL_TANK_MILES === 1200);

console.log('\n=== the needle at the receiver: the TANK, never the tier ===');
// A truck that filled 134 mi ago is at 7/8 whether its tier says 500 or 900.
ok('>>> arrival is the tank less the final leg',
   G.fuelAtArrival(G.FULL_TANK_MILES, 134) === 1066);
ok('  in ticks, that is 7.1 — read DOWN to 7/8, never up to F',
   Math.abs(G.tickAtArrival(G.FULL_TANK_MILES, 134) - 7.106) < 0.01
   && G.tickLabel(Math.floor(G.tickAtArrival(G.FULL_TANK_MILES, 134))) === '7/8');
ok('>>> and it is independent of the tier entirely',
   G.tickAtArrival(G.FULL_TANK_MILES, 600) === G.tickAtArrival(G.FULL_TANK_MILES, 600));
ok('  a 600-mi final leg lands exactly on half',
   G.tickAtArrival(G.FULL_TANK_MILES, 600) === G.TARGET_FILL_TICK);
ok('  one mile further is under it, which is what the advice keys on',
   G.tickAtArrival(G.FULL_TANK_MILES, 601) < G.TARGET_FILL_TICK);
ok('never negative, however long the leg',
   G.fuelAtArrival(G.FULL_TANK_MILES, 9999) === 0 && G.tickAtArrival(1200, 9999) === 0);

console.log('\n=== spaceFills: the pass that keeps fills worth stopping for ===');
{
  // THE CASE THAT MOTIVATED IT. Greedy takes the furthest reachable stop
  // every time, which front-loads the distance and leaves a short fill.
  const stops = dense(100, 1300);
  const R = 1200, range = 700, ask = 300;
  const greedy = planFuel(R, stops.filter(s => s.mile < R), range, 0, ask);
  ok('fixture: greedy needs 2 stops and leaves a SHORT fill',
     greedy.ok && greedy.plan.length === 2 && worstFill(greedy.plan) < 60,
     JSON.stringify(legsOf(greedy.plan).map(l => Math.round(gal(l)))));
  const spaced = spaceFills(R, stops.filter(s => s.mile < R), range, 0, ask, 2, G.targetFillMiles());
  ok('>>> spacing turns it into two fills that BOTH earn a credit',
     spaced && spaced.length === 2 && worstFill(spaced) >= 60,
     JSON.stringify(legsOf(spaced).map(l => Math.round(gal(l)))));
  ok('  without adding a stop — more stops would mean smaller fills',
     spaced.length === greedy.plan.length);
  ok('  and planFuel applies it when handed a target',
     worstFill(planFuel(R, stops.filter(s => s.mile < R), range, 0, ask, G.targetFillMiles()).plan) >= 60);
  ok('>>> while WITHOUT a target the old plan is returned unchanged',
     JSON.stringify(planFuel(R, stops.filter(s => s.mile < R), range, 0, ask).plan)
       === JSON.stringify(greedy.plan));
}
{
  // THE ONE-SIDED PENALTY. A first cut scored distance from the target in both
  // directions and pulled a perfectly good 700-mi leg (84 gal) back to 600
  // (72) to sit nearer the mark — costing gallons and arrival cushion for
  // nothing. Only SHORT legs are a problem, so only short legs score.
  const stops = dense(100, 900);
  const R = 1000, range = 700, ask = 300;
  const spaced = spaceFills(R, stops.filter(s => s.mile < R), range, 0, ask, 1, G.targetFillMiles());
  ok('>>> a leg already past the target is NOT pulled back to it',
     spaced && spaced[0].mile === 700, JSON.stringify(spaced && spaced[0].mile));
  ok('  which keeps the bigger fill', Math.round(gal(spaced[0].mile)) === 84);
}
{
  // Constraints it must never break, whatever it is optimising.
  const stops = dense(100, 1600);
  const R = 1700, range = 900, ask = 300;
  const n = planFuel(R, stops.filter(s => s.mile < R), range, 0, ask).plan.length;
  const spaced = spaceFills(R, stops.filter(s => s.mile < R), range, 0, ask, n, G.targetFillMiles());
  ok('>>> no leg exceeds the range', legsOf(spaced).every(l => l <= range + 1e-9),
     JSON.stringify(legsOf(spaced)));
  ok('>>> the arrival reserve still holds', R - spaced[spaced.length - 1].mile <= range - ask + 1e-9);
  ok('  legMiles is filled in, as the greedy plan does',
     spaced.every(s => typeof s.legMiles === 'number'));
  ok('  and startBurned shortens the FIRST reach only',
     (spaceFills(R, stops.filter(s => s.mile < R), range, 400, ask, n, G.targetFillMiles()) || [{}])[0].mile <= 500);
}
{
  // Degenerate inputs: it declines rather than inventing something.
  const stops = dense(100, 900);
  ok('no target -> no opinion', spaceFills(1000, stops, 700, 0, 300, 1, 0) === null);
  ok('no stops to place -> no opinion', spaceFills(1000, stops, 700, 0, 300, 0, 600) === null);
  ok('more stops than candidates -> no opinion',
     spaceFills(1000, stops.slice(0, 1), 700, 0, 300, 3, 600) === null);
  ok('an unsatisfiable reserve -> no opinion, and no throw',
     spaceFills(1000, stops, 700, 0, 5000, 1, 600) === null);
}
{
  // SOMETIMES A SHORT LEG CANNOT BE HELPED, and the pass must return the best
  // available rather than nothing. The real I-40 corridor spacing: nothing
  // between 430 and 622 to balance a 1200-mi run.
  const real = [34, 314, 430, 622, 767, 959, 1080]
    .map((m, i) => ({ id: 'r' + i, name: 'r' + i, mile: m, detour: 1 }));
  const spaced = spaceFills(1200, real, 700, 0, 300, 2, G.targetFillMiles());
  ok('>>> it still returns a plan when no arrangement earns two credits',
     spaced && spaced.length === 2, JSON.stringify(spaced && legsOf(spaced)));
  ok('  and it is the best worst-fill available (622 then 1080, 55 gal)',
     Math.round(worstFill(spaced)) === 55, String(worstFill(spaced)));
  ok('  which the caller is expected to LABEL, not hide',
     !G.earnsCredit(Math.min(...legsOf(spaced))));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
