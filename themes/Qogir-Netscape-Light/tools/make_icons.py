#!/usr/bin/env python3
"""Build a self-contained Qogir-Netscape-Light icon theme: a copy of Qogir (the
standard variant: light-panel-safe app icons, light symbolic panel icons for a dark
panel) with the folder icons recolored to Netscape teal, exactly as
Qogir-Netscape-Dark/tools/make_icons.py does for Qogir-Dark.

usage: make_icons.py <qogir-icon-dir> <out-dir>      (e.g. ~/.icons/Qogir)
"""
import os, re, sys, shutil, collections, subprocess

SRC, DST = (os.path.abspath(os.path.expanduser(a)) for a in sys.argv[1:3])
NAME = os.path.basename(DST)

MAP = {"6ba4e7": "5cb8c2",                       # folder body
       "003579": "093a3f", "003779": "093a3f",   # folder back/shade
       # the dark theme's shift() values for the other folder blues
       "5294e2": "47aeb9", "3981d7": "40939c", "46a7e9": "3fb0bc"}
FOLDER_ONLY = {"6ba4e7", "003579", "003779"}     # colors also used outside places/
ALL_RE = re.compile(r"#(%s)\b" % "|".join(MAP), re.I)
FOLDER_RE = re.compile(r"#(%s)\b" % "|".join(FOLDER_ONLY), re.I)
SHADE_RE = re.compile(r"#(003579|003779)\b", re.I)   # folder-shape signature

if os.path.exists(DST):
    sys.exit(f"{DST} exists; remove it first")
shutil.copytree(SRC, DST, symlinks=True, ignore=shutil.ignore_patterns(
    "cursors", "cursors_scalable", "cursor.theme", "icon-theme.cache"))

stats = collections.Counter()
for root, dirs, files in os.walk(DST):
    ctx = os.path.basename(root)
    for fn in files:
        p = os.path.join(root, fn)
        if not fn.endswith(".svg") or os.path.islink(p): continue
        t = open(p, errors="ignore").read()
        if ctx == "places":
            new = ALL_RE.sub(lambda m: "#" + MAP[m.group(1).lower()], t)
        elif SHADE_RE.search(t):                 # folder-shaped app icons (file managers)
            new = FOLDER_RE.sub(lambda m: "#" + MAP[m.group(1).lower()], t)
        else:
            continue
        if new != t:
            open(p, "w").write(new); stats[ctx] += 1

idx = open(os.path.join(DST, "index.theme")).read()
idx = re.sub(r"(?m)^Name=.*", "Name=" + NAME, idx, count=1)
idx = re.sub(r"(?m)^Comment=.*", "Comment=Qogir with Netscape teal folders (self-contained)", idx, count=1)
open(os.path.join(DST, "index.theme"), "w").write(idx)

if shutil.which("gtk-update-icon-cache"):
    subprocess.run(["gtk-update-icon-cache", "-f", "-q", DST], check=False)
print("recolored files per context:", dict(stats))
