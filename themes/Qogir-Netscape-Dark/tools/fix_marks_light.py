#!/usr/bin/env python3
"""Fix (2026-11-17): radio dots, checkmarks, switch knobs etc. are *marks* drawn
on a transparent/dark background, so they must use LIGHT teal, not DARK.
Re-recolors those assets from the original (orange) backup copy.

usage: fix_marks_light.py <original-theme-dir> <theme-dir>
"""
import re, sys, colorsys
from pathlib import Path
from PIL import Image

ORIG, ROOT = Path(sys.argv[1]), Path(sys.argv[2])
LIGHT = "5cb8c2"

def hls(h): return colorsys.rgb_to_hls(*(int(h[i:i+2], 16) / 255 for i in (0, 2, 4)))
_, BL, BS = hls("fb8441")
TH, TL, TS = hls(LIGHT)
def map_rgb(r, g, b):
    _, L, S = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
    nl = min(0.97, max(0.03, TL + (L - BL)))
    return tuple(round(c * 255) for c in colorsys.hls_to_rgb(TH, nl, TS * min(1.0, S / BS)))
def is_orange(r, g, b, min_s=0.5):
    H, L, S = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
    return 0.02 < H < 0.11 and S > min_s and 0.2 < L < 0.95

PNG_MARKS = re.compile(r"^(menu-)?(checkbox|radio|switch|selected-dot|progressbar|slider|trough)")
SVG_MARKS = re.compile(r"checkbox|switch-on|calendar-today")

n = 0
for d in ("gtk-2.0/assets", "gtk-3.0/assets", "gtk-4.0/assets"):
    for src in sorted((ORIG / d).glob("*.png")):
        if not PNG_MARKS.match(src.name): continue
        im = Image.open(src).convert("RGBA"); px = im.load(); hit = False
        for y in range(im.height):
            for x in range(im.width):
                r, g, b, a = px[x, y]
                if a and is_orange(r, g, b):
                    px[x, y] = (*map_rgb(r, g, b), a); hit = True
        if hit:
            im.save(ROOT / d / src.name); n += 1
print("PNGs fixed:", n)

HEX = re.compile(r"#([0-9a-fA-F]{6})\b")
def hex_sub(m):
    h = m.group(1); r, g, b = (int(h[i:i+2], 16) for i in (0, 2, 4))
    return "#%02x%02x%02x" % map_rgb(r, g, b) if is_orange(r, g, b, 0.6) else m.group(0)
m = 0
for src in sorted(list(ORIG.glob("gnome-shell/assets/*.svg")) + list(ORIG.glob("cinnamon/**/*.svg"))):
    if not SVG_MARKS.search(src.name): continue
    txt = src.read_text(); new = HEX.sub(hex_sub, txt)
    if new != txt:
        (ROOT / src.relative_to(ORIG)).write_text(new); m += 1
print("SVGs fixed:", m)
