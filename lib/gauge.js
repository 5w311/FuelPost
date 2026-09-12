// Pure fuel-gauge math: tick <-> miles conversion, emergency-zone check. No
// DOM, no network. formatGpsFallbackLabel/isPreciseFix live in lib/location.js
// — don't duplicate them here.

// 1200 since v1.40.0 (1000 in v1.39.0, 1200 in v1.36.0-v1.38.0): the tank is
// sized so that the PLANNABLE span is a round 900 mi, evenly divided. With the
// bottom quarter held back (RESERVE_TICKS 2, below), the six plannable eighths
// run 150 mi each and F plans exactly 900 — the same number as the Max tier,
// so the biggest range a driver can pick is exactly the range a full tank
// gives. The dial stays even end to end: 1200, 1050, 900, 750, 600, 450, 300,
// 150, E, of which the top six eighths are plannable and the bottom two are
// the driver's own cushion.
//
// (The fleet's 2025 Cascadias run 8.5 mpg on dual 100-gallon tanks, a
// comfortable ~1200 mi full-to-empty. v1.39.0 evened the whole tank to 1000;
// v1.40.0 moved the evenness to where it is actually read — the plannable
// span — and 1200 is what makes that span 900.)
//
// Every figure the app shows comes off these two constants and RESERVE_TICKS,
// so the whole app moves with these lines: the gauge readout, the limp
// distance, the arrival floor and aim, and the plannable ceiling.
const FULL_TANK_MILES = 1200;
const TICKS = 8;                // eighths, E(0) to F(8)
const MILES_PER_TICK = FULL_TANK_MILES / TICKS; // 150
const EMERGENCY_TICK_CEILING = 2; // ticks 0 and 1 (below 1/4 tank) are the emergency zone

function milesForTick(tick) {
  const t = Math.max(0, Math.min(TICKS, Math.round(tick)));
  return t * MILES_PER_TICK;
}

function tickForMiles(miles) {
  const m = Math.max(0, Math.min(FULL_TANK_MILES, miles));
  return Math.round(m / MILES_PER_TICK);
}

function isEmergencyZone(tick) {
  return tick < EMERGENCY_TICK_CEILING;
}

function tickLabel(tick) {
  const fracs = ['E', '1/8', '1/4', '3/8', '1/2', '5/8', '3/4', '7/8', 'F'];
  return fracs[Math.max(0, Math.min(TICKS, Math.round(tick)))];
}

// The unplannable band, raised from one eighth to a QUARTER in v1.40.0 at the
// fleet's direction: E through 1/4 is the driver's own fuel and the app will
// not plan a mile of it. It is never counted as plannable range, and stays
// nameable as physical "limp" distance in the floor message — 300 mi of it
// now, two eighths of the 1200 tank.
//
// This is the single most consequential constant in the file. Raising it does
// not just shrink the ceiling: it moves the ZERO of the whole plannable scale,
// because every "how much range is that" answer here is measured above it.
// The arrival reserve is the clearest case — asking to arrive at 1/4 used to
// cost 125 mi and now costs nothing at all, since 1/4 IS the floor. That is
// why ARRIVAL_TOGGLE_TICK below is derived from this constant rather than
// written as a number: a floor that swallowed the switch's own floor would
// leave a working-looking switch that changed no plan.
const RESERVE_TICKS = 2;

function plannableMilesForTick(tick) {
  const t = Math.max(0, Math.min(TICKS, Math.round(tick)));
  return Math.max(0, (t - RESERVE_TICKS) * MILES_PER_TICK);
}

// THE BACKUP RESERVE (v1.41.0). RESERVE_TICKS says the app will not PLAN on
// the bottom quarter — but refusing to plan and refusing to look are two
// different things, and until now a driver sitting on a quarter tank got a
// blank panel: no routing call, no stops, nothing but the limp figure. That
// is the moment they most need to see what is near them.
//
// So the band between 1/8 and 1/4 — one tick, 150 mi, the amber stretch on
// the gauge — is a BACKUP reserve rather than a dead zone. It is never spent
// by an ordinary plan (a driver at 3/8 still gets the 150 mi above the
// quarter-tank floor, not 300), but when the reading is already at or under
// the floor the app dips into it so it can go and find the few stops within
// reach. The last eighth stays untouchable: that is the limp band, and
// BACKUP_RESERVE_TICKS is what makes it so.
//
// Two floors, then, and they answer different questions:
//   RESERVE_TICKS (2, 1/4)        what a normal plan may not touch
//   BACKUP_RESERVE_TICKS (1, 1/8) what NOTHING may touch, ever
const BACKUP_RESERVE_TICKS = 1;

function backupMilesForTick(tick) {
  const t = Math.max(0, Math.min(TICKS, Math.round(tick)));
  return Math.max(0, (t - BACKUP_RESERVE_TICKS) * MILES_PER_TICK);
}

// The one question the app should actually ask a gauge reading: how far can
// this plan, and does that dip into the backup? Everything downstream — the
// readout, the range handed to the planner, the caution on the results —
// reads this rather than choosing between the two scales itself, because the
// choice is the same one every time and splitting it is how they drift apart.
//
// Above the floor: ordinary plannable range, backup untouched. At or under
// it: whatever the backup band still holds, flagged so the driver is told.
// At 1/8 the backup is spent too, and this returns 0 — the floor-gap panel,
// unchanged, because there really is nothing to plan.
function rangeForTick(tick) {
  const normal = plannableMilesForTick(tick);
  if (normal > 0) return { miles: normal, backup: false };
  const backup = backupMilesForTick(tick);
  return { miles: backup, backup: backup > 0 };
}

// How much fuel the driver wants LEFT when they get there, in miles, measured
// the same way as everything else on this scale: above the built-in floor.
//
// v1.27.0 added the arrival reserve, and the cleanest way to think about it is
// that RESERVE_TICKS was always an arrival reserve — a hard-coded one of 1/8
// that no driver could raise. This is the same floor with a dial on it. Which
// is why the arithmetic below is not merely similar to plannableMilesForTick's
// but IDENTICAL, and why this delegates instead of repeating it: the two
// functions are one question asked from opposite ends of the trip. "How far
// can I plan on running from here?" and "how far must I still be able to run
// when I arrive?" are the same subtraction.
//
// arrivalReserveMiles(RESERVE_TICKS) === 0, which is what makes the standard
// reserve exactly the behaviour every release before v1.27.0 had.

// The arrival switch is ONE number again since v1.42.0: with it on, no plan
// may land the driver under ARRIVAL_TOGGLE_TICK — half a tank, 300 mi of
// range above the floor.
//
// The history, since this dial has moved every which way: v1.27.0 offered a
// 1/8-1/2 dial, v1.30.1 dropped 1/8, v1.35.0 collapsed it to one switch at
// 1/2, v1.37.0 raised it to 5/8, v1.38.0 split it into a 1/4 floor plus a 1/2
// "aim", v1.40.0 pushed the floor to 3/8 when the app's own floor rose — and
// v1.42.0 deleted the aim and came back to the single 1/2 the fleet asked for
// in the first place.
//
// WHY THE AIM DIED. It was a SYMMETRIC target: the planner re-picked the last
// stop to land the arrival closest to 1/2, counting an arrival above it as
// just as wrong as one below. For a control a driver reads as "leave me some
// fuel", that is backwards. Measured on a real Dallas->Carteret run: at 700
// mi range the aim moved the last stop earlier and cut the arrival from 566
// mi to 350 — the switch made things WORSE than leaving it off — and at 900,
// where one stop covers the run, it had nothing it was allowed to re-pick and
// silently did nothing at all. A minimum has neither fault: the planner adds
// a stop when it must, always takes the furthest reachable one, and so lands
// the driver as full as the route allows and never under half.
//
// It must stay above RESERVE_TICKS to cost anything at all (arrivalReserveMiles
// is measured above that floor, so a tick at or under it asks for zero) —
// gauge.test.js pins that, and pinned it through v1.40.0's floor change.
const ARRIVAL_TOGGLE_TICK = 4;

function arrivalReserveMiles(tick) {
  return plannableMilesForTick(tick);
}

/* ---- Gallons, and what a stop is worth (v1.51.0) ----
   The app was pure miles until now, and miles are not what earns a shower
   credit: gallons are. A driver who tops off 300 mi into a tank pumps ~36
   gallons, waits in the same line, and earns nothing. So the planner needs to
   know what a leg is worth at the pump.

   MPG IS AN ASSUMPTION AND IS STATED AS ONE. 8.5 is the fleet's working
   figure and is deliberately below the 8.9 currently measured.

   WHICH WAY THAT ERRS DEPENDS ON THE QUESTION, and an earlier version of this
   comment had it backwards, so it is worth being exact. Gallons are miles
   DIVIDED by mpg, so a low mpg figure produces a HIGH gallon estimate:

     - for RANGE, 8.5 is conservative. Fewer miles per gallon means less
       range than the truck really has, and planning short is safe.
     - for GALLONS, 8.5 is optimistic. A 500-mi leg estimates 60.3 combined
       gal at 8.5 but pumps about 57.6 at a real 8.9 — so a leg sitting just
       above the credit line here can still miss it at the pump.

   One constant cannot be safe in both directions, and 8.5 is the fleet's
   number, so the gap is documented rather than papered over: treat a fill
   within a few gallons of CREDIT_GALLONS as a coin toss, not a credit. The
   labels the planner prints say "short of a credit" wherever the estimate
   itself falls under the line, which is the honest half of this.

   DEF rides at ~2.5% of diesel volume on a modern SCR engine, and the credit
   is counted on the COMBINED total, which is how the fleet's stops are
   scored — so it is combined gallons that this module reports. */
const MPG = 8.5;
const DEF_RATIO = 0.025;
const CREDIT_GALLONS = 60;

/* WHAT THE TANKS ACTUALLY HOLD, and why it does not contradict the 1200-mi
   model above. The fleet runs dual 100-gallon tanks that fill to 90%, so 180
   gallons is the real ceiling — which at 8.5 mpg would be 1530 mi of driving,
   not 1200. The 1200 is deliberately short of that: it is the COMFORTABLE
   full-to-empty the fleet plans on, and the difference is the margin nobody
   wants to spend. Both numbers are right; they answer different questions.

   The cap is here so a fill estimate can never claim more than the tanks can
   take. At the target leg it is nowhere near binding (~72 gal of 180) — it
   exists to stop a very long leg, or a future change to MPG, from printing a
   number the pump would refuse. */
const USABLE_GALLONS = 180;

function dieselGallons(miles) {
  return Math.max(0, miles) / MPG;
}
function combinedGallons(miles) {
  return Math.min(USABLE_GALLONS, dieselGallons(miles) * (1 + DEF_RATIO));
}
// The inverse, so the planner can work in the miles it already speaks.
function milesForCombinedGallons(gallons) {
  return Math.max(0, gallons) / (1 + DEF_RATIO) * MPG;
}
// ~498 mi at these numbers: the shortest leg that still earns a credit.
const CREDIT_MILES = milesForCombinedGallons(CREDIT_GALLONS);

function earnsCredit(miles) {
  // A hair of tolerance: a leg of exactly CREDIT_MILES must not fail on the
  // last bit of floating-point dust.
  return combinedGallons(miles) >= CREDIT_GALLONS - 1e-9;
}

/* WHERE AUTO AIMS TO FILL. The fleet's own read, and the reason this is a
   target rather than the credit line: filling when the gauge reads about half
   pumps ~72 combined gallons, which clears the 60-gallon credit with ~12 to
   spare. Aiming AT the credit line instead would put every stop on the edge
   of missing it, and a fuel plan that is only just good enough is not one.

   TARGET_FILL_TICK is 4 for the same reason ARRIVAL_TOGGLE_TICK is — half a
   tank is a natural place to think about — but they are NOT the same quantity
   and must not be collapsed into one constant: this is how empty the tank
   should be when the driver pulls IN to fuel, that one is how full it should
   be when they pull in to DELIVER. */
const TARGET_FILL_TICK = 4;
function targetFillMiles() {
  return milesForTick(TICKS) - milesForTick(TARGET_FILL_TICK);
}

/* WHEN A STOP IS NOT WORTH TAKING (v1.52.0). The arrival reserve is a
   minimum, and a minimum can force a stop the driver would never choose: on a
   1100-mi run at the 700-mi tier the reserve adds a second stop 20 mi from
   the receiver that pumps ~55 gal. That stop earns no credit, costs a full
   pull-in, and sits so close to the delivery that the same fuel could be
   bought AFTER dropping the trailer instead — which is the one place the
   driver is guaranteed to have time.

   So Auto is allowed to skip exactly that stop. The rule needs three things
   to be true at once, and all three matter:

     - it is reserve-forced: the truck reaches the receiver without it,
     - it earns no credit: its fill is under CREDIT_MILES,
     - it is within SKIP_NEAR_RECEIVER_MI of the receiver.

   WHY THIS CANNOT STRAND ANYONE, which is the whole reason it is safe to do:
   the range the planner spends is already net of RESERVE_TICKS. Arriving with
   zero PLANNABLE miles left means arriving at 1/4 of a tank — 300 real miles
   of diesel still in the tanks. Skipping the stop trades a nearly-full
   arrival for a quarter-tank one; it never trades it for an empty one. (On
   the backup band the same arithmetic lands at 1/8, 150 real miles, on a trip
   that by definition is shorter than that band.)

   100 mi is the threshold because it is about the last hour of a run: close
   enough that fuelling after delivery is the same day's work, far enough that
   a stop genuinely mid-route is never touched. The arrival reading and the
   nearest-stops-to-delivery panel, both already on the results screen, are
   what make the trade legible when it is taken. */
const SKIP_NEAR_RECEIVER_MI = 100;

/* THE SECOND WAY A FORCED STOP STOPS BEING WORTH TAKING (v1.53.0), and the
   one the road found first. Coppell TX -> Redlands CA, 1375 mi at the 900-mi
   tier: Auto added TA Tonopah at mile 1105 for a 490-mi leg — 59 gal, a
   gallon under the line — while TA Ontario sits 19 mi from the receiver. Two
   stops to earn one credit, where one stop plus fuelling after the drop earns
   the same one.

   SKIP_NEAR_RECEIVER_MI could never catch that: Tonopah is 270 mi out, and
   widening a window measured from the SKIPPED STOP to 270 mi would start
   skipping stops that are genuinely mid-route. The thing that makes the skip
   acceptable here is not where the forced stop sat — it is that fuel is
   waiting at the DESTINATION. So it is measured there instead, and the two
   tests are independent: either the forced stop is close enough to the
   receiver to take afterwards, or there is network fuel close enough to the
   receiver to use instead.

   50 mi is a hop once the trailer is off, not a side trip. On the run above
   the nearest stop to the delivery is 19 mi and the NEXT nearest is 177, so
   the threshold is nowhere near either edge of that decision. */
const FUEL_NEAR_DELIVERY_MI = 50;

/* WHERE THE NEEDLE WILL SIT AT THE RECEIVER. Deliberately measured against
   the TANK and not the tier: the tier is a policy about how far to run
   between stops, while what the driver will see on the gauge when they shut
   down is physical fuel. A truck that filled 134 mi ago is at 7/8 whether its
   tier says 500 or 900.

   fuelLeavingMiles is what was in the tank when it last left a pump — a full
   tank if the plan has any stop in it, otherwise whatever the driver told the
   gauge they were leaving the shipper with. */
function fuelAtArrival(fuelLeavingMiles, finalLegMiles) {
  return Math.max(0, Math.max(0, fuelLeavingMiles) - Math.max(0, finalLegMiles));
}
function tickAtArrival(fuelLeavingMiles, finalLegMiles) {
  return fuelAtArrival(fuelLeavingMiles, finalLegMiles) / MILES_PER_TICK;
}

function computeStartBurned(maxRange, rangeAtPickup) {
  return Math.max(0, maxRange - rangeAtPickup);
}

module.exports = {
  FULL_TANK_MILES, TICKS, MILES_PER_TICK, EMERGENCY_TICK_CEILING, RESERVE_TICKS,
  BACKUP_RESERVE_TICKS, ARRIVAL_TOGGLE_TICK, TARGET_FILL_TICK,
  MPG, DEF_RATIO, CREDIT_GALLONS, CREDIT_MILES, USABLE_GALLONS,
  SKIP_NEAR_RECEIVER_MI, FUEL_NEAR_DELIVERY_MI,
  milesForTick, plannableMilesForTick, backupMilesForTick, rangeForTick,
  arrivalReserveMiles, tickForMiles, targetFillMiles,
  dieselGallons, combinedGallons, milesForCombinedGallons, earnsCredit,
  fuelAtArrival, tickAtArrival,
  isEmergencyZone, tickLabel, computeStartBurned
};
