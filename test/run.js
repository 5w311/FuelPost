#!/usr/bin/env node
// Runs every test/*.test.js in a child process and reports a combined total.
// The shipped fuelplan.test.js reports failures on stdout without always
// setting a nonzero exit code, so this runner scans output for FAIL lines too.
//
// Usage: node test/run.js

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js')).sort();
let totalPass = 0, totalFail = 0, hardFail = false;

for (const f of files) {
  let out = '', code = 0;
  try {
    out = execFileSync(process.execPath, [path.join(__dirname, f)], { encoding: 'utf8' });
  } catch (err) {
    out = (err.stdout || '') + (err.stderr || '');
    code = err.status == null ? 1 : err.status;
  }
  const pass = (out.match(/^\s*PASS /gm) || []).length;
  const fail = (out.match(/^\s*FAIL /gm) || []).length;
  totalPass += pass;
  totalFail += fail;
  if (fail || code !== 0) hardFail = true;
  console.log(`${fail || code ? 'FAIL' : 'ok  '}  ${f.padEnd(24)} ${String(pass).padStart(3)} passed${fail ? `, ${fail} FAILED` : ''}${code ? ` (exit ${code})` : ''}`);
  if (fail || code) console.log(out.split('\n').filter(l => /FAIL|Error/.test(l)).map(l => '      ' + l).join('\n'));
}

console.log(`\n${files.length} files · ${totalPass} passed · ${totalFail} failed`);
process.exit(hardFail ? 1 : 0);
