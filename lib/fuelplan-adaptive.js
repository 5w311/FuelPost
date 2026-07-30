const { projectStops, planFuel, haversine } = require('./fuelplan.js');

// Escalate detour tolerance only when the tight search strands the driver.
// Returns the tightest tolerance that produces a complete plan.
function planAdaptive(poly, routeMiles, stops, maxRange, startBurned, tiers = [8, 15, 30]) {
  let last = null;
  for (const tol of tiers) {
    const proj = projectStops(poly, stops, tol);
    const r = planFuel(routeMiles, proj, maxRange, startBurned);
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
module.exports = { planAdaptive, stopsNearPickup };
