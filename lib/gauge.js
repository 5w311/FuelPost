// Pure fuel-gauge math: tick <-> miles conversion, emergency-zone check. No
// DOM, no network. formatGpsFallbackLabel/isPreciseFix live in lib/location.js
// — don't duplicate them here.

// 1200 since v1.36.0 (1000 before): the fleet's 2025 Freightliner Cascadias
// run 8.5 mpg on dual 100-gallon tanks, and full-to-empty works out to a
// comfortable ~1200 mi. (8.5 x 200 is nominally 1700; the 1200 figure is the
// fleet's own comfortable full-to-empty, which already accounts for unusable
// fuel and real-world draw — use their number, not the brochure's.)
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

const RESERVE_TICKS = 1; // bottom 1/8 (150 mi at the 1200 tank) is always
                          // held back — never counted as plannable range,
                          // always nameable as physical "limp" distance in
                          // the floor message

function plannableMilesForTick(tick) {
  const t = Math.max(0, Math.min(TICKS, Math.round(tick)));
  return Math.max(0, (t - RESERVE_TICKS) * MILES_PER_TICK);
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

// The arrival reserve is a TOGGLE since v1.35.0: off is the standard reserve,
// on is this tick. The control narrowed release by release — v1.27.0 offered
// 1/8–1/2, v1.30.1 dropped 1/8, v1.35.0 collapsed the rest to one switch —
// and v1.37.0 RAISED the switch's value from 1/2 to 5/8 at the fleet's
// direction: a driver who wants fuel at delivery should land with 5/8 or
// better.
//
// 1/8 remains RESERVE_TICKS, the floor every release has held back, and what
// the planner uses with the toggle off — arrivalReserveMiles(RESERVE_TICKS)
// must stay 0, the standard reserve adding nothing on top of itself.
//
// WHAT 5/8 COSTS, stated so the number is a decision and not a surprise. The
// reserve is 600 mi of the 1200 tank. Against Long's 700 the last stop must
// sit within 100 mi of the delivery; against Max's 900, within 300. Against
// REGULAR'S 500 IT CAN NEVER BE MET AT ALL — the reserve exceeds the tier's
// whole range — so every Regular plan with the switch on reads as a reserve
// shortfall, which the results panel states honestly (verified: planFuel
// terminates and flags reserveShortfall, never a fake dry gap). One tick
// higher (3/4 = 750) would out-eat Long entirely; gauge.test.js pins that
// arithmetic so "or higher" stays a knowing change.
const ARRIVAL_TOGGLE_TICK = 5;

function arrivalReserveMiles(tick) {
  return plannableMilesForTick(tick);
}

function computeStartBurned(maxRange, rangeAtPickup) {
  return Math.max(0, maxRange - rangeAtPickup);
}

module.exports = {
  FULL_TANK_MILES, TICKS, MILES_PER_TICK, EMERGENCY_TICK_CEILING, RESERVE_TICKS,
  ARRIVAL_TOGGLE_TICK,
  milesForTick, plannableMilesForTick, arrivalReserveMiles, tickForMiles,
  isEmergencyZone, tickLabel, computeStartBurned
};
