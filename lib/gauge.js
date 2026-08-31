// Pure fuel-gauge math: tick <-> miles conversion, emergency-zone check. No
// DOM, no network. formatGpsFallbackLabel/isPreciseFix live in lib/location.js
// — don't duplicate them here.

const FULL_TANK_MILES = 1000;   // fleet-wide assumption; see brief for the tradeoff
const TICKS = 8;                // eighths, E(0) to F(8)
const MILES_PER_TICK = FULL_TANK_MILES / TICKS; // 125
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

const RESERVE_TICKS = 1; // bottom 1/8 (125mi) is always held back — never
                          // counted as plannable range, always nameable as
                          // physical "limp" distance in the floor message

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
// on is this tick — half a tank. The control has been narrowing release by
// release as the real choice got clearer: v1.27.0 offered 1/8–1/2, v1.30.1
// dropped 1/8 because nobody wants to arrive on an eighth, and the fleet's
// read on the remaining three was that a driver who wants fuel at delivery
// wants HALF A TANK — 1/4 and 3/8 were gradations nobody picked. One question,
// one switch.
//
// 1/8 remains RESERVE_TICKS, the floor every release has held back, and what
// the planner uses with the toggle off — arrivalReserveMiles(RESERVE_TICKS)
// must stay 0, the standard reserve adding nothing on top of itself.
//
// Raising this above 4 is a one-constant change but a bad default: 1/2 already
// holds back 375 mi, and at 5/8 the reserve alone eats 500 of a Long tier's
// 675, gapping most plans. test/gauge.test.js pins both the value and that
// ceiling reasoning.
const ARRIVAL_TOGGLE_TICK = 4;

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
