// Hand-off from a station to the phone's own navigation app.
//
// The destination is always COORDINATES, never the street address. A truck
// stop's address routinely geocodes to the wrong side of the interchange,
// which is the whole reason this exists — and row[9]/row[10] are the same
// point the map pin already uses, so the nav app lands exactly where
// FuelPost said the stop is.

// Coordinates are Number-coerced rather than URL-encoded. That is a
// stronger guarantee than encoding, not a weaker one: a value that survives
// Number() cannot contain anything that needs escaping, and the literal
// comma matches the "comma-separated pair of floating point values" form
// both providers document in their own examples. (encodeURIComponent would
// emit %2C, which should decode identically everywhere but matches no
// published example — not a gamble worth taking on a link this app cannot
// test in CI.) Names, which really can carry spaces and punctuation, do go
// through encodeURIComponent below.
function coordPair(row) {
  const lat = Number(row[9]), lng = Number(row[10]);
  return `${lat},${lng}`;
}

// Apple Maps.
//   dirflg=d is documented as "by car".
//   q= carries the station name; Apple's docs: "If you include a name in
//   the value of the q parameter, Maps tries to match the name at the
//   specified location."
//
// KNOWN DOC GAP, verified against Apple's URL Scheme Reference rather than
// assumed: daddr is documented only as "an address string that geolocation
// can understand", and no published example passes it a coordinate pair —
// the documented home for coordinates is `ll`, which centres the map and
// places a pin but does NOT set a directions destination. There is no
// documented way to request directions to a raw coordinate. daddr=lat,lng
// is long-standing de-facto Apple behaviour and is what every maps hand-off
// in the wild uses; the documented alternative (daddr=<address string>)
// would re-introduce the exact interchange-geocoding error this feature
// exists to avoid. So: coordinates in daddr, name in q, and the on-device
// check that this lands on the right pin is load-bearing, not a formality.
function appleMapsUrl(row) {
  return 'https://maps.apple.com/?daddr=' + coordPair(row)
    + '&q=' + encodeURIComponent(row[2])
    + '&dirflg=d';
}

// Google Maps Universal URL API. Coordinates are the destination;
// destination_place_id is the documented way to also name the place, and
// this app has no Place IDs, so the name is omitted rather than guessed at.
function googleMapsUrl(row) {
  return 'https://www.google.com/maps/dir/?api=1&destination=' + coordPair(row);
}

// One line, the way a driver would read it out or paste it into a Garmin:
// street, city, ST zip.
function formatStationAddress(row) {
  return `${row[3]}, ${row[4]}, ${row[5]} ${row[6]}`;
}

// Whether to offer the Apple Maps button at all — it does not exist on
// Android, and a button that cannot work is worse than a missing one.
//
// There is no feature test for "this device has Apple Maps", so this is
// user-agent matching, which is unreliable by nature. It is arranged so the
// unreliability is one-directional: a miss costs an Apple user one button
// (Google still routes them), while Google is offered unconditionally and
// never hidden by a guess.
//
// Macintosh counts WITHOUT a touch check, which is a deliberate widening of
// the usual iPadOS workaround. The common form of this test is
// `Macintosh && maxTouchPoints > 0`, aimed at catching iPadOS 13+, which
// reports itself as "Macintosh; Intel Mac OS X". But desktop macOS ships
// Maps.app and opens maps.apple.com links in it, so excluding touchless
// Macs would hide a button that works. Matching Macintosh outright covers
// both, and no non-Apple platform reports it.
function isApplePlatform(ua) {
  if (!ua) return false;
  return /\b(iPhone|iPad|iPod)\b/.test(ua) || /Macintosh/.test(ua);
}

module.exports = { appleMapsUrl, googleMapsUrl, formatStationAddress, isApplePlatform };
