#!/usr/bin/env bash
# Install the Qogir-Netscape-Dark GTK/Cinnamon theme, its icon theme and the
# Bibata-Modern-Classic cursors for the current user, then copy the titlebar override gtk.css into the GTK 3 and
# GTK 4 user config folders. Existing installs and gtk.css files are replaced.
# The cursors are skipped if the system already provides them (e.g. Linux Mint).
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

# Skip the cursors if the distro already ships them (e.g. Linux Mint puts
# Bibata in /usr/share/icons).
system_cursor_dir() {
    local dir
    IFS=: read -ra dirs <<< "${XDG_DATA_DIRS:-/usr/local/share:/usr/share}"
    for dir in "${dirs[@]}"; do
        if [[ -f "$dir/icons/$CURSOR/index.theme" ]]; then
            echo "$dir/icons/$CURSOR"
            return 0
        fi
    done
    return 1
}

if existing="$(system_cursor_dir)"; then
    echo "$CURSOR already installed at $existing; skipping"
else
    install_dir "$CURSOR_SRC" "$CURSOR_DEST"
fi

# Refresh the icon cache so the new icons show up without a re-login.
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
    gtk-update-icon-cache -f -q "$ICONS_DEST" || true
fi

for gtk in gtk-3.0 gtk-4.0; do
    mkdir -p "$CONFIG_DIR/$gtk"
    cp -f "$CSS_SRC" "$CONFIG_DIR/$gtk/gtk.css"
    echo "Copied gtk.css to $CONFIG_DIR/$gtk/gtk.css"
done

# Let VS Code open folders: make sure a user copy of its desktop file exists
# and that its MimeType line includes inode/directory.
VSCODE_DESKTOP="com.microsoft.VSCode.desktop"
VSCODE_SYS="/usr/share/applications/$VSCODE_DESKTOP"
APPS_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
VSCODE_LOCAL="$APPS_DIR/$VSCODE_DESKTOP"

if [[ ! -f "$VSCODE_LOCAL" ]]; then
    if [[ -f "$VSCODE_SYS" ]]; then
        mkdir -p "$APPS_DIR"
        cp "$VSCODE_SYS" "$VSCODE_LOCAL"
        echo "Copied $VSCODE_SYS to $VSCODE_LOCAL"
    else
        echo "$VSCODE_DESKTOP not found in $APPS_DIR or /usr/share/applications; skipping VS Code setup"
    fi
fi

if [[ -f "$VSCODE_LOCAL" ]]; then
    if grep -Eq '^MimeType=(.*;)?inode/directory(;|$)' "$VSCODE_LOCAL"; then
        echo "$VSCODE_LOCAL already handles inode/directory"
    else
        # Append to the first MimeType= line (adding a ';' separator if the line
        # lacks a trailing one), or add the line to [Desktop Entry] if it's missing.
        tmp="$(mktemp)"
        awk '
            !done && /^MimeType=/ {
                if ($0 !~ /;$/ && $0 != "MimeType=") $0 = $0 ";"
                print $0 "inode/directory;"; done = 1; next
            }
            { print }
            END { if (!done) exit 1 }
        ' "$VSCODE_LOCAL" > "$tmp" \
            || awk '{ print } /^\[Desktop Entry\]$/ { print "MimeType=inode/directory;" }' "$VSCODE_LOCAL" > "$tmp"
        cat "$tmp" > "$VSCODE_LOCAL"
        rm -f "$tmp"
        echo "Added inode/directory to MimeType in $VSCODE_LOCAL"
    fi
    if command -v update-desktop-database >/dev/null 2>&1; then
        update-desktop-database -q "$APPS_DIR" || true
    fi
fi

echo "Done. Select $NAME in Themes (and restart running apps) if it isn't already active."
