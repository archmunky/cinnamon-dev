#!/usr/bin/env python3
"""Build Qogir-Netscape-Light: light windows, dark Netscape-teal panel and titlebars.

usage: make_light.py <qogir-manjaro-dir> <qogir-netscape-dark-dir> <out-dir>

Sources:
  * Qogir-Manjaro (Qogir's "standard" style with a green #2eb398 accent): light GTK
    windows, dark titlebars/file-manager toolbars, light Cinnamon menus, dark panel.
  * Qogir-Netscape-Dark: every part that standard Qogir shares with Qogir-Dark
    (gtk-dark.css, the *-dark PNG assets, cinnamon/common-assets, labwc, plank, unity,
    xfce-notify) is copied as is, already recolored and fixed.

Recolor rule (the dark theme's rule, flipped for light surfaces):
  * On light surfaces, fills AND marks/lines use FILL #267a83. Light teal #5cb8c2 has
    only ~2.2:1 contrast on white, so it is not used there.
  * On dark surfaces (titlebars, file-manager toolbars, menubars, the Cinnamon panel),
    the dark theme's rule applies: fills FILL, thin marks/lines LIGHT.
"""
import re, sys, shutil, colorsys, collections
from pathlib import Path
from PIL import Image

SRC, DARKTHEME, OUT = (Path(a) for a in sys.argv[1:4])
NAME = OUT.name
FILL, LIGHT = "267a83", "5cb8c2"
PANEL = "093a3f"
BASE = "2eb398"                       # Qogir-Manjaro accent

def hls(h): return colorsys.rgb_to_hls(*(int(h[i:i+2], 16) / 255 for i in (0, 2, 4)))
def rgb(h): return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))
def hx(t): return "%02x%02x%02x" % t
BH, BL, BS = hls(BASE)

def in_family(H, S):                  # accent hue; excludes success #6dcfa7 (H .432)
    return 0.456 < H < 0.50 and S > 0.22

def is_accent(h):
    H, L, S = hls(h)
    return in_family(H, S) and 0.12 < L < 0.98

def shade(r, g, b, target):
    """Same lightness/saturation offset from the Manjaro green, applied to target."""
    _, L, S = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
    TH, TL, TS = hls(target)
    nl = min(0.97, max(0.03, TL + (L - BL)))
    return tuple(round(c * 255) for c in colorsys.hls_to_rgb(TH, nl, TS * min(1.0, S / BS)))

def blend_fit(c, bgs):
    """Find (alpha, bg) with c ~= alpha*BASE + (1-alpha)*bg."""
    best = None
    base = rgb(BASE)
    for bg in bgs:
        den = sum((base[i] - bg[i]) ** 2 for i in range(3))
        if not den: continue
        a = sum((c[i] - bg[i]) * (base[i] - bg[i]) for i in range(3)) / den
        if not 0.04 < a < 0.96: continue
        err = max(abs(a * base[i] + (1 - a) * bg[i] - c[i]) for i in range(3))
        if best is None or err < best[0]: best = (err, a, bg)
    return best if best and best[0] <= 4 else None

def recolor_hex(h, target, bgs):
    c = rgb(h)
    H, L, S = hls(h)
    if abs(S - BS) > 0.03:            # not a pure shade: probably accent mixed with a bg
        fit = blend_fit(c, bgs)
        if fit:
            _, a, bg = fit
            t = rgb(target)
            return hx(tuple(round(a * t[i] + (1 - a) * bg[i]) for i in range(3)))
    return hx(shade(*c, target))

stats = collections.Counter()
HEX = re.compile(r"#([0-9a-fA-F]{6})\b")
RGBA = re.compile(r"rgba\(46,\s*179,\s*152,\s*([0-9.]+)\)")
BG_PROPS = {"background-color", "background", "background-image"}
THIN_SEL = re.compile(r"progress|highlight|scale|level|trough|slider|ripple")
DARK_CTX = {
    "gtk": re.compile(r"headerbar|titlebar|menubar|primary-toolbar|#Toolbar|thunar toolbar|raven|budgie-panel|ValaPanel"),
    "cinnamon": re.compile(r"panel|window-list|grouped-window|workspace-switch|systray|applet-box|applet-label|expo|overview"),
    "gnome-shell": re.compile(r"#panel|panel-button|\.dash|overview|workspace-thumb"),
}

LIGHT_SURFACE = re.compile(r"popover|menu\b|-menu|tooltip")   # popups are light, even off a dark bar

def target_for(line, sel, ctx, alpha=None):
    if not (ctx and ctx.search(sel)) or LIGHT_SURFACE.search(sel):
        return FILL                   # light surface: everything FILL
    s = line.strip()
    m = re.match(r"@define-color\s+(\S+)", s)
    if m:
        return FILL if re.search(r"bg|selected", m.group(1)) else LIGHT
    m = re.match(r"([-\w]+)\s*:", s)
    prop = m.group(1) if m else ""
    if prop in BG_PROPS and "radial" not in s and not THIN_SEL.search(sel):
        return LIGHT if alpha is not None and alpha < 0.5 else FILL
    return LIGHT

def bg_candidates(text):
    out = {(255, 255, 255), (0, 0, 0)}
    for h in HEX.findall(text):
        H, L, S = hls(h)
        if S < 0.25 or L > 0.9 or L < 0.1: out.add(rgb(h))
    return out

def do_css(path, kind):
    text = path.read_text()
    bgs, ctx = bg_candidates(text), DARK_CTX.get(kind)
    out, sel = [], ""
    for line in text.split("\n"):
        if "{" in line: sel = line
        if re.match(r"\s*@define-color\s+[A-Z_0-9]+\s", line):   # palette constants
            out.append(line); continue
        def rh(m):
            h = m.group(1)
            if not is_accent(h): return m.group(0)
            t = target_for(line, sel, ctx)
            stats[(kind, "FILL" if t == FILL else "LIGHT")] += 1
            return "#" + recolor_hex(h, t, bgs)
        def rr(m):
            t = target_for(line, sel, ctx, float(m.group(1)))
            stats[(kind, "rgba")] += 1
            r, g, b = rgb(t)
            return f"rgba({r}, {g}, {b}, {m.group(1)})"
        out.append(RGBA.sub(rr, HEX.sub(rh, line)))
    path.write_text("\n".join(out))

def do_svg(path, target):
    txt = path.read_text()
    bgs = bg_candidates(txt)
    new = HEX.sub(lambda m: "#" + recolor_hex(m.group(1), target, bgs) if is_accent(m.group(1)) else m.group(0), txt)
    if new != txt:
        path.write_text(new); stats[("svg", path.parent.name)] += 1

def do_png(path, target):
    im = Image.open(path)
    im = im.convert("RGBA"); px = im.load(); n = 0
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a == 0: continue
            H, L, S = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
            if in_family(H, S) and S > 0.35 and 0.2 < L < 0.95:
                px[x, y] = (*shade(r, g, b, target), a); n += 1
    if n:
        im.save(path); stats[("png", path.parent.name)] += 1

# ---- assemble -------------------------------------------------------------------
if OUT.exists():
    sys.exit(f"{OUT} exists; remove it first")
shutil.copytree(DARKTHEME, OUT, ignore=shutil.ignore_patterns("tools"))

for sub in ["gtk-2.0", "cinnamon", "gnome-shell", "metacity-1"]:
    shutil.rmtree(OUT / sub)
    shutil.copytree(SRC / sub, OUT / sub)
# cinnamon/common-assets is shared with the dark theme: keep Netscape-Dark's
shutil.rmtree(OUT / "cinnamon/common-assets")
shutil.copytree(DARKTHEME / "cinnamon/common-assets", OUT / "cinnamon/common-assets")
for f in ["calendar-arrow-left-hover.svg", "calendar-arrow-right-hover.svg"]:   # on light menus
    shutil.copy2(SRC / "cinnamon/common-assets/misc" / f, OUT / "cinnamon/common-assets/misc" / f)
for gtk in ["gtk-3.0", "gtk-4.0"]:
    for f in ["gtk.css", "thumbnail.png"]:
        shutil.copy2(SRC / gtk / f, OUT / gtk / f)
    for p in (SRC / gtk / "assets").glob("*.png"):
        if "-dark" not in p.name:                 # light assets; *-dark stay Netscape-Dark's
            shutil.copy2(p, OUT / gtk / "assets" / p.name)

# ---- recolor ----------------------------------------------------------------------
for gtk in ["gtk-3.0", "gtk-4.0"]:
    do_css(OUT / gtk / "gtk.css", "gtk")
do_css(OUT / "cinnamon/cinnamon.css", "cinnamon")
do_css(OUT / "gnome-shell/gnome-shell.css", "gnome-shell")

LINK = recolor_hex("248a76", FILL, set())          # Qogir's light link color, as a teal shade
rc = (OUT / "gtk-2.0/gtkrc").read_text()
rc = re.sub(r"selected_bg_color: #2eb398", "selected_bg_color: #" + FILL, rc)
rc = re.sub(r"link_color: #[0-9a-fA-F]{6}", "link_color: #" + LINK, rc)
(OUT / "gtk-2.0/gtkrc").write_text(rc)

for p in sorted((OUT / "cinnamon").glob("assets/**/*.svg")): do_svg(p, FILL)
for p in sorted((OUT / "cinnamon/common-assets/misc").glob("calendar-arrow-*-hover.svg")): do_svg(p, FILL)
for p in sorted((OUT / "gnome-shell").glob("**/*.svg")): do_svg(p, FILL)
for d in ["gtk-2.0/assets", "gtk-3.0/assets", "gtk-4.0/assets"]:
    for p in sorted((OUT / d).glob("*.png")):
        if "-dark" not in p.name: do_png(p, FILL)
for p in ["cinnamon/thumbnail.png", "gtk-3.0/thumbnail.png", "gtk-4.0/thumbnail.png"]:
    do_png(OUT / p, FILL)

# ---- Netscape customizations --------------------------------------------------------
css = (OUT / "cinnamon/cinnamon.css").read_text()
for sel in ["#panel", ".panel-status-button", ".panel-button", ".applet-label"]:
    css = re.sub(r"(\n%s \{[^}]*?)font-weight: bold;" % re.escape(sel), r"\1font-weight: normal;", css)
css += ("\n/* Custom panel color */\n"
        "#panel, .panel-top, .panel-bottom, .panel-left, .panel-right {\n"
        f"  background-color: #{PANEL};\n  background-image: none;\n}}\n")
(OUT / "cinnamon/cinnamon.css").write_text(css)

# The linked-button (2026-11-17) and Nemo path-bar (2026-11-19) fix blocks, copied
# verbatim from the end of Netscape-Dark's gtk.css files. Their light-teal lines suit
# the dark titlebars and file-manager toolbars of standard Qogir.
for gtk in ["gtk-3.0", "gtk-4.0"]:
    dark = (DARKTHEME / gtk / "gtk.css").read_text()
    i = dark.index("/* Netscape fix (2026-11-17)")
    p = OUT / gtk / "gtk.css"
    p.write_text(p.read_text().rstrip("\n") + "\n\n" + dark[i:])

# ---- names --------------------------------------------------------------------------
it = (OUT / "index.theme").read_text().replace("Qogir-Netscape-Dark", NAME)
(OUT / "index.theme").write_text(it)
for p in (OUT / "metacity-1").glob("*.xml"):
    p.write_text(re.sub(r"Qogir-Manjaro", NAME, p.read_text()))

for k, v in sorted(stats.items()): print(k, v)
print("link color #" + LINK)
