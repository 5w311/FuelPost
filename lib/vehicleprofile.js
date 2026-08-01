// Vehicle profiles -> HERE Routing v8 `vehicle[...]` parameters.
// Drivers think in feet/inches/pounds; HERE wants centimeters/kilograms.
// One conversion, one place, tested — a silent unit error here would mean
// routing a legal truck onto a road it can't physically use.

const CM_PER_INCH = 2.54;
const KG_PER_LB = 0.45359237;

// Standard US 5-axle tractor-trailer, loaded to federal maximums.
// Height 13'6", width 8'6", combo length 70', gross 80,000 lb.
const STANDARD = { heightIn: 162, widthIn: 102, lengthIn: 840, weightLb: 80000 };

// HERE's shippedHazardousGoods enum. VERIFY against the current API
// reference at implementation time — this list is the documented set as of
// writing, but HERE updates enums.
const HAZMAT_CLASSES = [
  'explosive', 'gas', 'flammable', 'combustible', 'organic', 'poison',
  'radioactive', 'corrosive', 'poisonousInhalation', 'harmfulToWater', 'other'
];

// Round UP, never down. Under-declaring a dimension or weight makes HERE
// think the truck fits somewhere it doesn't — that's the dangerous
// direction. Over-declaring at worst costs a slightly longer legal route.
// Note 102in ceils to 260cm, which is exactly the 2.6 m that 23 CFR 658.15
// itself names as the metric equivalent of the 102-inch limit.
const inToCm = inches => Math.ceil(inches * CM_PER_INCH);
const lbToKg = pounds => Math.ceil(pounds * KG_PER_LB);

// Build the vehicle[...] query params for a profile.
//   profile: { heightIn, widthIn, lengthIn, weightLb, hazmat: [] }
// Returns a plain object of param name -> string value.
function vehicleParams(profile) {
  const p = { ...STANDARD, ...profile };
  const out = {};
  if (p.heightIn > 0) out['vehicle[height]'] = String(inToCm(p.heightIn));
  if (p.widthIn  > 0) out['vehicle[width]']  = String(inToCm(p.widthIn));
  if (p.lengthIn > 0) out['vehicle[length]'] = String(inToCm(p.lengthIn));
  if (p.weightLb > 0) out['vehicle[grossWeight]'] = String(lbToKg(p.weightLb));
  const haz = Array.isArray(p.hazmat) ? p.hazmat.filter(h => HAZMAT_CLASSES.includes(h)) : [];
  if (haz.length) out['vehicle[shippedHazardousGoods]'] = haz.join(',');
  return out;
}

// Validation for the custom profile. Returns [] when clean, else messages.
// Bounds are sanity rails, not legal limits — the app should not pretend to
// know every state's permit rules, only catch obvious typos.
function validateCustom(profile) {
  const errs = [];
  const check = (v, label, min, max, unit) => {
    if (v === '' || v === null || v === undefined) return; // blank = use standard
    const n = Number(v);
    if (!Number.isFinite(n)) errs.push(`${label} must be a number.`);
    else if (n < min || n > max) errs.push(`${label} looks off — expected ${min}–${max} ${unit}.`);
  };
  check(profile.heightIn, 'Height', 60, 200, 'inches');
  check(profile.widthIn,  'Width',  60, 150, 'inches');
  check(profile.lengthIn, 'Length', 120, 1200, 'inches');
  check(profile.weightLb, 'Weight', 5000, 200000, 'pounds');
  return errs;
}

module.exports = { STANDARD, HAZMAT_CLASSES, inToCm, lbToKg, vehicleParams, validateCustom };
