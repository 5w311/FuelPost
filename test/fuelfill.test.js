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

// ===========================================================================
// v1.52.0 — the stop Auto declines to take.
//
// The measured finding behind this: the arrival reserve is what CREATES short
// fills. Forcing the truck to reach the receiver with a cushion can add a stop
// 20 mi from the door that pumps 55 gal, earns no credit, and costs a full
// pull-in. Option 3 of three: skip it, but only within the last stretch of the
// run, where the same fuel can be bought after dropping the trailer.
// ===========================================================================
console.log('\n=== the skip rule: the three conditions, each one load-bearing ===');
{
  const skip = { creditMiles: G.CREDIT_MILES, withinMiles: G.SKIP_NEAR_RECEIVER_MI };
  const tl = G.targetFillMiles();
  ok('100 mi is the near-receiver threshold', G.SKIP_NEAR_RECEIVER_MI === 100);

  // THE REPORTED SHAPE, reduced to the two stops that make it. One usable stop
  // before the thin stretch and one near the receiver, so NO arrangement can
  // give the final leg a credit — which is what makes the stop skippable
  // rather than movable.
  const forced = [
    { id: 'a', name: 'Mid', mile: 620, detour: 2 },
    { id: 'z', name: 'Near', mile: 1080, detour: 2 }
  ];
  const off  = planFuel(1100, forced, 700, 0, 0, 0);
  const on   = planFuel(1100, forced, 700, 0, 300, tl);
  const skpd = planFuel(1100, forced, 700, 0, 300, tl, skip);

  ok('>>> the reserve forces a second stop the range did not need',
     off.plan.length === 1 && on.plan.length === 2,
     JSON.stringify([off.plan.map(s => s.mile), on.plan.map(s => s.mile)]));
  ok('  and that forced stop earns no credit — 55 gal, 20 mi from the door',
     Math.round(gal(on.plan[1].legMiles)) === 55 && Math.round(1100 - on.plan[1].mile) === 20,
     JSON.stringify([gal(on.plan[1].legMiles), 1100 - on.plan[1].mile]));
  ok('>>> Auto skips it, and reports WHICH stop it skipped',
     skpd.plan.length === 1 && skpd.droppedFinal && skpd.droppedFinal.mile === 1080,
     JSON.stringify([skpd.plan.map(s => s.mile), skpd.droppedFinal]));
  ok('  the report carries the distance from delivery, so the UI need not recompute it',
     skpd.droppedFinal.milesFromDelivery === 20, String(skpd.droppedFinal.milesFromDelivery));
  ok('  the plan that remains is the one the switch OFF would have driven',
     JSON.stringify(skpd.plan.map(s => s.mile)) === JSON.stringify(off.plan.map(s => s.mile)),
     JSON.stringify(skpd.plan.map(s => s.mile)));

  // THE SAFETY ARGUMENT, PINNED. This is the whole reason the trade is
  // allowed: the range the planner spends is already net of RESERVE_TICKS, so
  // spending all of it lands at a quarter tank, not at empty.
  const arriveTick = G.tickAtArrival(G.FULL_TANK_MILES, skpd.finalLegMiles);
  ok('>>> skipping cannot strand anyone: the arrival is still half a tank here',
     arriveTick >= 4 - 1e-9, String(arriveTick));
  ok('  and at worst it is the quarter-tank floor, never below it — that floor is why',
     G.plannableMilesForTick(G.RESERVE_TICKS) === 0
       && G.milesForTick(G.RESERVE_TICKS) === 300,
     String(G.milesForTick(G.RESERVE_TICKS)));

  // EACH CONDITION ON ITS OWN. Remove one at a time; the stop must survive.
  {
    // (a) not reserve-forced: the truck cannot reach the receiver without it.
    // Being near the receiver AND range-needed only coexist in a narrow window
    // — the leg has to miss a credit, so the range must be under ~600 — hence
    // the tight numbers: 560 mi of route on 500 mi of range, one stop at 470
    // that is 90 mi from the door and pumps 56 gal. Short, close, and
    // unskippable, because without it the truck stops 60 mi shy.
    const needed = planFuel(560, [{ id: 'z', name: 'Near', mile: 470, detour: 2 }],
                            500, 0, 300, tl, skip);
    ok('>>> a stop the RANGE needs is never skipped, credit or no credit',
       needed.ok && needed.plan.length === 1 && needed.droppedFinal === null,
       JSON.stringify([needed.ok, needed.plan.map(s => s.mile), needed.droppedFinal]));
    ok('  and that stop really was short and really was near the door',
       !G.earnsCredit(needed.plan[0].legMiles) && 560 - needed.plan[0].mile <= 100,
       JSON.stringify([Math.round(gal(needed.plan[0].legMiles)), 560 - needed.plan[0].mile]));
  }
  {
    // (b) earns a credit: move the near-receiver stop out so its leg is long.
    const earns = [
      { id: 'a', name: 'Mid', mile: 420, detour: 2 },
      { id: 'z', name: 'Near', mile: 1080, detour: 2 }
    ];
    const r = planFuel(1100, earns, 700, 0, 300, tl, skip);
    ok('>>> a stop that EARNS its credit is kept, even 20 mi from the receiver',
       r.droppedFinal === null && r.plan.length === 2 && G.earnsCredit(r.plan[1].legMiles),
       // Evidence must survive the assertion being FALSE: dereferencing
       // plan[1] here crashes the file when the stop was wrongly skipped,
       // which swallows every assertion below it and reads as a pass.
       JSON.stringify([r.plan.map(s => s.mile), r.droppedFinal && r.droppedFinal.mile]));
  }
  {
    // (c) near the receiver: same short fill, but 300 mi out — mid-route, and
    // mid-route is where a fuel stop belongs however small the fill.
    const midRoute = [
      { id: 'a', name: 'Mid', mile: 620, detour: 2 },
      { id: 'z', name: 'Far', mile: 800, detour: 2 }
    ];
    const r = planFuel(1100, midRoute, 700, 0, 300, tl, skip);
    ok('>>> a short fill 300 mi from delivery is NOT near the receiver, so it stays',
       r.droppedFinal === null,
       JSON.stringify([r.plan.map(s => s.mile), r.droppedFinal]));
  }

  // THE ORDER OF THE TWO PASSES, which is not arbitrary. Spacing runs first so
  // that a stop it can rescue is rescued rather than skipped.
  {
    const rescuable = [];
    for (let m = 100; m <= 620; m += 60) rescuable.push({ id: 'a' + m, name: 'a' + m, mile: m, detour: 2 });
    for (const m of [1000, 1040, 1080]) rescuable.push({ id: 'z' + m, name: 'z' + m, mile: m, detour: 2 });
    const r = planFuel(1100, rescuable, 700, 0, 300, tl, skip);
    ok('>>> spacing runs FIRST: a stop it can move into a credit is kept, not skipped',
       r.droppedFinal === null && r.plan.length === 2 && G.earnsCredit(r.plan[1].legMiles),
       JSON.stringify([r.plan.map(s => s.mile), r.plan.map(s => Math.round(gal(s.legMiles))),
                       r.droppedFinal && r.droppedFinal.mile]));
  }

  // INERTNESS. The v1.42.0 invariant — asking for fuel at delivery never
  // arrives with less than not asking — is deliberately relaxed by this rule,
  // and ONLY by explicit opt-in. Every caller that does not pass the option
  // must plan identically, and a caller with no reserve must be unaffected
  // even if it does pass it.
  {
    const stops = dense(60, 1080);
    let drift = null, firedNoReserve = null;
    for (const routeMiles of [500, 700, 900, 1100, 1300]) {
      for (const range of [500, 700, 900]) {
        for (const res of [0, 150, 300, 450]) {
          const a = planFuel(routeMiles, stops, range, 0, res, tl);
          const b = planFuel(routeMiles, stops, range, 0, res, tl, skip);
          if (!a.ok || !b.ok) continue;
          if (res === 0 && b.droppedFinal) firedNoReserve = { routeMiles, range };
          if (!b.droppedFinal &&
              JSON.stringify(a.plan.map(s => s.mile)) !== JSON.stringify(b.plan.map(s => s.mile))) {
            drift = { routeMiles, range, res };
          }
        }
      }
    }
    ok('>>> with no reserve the rule is inert — nothing forced the stop, nothing to skip',
       firedNoReserve === null, JSON.stringify(firedNoReserve));
    ok('>>> and when it does not fire it changes nothing at all',
       drift === null, JSON.stringify(drift));
  }

  // LEGALITY, swept. A skipped plan must still be drivable: the final leg can
  // never exceed what the truck leaves its last stop (or the shipper) with.
  {
    const stops = dense(40, 1400);
    let illegal = null, fired = 0;
    for (const routeMiles of [600, 900, 1200, 1450]) {
      for (const range of [500, 700, 900]) {
        for (const res of [150, 300, 450]) {
          for (const burned of [0, 200]) {
            const r = planFuel(routeMiles, stops, range, burned, res, tl, skip);
            if (!r.ok) continue;
            if (r.droppedFinal) fired++;
            const lastPos = r.plan.length ? r.plan[r.plan.length - 1].mile : 0;
            const avail = r.plan.length ? range : Math.max(0, range - burned);
            if (routeMiles - lastPos > avail + 1e-6) {
              illegal = { routeMiles, range, res, burned, final: routeMiles - lastPos, avail };
            }
          }
        }
      }
    }
    ok('>>> every skipped plan is still drivable — the final leg always fits',
       illegal === null, JSON.stringify(illegal));
    ok('  and the sweep actually exercised the skip', fired > 0, String(fired));
  }

  // THE RESPACE MUST DROP THE RESERVE IT JUST SURRENDERED. Found by a
  // mutation that survived both suites: passing `arrivalReserve` to the
  // re-spacing pass instead of 0 keeps a constraint the skip has just given
  // up, so spaceFills rejects every arrangement, returns null, and the stops
  // stay where the greedy put them. It is not a cosmetic difference — on this
  // fixture (found by searching 40,000 random corridors for a disagreement)
  // the kept stop moves from mile 457 to mile 232 and its fill halves, from
  // 55 gal to 28. A release whose whole point is the size of a fill cannot
  // leave that untested.
  {
    const fixture = [91, 232, 457, 518, 528, 641, 652]
      .map((m, i) => ({ id: 'x' + i, name: 'x' + i, mile: m, detour: 1 }));
    const r = planFuel(682, fixture, 500, 0, 300, tl, skip);
    ok('>>> after a skip the stops are re-spaced WITHOUT the surrendered reserve',
       r.droppedFinal && r.droppedFinal.mile === 652 && r.plan.length === 1
         && r.plan[0].mile === 457,
       JSON.stringify([r.plan.map(s => s.mile), r.droppedFinal && r.droppedFinal.mile]));
    ok('  which is worth 55 gal at that stop rather than the 28 the greedy left',
       Math.round(gal(r.plan[0].legMiles)) === 55 && Math.round(gal(232)) === 28,
       JSON.stringify([gal(r.plan[0].legMiles), gal(232)]));
  }

  // Skipping the ONLY stop is allowed and turns the run into a no-stop one,
  // which is a real answer the app already knows how to render.
  {
    const one = [{ id: 'z', name: 'Near', mile: 480, detour: 2 }];
    const r = planFuel(500, one, 700, 0, 300, tl, skip);
    ok('>>> the only stop can be skipped, leaving a no-fuel-required run',
       r.ok && r.plan.length === 0 && r.droppedFinal && r.droppedFinal.mile === 480,
       JSON.stringify([r.plan.length, r.droppedFinal]));
  }
}

// ===========================================================================
// v1.53.0 — the second reason a forced stop stops being worth taking, found on
// the road rather than in a fixture. Coppell TX -> Redlands CA, 1375 mi at the
// 900-mi tier, leaving at 7/8: Auto added TA Tonopah at mile 1105 for a 490-mi
// leg (59 gal, a gallon under the line) while TA Ontario sits 19 mi from the
// receiver. Two stops to earn one credit, where one stop plus fuelling after
// the drop earns the same one. v1.52.0's window could never catch it —
// Tonopah is 270 mi out — because it measured from the wrong end.
// ===========================================================================
console.log('\n=== the near-delivery path: fuel waiting at the destination ===');
{
  const tl = G.targetFillMiles();
  const base = { creditMiles: G.CREDIT_MILES, withinMiles: G.SKIP_NEAR_RECEIVER_MI };
  const withFuel = { ...base, fuelNearDelivery: true };
  ok('50 mi is what counts as fuel near the delivery', G.FUEL_NEAR_DELIVERY_MI === 50);

  // THE REPORTED RUN, to scale. Both stops are the real ones, at their real
  // miles; startBurned is the 7/8 reading from the screenshot.
  const route = 1375, range = 900;
  const burned = G.computeStartBurned(range, G.plannableMilesForTick(7));
  // The flat half-tank reserve the app used when this run was reported.
  const reserve = 300;
  const real = [
    { id: 'ep', name: 'Petro El Paso', mile: 614, detour: 0.1 },
    { id: 'tn', name: 'TA Tonopah', mile: 1105, detour: 0.3 }
  ];
  const off  = planFuel(route, real, range, burned, 0, 0);
  const v152 = planFuel(route, real, range, burned, reserve, tl, base);
  const v153 = planFuel(route, real, range, burned, reserve, tl, withFuel);

  ok('fixture: it reproduces the screenshots — 1 stop off, 2 on, 74 and 59 gal',
     off.plan.length === 1 && v152.plan.length === 2
       && Math.round(gal(v152.plan[0].legMiles)) === 74
       && Math.round(gal(v152.plan[1].legMiles)) === 59,
     JSON.stringify([off.plan.map(s => s.mile), v152.plan.map(s => s.mile),
                     v152.plan.map(s => Math.round(gal(s.legMiles)))]));
  ok('  and the forced stop is 270 mi out, far outside the near-receiver window',
     route - v152.plan[1].mile === 270 && 270 > G.SKIP_NEAR_RECEIVER_MI,
     String(route - v152.plan[1].mile));
  ok('>>> so the v1.52.0 window alone cannot skip it — which is the bug',
     v152.droppedFinal === null, JSON.stringify(v152.droppedFinal));
  ok('>>> with fuel near the delivery, Auto declines it and matches the OFF plan',
     v153.droppedFinal !== null && v153.droppedFinal.name === 'TA Tonopah'
       && JSON.stringify(v153.plan.map(s => s.mile)) === JSON.stringify(off.plan.map(s => s.mile)),
     JSON.stringify([v153.plan.map(s => s.mile), v153.droppedFinal
                     && v153.droppedFinal.name]));
  ok('  the one stop that remains still earns its credit',
     G.earnsCredit(v153.plan[0].legMiles), String(Math.round(gal(v153.plan[0].legMiles))));
  ok('  so the skip costs zero credits — one from one stop instead of one from two',
     v153.plan.filter(st => G.earnsCredit(st.legMiles)).length
       === v152.plan.filter(st => G.earnsCredit(st.legMiles)).length,
     JSON.stringify([v152.plan.filter(st => G.earnsCredit(st.legMiles)).length,
                     v153.plan.filter(st => G.earnsCredit(st.legMiles)).length]));
  // The arrival is the trade, and it is the one the driver accepted: a quarter
  // tank at the receiver with a station 19 mi past it.
  ok('>>> and it still arrives on the quarter-tank floor, not below it',
     G.tickAtArrival(G.FULL_TANK_MILES, v153.finalLegMiles) >= G.RESERVE_TICKS - 1e-9,
     String(G.tickAtArrival(G.FULL_TANK_MILES, v153.finalLegMiles)));

  // THE FLAG IS NOT A LICENCE. Everything else still binds — this is the test
  // that stops "fuel near the delivery" from becoming "skip whatever you like".
  {
    // Still needs to be credit-less.
    const earns = [
      { id: 'a', name: 'Mid', mile: 420, detour: 2 },
      { id: 'z', name: 'Near', mile: 1080, detour: 2 }
    ];
    const r = planFuel(1100, earns, 700, 0, 300, tl, withFuel);
    ok('>>> a stop that earns its credit is still kept, fuel at the receiver or not',
       r.droppedFinal === null,
       JSON.stringify([r.plan.map(s => s.mile), r.droppedFinal && r.droppedFinal.mile]));
  }
  {
    // Still needs to be reserve-forced, not range-needed.
    const r = planFuel(560, [{ id: 'z', name: 'Near', mile: 470, detour: 2 }],
                       500, 0, 300, tl, withFuel);
    ok('>>> a stop the RANGE needs is still kept, fuel at the receiver or not',
       r.ok && r.plan.length === 1 && r.droppedFinal === null,
       JSON.stringify([r.ok, r.plan.map(s => s.mile), r.droppedFinal]));
  }
  {
    // And with no reserve there is nothing forced to skip.
    const stops = dense(60, 1080);
    let fired = null;
    for (const routeMiles of [700, 900, 1100, 1300]) {
      for (const range of [500, 700, 900]) {
        const r = planFuel(routeMiles, stops, range, 0, 0, tl, withFuel);
        if (r.ok && r.droppedFinal) fired = { routeMiles, range };
      }
    }
    ok('>>> and with no reserve the flag changes nothing — nothing forced a stop',
       fired === null, JSON.stringify(fired));
  }
  // The two tests are independent: the near-receiver path must still work on
  // its own, with no fuel at the destination.
  {
    const forced = [
      { id: 'a', name: 'Mid', mile: 620, detour: 2 },
      { id: 'z', name: 'Near', mile: 1080, detour: 2 }
    ];
    const r = planFuel(1100, forced, 700, 0, 300, tl, base);
    ok('>>> the near-receiver path still stands alone, with no fuel near delivery',
       r.droppedFinal !== null && r.droppedFinal.mile === 1080,
       JSON.stringify(r.droppedFinal && r.droppedFinal.mile));
  }
  // The flag must be an explicit true. A truthy-ish value arriving from a
  // caller that did not mean it would silently widen the rule.
  {
    const forced = [
      { id: 'a', name: 'Mid', mile: 614, detour: 2 },
      { id: 'z', name: 'Far', mile: 1105, detour: 2 }
    ];
    const r = planFuel(1375, forced, 900, burned, reserve, tl,
                       { ...base, fuelNearDelivery: 'yes' });
    ok('>>> the flag is read as a strict true, so a stray truthy value cannot widen it',
       r.droppedFinal === null, JSON.stringify(r.droppedFinal));
  }
}

// WHICH WAY 8.5 MPG ERRS. The fleet keeps 8.5, but an earlier comment claimed
// under-stating mpg under-states gallons, and that is arithmetically backwards
// — gallons are miles DIVIDED by mpg. Pinned because the labels this release
// leans on are built on it, and because a wrong justification is how a wrong
// number gets adopted later.
console.log('\n=== the direction of the mpg assumption ===');
{
  const at = (mi, mpg) => mi / mpg * (1 + G.DEF_RATIO);
  ok('the fleet figure is still 8.5', G.MPG === 8.5);
  ok('>>> 8.5 produces a HIGHER gallon estimate than the measured 8.9, not lower',
     at(500, 8.5) > at(500, 8.9),
     JSON.stringify([at(500, 8.5).toFixed(1), at(500, 8.9).toFixed(1)]));
  ok('  so a leg just over the credit line here can still miss it at the pump',
     at(500, 8.5) >= G.CREDIT_GALLONS && at(500, 8.9) < G.CREDIT_GALLONS,
     JSON.stringify([at(500, 8.5).toFixed(1), at(500, 8.9).toFixed(1)]));
  ok('  which is the opposite of how 8.5 behaves for RANGE, where it is conservative',
     G.MPG < 8.9);
  ok('  and the module says so in as many words, rather than the reverse',
     /for GALLONS, 8\.5 is optimistic/.test(
       require('fs').readFileSync(require('path').join(__dirname, '../lib/gauge.js'), 'utf8')));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
