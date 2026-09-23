// The workflow that makes every other test file matter.
//
// This project's release discipline lives in the suite: APP_VERSION against
// all 17 ?v= stamps and version.txt, a README entry for the current version,
// the structural pins on index.html, the scope walk that keeps the app alive
// without the map SDK. Until v2.0.0 all of it ran only when someone
// remembered to type `node test/run.js`.
//
// So the point of this file is narrow and worth stating: it is not testing
// GitHub. It checks that the workflow still runs the WHOLE suite on pull
// requests — because the failure mode is not CI breaking loudly, it is
// someone narrowing it to one file, or to pushes only, and nobody noticing
// that PRs stopped being checked.
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c, e = '') => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.log('  FAIL', n, e); } };

const WF = path.join(__dirname, '..', '.github', 'workflows', 'tests.yml');

ok('the workflow exists', fs.existsSync(WF), WF);
if (!fs.existsSync(WF)) {
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = 1;
  return;
}
const wf = fs.readFileSync(WF, 'utf8');

console.log('\n=== it runs the whole suite, on pull requests ===');
ok('>>> it runs test/run.js',
   /run:\s*node test\/run\.js/.test(wf), wf);
ok('>>> and the WHOLE suite, not one file',
   !/node test\/[a-z-]+\.test\.js/.test(wf),
   'a single test file in the run step means the rest stopped being checked');
ok('>>> it fires on pull requests', /^on:[\s\S]*?^\s{2}pull_request:/m.test(wf), wf);
ok('  and on pushes to main', /^\s{2}push:\s*\n\s+branches:\s*\[main\]/m.test(wf), wf);

console.log('\n=== it stays a zero-dependency run ===');
// The whole project is plain Node with no build step. An install step here
// would be the first one it has ever had, and would mean the tests no longer
// run the way a developer runs them.
ok('no npm install / npm ci step', !/npm (install|ci)\b/.test(wf), wf);
ok('and no package.json was introduced alongside it',
   !fs.existsSync(path.join(__dirname, '..', 'package.json')),
   'the suite runs under plain node; adding npm changes how it is run');

console.log('\n=== the run cannot pass by doing nothing ===');
ok('it checks the repo out', /uses: actions\/checkout@v\d/.test(wf), wf);
ok('it sets up node explicitly rather than taking the runner default',
   /uses: actions\/setup-node@v\d/.test(wf) && /node-version:\s*'?\d+/.test(wf), wf);
ok('  on a version the suite is actually exercised on',
   /node-version:\s*'?22/.test(wf),
   'local runs are Node 22; CI passing on a different major proves less');
ok('it is bounded, so a hang fails rather than runs forever',
   /timeout-minutes:\s*\d+/.test(wf), wf);
ok('and it asks for no more permission than reading the code',
   /permissions:\s*\n\s+contents:\s*read/.test(wf), wf);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
