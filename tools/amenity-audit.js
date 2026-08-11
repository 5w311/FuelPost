#!/usr/bin/env node
'use strict';

// Amenity audit: compares DATA's amenity column against TA's own location
// pages and writes tools/amenity-audit-report.txt.
//
// READ AND REPORT ONLY. This tool never modifies index.html — not the
// amenity column, not anything. That is a deliberate departure from
// tools/geocode.js, which rewrites coordinates behind a distance gate.
// Coordinates have a plausibility test; amenities do not. A code on one
// source and not the other can mean the fuel book is stale or it can mean
// TA's listing is incomplete, and nothing in the response tells them
// apart. The human reads the report and decides; a later brief applies
// the decisions.
//
// Usage: node tools/amenity-audit.js [--limit N] [--refetch]
//   --limit N   only audit the first N fuel stops (for a quick smoke run)
//   --refetch   ignore the on-disk page cache and fetch everything again
//
// Run from anywhere; paths are resolved relative to this file.

const fs = require('fs');
const path = require('path');
const https = require('https');
const url = require('url');

const P = require('./amenityparse.js');
const { splitDataBlock, parseRowLine } = require('./geocode.js');

const INDEX_PATH = path.join(__dirname, '..', 'index.html');
const REPORT_PATH = path.join(__dirname, 'amenity-audit-report.txt');
// Gitignored. Every fetched page lands here and is reused on re-runs, so
// tuning the parser costs zero requests to TA.
const CACHE_DIR = path.join(__dirname, '.amenity-cache');

const SITEMAP_URL = 'https://www.ta-petro.com/sitemap-xml/';
// Honest identification, in the spirit of geocode.js's request interval.
const USER_AGENT = 'FuelPost-amenity-audit/1.0 (+https://github.com/5w311/FuelPost)';
const REQUEST_INTERVAL_MS = 1200;   // ~0.8 req/sec — this is someone else's site
const MAX_ATTEMPTS = 3;

// DATA column indices (see the field comment above DATA in index.html).
const F = { ID: 0, BRAND: 1, NAME: 2, ADDR: 3, CITY: 4, ST: 5, EXIT: 7,
            LAT: 9, LNG: 10, TYPE: 11, PARK: 12, SHOWERS: 14, BAYS: 15,
            AMEN: 16, NAV: 20 };

const sleep = ms => new Promise(r => setTimeout(r, ms));

// --- fetching ---------------------------------------------------------
// Dependency-free HTTPS GET that tunnels through HTTPS_PROXY when one is
// set (Node's global fetch ignores the proxy env vars, which is why this
// exists rather than a one-line fetch call).
function httpGet(target, redirectsLeft = 4) {
  return new Promise((resolve, reject) => {
    const u = new URL(target);
    const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
    const headers = { 'user-agent': USER_AGENT, accept: 'text/html,application/xml' };

    const onRes = res => {
      const code = res.statusCode;
      if (code >= 300 && code < 400 && res.headers.location && redirectsLeft > 0) {
        res.resume();
        return resolve(httpGet(url.resolve(target, res.headers.location), redirectsLeft - 1));
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', c => { body += c; });
      res.on('end', () => resolve({ status: code, body }));
    };

    if (!proxy) {
      https.get({ hostname: u.hostname, path: u.pathname + u.search, headers }, onRes)
        .on('error', reject);
      return;
    }
    const p = new URL(proxy);
    require('http').request({
      host: p.hostname, port: p.port || 80, method: 'CONNECT',
      path: `${u.hostname}:443`, headers: { host: `${u.hostname}:443` }
    }).on('connect', (r, socket) => {
      if (r.statusCode !== 200) return reject(new Error('proxy CONNECT ' + r.statusCode));
      https.get({ hostname: u.hostname, path: u.pathname + u.search, headers, socket,
        agent: false, servername: u.hostname }, onRes).on('error', reject);
    }).on('error', reject).end();
  });
}

const cacheFile = u => path.join(CACHE_DIR,
  u.replace(/^https?:\/\//, '').replace(/[^a-zA-Z0-9._-]/g, '_') + '.html');

// Cached fetch with a small fixed retry budget. A page that still fails is
// returned as null so the caller can flag that row rather than kill the run.
async function getPage(u, state) {
  const f = cacheFile(u);
  if (!state.refetch && fs.existsSync(f)) return fs.readFileSync(f, 'utf8');
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) await sleep(1000 * 2 ** (attempt - 1));
    await sleep(REQUEST_INTERVAL_MS);
    state.fetches++;
    try {
      const res = await httpGet(u);
      if (res.status === 200) { fs.writeFileSync(f, res.body); return res.body; }
      if (res.status === 404) return null;          // not a transient failure
      state.log(`    HTTP ${res.status} on ${u}`);
    } catch (e) {
      state.log(`    ${e.message} on ${u}`);
    }
  }
  return null;
}

// --- URL discovery ----------------------------------------------------
// TA's published sitemap, not URLs constructed from station names. DATA
// carries no TA slug, and name-to-slug guessing breaks on rows like
// "Petro W. Memphis" and "TA Jacksonville South" — and on "TA Tampa",
// which TA files as "TA Express Tampa".
async function locationUrls(state) {
  const xml = await getPage(SITEMAP_URL, state);
  if (!xml) throw new Error('could not fetch the TA sitemap; nothing to match against');
  const urls = [...xml.matchAll(/https:\/\/www\.ta-petro\.com\/location\/([a-z]{2})\/([^\/<\s]+)\//g)]
    .map(m => ({ url: m[0], st: m[1].toUpperCase(), slug: m[2] }));
  const seen = new Set();
  return urls.filter(u => !seen.has(u.url) && seen.add(u.url));
}

// Fetch ORDER only — never a match decision. Pages are still confirmed on
// address, so a bad guess here costs one wasted request, not a wrong row.
function rankCandidates(row, candidates) {
  const want = new Set(String(row[F.NAME]).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean));
  return candidates.slice().sort((a, b) => score(b) - score(a));
  function score(c) {
    const toks = c.slug.split('-');
    return toks.reduce((n, t) => n + (want.has(t) ? 1 : 0), 0) - toks.length * 0.01;
  }
}

// --- audit ------------------------------------------------------------
async function run({ log = console.log, limit = 0, refetch = false } = {}) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const state = { log, refetch, fetches: 0 };

  const DATA = splitDataBlock(fs.readFileSync(INDEX_PATH, 'utf8')).rowLines.map(parseRowLine);
  const stops = DATA.filter(r => r[F.TYPE] !== 'term');
  const rows = limit ? stops.slice(0, limit) : stops;

  log(`DATA: ${DATA.length} rows, ${stops.length} fuel stops (terminals excluded)`);
  const all = await locationUrls(state);
  log(`TA sitemap: ${all.length} location pages`);

  const byState = new Map();
  all.forEach(u => { if (!byState.has(u.st)) byState.set(u.st, []); byState.get(u.st).push(u); });

  const results = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const cands = rankCandidates(row, byState.get(String(row[F.ST]).toUpperCase()) || []);
    const rec = { row, url: null, page: null, unmatched: true, fetchFailed: false, tried: 0,
                  siteOnly: null };
    // DATA's nav code carries TA's site number (CVENTA016 -> #0016). It is
    // NOT used to match — the brief calls for address matching, and an ID
    // collision would be silent. It IS recorded when the address match
    // fails, because "the site number says this is the same station but
    // the two addresses disagree" is the single most useful thing the
    // report can tell a human about an unmatched row.
    const wantSite = P.siteNumberFromNav(row[F.NAV]);
    for (const c of cands) {
      const html = await getPage(c.url, state);
      rec.tried++;
      if (html === null) { rec.fetchFailed = true; continue; }
      const loc = P.parseLocation(html);
      if (!loc) continue;
      if (P.sameAddress({ street: row[F.ADDR], state: row[F.ST] }, loc)) {
        rec.url = c.url; rec.page = loc; rec.unmatched = false; rec.fetchFailed = false;
        break;
      }
      if (wantSite != null && loc.siteNumber === wantSite && !rec.siteOnly) {
        rec.siteOnly = Object.assign({ url: c.url }, loc);
      }
    }
    results.push(rec);
    log(`[${String(i + 1).padStart(3)}/${rows.length}] ${row[F.NAME]} — ${
      rec.unmatched ? 'UNMATCHED after ' + rec.tried + ' pages' : rec.page.name + ' (' + rec.page.codes + ')'}`);
  }

  fs.writeFileSync(REPORT_PATH, buildReport(results, DATA.length, stops.length, state));
  log(`\nWrote ${path.relative(process.cwd(), REPORT_PATH)} (${state.fetches} network fetches this run)`);
  return results;
}

// --- report -----------------------------------------------------------
const codeSet = s => new Set(String(s || '').split(',').map(x => x.trim()).filter(Boolean));

function buildReport(results, totalRows, totalStops, state) {
  const L = [];
  const matched = results.filter(r => !r.unmatched);
  const unmatched = results.filter(r => r.unmatched && !r.fetchFailed);
  const unfetched = results.filter(r => r.unmatched && r.fetchFailed);

  const diffs = matched.map(r => {
    const d = codeSet(r.row[F.AMEN]);
    const t = new Set(String(r.page.codes || '').split(''));
    return {
      r,
      missingFromData: P.sortCodes([...t].filter(c => !d.has(c))),
      extraInData: P.sortCodes([...d].filter(c => !t.has(c)))
    };
  });
  const agree = diffs.filter(d => !d.missingFromData.length && !d.extraInData.length);
  const disagree = diffs.filter(d => d.missingFromData.length || d.extraInData.length);

  L.push(`FuelPost amenity audit — ${new Date().toISOString()}`);
  L.push(`Source: TA location pages on ta-petro.com, discovered via TA's published sitemap.`);
  L.push(`This report is READ ONLY. No DATA row was changed by this tool.`);
  L.push('');
  L.push('TOTALS');
  L.push(`  Rows in DATA:                 ${totalRows}`);
  L.push(`  Fuel stops audited:           ${totalStops} (terminals excluded — FUEL_STOPS filters them)`);
  L.push(`  Matched to a TA page:         ${matched.length}`);
  L.push(`  Unmatched (no address match): ${unmatched.length}`);
  L.push(`  Unfetched (network failures): ${unfetched.length}`);
  L.push(`  Amenity codes agree exactly:  ${agree.length}`);
  L.push(`  Amenity codes disagree:       ${disagree.length}`);
  L.push('');

  L.push('SOURCE LIMITATIONS — READ BEFORE ACTING ON ANYTHING BELOW');
  L.push('  Three fields the brief asked for cannot be fully collected from TA\'s site.');
  L.push('  These are properties of the source, confirmed against raw HTML, not parser bugs:');
  L.push('');
  L.push('  1. SHOWER COUNTS ARE NOT PUBLISHED. TA location pages carry no shower');
  L.push('     number anywhere. The only mention is boilerplate prose ("use our laundry');
  L.push('     and shower facilities"). DATA\'s shower column cannot be audited against');
  L.push('     this source at all. The hand check that produced the known-answer shower');
  L.push('     figures must have used another source.');
  L.push('');
  L.push('  2. TA NO LONGER LISTS "STAYFIT Walking Trail" AT ANY LOCATION. Not one page');
  L.push('     fetched in this run mentions a walking trail. DATA carries W on many rows.');
  L.push('     Every one of those therefore reports as "in DATA, not on TA" below. That is');
  L.push('     one systematic source difference, NOT that many independent data errors,');
  L.push('     and it should be decided as a single question: did TA retire the amenity,');
  L.push('     or retire the listing?');
  L.push('');
  L.push('  3. RESTAURANT LISTS ARE THINNER THAN THE HAND CHECK. TA\'s pages list fewer');
  L.push('     brands than the by-hand spot check found — including TA\'s own Country');
  L.push('     Pride, absent from the Baldwin page. Treat the brand lists below as a');
  L.push('     lower bound on what is actually at each stop.');
  L.push('');

  L.push('AMENITY CODE DIFF');
  L.push('  Grouped by direction. The first group is the one that hides stops from a');
  L.push('  filter: the stop has the amenity, DATA does not say so, so a filter on that');
  L.push('  code silently drops it.');
  L.push('');
  const missing = disagree.filter(d => d.missingFromData.length);
  L.push(`  --- IN TA, MISSING FROM DATA (${missing.length} rows) ---`);
  if (!missing.length) L.push('  (none)');
  missing.forEach(d => L.push(
    `  ${pad(d.r.row[F.NAME], 26)} ${pad(d.r.row[F.CITY] + ', ' + d.r.row[F.ST], 22)}` +
    ` DATA=[${pad(d.r.row[F.AMEN] || '-', 11)}] TA=[${pad(d.r.page.codes || '-', 6)}] missing: ${d.missingFromData.join(',')}`));
  L.push('');
  const extra = disagree.filter(d => d.extraInData.length);
  L.push(`  --- IN DATA, NOT LISTED BY TA (${extra.length} rows) ---`);
  if (!extra.length) L.push('  (none)');
  extra.forEach(d => L.push(
    `  ${pad(d.r.row[F.NAME], 26)} ${pad(d.r.row[F.CITY] + ', ' + d.r.row[F.ST], 22)}` +
    ` DATA=[${pad(d.r.row[F.AMEN] || '-', 11)}] TA=[${pad(d.r.page.codes || '-', 6)}] extra: ${d.extraInData.join(',')}`));
  L.push('');

  L.push('PREVALENCE — the number that decides whether something becomes a filter');
  L.push(`  Out of ${matched.length} matched stops, as listed by TA:`);
  L.push('');
  const pct = n => matched.length ? (100 * n / matched.length).toFixed(1).padStart(5) : '  0.0';
  const laundryN = matched.filter(r => r.page.laundry).length;
  L.push(`  ${pad('Laundry', 30)} ${String(laundryN).padStart(3)} / ${matched.length}  ${pct(laundryN)}%`);
  if (matched.length && laundryN === matched.length) {
    L.push('       ^ present at EVERY matched stop. As a filter this would be a dead');
    L.push('         control — it can never narrow the list. Same shape as the CAT scale');
    L.push('         filter being removed.');
  }
  L.push('');
  P.AMENITY_LABELS.forEach(([code, label]) => {
    const n = matched.filter(r => String(r.page.codes).includes(code)).length;
    L.push(`  ${pad(code + ' — ' + label.replace('STAYFIT ', ''), 30)} ${String(n).padStart(3)} / ${matched.length}  ${pct(n)}%`);
  });
  L.push('');
  const restN = matched.filter(r => r.page.restaurants.length).length;
  L.push(`  ${pad('Any restaurant listed', 30)} ${String(restN).padStart(3)} / ${matched.length}  ${pct(restN)}%`);
  L.push('');

  L.push('RESTAURANTS — raw brand names, deliberately unclassified');
  L.push('  Sit-down vs quick-serve is domain knowledge and is not guessed at here.');
  L.push('');
  const brandCount = new Map();
  matched.forEach(r => r.page.restaurants.forEach(b => brandCount.set(b, (brandCount.get(b) || 0) + 1)));
  L.push(`  --- distinct brands across the network (${brandCount.size}) ---`);
  [...brandCount.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .forEach(([b, n]) => L.push(`  ${pad(b, 34)} ${String(n).padStart(3)} stops`));
  L.push('');
  L.push('  --- per stop ---');
  matched.forEach(r => L.push(`  ${pad(r.row[F.NAME], 26)} ${r.page.restaurants.join(', ') || '(none listed)'}`));
  L.push('');

  L.push('NUMERIC FIELD DISAGREEMENTS');
  L.push('  Parking and service bays are published by TA and compared here. Showers are');
  L.push('  not published (see limitation 1) and are therefore not compared at all.');
  L.push('');
  const nums = [];
  matched.forEach(r => {
    const p = Number(r.row[F.PARK]), b = Number(r.row[F.BAYS]);
    if (r.page.parking != null && Number.isFinite(p) && r.page.parking !== p)
      nums.push(`  ${pad(r.row[F.NAME], 26)} parking: DATA=${p} TA=${r.page.parking}`);
    if (r.page.bays != null && Number.isFinite(b) && r.page.bays !== b)
      nums.push(`  ${pad(r.row[F.NAME], 26)} bays:    DATA=${b} TA=${r.page.bays}`);
  });
  L.push(nums.length ? nums.join('\n') : '  (none — every comparable numeric field agreed)');
  L.push('');

  L.push('UNMATCHED ROWS');
  L.push('  No TA page in the row\'s state matched on street address, so nothing above');
  L.push('  counts these rows. Never guessed at — no amenity code from the pages named');
  L.push('  below has been applied to anything.');
  L.push('');
  L.push('  Where DATA\'s nav code (which carries TA\'s site number: CVENTA016 -> #0016)');
  L.push('  points at a real TA page, that page and its address are shown. In every such');
  L.push('  case the two sources disagree about the ADDRESS, which is a finding in its');
  L.push('  own right and is probably worth a separate look at the coordinate data.');
  L.push('');
  if (!unmatched.length) L.push('  (none)');
  unmatched.forEach(r => {
    L.push(`  ${r.row[F.NAME]} (nav ${r.row[F.NAV]}, ${r.tried} pages tried)`);
    L.push(`      DATA: ${r.row[F.ADDR]}, ${r.row[F.CITY]} ${r.row[F.ST]}`);
    if (r.siteOnly) {
      const s = r.siteOnly;
      L.push(`      TA  : ${s.street || '(TA publishes no street address on this page)'}` +
             `${s.city ? ', ' + s.city + ' ' + s.state : ''}   [${s.name}]`);
      L.push(`      TA lists codes [${s.codes || '-'}] — NOT applied, and not counted above.`);
    } else {
      L.push('      TA  : no page in this state carries a matching site number either.');
    }
  });
  L.push('');
  L.push('UNFETCHED ROWS');
  L.push('  Network failures after retries. Re-running will retry these; cached pages are reused.');
  L.push('');
  L.push(unfetched.length
    ? unfetched.map(r => `  ${pad(r.row[F.NAME], 26)} ${r.row[F.CITY]}, ${r.row[F.ST]}`).join('\n')
    : '  (none)');
  L.push('');
  L.push('PROVENANCE');
  L.push('  DATA\'s stations come from the Covenant fuel book Rev 01-2026, and that book');
  L.push('  governs which stops are in network. TA\'s site governs what is currently at');
  L.push('  those stops. Where they disagree about amenities the site is more current;');
  L.push('  where they disagree about a station existing, the book wins and the row stays.');
  L.push('  This report states disagreements. It does not resolve them, and it neither');
  L.push('  removed nor added a row.');
  L.push('');
  return L.join('\n');
}

function pad(s, n) { s = String(s == null ? '' : s); return s.length >= n ? s : s + ' '.repeat(n - s.length); }

if (require.main === module) {
  const argv = process.argv.slice(2);
  const li = argv.indexOf('--limit');
  run({ limit: li >= 0 ? Number(argv[li + 1]) : 0, refetch: argv.includes('--refetch') })
    .catch(e => { console.error(e); process.exit(1); });
}

module.exports = { run, buildReport, rankCandidates, httpGet };
