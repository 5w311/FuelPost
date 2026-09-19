// THE APP MUST SURVIVE A MISSING MAP SDK.
//
// Until v1.65.0 index.html built HERE objects at the TOP LEVEL of its main
// script. When the four HERE <script> tags had not loaded — a dead cell, a
// captive portal, a CDN blip, a rejected key — the first reference to `H`
// threw, and because it threw at the top level it took the whole script with
// it: no state, no renderList, no station list, no search. The driver got a
// page that looked alive and did nothing.
//
// This is not a regex sweep. It strips comments and strings, then walks the
// script tracking two things — am I inside a function, and am I inside an
// `if(MAP_SDK)` block — and reports any map construction that runs at the top
// level unguarded. A regex could not tell those apart, and the difference is
// the entire bug.
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c, e = '') => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.log('  FAIL', n, e); } };

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// The main script block: the biggest one.
const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => ({ i: m.index, body: m[1] }));
const main = blocks.reduce((a, b) => (b.body.length > a.body.length ? b : a));
const firstLine = html.slice(0, main.i).split('\n').length;

// Blank out comments and string/template bodies, preserving newlines so line
// numbers still line up. Everything below reads CODE, never prose.
function stripped(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') { out.push(' '); i++; } }
    else if (c === '/' && src[i + 1] === '*') {
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) { out.push(src[i] === '\n' ? '\n' : ' '); i++; }
      out.push('  '); i += 2;
    } else if (c === '"' || c === "'" || c === '`') {
      const q = c; out.push(' '); i++;
      while (i < src.length && src[i] !== q) {
        if (src[i] === '\\') { out.push(' '); i++; }
        out.push(src[i] === '\n' ? '\n' : ' '); i++;
      }
      out.push(' '); i++;
    } else { out.push(c); i++; }
  }
  return out.join('');
}

const code = stripped(main.body);
const lines = code.split('\n');
const raw = main.body.split('\n');

// Anything that only exists once the SDK has loaded.
const MAPREF = /(?<![.\w])new H\.|(?<![.\w])H\.[A-Za-z]|(?<![.\w])(?:map|ui|platform|defaultLayers|mapEvents|markerGroup|placeGroup|locateGroup|routeGroup)\s*\./;

// Walk the script. `fnDepth` is how deep we are inside any function body
// (declaration, expression or arrow); at 0 we are running at load time, which
// is the only place an unguarded reference is fatal. `guardDepth` is the brace
// depth of the nearest enclosing if(MAP_SDK) / if(mapLive()) block.
function walk() {
  let depth = 0, fnStack = [], guards = [], findings = [];
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n];
    const opensGuard = /\bif\s*\(\s*(?:MAP_SDK|mapLive\(\))\s*\)\s*\{/.test(line);
    const guardedInline = /\bif\s*\(\s*(?:MAP_SDK|mapLive\(\))\s*\)\s*[^{]/.test(line);
    const isFnHead = /(?:^|[^.\w])function\s*[\w$]*\s*\(|=>\s*\{|\)\s*=>/.test(line);
    const early = /if\s*\(\s*!\s*mapLive\(\)\s*\)\s*return/.test(line);

    // The guard's OWN definition names H.Map; `typeof H` is the one safe way
    // to touch H, which is the whole point of that line. Matched on the part
    // that survives stripping — the 'undefined' literal is blanked out by then.
    const isGuardDef = /const MAP_SDK = typeof H/.test(line);
    if (MAPREF.test(line) && !opensGuard && !guardedInline && !early && !isGuardDef) {
      const insideFn = fnStack.length > 0;
      const insideGuard = guards.length > 0;
      if (!insideFn && !insideGuard) {
        findings.push({ line: firstLine + n, text: raw[n].trim().slice(0, 78) });
      }
    }

    const opens = (line.match(/\{/g) || []).length;
    const closes = (line.match(/\}/g) || []).length;
    if (opensGuard) guards.push(depth);
    if (isFnHead && opens > 0) fnStack.push(depth);
    depth += opens - closes;
    while (guards.length && depth <= guards[guards.length - 1]) guards.pop();
    while (fnStack.length && depth <= fnStack[fnStack.length - 1]) fnStack.pop();
    if (depth < 0) depth = 0;
  }
  return findings;
}

console.log('\n=== the guard exists and is real ===');
ok('MAP_SDK is computed from whether H actually loaded',
   /const MAP_SDK = typeof H !== 'undefined' && !!\(H && H\.Map\);/.test(main.body));
ok('mapLive() reads the map itself, not just the flag',
   /function mapLive\(\)\{ return map !== null; \}/.test(main.body),
   'a half-built map must read as no map');
ok('the map and its groups are declared with let, not const',
   /let map = null;/.test(main.body)
   && /let markerGroup = null;/.test(main.body)
   && /let placeGroup = null;/.test(main.body)
   && /let locateGroup = null;/.test(main.body)
   && /let routeGroup = null;/.test(main.body));

console.log('\n=== nothing builds the map at load time unguarded ===');
const findings = walk();
ok('>>> no unguarded map construction runs at the top level',
   findings.length === 0,
   JSON.stringify(findings.slice(0, 6), null, 1));

// The walker is the whole test, so prove it can still see a violation —
// otherwise a broken walker would pass this file silently forever.
console.log('\n=== the walker itself still works ===');
{
  const saved = lines.slice();
  // Inject a violation at the top level and confirm it is caught.
  lines.unshift('const boom = new H.Map(document.body, null, {});');
  raw.unshift('const boom = new H.Map(document.body, null, {});');
  const caught = walk();
  lines.shift(); raw.shift();
  ok('an unguarded top-level construction IS reported',
     caught.length === 1 && /new H\.Map/.test(caught[0].text), JSON.stringify(caught));
  ok('and the real file is unchanged by the check', lines.length === saved.length);
}

console.log('\n=== the mixed functions keep their NON-map work ===');
// These do map work AND app work. Guarding the whole function would quietly
// break dark mode and place-clearing on a page with no map.
const switchTheme = main.body.slice(main.body.indexOf('function switchTheme(theme){'));
const stBody = switchTheme.slice(0, switchTheme.indexOf('\n}\n') + 3);
ok('switchTheme still sets the app-wide data-theme outside the guard',
   /setAttribute\('data-theme', theme\);/.test(stBody)
   && stBody.indexOf("setAttribute('data-theme'") < stBody.indexOf('if(mapLive())'), stBody);
ok('  and still updates the toggle UI outside it',
   /\}\s*\n\s*updateThemeToggleUI\(\);/.test(stBody), stBody);

const clearPlace = main.body.slice(main.body.indexOf('function clearPlace(){'));
const cpBody = clearPlace.slice(0, clearPlace.indexOf('\n}\n') + 3);
ok('clearPlace still clears placeAnchor and the Near Me panel',
   /placeAnchor = null;/.test(cpBody) && /renderNearMe\(\);/.test(cpBody)
   && /if\(mapLive\(\)\) placeGroup\.removeAll\(\);/.test(cpBody), cpBody);

console.log('\n=== the driver is told, rather than left with a spinner ===');
ok('a page with no SDK retires the loading state immediately',
   /clearTimeout\(window\.__mapLoadTimer\);/.test(main.body)
   && /mapLoadingSpin[\s\S]{0,120}remove\(\)/.test(main.body));
ok('  and the message says what still works',
   /The map needs a connection and could not load/.test(main.body)
   && /station list, search, filters and nav codes still work/.test(main.body));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
