const { extractVersion } = require('../lib/extract-version.js');
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name, extra); }
};

console.log('=== extractVersion ===');
ok('matches real shipped line, single quotes',
   extractVersion("// comment\nconst APP_VERSION = '1.6.4';\nother stuff") === '1.6.4');
ok('matches double quotes',
   extractVersion('const APP_VERSION = "2.0.0";') === '2.0.0');
ok('matches with extra whitespace',
   extractVersion('const   APP_VERSION   =   \'1.7.0\'  ;') === '1.7.0');
ok('matches when embedded deep in a large HTML doc',
   extractVersion('<html>'+'x'.repeat(5000)+"\nconst APP_VERSION = '9.9.9';\n"+'y'.repeat(5000)+'</html>') === '9.9.9');
ok('returns null when not found (fetch of a broken/unexpected page)',
   extractVersion('<html><body>404 not found</body></html>') === null);
ok('does not false-match a similarly named variable',
   extractVersion("const APP_VERSION_OLD = '1.0.0';") === null);
ok('does not false-match a comment mentioning the constant',
   extractVersion("// const APP_VERSION = '9.9.9' example\nconst APP_VERSION = '1.6.4';") === '1.6.4',
   'should match the real declaration even if a comment mentions it first — got: ' + extractVersion("// const APP_VERSION = '9.9.9' example\nconst APP_VERSION = '1.6.4';"));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
