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
function planFuel(routeMiles, projectedIn, maxRange, startBurned = 0) {
  // Defensive: the algorithm depends on ascending mile order. projectStops
  // already sorts, but don't make correctness depend on the caller.
  const projected = [...projectedIn].sort((a, b) => a.mile - b.mile);
  const plan = [];
  let pos = 0;
  let reach = maxRange - startBurned;

  while (pos + reach < routeMiles) {
    const limit = pos + reach;
    const cands = projected.filter(s => s.mile > pos + 0.001 && s.mile <= limit);
    if (cands.length === 0) {
      return { plan, gap: { fromMile: +pos.toFixed(1), deadMile: +limit.toFixed(1) }, ok: false };
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
  return {
    plan,
    gap: null,
    ok: true,
    finalLegMiles: +(routeMiles - pos).toFixed(1)
  };
}

module.exports = { haversine, cumulativeMiles, pointToSegment, projectStops, planFuel };
