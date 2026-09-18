# FuelPost

A single-page Covenant fuel-stop planner. See `README.md` for what it does and
how it works.

## Before changing the README

Read **For developers → Updating this README** in `README.md`. It is written for
a driver, not a developer: the plain-language guide comes first with no code
identifiers in it, and all technical detail sits in the developer section at the
end.

## Before changing behaviour

Read **For developers → Things not to undo** in `README.md` first. Those are
regressions this project has already paid for once.

## Shipping

`node test/run.js` must be green. Bump `APP_VERSION`, **all 17 `?v=` stamps, and
`VERSION` in `sw.js`** together, and add a one-line version-history entry —
tests enforce all of it. The service worker names its cache from its own
`VERSION`, so a partial bump ships a worker nothing requests from.

## Before touching sw.js

Read **For developers → Offline: the service worker** in `README.md`. It caches
our own files only, never HERE, and never answers a `_cb=` request. The kill
switch is in that section, verbatim, for when it is needed.
