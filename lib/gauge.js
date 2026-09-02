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
// land the driver under it — and ARRIVAL_TARGET_TICK is the AIM — among final
// stops that respect the floor, the planner picks the one landing the arrival
// closest to 1/2. Floor decides WHETHER a late stop is needed; target decides
// WHICH ONE it is (see planFuel's re-pick).
//
// The history, since this dial has moved every which way: v1.27.0 offered a
// 1/8–1/2 dial, v1.30.1 dropped 1/8, v1.35.0 collapsed it to one switch at
// 1/2, v1.37.0 raised the switch to 5/8, v1.38.0 split it into "never under a
// quarter, aim for half", and v1.40.0 moved the FLOOR UP ONE TICK because the
// app's own floor moved under it.
//
// WHY THE FLOOR IS DERIVED, NOT WRITTEN. Every number on this scale is
// measured above RESERVE_TICKS, so when v1.40.0 made the bottom QUARTER
// unplannable for everyone, "never arrive under 1/4" stopped being a
// constraint and became a tautology — arrivalReserveMiles(2) is exactly 0.
// Left as a literal 2 it would have been a switch that still flipped, still
// announced itself, and changed no plan at all. RESERVE_TICKS + 1 is what the
// switch has always MEANT: the first reading with real plannable range above
// the floor, so turning it on always costs a tick of range and can always
// force a late stop. It reads 3/8 today.
//
// 1/8 is no longer the floor tick, and arrivalReserveMiles(RESERVE_TICKS)
// must stay 0 — the standard reserve adding nothing on top of itself is what
// makes the switch's OFF state the pre-v1.27.0 behaviour exactly.
//
// WHAT THE 3/8 FLOOR COSTS: 150 mi of plannable range. The final leg may be
// at most range-150 — 350 on Regular, 550 on Long, 750 on Max. Satisfiable on
// every tier. The 1/2 TARGET costs nothing: it never changes the stop count,
// only which stop is last, and degrades to the nearest achievable arrival
// when 1/2 is out of reach. Floor and aim sit one tick apart (150 and 300),
// closer than the two ticks of v1.38.0 — the floor rose, the aim stayed where
// the fleet put it.
const ARRIVAL_TOGGLE_TICK = RESERVE_TICKS + 1;
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
