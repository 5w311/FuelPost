const Location = require('../lib/location.js');
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name, extra); }
};

console.log('=== GPS label formatting ===');
ok('formats coords to 4 decimals',
   Location.formatGpsFallbackLabel(40.73946, -111.99304) === 'Current location (40.7395, -111.9930)');
ok('precise fix under threshold', Location.isPreciseFix(45) === true);
ok('imprecise fix over threshold', Location.isPreciseFix(800) === false);
ok('boundary is inclusive', Location.isPreciseFix(300) === true);
ok('missing accuracy is not precise', Location.isPreciseFix(undefined) === false);
ok('missing accuracy is not precise (null)', Location.isPreciseFix(null) === false);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
