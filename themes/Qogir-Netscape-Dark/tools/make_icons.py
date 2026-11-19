#!/usr/bin/env python3
"""Build ~/.icons/Qogir-Netscape-Dark: an override icon theme that inherits
Qogir-Dark and only ships teal-recolored folder icons."""
import os, re, sys, colorsys, collections

ICONS = os.path.expanduser("~/.icons")
SRC = os.path.join(ICONS, "Qogir-Dark")
DST = os.path.join(ICONS, "Qogir-Netscape-Dark")
DRY = "--dry" in sys.argv

BODY_SRC, BODY_DST = "6ba4e7", "5cb8c2"   # folder body
SHADE_DST = "093a3f"                      # folder back/shade

def hls(h): return colorsys.rgb_to_hls(*(int(h[i:i+2], 16) / 255 for i in (0, 2, 4)))
def shift(h):
    """Same lightness/saturation offset from the Qogir body blue, applied to the teal."""
    _, L, S = hls(h); _, bL, bS = hls(BODY_SRC); tH, tL, tS = hls(BODY_DST)
    r = colorsys.hls_to_rgb(tH, min(.95, max(.05, tL + L - bL)), min(1, tS * S / bS))
    return "%02x%02x%02x" % tuple(round(c * 255) for c in r)

MAP = {"6ba4e7": BODY_DST, "003579": SHADE_DST, "003779": SHADE_DST}
for h in ("5294e2", "3981d7", "46a7e9"):
    MAP[h] = shift(h)
FOLDER_ONLY = {"6ba4e7", "003579", "003779"}   # used outside places/
ALL_RE = re.compile(r"#(%s)\b" % "|".join(MAP), re.I)
FOLDER_RE = re.compile(r"#(003579|003779)\b", re.I)  # folder-shape signature

idx = open(os.path.join(SRC, "index.theme")).read()
dirs = idx.split("Directories=")[1].split("\n")[0].split(",")

def read(p):
    try: return open(p, errors="ignore").read()
    except OSError: return None

# 1. Decide which icon names (per context) to override.
override = set()   # (context, name)
for d in dirs:
    full = os.path.join(SRC, d)
    if not os.path.isdir(full): continue
    ctx = d.split("/")[-1]
    for fn in os.listdir(full):
        if not fn.endswith(".svg"): continue
        t = read(os.path.join(full, fn))
        if t is None: continue
        if (ctx == "places" and ALL_RE.search(t)) or (ctx != "places" and FOLDER_RE.search(t)):
            override.add((ctx, fn))

# 2. Write every size of each overridden icon (recolored), so lookups never mix themes.
stats = collections.Counter(); used_dirs = []
for d in dirs:
    full = os.path.join(SRC, d)
    if not os.path.isdir(full): continue
    ctx = d.split("/")[-1]; wrote = False
    for fn in os.listdir(full):
        if (ctx, fn) not in override: continue
        t = read(os.path.join(full, fn))
        if t is None: continue
        rx = ALL_RE if ctx == "places" else re.compile(r"#(%s)\b" % "|".join(FOLDER_ONLY), re.I)
        new = rx.sub(lambda m: "#" + MAP[m.group(1).lower()], t)
        stats[ctx] += 1; wrote = True
        if not DRY:
            os.makedirs(os.path.join(DST, d), exist_ok=True)
            open(os.path.join(DST, d, fn), "w").write(new)
    if wrote: used_dirs.append(d)

# 3. index.theme: keep Qogir-Dark's directory definitions for the dirs we ship.
head, rest = idx.split("Directories=", 1)
rest = rest.split("\n", 1)[1]
head = re.sub(r"(?m)^Name=.*", "Name=Qogir-Netscape-Dark", head)
head = re.sub(r"(?m)^Comment=.*", "Comment=Qogir-Dark with Netscape teal folders", head)
head = re.sub(r"(?m)^Inherits=.*", "Inherits=Qogir-Dark,hicolor,breeze", head)
sections = re.split(r"(?m)^(?=\[)", rest)
keep = [s for s in sections if not s.startswith("[") or s.split("]")[0][1:] in used_dirs]
out = head + "Directories=" + ",".join(used_dirs) + "\n" + "".join(keep)
out = re.sub(r"(?m)^ScaledDirectories=.*\n", "", out)
if not DRY:
    open(os.path.join(DST, "index.theme"), "w").write(out)

print("color map:", MAP)
print("icon names overridden:", len(override), dict(collections.Counter(c for c, _ in override)))
print("files written per context:", dict(stats))
print("directories:", len(used_dirs))
