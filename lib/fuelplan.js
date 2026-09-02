// Pure fuel-planning logic — no DOM, no network. Mirrors what ships in the app.

const R_MI = 3958.8;
const toRad = d => d * Math.PI / 180;

function haversine(aLat, aLng, bLat, bLng) {
  const p1 = toRad(aLat), p2 = toRad(bLat);
  const dp = toRad(bLat - aLat), dl = toRad(bLng - aLng);
  const h = Math.sin(dp/2)**2 + Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
  return 2 * R_MI * Math.asin(Math.sqrt(h));
}

// Cumulative mile marker for each vertex of the route polyline.
function cumulativeMiles(poly) {
  const cum = [0];
  for (let i = 1; i < poly.length; i++) {
    cum.push(cum[i-1] + haversine(poly[i-1][0], poly[i-1][1], poly[i][0], poly[i][1]));
  }
  return cum;
}

// Perpendicular distance from point to segment, plus how far along the segment
// the closest point falls (0..1). Equirectangular projection — fine at segment scale.
function pointToSegment(pLat, pLng, aLat, aLng, bLat, bLng) {
  const latRef = toRad((aLat + bLat) / 2);
  const x = (lng, lat) => ({ x: toRad(lng) * Math.cos(latRef) * R_MI, y: toRad(lat) * R_MI });
  const P = x(pLng, pLat), A = x(aLng, aLat), B = x(bLng, bLat);
  const vx = B.x - A.x, vy = B.y - A.y;
  const wx = P.x - A.x, wy = P.y - A.y;
  const len2 = vx*vx + vy*vy;
  let t = len2 === 0 ? 0 : (wx*vx + wy*vy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = A.x + t*vx, cy = A.y + t*vy;
  return { dist: Math.hypot(P.x - cx, P.y - cy), t };
}

// Project every stop onto the route. Returns those within detourMax miles,
// each tagged with its mile marker along the route. Sorted by mile.
function projectStops(poly, stops, detourMax) {
  const cum = cumulativeMiles(poly);
  const out = [];
  for (const s of stops) {
    let best = null;
    for (let i = 1; i < poly.length; i++) {
      const r = pointToSegment(s.lat, s.lng, poly[i-1][0], poly[i-1][1], poly[i][0], poly[i][1]);
      if (!best || r.dist < best.dist) {
        const segLen = cum[i] - cum[i-1];
        best = { dist: r.dist, mile: cum[i-1] + r.t * segLen };
      }
    }
    if (best && best.dist <= detourMax) {
      out.push({ ...s, mile: best.mile, detour: best.dist });
    }
  }
  return out.sort((a, b) => a.mile - b.mile);
}

// Fewest-stops plan: from each position, push to the furthest stop still in range.
// startBurned = miles already driven on the current tank at origin.
//
// arrivalReserve (v1.27.0) = miles of unused range the driver wants LEFT when
// they get there. It works by planning against a destination that is that much
// further away than the real one: the loop keeps planning until it can reach
// routeMiles + arrivalReserve, which is exactly the condition
// "maxRange - finalLeg >= arrivalReserve". Zero — the default — is every
// release before v1.27.0, byte for byte.
//
// Why this parameter is miles and not ticks: this module is pure arithmetic
// over a route and must not know that a tank has eighths. The caller converts
// (FuelGauge.arrivalReserveMiles), which also keeps the tank scale in one file.
// arrivalReserve is a MINIMUM and only a minimum: the run must end holding at
// least this much, and the greedy loop's furthest-stop rule then beats it by
// as much as the route allows. It is deliberately not a target to land ON —
// see the note above the return for the release that tried that and what it
// cost the driver.
function planFuel(routeMiles, projectedIn, maxRange, startBurned = 0, arrivalReserve = 0) {
  // Defensive: the algorithm depends on ascending mile order. projectStops
  // already sorts, but don't make correctness depend on the caller.
  const projected = [...projectedIn].sort((a, b) => a.mile - b.mile);
  const plan = [];
  let pos = 0;
  let reach = maxRange - startBurned;
  const target = routeMiles + Math.max(0, arrivalReserve);

  while (pos + reach < target) {
    const limit = pos + reach;
    const cands = projected.filter(s => s.mile > pos + 0.001 && s.mile <= limit);
    if (cands.length === 0) {
      const gap = { fromMile: +pos.toFixed(1), deadMile: +limit.toFixed(1) };
      // Two very different failures wear the same shape, and calling both "you
      // run dry" would be a lie in one of them. If the truck can already reach
      // the DESTINATION from here, it is not stranded anywhere — it simply
      // cannot get there still holding the reserve that was asked for. The
      // flag is only attached when that is the case, so a plain no-reserve
      // call returns exactly the object shape it always did.
      if (limit >= routeMiles) gap.reserveShortfall = true;
      return { plan, gap, ok: false };
    }
    // Furthest wins. But stops within CLUSTER_MI of the furthest are effectively
    // the same fuel decision (e.g. two Amarillo stops 1 mi apart) — among those,
    // take the smallest detour off the route.
    const CLUSTER_MI = 15;
    const furthest = cands[cands.length - 1].mile;
    const tied = cands.filter(s => s.mile >= furthest - CLUSTER_MI);
    const chosen = tied.reduce((a, b) => (b.detour < a.detour ? b : a));
    plan.push({ ...chosen, legMiles: +(chosen.mile - pos).toFixed(1) });
    pos = chosen.mile;
    reach = maxRange;
  }
  // WHY THERE IS NO SECOND PASS HERE ANY MORE (v1.42.0). v1.38.0 added one:
  // it re-picked the final stop to land the arrival CLOSEST to a target,
  // treating an arrival above the target as just as wrong as one below it.
  // That was backwards for a control the driver reads as "leave me some
  // fuel". On a real Dallas->Carteret run at 700 mi range it moved the last
  // stop EARLIER and dropped the arrival from 566 mi to 350 — the switch,
  // turned on, left the driver with less fuel than leaving it off. And it
  // could only ever re-pick among stops reachable from the SECOND-TO-LAST
  // stop, so at 900 mi range, where the plan needs only one stop, it had
  // nothing to choose from and did nothing at all.
  //
  // Both faults come from the same idea, so the idea is gone. The arrival
  // reserve is now a MINIMUM and nothing else: the loop above runs until the
  // destination is reachable while still holding it, and because that loop
  // always takes the FURTHEST reachable stop, the final leg is as short as
  // the route allows and the arrival as full. Asking for more fuel can then
  // only ever add a stop or move one later — never leave the driver worse
  // off than the switch being off, which fuelplan.test.js now pins directly.
  return {
    plan,
    gap: null,
    ok: true,
    finalLegMiles: +(routeMiles - pos).toFixed(1)
  };
}

module.exports = { haversine, cumulativeMiles, pointToSegment, projectStops, planFuel };
