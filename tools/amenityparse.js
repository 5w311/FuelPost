#!/usr/bin/env node
'use strict';

// Pure parsing and matching for the amenity audit (FuelPost amenity brief).
// No network, no filesystem, no DOM — every function here takes a string of
// already-fetched HTML and returns plain data, so the whole thing can be
// exercised against saved fixtures in test/amenityparse.test.js.
//
// Deliberately NOT in lib/. lib/ is the app's own code and test/cachebust
// asserts that every lib/*.js is referenced by index.html; a tool-only
// module there would fail that test. This ships nothing to the driver.

// TA's own labels for the STAYFIT recreation amenities, confirmed against
// live location pages rather than guessed:
//   Tuscaloosa/Lincoln/Baldwin/Tampa/Vero Beach for F, B, H, T
//   Petro Salina + TA Edinburg (the only two DATA rows carrying O) for the
//   outdoor variant, which TA calls "STAYFIT Outdoor Fitness Room".
//
// ORDER MATTERS and the longest label must be tested first: "STAYFIT
// Outdoor Fitness Room" contains "STAYFIT Fitness Room" as a substring, so
// a naive includes() scan reports both F and O for an O-only location.
// Matching is anchored on the full label for that reason.
const AMENITY_LABELS = [
  ['O', 'STAYFIT Outdoor Fitness Room'],
  ['F', 'STAYFIT Fitness Room'],
  ['W', 'STAYFIT Walking Trail'],
  ['B', 'STAYFIT Basketball Hoop'],
  ['H', 'STAYFIT Horseshoe Pit'],
  ['T', 'STAYFIT Bean Bag Toss']
];
// DATA writes the codes in this order; the report compares sets, but
// rendering them consistently keeps diffs readable.
const CODE_ORDER = ['F', 'O', 'W', 'H', 'B', 'T'];

// Numeric character references are decoded generically rather than by a
// hand-written table: TA's brand names carry &#xE9; (Miss J's Café) and
// &#x27; among others, and an incomplete table silently splits one brand
// into two rows of the prevalence count.
const decode = s => String(s)
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&nbsp;/g, ' ').replace(/&apos;/g, "'")
  .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&amp;/g, '&');

const flatten = html => decode(String(html).replace(/\s+/g, ' '));
const stripTags = s => decode(String(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());

function sortCodes(codes) {
  return CODE_ORDER.filter(c => codes.includes(c));
}

// The STAYFIT list. Each item renders as an anchor opening a modal, so the
// label appears more than once per page (link text plus modal body); a Set
// collapses that. Returns codes in CODE_ORDER, e.g. "FT".
function parseAmenityCodes(html) {
  const flat = flatten(html);
  const found = new Set();
  for (const [code, label] of AMENITY_LABELS) {
    // Anchoring on the full label including the "STAYFIT" prefix is what
    // defuses the O/F trap: in "STAYFIT Outdoor Fitness Room" the token
    // after "STAYFIT " is "Outdoor", so the F pattern cannot match there.
    // The trailing guard stops "Fitness Room" matching a longer word.
    const re = new RegExp(label.replace(/ /g, '\\s+') + '(?![A-Za-z])', 'i');
    if (re.test(flat)) found.add(code);
  }
  return sortCodes([...found]).join('');
}

// The "Other Amenities" accordion: plain <li> text, no modals. Used for
// laundry, and returned whole because the same list carries CAT Scale and
// the other non-recreation facilities a later brief may want.
function parseOtherAmenities(html) {
  const flat = flatten(html);
  const m = flat.match(/Other Amenities(.*?)(?:Truck Service Amenities|Recent Blog Posts|<\/section>)/i);
  if (!m) return [];
  return [...m[1].matchAll(/<li>(.*?)<\/li>/gi)]
    .map(x => stripTags(x[1])).filter(Boolean);
}

function parseLaundry(html) {
  return parseOtherAmenities(html).some(a => /laundry/i.test(a));
}

// Restaurant brands. Each brand renders as a card with a logo and an hours
// table; the brand name is the bold caption. Kept verbatim — no sit-down
// vs quick-serve classification here, deliberately: that judgment is
// domain knowledge and belongs to a human reading the report.
function parseRestaurants(html) {
  const flat = flatten(html);
  const names = [...flat.matchAll(/<p class="text-right my-0"><strong>(.*?)<\/strong><\/p>/gi)]
    .map(m => stripTags(m[1])).filter(Boolean);
  return [...new Set(names)];
}

// Numeric fields. Only the service-bay count is published as a labelled
// value; parking appears solely in the marketing paragraph, and the shower
// count is not published at all (see parseShowers).
function parseBays(html) {
  const m = flatten(html).match(/Truck Service Bays:\s*(?:<[^>]+>\s*)*(\d+)/i);
  return m ? Number(m[1]) : null;
}

function parseParking(html) {
  const m = flatten(html).match(/([\d,]+)\s+truck parking spaces/i);
  return m ? Number(m[1].replace(/,/g, '')) : null;
}

// Always null, on purpose, and called anyway so the report can say so.
// TA's location pages never publish a shower COUNT: the only mention of
// showers is boilerplate prose ("use our laundry and shower facilities")
// carrying no number. Verified across every page fetched during this
// work. Returning null rather than omitting the field keeps the audit
// honest — the column is uncollectable from this source, not merely
// missing on some rows.
function parseShowers(html) {
  // Kept narrow on purpose. A loose /(\d+)\s+shower/ would eventually pick
  // a number out of unrelated prose and inject a phantom disagreement into
  // the numeric section, which is worse than reporting nothing.
  const flat = flatten(html);
  const m = flat.match(/Showers?:\s*(?:<[^>]+>\s*)*(\d+)/i) || flat.match(/(\d+)\s+showers\b/i);
  return m ? Number(m[1]) : null;
}

// schema.org GasStation block: authoritative address, coordinates and the
// site number ("TA Tuscaloosa #0016"), which is what DATA's nav code
// encodes (CVENTA016). Used to corroborate the address match.
function parseJsonLd(html) {
  const m = String(html).match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/i);
  if (!m) return null;
  let d;
  try { d = JSON.parse(decode(m[1])); } catch (e) { return null; }
  const a = d.address || {};
  return {
    name: d.name || '',
    siteNumber: siteNumberFromName(d.name || ''),
    street: a.streetAddress || '',
    city: a.addressLocality || '',
    state: a.addressRegion || '',
    zip: a.postalCode || '',
    phone: a.telephone || '',
    lat: d.geo ? Number(d.geo.latitude) : null,
    lng: d.geo ? Number(d.geo.longitude) : null
  };
}

// "TA Tuscaloosa #0016" -> 16 ; "Petro Shorter #0505" -> 505
function siteNumberFromName(name) {
  const m = String(name).match(/#\s*(\d+)/);
  return m ? Number(m[1]) : null;
}

// DATA's nav code carries the same number: CVENTA016 -> 16, CVENPE505 -> 505.
function siteNumberFromNav(nav) {
  const m = String(nav || '').match(/^CVEN(?:TA|PE)(\d{3})$/);
  return m ? Number(m[1]) : null;
}

// Everything the audit collects from one page, or null when the page has
// no location block at all (a state index, a 404 body, a redirect landing).
function parseLocation(html) {
  const ld = parseJsonLd(html);
  if (!ld) return null;
  return Object.assign({}, ld, {
    codes: parseAmenityCodes(html),
    otherAmenities: parseOtherAmenities(html),
    laundry: parseLaundry(html),
    restaurants: parseRestaurants(html),
    parking: parseParking(html),
    bays: parseBays(html),
    showers: parseShowers(html)
  });
}

// --- address matching -------------------------------------------------
// Names are not comparable between sources (the fuel book files TA
// Tuscaloosa under Cottondale; TA's site calls TA Tampa "TA Express
// Tampa"), so the match runs on street + city + state.
const STREET_WORDS = {
  street: 'st', str: 'st', st: 'st',
  road: 'rd', rd: 'rd',
  avenue: 'ave', ave: 'ave', av: 'ave',
  drive: 'dr', dr: 'dr',
  highway: 'hwy', hwy: 'hwy', hiway: 'hwy',
  boulevard: 'blvd', blvd: 'blvd',
  parkway: 'pkwy', pkwy: 'pkwy',
  lane: 'ln', ln: 'ln',
  place: 'pl', pl: 'pl',
  court: 'ct', ct: 'ct',
  circle: 'cir', cir: 'cir',
  turnpike: 'tpke', tpke: 'tpke',
  north: 'n', south: 's', east: 'e', west: 'w',
  northeast: 'ne', northwest: 'nw', southeast: 'se', southwest: 'sw',
  interstate: 'i', route: 'rt', rte: 'rt', rt: 'rt', us: 'us', state: 'state'
};

function normalizeStreet(s) {
  return decode(s || '')
    .toLowerCase()
    .replace(/[.,#]/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/).filter(Boolean)
    .map(w => STREET_WORDS[w] || w)
    .join(' ')
    .trim();
}

function normalizeCity(s) {
  return decode(s || '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
}

// The leading house/route number, which is the part that almost never
// differs between two records for the same physical site.
function streetNumber(s) {
  const m = normalizeStreet(s).match(/^(\d+)\b/);
  return m ? m[1] : null;
}

// True when two address records describe the same site. State must agree
// exactly. Beyond that, either the normalized street matches outright, or
// the house number matches and the streets share a meaningful token —
// enough to absorb "8301 N.HWY 281" vs "8301 North Highway 281" without
// letting two different stops in one city collide.
function sameAddress(a, b) {
  if (!a || !b) return false;
  if (String(a.state || '').toUpperCase() !== String(b.state || '').toUpperCase()) return false;
  const sa = normalizeStreet(a.street), sb = normalizeStreet(b.street);
  if (!sa || !sb) return false;
  if (sa === sb) return true;
  const na = streetNumber(a.street), nb = streetNumber(b.street);
  if (!na || !nb || na !== nb) return false;
  const ta = new Set(sa.split(' ').filter(w => w !== na && w.length > 1));
  const tb = sb.split(' ').filter(w => w !== nb && w.length > 1);
  return tb.some(w => ta.has(w));
}

module.exports = {
  AMENITY_LABELS, CODE_ORDER,
  parseAmenityCodes, parseOtherAmenities, parseLaundry, parseRestaurants,
  parseBays, parseParking, parseShowers,
  parseJsonLd, parseLocation,
  siteNumberFromName, siteNumberFromNav,
  normalizeStreet, normalizeCity, streetNumber, sameAddress, sortCodes
};
