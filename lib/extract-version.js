// Pure function: extract APP_VERSION from raw fetched HTML/JS source text.
// Anchored to line start (after optional whitespace) so a `//` comment that
// happens to mention "const APP_VERSION = ..." can't shadow the real
// declaration — a comment line starts with `//`, not `const`, so it can't
// match this anchored pattern.
function extractVersion(sourceText) {
  const m = sourceText.match(/^\s*const\s+APP_VERSION\s*=\s*['"]([^'"]+)['"]/m);
  return m ? m[1] : null;
}

// The same answer from version.txt, which is the whole file: one version and
// a newline. Since v1.66.0 checkForUpdate asks for THAT rather than dragging
// the entire 367 KB index.html down the wire to read one string — a check
// that runs on load and again every time the app returns to the foreground.
//
// STRICT on purpose. A captive portal, a 404 page or an index.html served by
// mistake are all "text that came back 200", and any of them parsed loosely
// would be reported to the driver as a version. Only a bare dotted number is
// accepted; anything else is null, and null falls back to reading the HTML.
function parseVersionFile(text) {
  if (typeof text !== 'string') return null;
  const t = text.trim();
  return /^\d+\.\d+\.\d+$/.test(t) ? t : null;
}

module.exports = { extractVersion, parseVersionFile };
