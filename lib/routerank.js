// Rank planned route options for a fuel-network app.
//
// The ordering rule, and the whole point of showing alternatives here:
// a route the truck can actually complete on network fuel beats a shorter
// route that strands it. Miles only break ties among routes that all work.
//
// Each input option: { poly, routeMiles, result, label }
//   result is planAdaptive's return: { plan, gap, ok, finalLegMiles, detourMax }
function rankRouteOptions(options) {
  return [...options].sort((a, b) => {
    // 1. Completable routes first — a gap is disqualifying, not a tiebreak.
    if (a.result.ok !== b.result.ok) return a.result.ok ? -1 : 1;

    if (a.result.ok) {
      // 2. Among working routes: fewer fuel stops (less downtime).
      const stops = a.result.plan.length - b.result.plan.length;
      if (stops !== 0) return stops;
      // 3. Then tighter detours — 8mi tier beats a 30mi tier.
      if (a.result.detourMax !== b.result.detourMax)
        return a.result.detourMax - b.result.detourMax;
    }
    // 4. Then shortest. (For gapped routes this is the only signal that
    //    matters — none of them work, so show the shortest first.)
    return a.routeMiles - b.routeMiles;
  });
}

// Dedupe near-identical alternatives HERE sometimes returns: if two routes
// are within tolerancePct of the same length AND select the same fuel stops,
// they're the same decision to a driver — keep the first.
function dedupeOptions(ranked, tolerancePct = 0.02) {
  const kept = [];
  for (const o of ranked) {
    const dup = kept.find(k => {
      const lenClose = Math.abs(k.routeMiles - o.routeMiles) / Math.max(k.routeMiles, 1) <= tolerancePct;
      const sameStops = JSON.stringify(k.result.plan.map(s => s.id))
                     === JSON.stringify(o.result.plan.map(s => s.id));
      return lenClose && sameStops;
    });
    if (!dup) kept.push(o);
  }
  return kept;
}

module.exports = { rankRouteOptions, dedupeOptions };
