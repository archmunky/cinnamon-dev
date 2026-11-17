#!/usr/bin/env bash
# Install this applet into the current user's Cinnamon applets directory.
# Copies everything in this folder except development-only files.
set -euo pipefail

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UUID="$(basename "$SRC_DIR")"
DEST_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/cinnamon/applets/$UUID"

if [[ ! -f "$SRC_DIR/metadata.json" ]]; then
    echo "No metadata.json in $SRC_DIR; is this an applet folder?" >&2
    exit 1
fi

# Replace any previous install so removed files don't linger.
rm -rf "$DEST_DIR"
mkdir -p "$DEST_DIR"

shopt -s nullglob   # hidden files are skipped since dotglob is off
for entry in "$SRC_DIR"/*; do
    case "$(basename "$entry")" in
        install.sh|README.md|CLAUDE.md) continue ;;
    esac
    cp -r "$entry" "$DEST_DIR"/
done

echo "Installed $UUID to $DEST_DIR"

# Reload the applet if Cinnamon is running (harmless if it isn't on a panel yet).
if command -v dbus-send >/dev/null 2>&1 && pgrep -x cinnamon >/dev/null 2>&1; then
    dbus-send --session --dest=org.Cinnamon.LookingGlass --type=method_call \
        /org/Cinnamon/LookingGlass org.Cinnamon.LookingGlass.ReloadExtension \
        string:"$UUID" string:'APPLET' >/dev/null 2>&1 \
        && echo "Reloaded $UUID in Cinnamon" \
        || echo "Could not reload automatically; remove and re-add the applet or restart Cinnamon"
fi
