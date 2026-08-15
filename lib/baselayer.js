// Pure decision: given the map's CURRENT base layer and a newly resolved
// theme, what base layer should the map end up on?
//
// Returns the layer to switch to, or null meaning "leave the base layer
// alone entirely". null still covers two distinct cases that both mean no
// call:
//   - the current layer belongs to NONE of the themed pairs it was handed —
//     Terrain, or whatever else HERE's layer switcher offers now or adds
//     later. Not this app's to touch, so the driver keeps looking at it.
//   - the current layer is already the correct one for this theme
//
// `layers` is either a single {light, dark} pair or {pairs:[...]} holding
// several. v1.26.0 introduced the second pair: the satellite view became
// HERE's hybrid stack, which has day and night variants of its own, so
// there is now more than one themed pair to keep in step.
//
// The contract that changed, stated plainly so nobody "restores" it: through
// v1.25.x this module promised that a theme change would never touch
// Satellite, and its headline tests pinned exactly that. Satellite is themed
// now — hybrid light plus a dark theme returns hybrid dark. The SPIRIT is
// unchanged and is the whole reason this function exists: the driver stays
// on the view they chose, now correctly themed, instead of being yanked back
// to a road map. What survives intact is the mechanism, an allow-list BY
// IDENTITY rather than a deny-list naming satellite — a layer in no pair is
// left alone, a layer in a pair moves with the theme, whichever pair it is
// in. A check for "is this the satellite layer?" would need updating every
// time HERE adds a layer, and would be wrong until someone noticed; that is
// the shape of the bug this replaced, and it is not coming back.
function nextBaseLayer(currentLayer, theme, layers) {
  const pairs = layers && layers.pairs ? layers.pairs : [layers];
  const want = theme === 'dark' ? 'dark' : 'light';
  for (const pair of pairs) {
    // A pair the caller could not build (a layer this SDK build didn't
    // return) is skipped, never thrown on: a missing satellite pair must not
    // take the road pair down with it.
    if (!pair) continue;
    // Not one of ours. Hands off, and keep looking through the other pairs.
    if (currentLayer !== pair.light && currentLayer !== pair.dark) continue;
    // Already right. Returning null here is also what makes the app's own
    // baselayerchange backstop self-terminating rather than a feedback loop:
    // the correction it triggers produces an event whose next pass asks for
    // nothing.
    return currentLayer === pair[want] ? null : pair[want];
  }
  return null;
}

module.exports = { nextBaseLayer };
