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

`node test/run.js` must be green. Bump `APP_VERSION` **and all 17 `?v=` stamps**
together, and add a one-line version-history entry — tests enforce both.
