# spc-outlook@archmunky — project notes

Cinnamon 6.6 panel applet (Linux Mint 22.3) showing the SPC Day 1 categorical
convective outlook for one lat/lon. UUID convention: `<name>@archmunky`.
Test with Looking Glass (`lg`); logs are prefixed `[spc-outlook@archmunky]`.

When unsure of an API, read the actual source in `/usr/share/cinnamon/js/`
(e.g. `ui/applet.js`, `ui/popupMenu.js`, `ui/settings.js`, `misc/fileUtils.js`)
rather than relying on memory. Cinnamon's current state is what matters.

## Constraints
- Only what ships with Cinnamon: cjs, Soup, GLib/Gio, St. No npm or external libraries.
- **Soup is 3.0**, pinned in `/usr/share/cinnamon/js/ui/environment.js`. Use
  `send_and_read_async`/`send_and_read_finish`. Never use sync `send_and_read`,
  which blocks the whole shell.
- settings-schema `spinbutton`: do **not** use `"digits"`. Mint's xapp `SpinButton` rejects it
  and `xlet-settings` crashes (Configure… silently does nothing). Decimals come from `step`.
  Debug the settings dialog with `xlet-settings applet spc-outlook@archmunky -i <instance-id>` in a terminal.
  After changing the schema, reload the applet so `~/.config/cinnamon/spices/<uuid>/<id>.json` updates to match.
- Network failure: keep the last good value, mark it stale (`?`, dimmed), log with `global.logError`.

## Layout
- `applet.js`: `TextIconApplet` subclass: settings, menu, timer, fetch, render.
- `spcgeo.js`: pure helpers (point-in-polygon, classify, time parsing, colors).
  No Cinnamon imports. It is loaded by the applet via `require('./spcgeo')` and by the
  test via `imports.spcgeo`. Both loaders export only top-level `var`/`function`
  declarations, so keep public symbols declared that way (not `const`/`let`).
- `settings-schema.json`: `latitude`, `longitude`, `refresh-interval` (min), `display-mode` (`both|label|icon`).
- `tests/classify-test.js`: run `cjs tests/classify-test.js`. Fixtures are in `tests/fixtures/`.

## SPC GeoJSON facts (verified against real files)
- `FeatureCollection`, one feature per category. Geometry is `Polygon` or `MultiPolygon`, coords `[lon, lat]`.
- `nolyr` polygons have holes (e.g. MRGL with a hole where SLGT sits), but categories
  can still overlap, so classify by picking the containing feature with the max `DN`.
- `DN`: 2 TSTM, 3 MRGL, 4 SLGT, 5 ENH, 6 MDT, 8 HIGH. Also `LABEL`, `LABEL2`, `FORECASTER`, `fill`, `stroke`.
- Live files have `VALID_ISO`/`EXPIRE_ISO`/`ISSUE_ISO`. **Archived files only have**
  `VALID`/`EXPIRE`/`ISSUE` as `YYYYMMDDHHMM` UTC. `parseSpcTime` handles both.
- No-risk days: assumed to be an empty `features` array (not yet observed).
- Archive URL pattern: `https://www.spc.noaa.gov/products/outlook/archive/YYYY/day1otlk_YYYYMMDD_HHMM_cat.nolyr.geojson`

## Display decisions (from the user)
- Label/icon color uses SPC's lighter **fill** colors (readable on dark panels).
- No risk: no text, just a dim grey icon, regardless of display mode.
- Icon by severity: `weather-storm-symbolic` for loading/unknown and TSTM–ENH, `weather-severe-alert-symbolic`
  for MDT/HIGH (DN ≥ 6). Both exist in the user's theme (Qogir-Netscape-Dark → Qogir-Dark) and Adwaita.
- No risk = `emblem-default-symbolic` (checkmark in a circle) in dim grey `#888888`, no text. This was the user's pick.
  Rejected so far: cloud/sun icons (they imply sky conditions), a plain dimmed storm, and a dimmed storm with
  an `action-unavailable-symbolic` circle/slash overlay (the overlay code was removed; it overrode the private `_ensureIcon`).

## Test mode
- Settings → Testing → "Preview with archived outlook" (`test-point`): loads
  `tests/fixtures/day1otlk_20240506_1630_cat.nolyr.geojson` and uses a fixed city per category
  (`TEST_POINTS` in applet.js), ignoring lat/lon and the expiry check. The tooltip and menu show `[TEST …]`.

## Driving the live applet from a shell
- `gdbus call --session --dest org.Cinnamon --object-path /org/Cinnamon --method org.Cinnamon.Eval "<js>"`
  runs JS inside Cinnamon. Get the instance with
  `imports.ui.appletManager.getRunningInstancesForUuid('spc-outlook@archmunky')[0]`.
- `settings.setValue()` from code does **not** fire the `bind()` callback. Call the handler yourself
  (e.g. `a._onTestPointChanged()`). Editing `~/.config/cinnamon/spices/.../<id>.json` directly is not picked up.
- Reload: `dbus-send ... org.Cinnamon.LookingGlass.ReloadExtension string:'spc-outlook@archmunky' string:'APPLET'`.
