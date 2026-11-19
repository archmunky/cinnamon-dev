#!/usr/bin/env bash
# theme-mode-sync: keep the desktop's dark-mode preference in line with the GTK theme.
#
# Cinnamon doesn't set color-scheme for custom themes, so GTK 4/libadwaita apps (and
# anything using the portal) stay dark or light regardless of the chosen theme. This
# watches org.cinnamon.desktop.interface gtk-theme and, on every change, sets:
#   - org.gnome.desktop.interface color-scheme: prefer-dark / default
#   - org.x.apps.portal color-scheme (Linux Mint only): prefer-dark / default
#   - gtk-application-prefer-dark-theme in ~/.config/gtk-3.0/settings.ini: 1 / 0
# A theme counts as dark when its name contains "-Dark" or "-dark".
#
# Started at login by ~/.config/autostart/theme-mode-sync.desktop (see install.sh).
# Run with --once to apply the current theme and exit.
set -uo pipefail

SETTINGS_INI="${XDG_CONFIG_HOME:-$HOME/.config}/gtk-3.0/settings.ini"

apply() {
    local theme scheme dark
    theme=$(gsettings get org.cinnamon.desktop.interface gtk-theme | tr -d "'")
    if [[ $theme == *-Dark* || $theme == *-dark* ]]; then
        scheme=prefer-dark dark=1
    else
        scheme=default dark=0
    fi

    if [[ $(gsettings get org.gnome.desktop.interface color-scheme) != "'$scheme'" ]]; then
        gsettings set org.gnome.desktop.interface color-scheme "$scheme"
    fi

    # Linux Mint's XDG portal setting (what Flatpak/Electron/browser apps are told).
    if gsettings list-keys org.x.apps.portal 2>/dev/null | grep -qx color-scheme \
        && [[ $(gsettings get org.x.apps.portal color-scheme) != "'$scheme'" ]]; then
        gsettings set org.x.apps.portal color-scheme "$scheme"
    fi

    if [[ -f $SETTINGS_INI ]] && grep -q '^gtk-application-prefer-dark-theme=' "$SETTINGS_INI"; then
        sed -i "s/^gtk-application-prefer-dark-theme=.*/gtk-application-prefer-dark-theme=$dark/" "$SETTINGS_INI"
    fi
    echo "theme-mode-sync: $theme -> color-scheme=$scheme, gtk3 prefer-dark=$dark"
}

if [[ ${1:-} == --once ]]; then
    apply
    exit 0
fi

# One instance per session.
exec 9>"${XDG_RUNTIME_DIR:-/tmp}/theme-mode-sync.lock"
flock -n 9 || { echo "theme-mode-sync: already running" >&2; exit 0; }

apply
# 9>&- so the monitor doesn't inherit (and outlive us holding) the lock.
gsettings monitor org.cinnamon.desktop.interface gtk-theme 9>&- | while read -r _; do
    apply
done
