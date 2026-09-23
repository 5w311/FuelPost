#!/usr/bin/env node
'use strict';

// One-off geocoder for the DATA array in index.html (FuelPost brief 01).
//
// Replaces the estimated lat/lng (fields 9 and 10) in each DATA row with
// HERE Geocoding API v7 results, gated by a 25-mile plausibility check
// against the old estimate. Rows whose geocode jumps >= 25 miles, or that
// get no result, keep their old coordinates and are flagged for human
// review. Writes a summary to tools/geocode-report.txt.
//
// Usage: node tools/geocode.js
// Run from anywhere; paths are resolved relative to this file.

const fs = require('fs');
const path = require('path');

const INDEX_PATH = path.join(__dirname, '..', 'index.html');
const REPORT_PATH = path.join(__dirname, 'geocode-report.txt');

const FIELD_COUNT = 21;
const LAT_IDX = 9;
const LNG_IDX = 10;
const MAX_JUMP_MILES = 25;
const REQUEST_INTERVAL_MS = 200; // ~5 requests/second
const MAX_RETRIES = 3;

// Continental US bounding box for the post-run sanity check.
const BBOX = { latMin: 24, latMax: 50, lngMin: -125, lngMax: -66 };

// ---------------------------------------------------------------------------
// Extraction

// Finds the DATA block and returns { before, rowLines, after } where
// rowLines are the raw one-row-per-line strings (without trailing commas
// stripped) and before/after are the untouched surrounding file text.
function splitDataBlock(html) {
  const startMarker = 'const DATA = [';
  const startIdx = html.indexOf(startMarker);
  if (startIdx === -1) throw new Error('Could not find "const DATA = [" in index.html');
  const bodyStart = html.indexOf('\n', startIdx) + 1;
  if (bodyStart === 0) throw new Error('No newline after DATA opener');
  const endIdx = html.indexOf('\n];', bodyStart);
  if (endIdx === -1) throw new Error('Could not find closing "];" of DATA block');
  const body = html.slice(bodyStart, endIdx);
  return {
    before: html.slice(0, bodyStart),
    rowLines: body.split('\n'),
    after: html.slice(endIdx), // starts with "\n];"
  };
}

// Parses one raw row line (JSON array literal with optional trailing comma)
// into a JS array. Throws if it is not valid JSON.
function parseRowLine(line) {
  const trimmed = line.trim().replace(/,$/, '');
  const row = JSON.parse(trimmed);
  if (!Array.isArray(row) || row.length !== FIELD_COUNT) {
    throw new Error(`Row does not have ${FIELD_COUNT} fields: ${trimmed.slice(0, 60)}...`);
  }
  return row;
}

function extractApiKey(html) {
  const m = html.match(/const HERE_API_KEY = '([^']+)'/);
  if (!m) throw new Error('Could not find HERE_API_KEY in index.html');
  return m[1];
}

// ---------------------------------------------------------------------------
// Line rewriting (byte-preserving for all fields except lat/lng)

// Returns the character spans [start, end) of each top-level element in a
// one-line JSON array literal, by scanning instead of re-serializing, so
// every untouched field stays byte-identical.
function topLevelElementSpans(line) {
  const open = line.indexOf('[');
  if (open === -1) throw new Error('No "[" in row line');
  const spans = [];
  let depth = 0;
  let inString = false;
  let elemStart = open + 1;
  for (let i = open; i < line.length; i++) {
    const ch = line[i];
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '[' || ch === '{') depth++;
    else if (ch === ']' || ch === '}') {
      depth--;
      if (depth === 0) {
        spans.push([elemStart, i]);
        return spans;
      }
    } else if (ch === ',' && depth === 1) {
      spans.push([elemStart, i]);
      elemStart = i + 1;
    }
  }
  throw new Error('Unterminated array in row line');
}

// Replaces fields LAT_IDX and LNG_IDX in a raw row line with the given
// numbers (already rounded), leaving every other byte of the line intact.
function rewriteCoords(line, lat, lng) {
  const spans = topLevelElementSpans(line);
  if (spans.length !== FIELD_COUNT) {
    throw new Error(`Expected ${FIELD_COUNT} elements, found ${spans.length}: ${line.slice(0, 60)}...`);
  }
  const [latStart, latEnd] = spans[LAT_IDX];
  const [lngStart, lngEnd] = spans[LNG_IDX];
  return (
    line.slice(0, latStart) + lat.toFixed(4) +
    line.slice(latEnd, lngStart) + lng.toFixed(4) +
    line.slice(lngEnd)
  );
}

// ---------------------------------------------------------------------------
// Geocoding

function haversineMiles(lat1, lng1, lat2, lng2) {
  const R = 3958.7613; // earth radius, miles
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Geocodes one address. Returns {lat, lng} or null for "no result".
// Transport failures and 5xx/429 are retried, then thrown — a dead network
// must abort the run, not silently flag all 146 rows.
async function geocodeAddress(query, apiKey, fetchFn) {
  const url =
    'https://geocode.search.hereapi.com/v1/geocode' +
    `?q=${encodeURIComponent(query)}` +
    `&in=countryCode:USA&limit=1&apiKey=${apiKey}`;
  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(1000 * 2 ** (attempt - 1));
    try {
      const res = await fetchFn(url);
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`HTTP ${res.status} from HERE API`);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} from HERE API for "${query}"`);
      const json = await res.json();
      const item = json.items && json.items[0];
      if (!item || !item.position) return null;
      return { lat: item.position.lat, lng: item.position.lng };
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`Geocoding failed after ${MAX_RETRIES + 1} attempts for "${query}": ${lastErr.message}`);
}

// ---------------------------------------------------------------------------
// Post-rewrite verification

function verifyRewrite(oldHtml, newHtml, expectedRowCount) {
  const oldBlock = splitDataBlock(oldHtml);
  const newBlock = splitDataBlock(newHtml);
  if (newBlock.rowLines.length !== expectedRowCount) {
    throw new Error(`Row count changed: ${newBlock.rowLines.length} !== ${expectedRowCount}`);
  }
  for (let i = 0; i < expectedRowCount; i++) {
    const oldRow = parseRowLine(oldBlock.rowLines[i]);
    const newRow = parseRowLine(newBlock.rowLines[i]); // throws if not JSON
    if (typeof newRow[LAT_IDX] !== 'number' || typeof newRow[LNG_IDX] !== 'number') {
      throw new Error(`Row ${newRow[0]}: lat/lng not numeric after rewrite`);
    }
    for (let f = 0; f < FIELD_COUNT; f++) {
      if (f === LAT_IDX || f === LNG_IDX) continue;
      if (JSON.stringify(oldRow[f]) !== JSON.stringify(newRow[f])) {
        throw new Error(`Row ${oldRow[0]}: field ${f} changed (${JSON.stringify(oldRow[f])} -> ${JSON.stringify(newRow[f])})`);
      }
    }
    // Non-coordinate bytes must be identical, not merely JSON-equal.
    const oldSpans = topLevelElementSpans(oldBlock.rowLines[i]);
    const newSpans = topLevelElementSpans(newBlock.rowLines[i]);
    for (let f = 0; f < FIELD_COUNT; f++) {
      if (f === LAT_IDX || f === LNG_IDX) continue;
      const oldText = oldBlock.rowLines[i].slice(oldSpans[f][0], oldSpans[f][1]);
      const newText = newBlock.rowLines[i].slice(newSpans[f][0], newSpans[f][1]);
      if (oldText !== newText) {
        throw new Error(`Row ${oldRow[0]}: field ${f} bytes changed ("${oldText}" -> "${newText}")`);
      }
    }
  }
  // Surrounding file text untouched.
  if (oldBlock.before !== newBlock.before || oldBlock.after !== newBlock.after) {
    throw new Error('Text outside the DATA rows changed');
  }
  // Inline <script> blocks must still parse as JS after the rewrite.
  const scripts = [...newHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  if (scripts.length === 0) throw new Error('No inline <script> blocks found to syntax-check');
  for (const [, src] of scripts) {
    new Function(src); // throws SyntaxError if the rewrite broke the JS
  }
}

function checkBbox(lat, lng) {
  return lat >= BBOX.latMin && lat <= BBOX.latMax && lng >= BBOX.lngMin && lng <= BBOX.lngMax;
}

// ---------------------------------------------------------------------------
// Main

async function run({ fetchFn = fetch, log = console.log } = {}) {
  const oldHtml = fs.readFileSync(INDEX_PATH, 'utf8');
  const apiKey = extractApiKey(oldHtml);
  const { before, rowLines, after } = splitDataBlock(oldHtml);
  const rows = rowLines.map(parseRowLine);
  log(`Extracted ${rows.length} rows from index.html`);

  const accepted = [];
  const flagged = [];
  const newLines = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const [id, , name, addr, city, st, zip] = row;
    const oldLat = row[LAT_IDX];
    const oldLng = row[LNG_IDX];
    const query = `${addr}, ${city}, ${st} ${zip}, USA`;

    if (i > 0) await sleep(REQUEST_INTERVAL_MS);
    const pos = await geocodeAddress(query, apiKey, fetchFn);

    if (!pos) {
      flagged.push({ id, name, oldLat, oldLng, newLat: null, newLng: null, miles: null, reason: 'no result' });
      newLines.push(rowLines[i]);
      log(`[${i + 1}/${rows.length}] ${id} ${name}: NO RESULT — keeping old coord`);
      continue;
    }

    const miles = haversineMiles(oldLat, oldLng, pos.lat, pos.lng);
    if (miles >= MAX_JUMP_MILES) {
      flagged.push({ id, name, oldLat, oldLng, newLat: pos.lat, newLng: pos.lng, miles, reason: `${miles.toFixed(1)} mi jump` });
      newLines.push(rowLines[i]);
      log(`[${i + 1}/${rows.length}] ${id} ${name}: FLAGGED ${miles.toFixed(1)} mi jump — keeping old coord`);
    } else {
      const lat = Number(pos.lat.toFixed(4));
      const lng = Number(pos.lng.toFixed(4));
      if (!checkBbox(lat, lng)) {
        throw new Error(`${id}: accepted coord ${lat},${lng} outside continental US bbox`);
      }
      accepted.push({ id, miles });
      newLines.push(rewriteCoords(rowLines[i], lat, lng));
      log(`[${i + 1}/${rows.length}] ${id} ${name}: accepted (${miles.toFixed(2)} mi from estimate)`);
    }
  }

  const newHtml = before + newLines.join('\n') + after;
  verifyRewrite(oldHtml, newHtml, rows.length);
  fs.writeFileSync(INDEX_PATH, newHtml);
  log('Rewrote index.html; post-rewrite verification passed.');

  // Report
  const lines = [];
  lines.push(`FuelPost geocode report — ${new Date().toISOString()}`);
  lines.push(`Rows: ${rows.length}, accepted: ${accepted.length}, flagged (kept old coord): ${flagged.length}`);
  lines.push('');
  if (flagged.length) {
    lines.push('FLAGGED ROWS (old coordinate kept — eyeball each before merging):');
    for (const f of flagged) {
      const geo = f.newLat === null ? 'no result' : `${f.newLat.toFixed(4)},${f.newLng.toFixed(4)}`;
      const dist = f.miles === null ? 'n/a' : `${f.miles.toFixed(1)} mi`;
      lines.push(`  ${f.id}  ${f.name}  old=${f.oldLat},${f.oldLng}  geocoded=${geo}  distance=${dist}`);
    }
  } else {
    lines.push('No flagged rows.');
  }
  const report = lines.join('\n') + '\n';
  fs.writeFileSync(REPORT_PATH, report);
  log('');
  log(report);
  return { accepted, flagged };
}

if (require.main === module) {
  run().catch((err) => {
    console.error(`FATAL: ${err.message}`);
    console.error('index.html was NOT modified unless "verification passed" was printed above.');
    process.exit(1);
  });
}

module.exports = {
  splitDataBlock,
  parseRowLine,
  extractApiKey,
  topLevelElementSpans,
  rewriteCoords,
  haversineMiles,
  geocodeAddress,
  verifyRewrite,
  run,
};
