// What to do when HERE's own settings control changes the base layer.
//
// HERE 3.1's vector.normal collection is { map, traffic, trafficincidents }.
// There is NO night variant of the traffic base layer — 3.0 had trafficnight,
// 3.1 dropped it. So toggling traffic in HERE's control always lands the map
// on the LIGHT traffic base layer, with nothing dark for it to pick instead.
//
// The fix is not "swap to a dark traffic layer" (none exists). It's to stop
// using traffic as a BASE layer at all: keep the themed road layer as the
// base and put traffic on top as an overlay, which is what HERE's own traffic
// documentation recommends anyway.
//
// Returns an action object; null means leave everything alone.
function trafficCorrection(currentLayer, theme, L) {
  // L: { light, dark, trafficBase, trafficIncidents, trafficOverlay }
  const isTrafficBase = currentLayer === L.trafficBase || currentLayer === L.trafficIncidents;

  if (isTrafficBase) {
    // Driver asked for traffic. Honour that, but not by giving up the theme.
    return {
      setBase: theme === 'dark' ? L.dark : L.light,
      addOverlay: L.trafficOverlay,
      removeOverlay: null
    };
  }
  // Back on a plain road layer: traffic is off, so drop the overlay if present.
  if (currentLayer === L.light || currentLayer === L.dark) {
    const correctBase = theme === 'dark' ? L.dark : L.light;
    return {
      setBase: currentLayer === correctBase ? null : correctBase,
      addOverlay: null,
      removeOverlay: L.trafficOverlay
    };
  }
  return null; // satellite, terrain, anything else — not ours to touch
}
module.exports = { trafficCorrection };
