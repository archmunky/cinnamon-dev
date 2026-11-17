// usgs-level@archmunky — latest USGS gauge height and flow for one monitoring site.

const UUID = 'usgs-level@archmunky';
const Applet = imports.ui.applet;
const Mainloop = imports.mainloop;
const PopupMenu = imports.ui.popupMenu;
const Settings = imports.ui.settings;
const Soup = imports.gi.Soup;   // Cinnamon pins Soup 3.0 (js/ui/environment.js)
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const St = imports.gi.St;

const DATA_URL = 'https://waterservices.usgs.gov/nwis/iv/?format=json&sites=';
const PAGE_URL = 'https://waterdata.usgs.gov/monitoring-location/';
const PLACEHOLDER = 'USGS Water Level';
const MINUTES_BETWEEN_CHECKS = 60;
const STALE_OPACITY = 150;           // 0–255
const TIME_FMT = '%a %b %-d, %-l:%M %p %Z';

function log(msg) {
    global.log(`[${UUID}] ${msg}`);
}

function logError(msg) {
    global.logError(`[${UUID}] ${msg}`);
}

function fmtTime(dt) {
    return dt ? dt.to_local().format(TIME_FMT) : '?';
}

// USGS timestamps look like 2026-11-16T20:15:00.000-05:00. Fall back to the raw string.
function fmtIso(str) {
    if (!str)
        return '?';
    try {
        const dt = GLib.DateTime.new_from_iso8601(str, null);
        if (dt)
            return fmtTime(dt);
    } catch (e) {
        // fall through
    }
    return str.replace('T', ' ');
}

class UsgsLevelApplet extends Applet.TextIconApplet {
    constructor(metadata, orientation, panelHeight, instanceId) {
        super(orientation, panelHeight, instanceId);

        this._data = null;          // last successfully parsed reading
        this._fetchedAt = null;     // GLib.DateTime of last good load
        this._error = null;         // message from the most recent failed load, or invalid site
        this._loading = false;
        this._cancellable = null;
        this._timerId = 0;
        this._siteChangeTimerId = 0;

        this._session = new Soup.Session({
            timeout: 30,
            user_agent: 'usgs-level-cinnamon-applet/1.0',
        });

        // Property names must not collide with Applet methods (e.g. showLabel).
        this.settings = new Settings.AppletSettings(this, metadata.uuid, instanceId);
        this.settings.bind('site-number', 'siteNumber', this._onSiteChanged);
        this.settings.bind('show-label', 'showPanelLabel', this._render);
        this.settings.bind('show-flow', 'showFlow', this._render);
        this.settings.bind('threshold-low', 'thresholdLow', this._render);
        this.settings.bind('threshold-yellow', 'thresholdYellow', this._render);
        this.settings.bind('threshold-green', 'thresholdGreen', this._render);
        this.settings.bind('threshold-high', 'thresholdHigh', this._render);

        this._buildMenu(orientation);
        this._render();
        this._refresh();
        this._timerId = Mainloop.timeout_add_seconds(MINUTES_BETWEEN_CHECKS * 60, () => {
            this._refresh();
            return GLib.SOURCE_CONTINUE;
        });
    }

    // ---- menu --------------------------------------------------------------

    _buildMenu(orientation) {
        this.menuManager = new PopupMenu.PopupMenuManager(this);
        this.menu = new Applet.AppletPopupMenu(this, orientation);
        this.menuManager.addMenu(this.menu);

        this._siteItem = new PopupMenu.PopupMenuItem('', { reactive: false });
        this.menu.addMenuItem(this._siteItem);
        this._statusItem = new PopupMenu.PopupMenuItem('', { reactive: false });
        this.menu.addMenuItem(this._statusItem);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const refreshItem = new PopupMenu.PopupIconMenuItem('Refresh now', 'view-refresh-symbolic',
            St.IconType.SYMBOLIC);
        refreshItem.connect('activate', () => this._refresh());
        this.menu.addMenuItem(refreshItem);

        const openItem = new PopupMenu.PopupIconMenuItem('Open USGS site page', 'web-browser-symbolic',
            St.IconType.SYMBOLIC);
        openItem.connect('activate', () => {
            const url = PAGE_URL + this._site() + '/';
            try {
                Gio.app_info_launch_default_for_uri(url, global.create_app_launch_context());
            } catch (e) {
                logError(`Could not open ${url}: ${e.message}`);
            }
        });
        this.menu.addMenuItem(openItem);
    }

    on_applet_clicked() {
        this.menu.toggle();
    }

    // ---- loading -----------------------------------------------------------

    _site() {
        return String(this.siteNumber || '').trim();
    }

    _onSiteChanged() {
        // Entry settings save on every keystroke; wait for typing to settle before refetching.
        if (this._siteChangeTimerId)
            Mainloop.source_remove(this._siteChangeTimerId);
        this._siteChangeTimerId = Mainloop.timeout_add_seconds(2, () => {
            this._siteChangeTimerId = 0;
            // Don't let one site's reading show under another.
            this._data = null;
            this._fetchedAt = null;
            this._error = null;
            this._refresh();
            return GLib.SOURCE_REMOVE;
        });
    }

    _refresh() {
        try {
            if (this._cancellable)
                this._cancellable.cancel();
            this._cancellable = null;

            const site = this._site();
            if (!/^\d+$/.test(site)) {
                this._loading = false;
                this._error = `Invalid site number "${site}"`;
                logError(this._error);
                this._render();
                return;
            }

            const cancellable = new Gio.Cancellable();
            this._cancellable = cancellable;
            this._loading = true;
            this._render();

            const url = DATA_URL + site;
            const message = Soup.Message.new('GET', url);
            log(`fetching ${url}`);
            this._session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, cancellable, (session, result) => {
                this._finishLoad(cancellable, () => {
                    const bytes = session.send_and_read_finish(result);
                    const status = message.get_status();
                    if (status !== Soup.Status.OK)
                        throw new Error(`HTTP ${status} ${message.get_reason_phrase() || ''}`.trim());
                    return bytes.get_data();
                });
            });
        } catch (e) {
            this._loading = false;
            this._error = e.message || String(e);
            logError(`refresh failed: ${this._error}`);
            this._render();
        }
    }

    // `readBytes` returns a Uint8Array or throws.
    _finishLoad(cancellable, readBytes) {
        if (this._cancellable !== cancellable)
            return;     // superseded by a newer request
        this._cancellable = null;
        this._loading = false;
        try {
            const json = JSON.parse(new TextDecoder('utf-8').decode(readBytes()));
            this._data = this._parse(json);
            this._fetchedAt = GLib.DateTime.new_now_utc();
            this._error = null;
            log(`loaded ${this._data.height} ${this._data.heightUnit} @ ${this._data.flow} ${this._data.flowUnit}`);
        } catch (e) {
            if (e instanceof GLib.Error && e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                return;
            this._error = e.message || String(e);
            logError(`load failed: ${this._error}`);
        }
        this._render();
    }

    _parse(json) {
        const series = json.value.timeSeries;
        const flow = series[0];
        const height = series[1];
        const geo = flow.sourceInfo.geoLocation.geogLocation;
        return {
            siteName: flow.sourceInfo.siteName,
            lat: geo.latitude,
            lon: geo.longitude,
            flow: flow.values[0].value[0].value,
            flowUnit: flow.variable.unit.unitCode,
            height: height.values[0].value[0].value,
            heightUnit: height.variable.unit.unitCode,
            readingTime: height.values[0].value[0].dateTime,
        };
    }

    // ---- display -----------------------------------------------------------

    // Returns [icon name, level description] for a gauge height.
    _level(height) {
        const amt = parseFloat(height);
        if (isNaN(amt))
            return ['kayak', 'Unknown'];
        if (amt < this.thresholdLow)
            return ['kayak-red', 'Too low'];
        if (amt >= this.thresholdHigh)
            return ['kayak-red', 'Too high'];
        if (amt <= this.thresholdYellow)
            return ['kayak-orange', 'Low'];
        if (amt <= this.thresholdGreen)
            return ['kayak-yellow', 'Marginal'];
        return ['kayak-green', 'Good'];
    }

    _render() {
        const d = this._data;
        const stale = d !== null && this._error !== null;
        let iconName, label, status;

        if (!d) {
            iconName = 'kayak';
            label = this._error ? '?' : (this._loading ? '…' : PLACEHOLDER);
            status = this._error ? 'No data (fetch failed)' : 'Loading…';
            if (this._error && this._error.startsWith('Invalid site'))
                label = 'Invalid site';
        } else {
            let levelName;
            [iconName, levelName] = this._level(d.height);
            label = `${d.height} ${d.heightUnit}`;
            if (this.showFlow)
                label += ` @ ${d.flow} ${d.flowUnit}`;
            if (stale)
                label += '?';
            status = `${d.height} ${d.heightUnit} (${levelName}) @ ${d.flow} ${d.flowUnit}`;
        }

        this.set_applet_icon_name(iconName);
        this._applet_icon.opacity = stale ? STALE_OPACITY : 255;
        // An empty label makes Cinnamon hide the label area, leaving just the icon.
        this.set_applet_label(this.showPanelLabel ? label : '');
        this._applet_label.opacity = stale ? STALE_OPACITY : 255;

        const siteTitle = d ? d.siteName : `USGS site ${this._site()}`;
        this._siteItem.label.set_text(siteTitle);
        this._statusItem.label.set_text(status);
        this.set_applet_tooltip(this._buildTooltip(siteTitle, status));
    }

    _buildTooltip(siteTitle, status) {
        const d = this._data;
        const lines = [siteTitle, status];
        if (d) {
            lines.push(`Reading: ${fmtIso(d.readingTime)}`);
            lines.push(`Location: ${Number(d.lat).toFixed(4)}, ${Number(d.lon).toFixed(4)}`);
        }
        lines.push(`Site: ${this._site()}`);
        if (this._fetchedAt)
            lines.push(`Updated: ${fmtTime(this._fetchedAt)}`);
        if (this._error)
            lines.push(`⚠ Last fetch failed: ${this._error}`);
        return lines.join('\n');
    }

    // ---- teardown ----------------------------------------------------------

    on_applet_removed_from_panel() {
        if (this._timerId) {
            Mainloop.source_remove(this._timerId);
            this._timerId = 0;
        }
        if (this._siteChangeTimerId) {
            Mainloop.source_remove(this._siteChangeTimerId);
            this._siteChangeTimerId = 0;
        }
        if (this._cancellable) {
            this._cancellable.cancel();
            this._cancellable = null;
        }
        this._session.abort();
        this.settings.finalize();
    }
}

function main(metadata, orientation, panelHeight, instanceId) {
    return new UsgsLevelApplet(metadata, orientation, panelHeight, instanceId);
}
