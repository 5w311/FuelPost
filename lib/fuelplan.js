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
function planFuel(routeMiles, projectedIn, maxRange, startBurned = 0, arrivalReserve = 0,
                  targetLeg = 0, skipShortFinal = null) {
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
      // droppedFinal is carried on both paths so callers never see undefined
      // on one and null on the other; a gapped plan never skips anything.
      return { plan, gap, ok: false, droppedFinal: null };
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
  // WHERE the stops go, once the loop above has settled HOW MANY. Off by
  // default (targetLeg 0), so every existing call plans byte-identically.
  // This never changes the count, never turns a plan into a gap, and never
  // shortens a leg that already clears the target — see spaceFills.
  if (targetLeg > 0 && plan.length > 0) {
    const spaced = spaceFills(routeMiles, projected, maxRange, startBurned,
                              arrivalReserve, plan.length, targetLeg);
    if (spaced && spaced.length === plan.length) {
      plan.length = 0;
      plan.push(...spaced);
      pos = spaced[spaced.length - 1].mile;
    }
  }

  // SKIPPING A STOP THE RESERVE FORCED AND NOTHING ELSE WANTS (v1.52.0).
  // Opt-in, via `skipShortFinal = { creditMiles, withinMiles }`, because it is
  // the one thing here that can leave the driver with LESS fuel at the
  // receiver than asking for the reserve implied — a deliberate trade of
  // arrival cushion for not making a pointless pull-in, and not something a
  // caller should get by accident. The reasoning, the safety argument and the
  // 100-mi threshold all live in gauge.js beside the constant.
  //
  // WHY THE LEGALITY TEST IS ALSO THE "reserve-forced" TEST, and why nothing
  // needs to ask whether a reserve was requested: the greedy loop above adds a
  // stop only when the truck cannot otherwise reach `target`. With no reserve,
  // target IS the destination, so the last stop it added is one the truck
  // could not have skipped and `reachesWithout` below is false by
  // construction. Only a reserve can produce a final stop that is optional.
  //
  // It runs AFTER spacing on purpose. Spacing can push the last stop later,
  // which lengthens its own fill — a stop that would have pumped 55 gal where
  // the greedy put it may well clear the credit once moved, and a stop that
  // earns its credit is never skipped.
  let droppedFinal = null;
  if (skipShortFinal && plan.length > 0) {
    const creditMiles = Math.max(0, skipShortFinal.creditMiles || 0);
    const withinMiles = Math.max(0, skipShortFinal.withinMiles || 0);
    const last = plan[plan.length - 1];
    const prevPos = plan.length > 1 ? plan[plan.length - 2].mile : 0;
    // Leaving the previous stop the tank is full; leaving the shipper it is
    // whatever the driver said. Only the no-earlier-stop case burns start fuel.
    const prevReach = plan.length > 1 ? maxRange
                                      : Math.max(0, maxRange - Math.max(0, startBurned));
    const reachesWithout = routeMiles - prevPos <= prevReach + 1e-9;
    const nearReceiver = routeMiles - last.mile <= withinMiles + 1e-9;
    const noCredit = last.legMiles < creditMiles - 1e-9;
    // TWO INDEPENDENT WAYS TO HAVE A BETTER OPTION THAN THIS STOP (v1.53.0),
    // and they are measured from different ends of the run. nearReceiver asks
    // whether the forced stop is close enough to take AFTER delivering;
    // fuelNearDelivery asks whether there is other network fuel close enough
    // to the receiver to use INSTEAD. The caller decides the second — the
    // planner only sees miles along one route and cannot know what sits near
    // the destination — which is why it arrives as a flag rather than a
    // distance. Either is enough; the credit and legality tests still bind.
    const fuelNearDelivery = skipShortFinal.fuelNearDelivery === true;

    if (reachesWithout && (nearReceiver || fuelNearDelivery) && noCredit) {
      droppedFinal = {
        ...last,
        milesFromDelivery: +(routeMiles - last.mile).toFixed(1)
      };
      plan.pop();
      pos = prevPos;
      // The stops that remain were placed to make the skipped stop reachable
      // while holding the reserve. Neither constraint applies now, so re-space
      // them for the plan that is actually being driven — with no reserve,
      // since giving it up is precisely what the skip decided. A null or
      // wrong-length answer just leaves the truncated plan alone: it is
      // already legal, `reachesWithout` said so.
      if (targetLeg > 0 && plan.length > 0) {
        const respaced = spaceFills(routeMiles, projected, maxRange, startBurned,
                                    0, plan.length, targetLeg);
        if (respaced && respaced.length === plan.length) {
          plan.length = 0;
          plan.push(...respaced);
          pos = respaced[respaced.length - 1].mile;
        }
      }
    }
  }

  return {
    plan,
    gap: null,
    ok: true,
    droppedFinal,
    finalLegMiles: +(routeMiles - pos).toFixed(1)
  };
}

/* ---- Where the stops GO, once you know how many (v1.51.0) ----
   The greedy loop above answers "how few stops can this route be done in" by
   taking the furthest reachable stop every time. That is the right answer to
   that question and the wrong one to the driver's: it front-loads the
   distance, so the first leg is enormous and whatever is left over becomes a
   short leg — and a short leg is a short FILL, which pumps too few gallons to
   earn a shower credit. Measured on a real 1100-mi run: 622 mi (75 gal) then
   458 mi (55 gal), the second one fuelling 20 miles from the receiver.

   So this pass keeps the COUNT the greedy loop found and reconsiders only the
   POSITIONS, aiming every fill leg at targetLeg — half a tank's worth of
   driving, where the fleet finds the gallons land. It never adds or removes a
   stop: more stops would mean shorter legs and smaller fills, which is the
   opposite of the point.

   THE PENALTY IS ONE-SIDED: only a leg SHORTER than the target counts against
   an arrangement. A first cut penalised distance from the target in both
   directions and promptly made things worse — on a 1000-mi run at Long it
   pulled a perfectly good 700-mi leg (84 gal) back to 600 (72 gal) to sit
   nearer the target, costing gallons and arrival cushion for nothing. A long
   leg is not a problem; the tier ceiling is already the limit on those. Only
   short fills are the problem, so only short fills are scored.

   MINIMAX, not total: it minimises the WORST shortfall rather than the sum,
   because one 48-gallon stop in an otherwise good plan is the thing the
   driver actually feels. Ties break on total shortfall, then — at the
   endpoint — on the LATER last stop, which leaves the most fuel in the tank
   at the receiver exactly as the arrival reserve intends, and finally on
   off-route detour, so co-located stops (Watt Road's two, 0.1 mi apart) pick
   the nearer one as the greedy loop's cluster rule does.

   The DP is exact for the minimax key — max() is monotone along a path, so
   keeping the best prefix per state cannot lose the optimum — and the two
   tie-break keys are carried along as heuristics on top of it. Cost is
   count x candidates^2, which on a real route is a few thousand operations.

   SOMETIMES A SHORT LEG CANNOT BE HELPED, and this must never pretend
   otherwise: it optimises within what the network offers and returns the best
   arrangement it found, short fills and all. Reporting them is the caller's
   job (see combinedGallons/earnsCredit in lib/gauge.js). */
function spaceFills(routeMiles, projectedIn, maxRange, startBurned = 0,
                    arrivalReserve = 0, count = 0, targetLeg = 0) {
  if (!(count > 0) || !(targetLeg > 0)) return null;
  const cand = [...projectedIn]
    .filter(s => s.mile > 0.001 && s.mile < routeMiles)
    .sort((a, b) => a.mile - b.mile);
  if (cand.length < count) return null;

  const firstReach = Math.max(0, maxRange - Math.max(0, startBurned));
  const finalCap = maxRange - Math.max(0, arrivalReserve);
  // Only the shortfall below the target scores; overshoot is free.
  const dev = leg => Math.max(0, targetLeg - leg);
  // Lexicographic (worst shortfall, total shortfall, total detour).
  const better = (a, b) => {
    if (!b) return true;
    if (Math.abs(a.maxDev - b.maxDev) > 1e-9) return a.maxDev < b.maxDev;
    if (Math.abs(a.sumDev - b.sumDev) > 1e-9) return a.sumDev < b.sumDev;
    return a.detour < b.detour;
  };

  // best[k][i]: the best plan using k stops whose k-th stop is cand[i].
  const best = Array.from({ length: count + 1 }, () => new Array(cand.length).fill(null));
  for (let i = 0; i < cand.length; i++) {
    const leg = cand[i].mile;
    if (leg > firstReach + 1e-9) continue;
    const d = dev(leg);
    best[1][i] = { maxDev: d, sumDev: d, detour: cand[i].detour || 0, prev: -1 };
  }
  for (let k = 2; k <= count; k++) {
    for (let i = 0; i < cand.length; i++) {
      for (let j = 0; j < i; j++) {
        const from = best[k - 1][j];
        if (!from) continue;
        const leg = cand[i].mile - cand[j].mile;
        if (leg <= 0.001 || leg > maxRange + 1e-9) continue;
        const d = dev(leg);
        const here = {
          maxDev: Math.max(from.maxDev, d),
          sumDev: from.sumDev + d,
          detour: from.detour + (cand[i].detour || 0),
          prev: j
        };
        if (better(here, best[k][i])) best[k][i] = here;
      }
    }
  }
  let endIdx = -1, endBest = null;
  for (let i = 0; i < cand.length; i++) {
    const node = best[count][i];
    if (!node) continue;
    if (routeMiles - cand[i].mile > finalCap + 1e-9) continue;  // reserve must still hold
    // Among arrangements that score the same on fills, take the one whose last
    // stop is FURTHEST along: the same "as full as the route allows" rule the
    // arrival reserve has followed since v1.42.0.
    const tiedOnFills = endBest
      && Math.abs(node.maxDev - endBest.maxDev) <= 1e-9
      && Math.abs(node.sumDev - endBest.sumDev) <= 1e-9;
    if (better(node, endBest) || tiedOnFills) { endBest = node; endIdx = i; }
  }
  if (endIdx < 0) return null;

  const picked = [];
  for (let i = endIdx, k = count; k >= 1; k--) { picked.unshift(cand[i]); i = best[k][i].prev; }
  let pos = 0;
  return picked.map(s => {
    const leg = +(s.mile - pos).toFixed(1);
    pos = s.mile;
    return { ...s, legMiles: leg };
  });
}

module.exports = { haversine, cumulativeMiles, pointToSegment, projectStops, planFuel, spaceFills };
