#!/usr/bin/env python3
"""Fix (2026-11-19): the fill teal #093a3f had ~1:1 contrast with the theme's dark
backgrounds, so selections (e.g. in Nemo) were hard to see. Replace it, and every
hover/pressed/tint shade derived from it, with a medium teal.

usage: lift_dark_teal.py <original-orange-theme-dir> <theme-dir> [--dry]
"""
import re, sys, colorsys
from pathlib import Path
from PIL import Image

ORIG, ROOT = Path(sys.argv[1]), Path(sys.argv[2])
DRY = "--dry" in sys.argv
OLD, NEW = "093a3f", "267a83"

def hls(h): return colorsys.rgb_to_hls(*(int(h[i:i+2], 16) / 255 for i in (0, 2, 4)))
_, BL, BS = hls("fb8441")
def map_rgb(r, g, b, target):            # identical to recolor.py
    _, L, S = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
    TH, TL, TS = hls(target)
    nl = min(0.97, max(0.03, TL + (L - BL)))
    return tuple(round(c * 255) for c in colorsys.hls_to_rgb(TH, nl, TS * min(1.0, S / BS)))
def hx(t): return "%02x%02x%02x" % t
KEEP = {"f27835", "f75d37", "f57900", "cf3b00", "f15d22", "ff9262", "ed5b00", "ffa95a"}
def is_accent(h):
    if h in KEEP: return False
    H, L, S = hls(h)
    return 0.03 < H < 0.09 and S > 0.6 and 0.3 < L < 0.9

HEX = re.compile(r"#([0-9a-fA-F]{6})\b")
text_files = ["gtk-2.0/gtkrc", "gtk-3.0/gtk.css", "gtk-3.0/gtk-dark.css", "gtk-4.0/gtk.css",
              "gtk-4.0/gtk-dark.css", "gnome-shell/gnome-shell.css", "cinnamon/cinnamon.css"]

# 1. old-dark-shade -> new-dark-shade table, built from every orange shade in the original.
orig_colors, table = set(), {}
for f in text_files:
    for h in HEX.findall((ORIG / f).read_text()):
        h = h.lower(); orig_colors.add(h)
        if is_accent(h):
            rgb = tuple(int(h[i:i+2], 16) for i in (0, 2, 4))
            o, n = hx(map_rgb(*rgb, OLD)), hx(map_rgb(*rgb, NEW))
            if table.get(o, n) != n: print("ambiguous", o, table[o], n)
            table.setdefault(o, n)
clash = set(table) & orig_colors
print(f"{len(table)} dark shades to replace; clashes with pre-existing theme colors: {clash or 'none'}")
for o, n in sorted(table.items()): print(f"  #{o} -> #{n}")

# 2. Text files: hex shades + rgba(9, 58, 63, a).
o_rgb = tuple(int(OLD[i:i+2], 16) for i in (0, 2, 4)); n_rgb = tuple(int(NEW[i:i+2], 16) for i in (0, 2, 4))
RGBA = re.compile(r"rgba\(%d,\s*%d,\s*%d," % o_rgb)
for f in text_files:
    # Lines that already used a clashing color before the teal recolor (e.g. the custom
    # Cinnamon panel color #093a3f) are user customizations: leave them alone.
    p = ROOT / f
    orig_lines = (ORIG / f).read_text().split("\n")
    out, count, kept = [], 0, 0
    for i, line in enumerate(p.read_text().split("\n")):
        if i < len(orig_lines) and any(c in orig_lines[i].lower() for c in clash):
            out.append(line); kept += 1; continue
        hits = [h for h in HEX.findall(line) if h.lower() in table]
        line = HEX.sub(lambda m: "#" + table.get(m.group(1).lower(), m.group(1)), line)
        line, k = RGBA.subn("rgba(%d, %d, %d," % n_rgb, line)
        count += len(hits) + k; out.append(line)
    s = "\n".join(out)
    if kept: print(f"{f}: kept {kept} pre-existing line(s) untouched")
    print(f"{f}: {count} replacements")
    if not DRY: p.write_text(s)

# 3. SVGs and PNGs that used the dark teal: regenerate from the orange originals.
for f in ["cinnamon/common-assets/menu/menu-hover.svg", "cinnamon/assets/misc/message.svg",
          "cinnamon/assets/misc/button-box.svg", "cinnamon/assets/misc/modal.svg"]:
    s = (ORIG / f).read_text()
    s = HEX.sub(lambda m: "#" + hx(map_rgb(*(int(m.group(1)[i:i+2], 16) for i in (0, 2, 4)), NEW))
                if is_accent(m.group(1).lower()) else m.group(0), s)
    print("svg", f)
    if not DRY: (ROOT / f).write_text(s)
for f in ["gtk-2.0/assets/menubar_button.png", "gtk-2.0/assets/menuitem.png"]:
    im = Image.open(ORIG / f).convert("RGBA"); px = im.load(); n = 0
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            H, L, S = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
            if a and 0.03 < H < 0.09 and S > 0.5 and 0.25 < L < 0.92:
                px[x, y] = (*map_rgb(r, g, b, NEW), a); n += 1
    print("png", f, n, "px")
    if not DRY: im.save(ROOT / f)
