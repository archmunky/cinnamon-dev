#!/usr/bin/env bash
# Install the Qogir-Netscape-Dark GTK/Cinnamon theme, its icon theme and the
# Bibata-Modern-Classic cursors for the current user, then copy the titlebar override gtk.css into the GTK 3 and
# GTK 4 user config folders. Existing installs and gtk.css files are replaced.
set -euo pipefail

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NAME="Qogir-Netscape-Dark"

THEME_SRC="$SRC_DIR/themes/$NAME"
ICONS_SRC="$SRC_DIR/icons/$NAME"
CSS_SRC="$SRC_DIR/themes/gtk.css"

CURSOR="Bibata-Modern-Classic"
CURSOR_SRC="$SRC_DIR/icons/$CURSOR"

THEME_DEST="$HOME/.themes/$NAME"
ICONS_DEST="$HOME/.icons/$NAME"
CURSOR_DEST="$HOME/.icons/$CURSOR"
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}"

for path in "$THEME_SRC/index.theme" "$ICONS_SRC/index.theme" "$CURSOR_SRC/index.theme" "$CSS_SRC"; do
    if [[ ! -f "$path" ]]; then
        echo "Missing $path; run this from the cinnamon-dev repo." >&2
        exit 1
    fi
done

# Replace whole folders so files removed from the repo don't linger.
install_dir() {
    local src="$1" dest="$2"
    mkdir -p "$(dirname "$dest")"
    rm -rf "$dest"
    cp -a "$src" "$dest"
    echo "Installed $(basename "$src") to $dest"
}

install_dir "$THEME_SRC" "$THEME_DEST"
install_dir "$ICONS_SRC" "$ICONS_DEST"
install_dir "$CURSOR_SRC" "$CURSOR_DEST"

# Refresh the icon cache so the new icons show up without a re-login.
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
    gtk-update-icon-cache -f -q "$ICONS_DEST" || true
fi

for gtk in gtk-3.0 gtk-4.0; do
    mkdir -p "$CONFIG_DIR/$gtk"
    cp -f "$CSS_SRC" "$CONFIG_DIR/$gtk/gtk.css"
    echo "Copied gtk.css to $CONFIG_DIR/$gtk/gtk.css"
done

echo "Done. Select $NAME in Themes (and restart running apps) if it isn't already active."
