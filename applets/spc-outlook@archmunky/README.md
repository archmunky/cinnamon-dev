# SPC Outlook (spc-outlook@archmunky)

Cinnamon panel applet that shows today's **SPC Day 1 categorical convective
outlook** risk for one location, colored with SPC's category colors.

| Panel shows | Meaning |
|---|---|
| dim grey checkmark-in-circle, no text | No thunderstorm risk at your location |
| `TSTM` `MRGL` `SLGT` `ENH` `MDT` `HIGH` (colored) | Highest risk category containing your point |
| `SLGT?` (dimmed) | Last fetch failed or the outlook expired; still showing last good value |
| `?` | No data yet and the fetch failed |
| `…` | First fetch in progress |

The icon is a storm cloud for TSTM through ENH and switches to a severe-alert
icon for MDT and HIGH, so the high-end days stand out even in icon-only mode.

The tooltip shows the category name, valid/expire time, issue time and
forecaster, your coordinates, the last update time, and any error. Click the
applet for **Refresh now** and **Open SPC outlook page**.

Data: <https://www.spc.noaa.gov/products/outlook/day1otlk_cat.nolyr.geojson>

## Install

```bash
ln -s "$HOME/Repos/spc-outlook@archmunky" ~/.local/share/cinnamon/applets/spc-outlook@archmunky
```

Then right-click the panel → **Applets** → find **SPC Outlook** → **+** to add it.
Configure the location, refresh interval and display mode from the applet's
**Configure…** menu.

Requires only what ships with Cinnamon 6.6 (cjs, Soup 3, GLib/Gio).

## Test

Geometry/parsing unit tests (runs outside Cinnamon):

```bash
cjs tests/classify-test.js
```

They use an archived HIGH‑risk day (2024‑05‑06 1630Z) to check every category,
polygon holes and MultiPolygons.

In Cinnamon:

1. After editing, reload the applet: right-click it → **Reload** (when the
   applet shows the reload option), or run
   `dbus-send --session --dest=org.Cinnamon.LookingGlass --type=method_call /org/Cinnamon/LookingGlass org.Cinnamon.LookingGlass.ReloadExtension string:'spc-outlook@archmunky' string:'APPLET'`
2. Open Looking Glass (`Alt+F2`, type `lg`, Enter) → **Log** tab. Messages
   are prefixed `[spc-outlook@archmunky]`.
3. To see every category on a quiet day, use **Configure… → Testing →
   Preview with archived outlook**. It loads the bundled 2024-05-06 High Risk
   outlook and puts you in a city inside the category you pick, from HIGH down
   to no risk. The tooltip says `TEST MODE` while it's on. Set it back to
   **Off (live data)** when you're done.
4. To test the failure state, disconnect the network and click **Refresh
   now**. You should see a dimmed `XXX?` (or `?`), and the error should
   appear in the tooltip and Looking Glass.
