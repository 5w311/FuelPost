// THE SHIM LEAKS. Every lib/*.js top-level name is a global.
//
// The libs are CommonJS so the same files run under node, and the browser
// loads them as CLASSIC SCRIPTS through a three-line module shim. Classic
// scripts share one global lexical scope, so `function hasAmenCode(){}` in a
// lib is not private to that lib — it is a global, and index.html declaring
// the same name is a redeclaration that kills the ENTIRE main script at parse
// time. Not the function: the whole script. No state, no list, no search.
//
// That is exactly what happened the first time lib/stopfilter.js was wired up
// in v2.0.0, and the node suite passed 1383 assertions while it was broken,
// because nothing here reads index.html the way a browser does. Only opening
// it in Chromium found it. This file closes that gap: it is cheap, it runs in
// the normal suite, and the hazard grows every time logic moves into lib/.
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c, e = '') => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.log('  FAIL', n, e); } };

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// Comments and strings blanked, newlines kept: a declaration named inside a
// comment is not a declaration, and this project has been bitten by matchers
// that could not tell the difference more than once.
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

// Top-level declarations only: anything nested is function-scoped and safe.
function topLevelNames(code) {
  const names = new Set();
  let depth = 0;
  for (const line of stripped(code).split('\n')) {
    const m = /^(?:async\s+function|function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/.exec(line);
    if (m && depth === 0) names.add(m[1]);
    depth += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
    if (depth < 0) depth = 0;
  }
  return names;
}

const libFiles = fs.readdirSync(path.join(ROOT, 'lib')).filter(f => f.endsWith('.js'));
const libGlobals = new Map();            // name -> [files]
for (const f of libFiles) {
  for (const n of topLevelNames(fs.readFileSync(path.join(ROOT, 'lib', f), 'utf8'))) {
    if (!libGlobals.has(n)) libGlobals.set(n, []);
    libGlobals.get(n).push(f);
  }
}

// index.html's main script: the biggest block.
const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const mainScript = blocks.reduce((a, b) => (b.length > a.length ? b : a));
const indexGlobals = topLevelNames(mainScript);

console.log('=== the scan itself is looking at something ===');
ok(`${libFiles.length} lib files scanned`, libFiles.length >= 17, String(libFiles.length));
ok(`${libGlobals.size} lib top-level names found`, libGlobals.size > 50, String(libGlobals.size));
ok(`${indexGlobals.size} index.html top-level names found`,
   indexGlobals.size > 100, String(indexGlobals.size));
ok('  and it finds names it should — a known lib export and a known page global',
   libGlobals.has('stopPasses') && indexGlobals.has('passes'),
   JSON.stringify([libGlobals.has('stopPasses'), indexGlobals.has('passes')]));

console.log('\n=== no lib global collides with an index.html global ===');
const clashes = [...libGlobals.keys()]
  .filter(n => indexGlobals.has(n))
  .map(n => ({ name: n, libs: libGlobals.get(n) }));
ok('>>> nothing is declared in both places',
   clashes.length === 0,
   JSON.stringify(clashes) + '  <- a redeclaration kills index.html\'s whole script');

console.log('\n=== nor do two libs collide with each other ===');
const doubled = [...libGlobals.entries()]
  .filter(([, files]) => files.length > 1)
  .map(([name, files]) => ({ name, files }));
ok('>>> no name is declared at top level by two different libs',
   doubled.length === 0, JSON.stringify(doubled));

console.log('\n=== the scan would catch a real collision ===');
// Otherwise a broken scan passes this file silently forever.
{
  const fake = topLevelNames('function passes(row){ return true; }\n');
  ok('a lib declaring `passes` WOULD be reported',
     fake.has('passes') && indexGlobals.has('passes'));
  const nested = topLevelNames('function outer(){\n  const passes = 1;\n}\n');
  ok('  but a nested declaration is not — it is function-scoped and safe',
     !nested.has('passes'), JSON.stringify([...nested]));
  const commented = topLevelNames('// const passes = 1;\n/* function passes(){} */\n');
  ok('  and neither is one named only in a comment',
     !commented.has('passes'), JSON.stringify([...commented]));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
