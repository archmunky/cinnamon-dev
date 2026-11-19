# Qogir-Netscape-Dark — customization notes

Based on **Qogir-Ubuntu-Dark** (GTK/Cinnamon/GNOME Shell theme). Panel and titlebar
colors were changed in an earlier session. On 2026-11-15 the orange accent was
replaced with a two-tone Netscape-style teal.

## Colors

| Role | Color | Used for |
|---|---|---|
| Fill teal | `#267a83` | Fills: text/row/file selection, checked buttons, suggested buttons, menu hover, semi-transparent tints at 50% opacity or more |
| Light teal | `#5cb8c2` | Thin accents: links, focus rings, borders, tab/window-list underlines, progress bar and slider fills, radio dots, checkmarks, switch knobs, faint tints below 50% opacity |
| Link color | `#a6d8de` | `link_color` (the original link color was a pale orange, so it became a pale teal) |
| Panel / dark teal | `#093a3f` | The Cinnamon panel (the `/* Custom panel color */` block in `cinnamon.css`, from the earlier session) and the folder icons' back tab. **No longer used for selection.** |
| Thumbnail teal | `#2a7f88` | Theme preview thumbnails only |
| Netscape window grey | `#e1eaef` | Considered as an accent, rejected: nearly identical to the theme's text color `#e6ebef` |

Text on the selection stays white (`#ffffff`), at about 5.0:1 contrast on `#267a83`. The selection itself is about 2.9:1 against the file-view background `#282A33`.

**Fix on 2026-11-19:** the fill teal was originally `#093a3f`. That gave about 1:1 contrast against the theme's dark backgrounds, so selected files in Nemo (and every other list) were nearly invisible. `tools/lift_dark_teal.py` replaced it, and all 32 hover/pressed/tint shades derived from it, with `#267a83`. It protects lines that already used `#093a3f` before the recolor (the panel color). The backup from just before this change is `~/.themes/Qogir-Netscape-Dark-backup-2026-11-19.tar.gz`.

**Fix on 2026-11-17:** some accents are marks drawn directly on the dark background, so they use **light** teal:
- radio dots, checkmarks and the indeterminate dash
- switch knobs, the selected dot
- the gtk-2 progress bar, slider and trough images
- the GNOME Shell/Cinnamon checkbox and switch SVGs, and the calendar-today dot

The first pass had made them dark teal, which was invisible. `tools/fix_marks_light.py` re-applied them from the backup, and `recolor.py`'s `PNG_LIGHT` and `SVG_LIGHT` rules now include these assets. The rule for any new accent: if it sits behind text, use dark teal; if it is a mark on the background, use light teal.

**Left orange on purpose:**
- `warning_color` `#F27835` and the error/warning entry colors (`#f75d37`, `#a15934`, ...)
- the `@define-color STRAWBERRY_* / ORANGE_*` palette constants
- the `avatar.color13` gradient

## What was changed in this folder

- `gtk-2.0/gtkrc`, `gtk-3.0/*.css`, `gtk-4.0/*.css`, `gnome-shell/gnome-shell.css`, `cinnamon/cinnamon.css`
  - every shade of `#fb8441` and `rgba(251,132,65,…)` recolored by CSS property
  - accent colors mixed with the background (Geary frames, sidebar banners, tab hover underline, Budgie indicator) recomputed as the same mix using light teal
- SVGs in `cinnamon/` and `gnome-shell/assets/`
- PNG checkboxes, radios, switches and focused entries in `gtk-2.0/assets`, `gtk-3.0/assets`, `gtk-4.0/assets`
- Thumbnails: `cinnamon/thumbnail.png`, `gtk-3.0/thumbnail.png`, `gtk-4.0/thumbnail.png`
- `index.theme` and `metacity-1/metacity-theme-3.xml`: renamed to `Qogir-Netscape-Dark`
- `index.theme`: `IconTheme=Qogir-Netscape-Dark`. `CursorTheme` is still `Qogir-Ubuntu-Dark`.

- **Linked-button border fix (2026-11-17):** a rule block marked `Netscape fix (2026-11-17): linked` is appended to the end of all four `gtk-3.0`/`gtk-4.0` CSS files.
  - The problem: linked buttons (stack switchers like the Radio++ / Cinnamon settings tabs, path bars, button groups) remove their inner left/right borders, so the dark-teal checked button showed gaps.
  - The rules draw the missing sides as inset `#6fc0c9` lines.
  - `recolor.py` does not add this block. Re-append it after any re-run.
- **Nemo/Thunar path bar fix (2026-11-19):** a block marked `Netscape fix (2026-11-19): Nemo` is appended to the end of both `gtk-3.0` CSS files.
  - The problem: the selected crumb has no fill, only a 2px underline drawn with `border-image`, so normal borders don't render. The linked-button fix above had given it left/right lines but no top.
  - The rules outline all sides with inset `#5cb8c2` lines.
  - This applies to GTK3 only; Nemo has no GTK4 rules. Re-append it after any re-run.

## Icon theme: `~/.icons/Qogir-Netscape-Dark`

- An override theme with `Inherits=Qogir-Dark,hicolor,breeze`. It ships only the recolored icons (about 2,600 files, 12 MB).
- It overrides all 219 `places` icons and the 49 folder-shaped app icons (file managers), at every size.
- Folder body: Qogir blue `#6ba4e7` became `#5cb8c2`. Shaded back tab: `#003579` became `#093a3f`.
- Neither Qogir-Dark nor Qogir-Ubuntu-Dark was modified.

## Scripts (in `tools/`)

- **`recolor.py <theme-dir>`** recolors the orange accent in the CSS, gtkrc, SVG and PNG files.
  - Run it on a fresh, unmodified copy. On this folder it does nothing, because the orange is gone.
  - It does not handle the accent/background blends or the thumbnails, which were fixed by one-off commands. Redo those by hand.
  - The colors are set by `DARK` and `LIGHT` at the top of the script.
- **`fix_marks_light.py <original-theme-dir> <theme-dir>`** re-recolors the radio, checkbox and switch assets in light teal from an unmodified copy of the theme. It is a one-off fix, already applied.
- **`lift_dark_teal.py <original-theme-dir> <theme-dir> [--dry]`** swaps the fill teal `#093a3f` and its shades for `#267a83`, leaving the panel color alone. It is a one-off fix, already applied. `recolor.py` now uses `#267a83` directly.
- **`make_icons.py`** rebuilds `~/.icons/Qogir-Netscape-Dark` from `~/.icons/Qogir-Dark`.
  - It is safe to re-run; it overwrites the existing files.
  - Run `gtk-update-icon-cache -f -t ~/.icons/Qogir-Netscape-Dark` afterwards.
  - `--dry` prints what it would do without writing anything.
  - The colors are set by `BODY_DST` and `SHADE_DST`.

## Backup

`~/.themes/Qogir-Netscape-Dark-backup-2026-11-15.tar.gz` holds the theme as it was
before the teal recolor (panel and titlebar changes already in place). To restore,
extract it in `~/.themes`.

## Still to do / ideas

- **Mouse cursors are still orange.** `~/.icons/Qogir-Ubuntu-Dark/cursors_scalable` uses `#fb8441`. The real cursors in `cursors/` are compiled X11 cursor files, so recoloring means rendering the SVGs to PNG and rebuilding them with `xcursorgen`. Alternatively, use Qogir-Dark's blue cursors.
- Most GTK4/libadwaita apps ignore the theme unless `~/.config/gtk-4.0/` links to this theme's `gtk-4.0` files.
