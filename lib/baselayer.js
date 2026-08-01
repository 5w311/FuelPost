// Pure decision: given the map's CURRENT base layer and a newly resolved
// theme, what base layer should the map end up on?
//
// Returns the layer to switch to, or null meaning "leave the base layer
// alone entirely". null covers two distinct cases that both mean no call:
//   - the current layer isn't one of our two themed road layers at all
//     (Satellite, Terrain, or anything else HERE's own layer switcher
//     offers) — a theme change must not yank the driver off it
//   - the current layer is already the correct one for this theme
function nextBaseLayer(currentLayer, theme, layers) {
  const light = layers.light, dark = layers.dark;
  // Not a themed road layer (satellite/terrain/unknown) — not ours to touch.
  if (currentLayer !== light && currentLayer !== dark) return null;
  const target = theme === 'dark' ? dark : light;
  return currentLayer === target ? null : target;
}

module.exports = { nextBaseLayer };
