// "Where is the nearest network fuel?" — pure ranking and bearing maths for
// the Near Me footer. No DOM, no network, no module dependencies.
//
// WHY THE DISTANCE FUNCTION IS INJECTED RATHER THAN REQUIRED. The obvious
// shape is `require('./fuelplan.js')` for haversine, and that is exactly what
// fuelplan-adaptive.js does — but those modules pay for it with the fetch +
// new Function loader in index.html, because a plain <script> tag has no
// require() and a top-level `const { haversine } = ...` collides with the
// global binding fuelplan.js's own classic-script load already created.
//
// A fetch is a network call, and this footer's whole promise is that it still
// answers in a dead zone. So the caller passes the real haversine in. The app
// passes FuelPlan.haversine and the tests pass the same imported function, so
// "the existing haversine" is genuinely what computes every mile shown; this
// module simply never reaches for it.

// Straight-line distance ONLY, and never a drive time — see NEARBY_CAP_MI
// below and the README. Sixty straight-line miles can be fifty minutes on an
// interstate or ninety on two-lane, and this module has no idea which.

// Initial bearing from point A to point B, in degrees clockwise from true
// north. Standard great-circle formula; atan2 keeps it finite everywhere,
// including at the equator, across the antimeridian, and for two identical
// points (which fall out as due north rather than NaN).
function bearing(lat1, lng1, lat2, lng2) {
  const toRad = d => d * Math.PI / 180;
  const p1 = toRad(lat1), p2 = toRad(lat2), dl = toRad(lng2 - lng1);
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  const deg = Math.atan2(y, x) * 180 / Math.PI;
  return (deg + 360) % 360;
}

// Eight points is enough. A driver needs to know whether fuel is ahead or
// behind; sixteen points would imply a precision straight-line distance does
// not have anyway.
const COMPASS_POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

function compassPoint(deg) {
  if (!Number.isFinite(deg)) return '';
  const norm = ((deg % 360) + 360) % 360;
  // Each point owns 45 degrees CENTRED on itself, so N is 337.5-22.5 rather
  // than 0-45. Rounding does that for free; the %8 folds 360 back to N.
  return COMPASS_POINTS[Math.round(norm / 45) % 8];
}

// Beyond this, "nearest fuel" stops being a fuelling decision and becomes
// trivia. 200 miles is well inside the app's own smallest range tier (Regular,
// 500 mi between stops since v1.30.0), and over three hours of driving —
// a driver that far from the network is not choosing where to stop, they are
// finding out they have a problem, which is a different sentence and gets
// one. Chosen from the brief's 150-250 band: 150 would fire inside ordinary
// sparse-network driving, and 250 would suppress the warning right through
// the ~490 mi I-40 gap in New Mexico, which is the one place a driver most
// needs to be told plainly.
const NEARBY_CAP_MI = 200;

// The nearest `limit` stops, nearest first, by straight-line distance.
//
// RANKING IGNORES EVERY FILTER, DELIBERATELY. This takes the full stop list
// and no filter state, and the caller must pass FUEL_STOPS rather than the
// filtered set. "Where am I" is a different question from "what am I looking
// for": a driver who filtered to sit-down restaurants an hour ago must not be
// told the nearest fuel is 200 miles away. This WILL look like a bug to
// someone reading passes() later — it is not, and wiring the two together
// would break the one thing this footer is for.
//
// Closed stops and terminals are excluded by FUEL_STOPS itself, upstream, so
// there is no exclusion logic here to drift out of sync with the planner's.
function nearestStops(lat, lng, stops, distanceFn, limit = 4) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Array.isArray(stops)) return [];
  const scored = [];
  for (const s of stops) {
    const miles = distanceFn(lat, lng, s.lat, s.lng);
    if (!Number.isFinite(miles)) continue;
    scored.push({
      stop: s,
      miles,
      bearing: bearing(lat, lng, s.lat, s.lng),
      direction: compassPoint(bearing(lat, lng, s.lat, s.lng))
    });
  }
  // Strict distance order: no tier weighting, no amenity or brand preference.
  scored.sort((a, b) => a.miles - b.miles);
  return scored.slice(0, Math.max(0, limit));
}

// Is the nearest one close enough to be an answer rather than a warning?
function isNearby(miles, cap = NEARBY_CAP_MI) {
  return Number.isFinite(miles) && miles <= cap;
}

module.exports = {
  COMPASS_POINTS, NEARBY_CAP_MI,
  bearing, compassPoint, nearestStops, isNearby
};
