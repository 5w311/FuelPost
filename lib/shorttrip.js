// Extra context for the ONE case the planner currently answers uselessly:
// zero required fuel stops. Long-trip planning is untouched — this only
// runs when planFuel/planAdaptive came back ok with an empty plan.
//
// Why it exists: "no fuel required" answers a question about the tractor.
// Some loads require arriving full — a reefer running through detention, a
// receiver's own rule — and the app cannot know that. So it should show
// what is available and let the driver apply the constraint it can't see.

const { haversine } = require('./fuelplan.js');

function shortTripOptions(opts) {
  const {
    routeMiles, projected, maxRange, startBurned = 0,
    plannedStopCount, allStops, delivery
  } = opts;

  // Only for the no-stop-required case. Anything else: not ours.
  if (plannedStopCount > 0) return { applies: false };

  const arrivalRange = Math.max(0, maxRange - startBurned - routeMiles);

  const onRoute = projected.map(s => ({
    ...s,
    milesFromDelivery: +(routeMiles - s.mile).toFixed(1)
  }));

  // Nearest network stop to where the truck will actually be sitting after
  // it delivers — the thing that decides whether arriving full matters.
  let nearestToDelivery = null;
  if (delivery && Array.isArray(allStops) && allStops.length) {
    let best = null;
    for (const s of allStops) {
      const d = haversine(delivery.lat, delivery.lng, s.lat, s.lng);
      if (!best || d < best.miles) best = { name: s.name, id: s.id, miles: +d.toFixed(0) };
    }
    nearestToDelivery = best;
  }

  return {
    applies: true,
    arrivalRange: Math.round(arrivalRange),
    onRoute,
    lastChance: onRoute.length ? onRoute[onRoute.length - 1] : null,
    nearestToDelivery,
    noneOnRoute: onRoute.length === 0
  };
}
module.exports = { shortTripOptions };
