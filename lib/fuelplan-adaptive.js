const { projectStops, planFuel, haversine } = require('./fuelplan.js');

// Escalate detour tolerance only when the tight search strands the driver.
// Returns the tightest tolerance that produces a complete plan.
// arrivalReserve rides through unchanged (v1.27.0). Escalating the detour
// tolerance is the right response to a reserve shortfall too: a stop close
// enough to delivery to leave the reserve intact may exist just off the tight
// search, and widening finds it.
function planAdaptive(poly, routeMiles, stops, maxRange, startBurned, tiers = [8, 15, 30], arrivalReserve = 0) {
  let last = null;
  for (const tol of tiers) {
    const proj = projectStops(poly, stops, tol);
    const r = planFuel(routeMiles, proj, maxRange, startBurned, arrivalReserve);
    last = { ...r, detourMax: tol };
    if (r.ok) return last;
  }
  return last; // still gapped at the widest tier
}

// Network stops near the pickup regardless of direction — "top off before you roll".
function stopsNearPickup(pickupLat, pickupLng, stops, radiusMi = 50) {
  return stops
    .map(s => ({ ...s, fromPickup: haversine(pickupLat, pickupLng, s.lat, s.lng) }))
    .filter(s => s.fromPickup <= radiusMi)
    .sort((a, b) => a.fromPickup - b.fromPickup);
}

// What the rest of a GAPPED route looks like, past the dry line. A gap ends
// the on-network plan, but the road usually doesn't end with it — a route can
// run dry in New Mexico and still pass six perfectly good stops in Texas. A
// driver looking at the map can SEE that fuel country; a plan that just says
// "gap, the end" reads as if the whole remainder were empty, which is a
// different (and wrong) claim.
//
// Assumption, stated plainly: the driver clears the gap stretch on approved
// out-of-network fuel — enough to reach the first network stop past the dry
// line — and fills to maxRange there. From that anchor the normal fewest-stops
// planner takes over. This is INFORMATION for the approval call to the Fuel
// Dept, not permission: the gap warning and its phone number stay exactly as
// loud as before.
//
// Returns null when there's nothing past the dry line worth showing (the
// remainder really is empty, or the gap reaches the delivery); otherwise
// { plan, ok, gap, finalLegMiles } in route-absolute miles, where plan[0] is
// the anchor stop just past the gap and ok/gap describe the REMAINDER (a
// second gap further on is possible and reported honestly).
function planBeyondGap(poly, routeMiles, stops, maxRange, gap, detourMax, arrivalReserve = 0) {
  // A reserve shortfall never gets here: its dead mile is at or past the
  // destination, so the guard below already returns null. That is the correct
  // answer — there is no "rest of the run" past a gap that isn't on the road.
  if (!gap || gap.deadMile >= routeMiles) return null;
  const proj = projectStops(poly, stops, detourMax);
  const after = proj.filter(s => s.mile > gap.deadMile);
  if (!after.length) return null;

  const anchor = after[0];
  // Re-run the planner as if the run began at the anchor with a full tank:
  // shift the remaining stops so the anchor is mile 0, then shift back.
  const shifted = after.slice(1).map(s => ({ ...s, mile: s.mile - anchor.mile }));
  const rest = planFuel(routeMiles - anchor.mile, shifted, maxRange, 0, arrivalReserve);
  const plan = [
    // The anchor's "leg" is measured from the last on-network stop — the
    // stretch it closes includes the out-of-network rescue somewhere inside.
    { ...anchor, legMiles: +(anchor.mile - gap.fromMile).toFixed(1) },
    ...rest.plan.map(s => ({ ...s, mile: s.mile + anchor.mile }))
  ];
  return {
    plan,
    ok: rest.ok,
    gap: rest.ok ? null : {
      fromMile: +(rest.gap.fromMile + anchor.mile).toFixed(1),
      deadMile: +(rest.gap.deadMile + anchor.mile).toFixed(1)
    },
    finalLegMiles: rest.ok ? rest.finalLegMiles : null
  };
}

module.exports = { planAdaptive, stopsNearPickup, planBeyondGap };
