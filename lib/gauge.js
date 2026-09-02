// Pure fuel-gauge math: tick <-> miles conversion, emergency-zone check. No
// DOM, no network. formatGpsFallbackLabel/isPreciseFix live in lib/location.js
// — don't duplicate them here.

// 1000 since v1.39.0 (1200 in v1.36.0-v1.38.0, 1000 before that): the fleet
// asked for an EVEN tank — F reads a round 1,000 mi and every eighth steps
// down by the same 125: 1000, 875, 750, 625, 500, 375, 250, 125, E. The
// 2025 Cascadia's comfortable full-to-empty (8.5 mpg on dual 100-gallon
// tanks) is the ~1200 that v1.36.0 used; 1000 is the fleet reading that back
// down to a number a driver can do in their head at a glance, and it is
// deliberately conservative — a gauge that under-promises range is the safe
// direction to round.
//
// Every figure the app shows comes off these two constants, so the whole app
// moved with this line: the gauge labels, the limp distance, the arrival
// floor and aim, and the plannable ceiling below.
const FULL_TANK_MILES = 1000;
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

const RESERVE_TICKS = 1; // bottom 1/8 (125 mi at the 1000 tank) is always
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

// The arrival switch is TWO numbers since v1.38.0, and the split is the whole
// design: ARRIVAL_TOGGLE_TICK is the FLOOR — with the switch on, no plan may
// land the driver under 1/4 of a tank — and ARRIVAL_TARGET_TICK is the AIM —
// among final stops that respect the floor, the planner picks the one landing
// the arrival closest to 1/2. Floor decides WHETHER a late stop is needed;
// target decides WHICH ONE it is (see planFuel's re-pick).
//
// The history, since this dial has moved every which way: v1.27.0 offered a
// 1/8–1/2 dial, v1.30.1 dropped 1/8, v1.35.0 collapsed it to one switch at
// 1/2, v1.37.0 raised the switch to 5/8, and v1.38.0 split it — the fleet's
// landing was that 5/8 as a HARD floor gapped too much (on Regular it could
// never be met at all), and what they actually wanted was "never under a
// quarter, aim for half".
//
// 1/8 remains RESERVE_TICKS, the floor every release has held back, and what
// the planner uses with the switch off — arrivalReserveMiles(RESERVE_TICKS)
// must stay 0, the standard reserve adding nothing on top of itself.
//
// WHAT THE 1/4 FLOOR COSTS: 125 mi of the 1000 tank. The final leg may be at
// most range-125 — 575 on Long, 375 on Regular, 775 on Max. Satisfiable on
// every tier, which the 5/8 floor was not. The 1/2 TARGET costs nothing: it
// never changes the stop count, only which stop is last, and degrades to the
// nearest achievable arrival when 1/2 is out of reach.
const ARRIVAL_TOGGLE_TICK = 2;
const ARRIVAL_TARGET_TICK = 4;

function arrivalReserveMiles(tick) {
  return plannableMilesForTick(tick);
}

function computeStartBurned(maxRange, rangeAtPickup) {
  return Math.max(0, maxRange - rangeAtPickup);
}

module.exports = {
  FULL_TANK_MILES, TICKS, MILES_PER_TICK, EMERGENCY_TICK_CEILING, RESERVE_TICKS,
  ARRIVAL_TOGGLE_TICK, ARRIVAL_TARGET_TICK,
  milesForTick, plannableMilesForTick, arrivalReserveMiles, tickForMiles,
  isEmergencyZone, tickLabel, computeStartBurned
};
