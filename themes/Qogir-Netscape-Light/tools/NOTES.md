# Qogir-Netscape-Light — build notes

The light variant of Qogir-Netscape: light windows and menus, with the same dark
Netscape-teal panel (`#093a3f`) and titlebars as the dark theme. It follows Qogir's
"standard" style, which has dark titlebars, a dark panel and light content. See
`../../Qogir-Netscape-Dark/tools/NOTES.md` for the color roles and the history of the
dark theme's fixes.

Built 2026-11-19 by `tools/make_light.py` and `tools/make_icons.py`.

## Sources

- **`~/.themes/Qogir-Manjaro`** is standard Qogir with Manjaro's green accent
  `#2eb398`. Qogir-Ubuntu (orange) in the standard style isn't installed, and
  Manjaro differs from Ubuntu only in the accent, so the recolor starts from green.
- **`themes/Qogir-Netscape-Dark`**: everything standard Qogir shares with Qogir-Dark is
  copied from the dark theme unchanged, already recolored and fixed:
  - `gtk-3.0/gtk-dark.css`, `gtk-4.0/gtk-dark.css`, and the `*-dark*.png` assets
  - `cinnamon/common-assets`, except the two calendar-arrow hover SVGs, which sit on
    light menus
  - `labwc`, `plank`, `unity`, `xfce-notify-4.0`
- From Qogir-Manjaro, and then recolored: `gtk-3.0/gtk.css`, `gtk-4.0/gtk.css`, the light
  PNG assets, `gtk-2.0`, `cinnamon` (light menus), `gnome-shell`, `metacity-1`, and the
  thumbnails.

## Color rule (the dark theme's rule, flipped)

| Surface | Fills | Marks and thin lines |
|---|---|---|
| Light: windows, menus, popovers, tooltips | `#267a83` | `#267a83` |
| Dark: titlebars, Nemo/Thunar/Caja toolbars, menubars, the Cinnamon panel and window list | `#267a83` | `#5cb8c2` |

- On white, light teal `#5cb8c2` is only about 2.2:1, too faint for checkmarks,
  focus rings or links. `#267a83` is about 5:1 on white, and white text on it is about 5:1.
- The link color is `#1b555b`: Qogir's light link color `#248a76`, shifted onto teal.
- Surfaces are detected by selector regexes (`DARK_CTX`, `LIGHT_SURFACE` in
  `make_light.py`). A selector naming a popover or menu always counts as light.
- Accent colors blended with a background (pale tints, hover mixes) are re-mixed with the
  same opacity against the same background, using teal instead of green.
- Left as is: `success_color` `#6dcfa7`, the warning/error oranges, and the palette
  constants.

## Netscape customizations re-applied

- `cinnamon.css`: `font-weight: normal` for `#panel`, `.panel-status-button`,
  `.panel-button` and `.applet-label`, plus the `/* Custom panel color */` block.
- `gtk-3.0`/`gtk-4.0` `gtk.css`: the linked-button (2026-11-17) and Nemo path-bar
  (2026-11-19) fix blocks, copied from the end of the dark theme's files. In standard
  Qogir the file-manager toolbars are dark, so their light-teal lines still fit.
- `themes/gtk.css` (the titlebar override that `install.sh` copies to `~/.config`) paints
  titlebars `#093a3f` for both variants.

## Icon theme: `icons/Qogir-Netscape-Light`

A self-contained copy of `~/.icons/Qogir` (the standard icons: dark app symbolics, light
panel symbolics for a dark panel) without the cursors. Its `places` icons and
folder-shaped app icons are recolored with the dark theme's exact folder map
(`#6ba4e7`→`#5cb8c2`, `#003579`/`#003779`→`#093a3f`, `#5294e2`→`#47aeb9`,
`#3981d7`→`#40939c`). Two broken microphone symlinks come from upstream Qogir.

## Rebuilding

```sh
cd ~/Repos/cinnamon-dev
rm -rf /tmp/build && mkdir /tmp/build
python3 themes/Qogir-Netscape-Light/tools/make_light.py ~/.themes/Qogir-Manjaro themes/Qogir-Netscape-Dark /tmp/build/Qogir-Netscape-Light
python3 themes/Qogir-Netscape-Light/tools/make_icons.py ~/.icons/Qogir /tmp/build/icons/Qogir-Netscape-Light
```

Then copy the results over `themes/Qogir-Netscape-Light` (keeping `tools/`) and
`icons/Qogir-Netscape-Light`. Rebuild after changing the dark theme's shared parts, since
the light theme copies them.

## Not checked yet

The theme was built and checked by script (no green left, light teal only on dark
surfaces), but not yet looked at on screen. Things to check: Nemo (selection, path bar),
Cinnamon menus and the calendar, settings dialogs (switches, checkboxes), and the GTK 2
apps.
