#!/usr/bin/env python3
"""Recolor Qogir orange accent (#fb8441 family) to a two-tone teal.
DARK  -> fills (selection, checked controls, buttons)
LIGHT -> text, borders, focus rings, underlines, faint tints, progress/scale fills
"""
import re, sys, glob, colorsys, collections
from pathlib import Path

ROOT = Path(sys.argv[1])
DARK, LIGHT = "267a83", "5cb8c2"  # DARK was 093a3f until 2026-11-19 (too dark: selections invisible)

def hls(h): return colorsys.rgb_to_hls(*(int(h[i:i+2], 16) / 255 for i in (0, 2, 4)))
BH, BL, BS = hls("fb8441")
# Orange-hued colors that are NOT the accent (warning/error/palette/avatar) - keep.
KEEP = {"f27835", "f75d37", "f57900", "cf3b00", "f15d22", "ff9262", "ed5b00", "ffa95a"}

def is_accent(h):
    h = h.lower()
    if h in KEEP: return False
    H, L, S = hls(h)
    return 0.03 < H < 0.09 and S > 0.6 and 0.3 < L < 0.9

def map_rgb(r, g, b, target):
    """Move a shade of the orange onto the same relative shade of target."""
    _, L, S = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
    TH, TL, TS = hls(target)
    nl = min(0.97, max(0.03, TL + (L - BL)))
    ns = TS * min(1.0, S / BS)
    return tuple(round(c * 255) for c in colorsys.hls_to_rgb(TH, nl, ns))

def map_hex(h, target):
    return "#%02x%02x%02x" % map_rgb(int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), target)

stats = collections.Counter()
HEX = re.compile(r"#([0-9a-fA-F]{6})\b")
RGBA = re.compile(r"rgba\(251,\s*132,\s*65,\s*([0-9.]+)\)")
BG_PROPS = {"background-color", "background", "background-image"}
LIGHT_SEL = re.compile(r"progress|highlight|scale|level|trough|slider|ripple")

def target_for(line, selector, alpha=None):
    s = line.strip()
    m = re.match(r"@define-color\s+(\S+)", s)
    if m:
        return DARK if re.search(r"bg|selected", m.group(1)) else LIGHT
    m = re.match(r"([-\w]+)\s*:", s)
    prop = m.group(1) if m else ""
    if prop in BG_PROPS and "radial" not in s and not LIGHT_SEL.search(selector):
        if alpha is not None and alpha < 0.5:
            return LIGHT
        return DARK
    return LIGHT

def do_css(path):
    out, sel = [], ""
    for line in path.read_text().split("\n"):
        if "{" in line: sel = line
        if re.match(r"\s*@define-color\s+[A-Z_0-9]+\s", line):  # palette constants
            out.append(line); continue
        def rh(m):
            h = m.group(1)
            if not is_accent(h): return m.group(0)
            t = target_for(line, sel)
            stats[(path.parent.name, "DARK" if t == DARK else "LIGHT")] += 1
            return map_hex(h, t)
        def rr(m):
            a = float(m.group(1)); t = target_for(line, sel, a)
            stats[(path.parent.name, "rgba-" + ("DARK" if t == DARK else "LIGHT"))] += 1
            r, g, b = (int(t[i:i+2], 16) for i in (0, 2, 4))
            return f"rgba({r}, {g}, {b}, {m.group(1)})"
        line = RGBA.sub(rr, HEX.sub(rh, line))
        out.append(line)
    path.write_text("\n".join(out))

def do_gtkrc(path):
    txt = path.read_text()
    txt = txt.replace("selected_bg_color: #fb8441", "selected_bg_color: #" + DARK)
    txt = txt.replace("link_color: #fb8441", "link_color: #" + LIGHT)
    path.write_text(txt); stats[("gtk-2.0", "gtkrc")] += 1

SVG_LIGHT = re.compile(r"checkbox|switch-on|calendar-today|unchecked-focused|window-list-active|activities-active|add-workspace-active|calendar-arrow|corner-ripple")
def do_svg(path):
    t = LIGHT if SVG_LIGHT.search(path.name) else DARK
    txt = path.read_text()
    new = HEX.sub(lambda m: map_hex(m.group(1), t) if is_accent(m.group(1)) else m.group(0), txt)
    if new != txt:
        path.write_text(new); stats[("svg", "LIGHT" if t == LIGHT else "DARK")] += 1

PNG_LIGHT = re.compile(r"focus|entry|border|checkbox|radio|switch|selected-dot|progressbar|slider|trough")  # marks on dark bg -> light (fixed 2026-11-17)
def do_png(path):
    from PIL import Image
    im = Image.open(path)
    mode = im.mode
    im = im.convert("RGBA"); px = im.load(); n = 0
    t = LIGHT if PNG_LIGHT.search(path.name) else DARK
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a == 0: continue
            H, L, S = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
            if 0.03 < H < 0.09 and S > 0.5 and 0.25 < L < 0.92:
                px[x, y] = (*map_rgb(r, g, b, t), a); n += 1
    if n:
        im.save(path); stats[("png " + path.parent.parent.name, "LIGHT" if t == LIGHT else "DARK")] += 1

for p in ["gtk-3.0/gtk.css", "gtk-3.0/gtk-dark.css", "gtk-4.0/gtk.css", "gtk-4.0/gtk-dark.css",
          "gnome-shell/gnome-shell.css", "cinnamon/cinnamon.css"]:
    do_css(ROOT / p)
do_gtkrc(ROOT / "gtk-2.0/gtkrc")
for p in sorted(ROOT.glob("**/*.svg")): do_svg(p)
for d in ["gtk-2.0/assets", "gtk-3.0/assets", "gtk-4.0/assets"]:
    for p in sorted((ROOT / d).glob("*.png")): do_png(p)

for k, v in sorted(stats.items()): print(k, v)
