// Pure function: extract APP_VERSION from raw fetched HTML/JS source text.
// Anchored to line start (after optional whitespace) so a `//` comment that
// happens to mention "const APP_VERSION = ..." can't shadow the real
// declaration — a comment line starts with `//`, not `const`, so it can't
// match this anchored pattern.
function extractVersion(sourceText) {
  const m = sourceText.match(/^\s*const\s+APP_VERSION\s*=\s*['"]([^'"]+)['"]/m);
  return m ? m[1] : null;
}

module.exports = { extractVersion };
