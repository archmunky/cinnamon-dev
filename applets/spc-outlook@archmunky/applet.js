// spc-outlook@archmunky — SPC Day 1 categorical convective outlook for one point.

const Applet = imports.ui.applet;
const PopupMenu = imports.ui.popupMenu;
const Settings = imports.ui.settings;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const St = imports.gi.St;
const Soup = imports.gi.Soup;   // Cinnamon pins Soup 3.0 (js/ui/environment.js)

const SpcGeo = require('./spcgeo');

const UUID = 'spc-outlook@archmunky';
const DATA_URL = 'https://www.spc.noaa.gov/products/outlook/day1otlk_cat.nolyr.geojson';
const PAGE_URL = 'https://www.spc.noaa.gov/products/outlook/day1otlk.html';

const ICON_NAME = 'weather-storm-symbolic';            // none / TSTM–ENH
const ICON_SEVERE = 'weather-severe-alert-symbolic';    // MDT and HIGH
const ICON_NO_RISK = 'emblem-default-symbolic';         // checkmark in a circle, dim grey
const SEVERE_DN = 6;

const DIM_COLOR = '#888888';
const STALE_OPACITY = 150;           // 0–255
const TIME_FMT = '%a %b %-d, %-l:%M %p %Z';

// Test mode: archived 2024-05-06 1630Z outlook (HIGH risk in OK) bundled with the
// applet, plus a point inside each category. Keys match settings-schema "test-point".
const TEST_FIXTURE = 'tests/fixtures/day1otlk_20240506_1630_cat.nolyr.geojson';
const TEST_POINTS = {
    okc:     { name: 'Oklahoma City', lat: 35.47, lon: -97.52 },   // HIGH
    wichita: { name: 'Wichita',       lat: 37.69, lon: -97.34 },   // MDT
    kc:      { name: 'Kansas City',   lat: 39.10, lon: -94.58 },   // ENH
    omaha:   { name: 'Omaha',         lat: 41.26, lon: -95.94 },   // SLGT
    dallas:  { name: 'Dallas',        lat: 32.78, lon: -96.80 },   // MRGL
    chicago: { name: 'Chicago',       lat: 41.88, lon: -87.63 },   // TSTM
    denver:  { name: 'Denver',        lat: 39.74, lon: -104.99 },  // none
};

function log(msg) {
    global.log(`[${UUID}] ${msg}`);
}

function logError(msg) {
    global.logError(`[${UUID}] ${msg}`);
}

function fmtTime(dt) {
    return dt ? dt.to_local().format(TIME_FMT) : '?';
}

class SpcOutlookApplet extends Applet.TextIconApplet {
    constructor(metadata, orientation, panelHeight, instanceId) {
        super(orientation, panelHeight, instanceId);

        this._path = metadata.path;
        this._geojson = null;       // last successfully loaded collection
        this._fetchedAt = null;     // GLib.DateTime of last good load
        this._error = null;         // message from the most recent failed load
        this._cancellable = null;
        this._timerId = 0;

        this._session = new Soup.Session({
            timeout: 30,
            user_agent: 'spc-outlook-cinnamon-applet/1.0',
        });

        this.settings = new Settings.AppletSettings(this, metadata.uuid, instanceId);
        this.settings.bind('latitude', 'latitude', this._onLocationChanged);
        this.settings.bind('longitude', 'longitude', this._onLocationChanged);
        this.settings.bind('refresh-interval', 'refreshInterval', this._restartTimer);
        this.settings.bind('display-mode', 'displayMode', this._render);
        this.settings.bind('test-point', 'testPoint', this._onTestPointChanged);

        this._buildMenu(orientation);
        this._render();
        this._refresh();
        this._restartTimer();
    }

    // ---- menu --------------------------------------------------------------

    _buildMenu(orientation) {
        this.menuManager = new PopupMenu.PopupMenuManager(this);
        this.menu = new Applet.AppletPopupMenu(this, orientation);
        this.menuManager.addMenu(this.menu);

        this._statusItem = new PopupMenu.PopupMenuItem('', { reactive: false });
        this.menu.addMenuItem(this._statusItem);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const refreshItem = new PopupMenu.PopupIconMenuItem('Refresh now', 'view-refresh-symbolic',
            St.IconType.SYMBOLIC);
        refreshItem.connect('activate', () => this._refresh());
        this.menu.addMenuItem(refreshItem);

        const openItem = new PopupMenu.PopupIconMenuItem('Open SPC outlook page', 'web-browser-symbolic',
            St.IconType.SYMBOLIC);
        openItem.connect('activate', () => {
            try {
                Gio.app_info_launch_default_for_uri(PAGE_URL, global.create_app_launch_context());
            } catch (e) {
                logError(`Could not open ${PAGE_URL}: ${e.message}`);
            }
        });
        this.menu.addMenuItem(openItem);
    }

    on_applet_clicked() {
        this.menu.toggle();
    }

    // ---- loading -----------------------------------------------------------

    _testPoint() {
        return TEST_POINTS[this.testPoint] || null;
    }

    _restartTimer() {
        if (this._timerId) {
            GLib.source_remove(this._timerId);
            this._timerId = 0;
        }
        const minutes = Math.max(5, Number(this.refreshInterval) || 30);
        this._timerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, minutes * 60, () => {
            this._refresh();
            return GLib.SOURCE_CONTINUE;
        });
        log(`refresh every ${minutes} min`);
    }

    _refresh() {
        if (this._cancellable)
            this._cancellable.cancel();
        const cancellable = new Gio.Cancellable();
        this._cancellable = cancellable;

        if (this._testPoint())
            this._loadFixture(cancellable);
        else
            this._fetchLive(cancellable);
    }

    _fetchLive(cancellable) {
        const message = Soup.Message.new('GET', DATA_URL);
        log(`fetching ${DATA_URL}`);

        this._session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, cancellable, (session, result) => {
            this._finishLoad(cancellable, () => {
                const bytes = session.send_and_read_finish(result);
                const status = message.get_status();
                if (status !== Soup.Status.OK)
                    throw new Error(`HTTP ${status} ${message.get_reason_phrase() || ''}`.trim());
                return bytes.get_data();
            });
        });
    }

    _loadFixture(cancellable) {
        const file = Gio.File.new_for_path(`${this._path}/${TEST_FIXTURE}`);
        log(`TEST MODE: loading ${file.get_path()}`);
        file.load_contents_async(cancellable, (f, result) => {
            this._finishLoad(cancellable, () => f.load_contents_finish(result)[1]);
        });
    }

    // Shared tail for live and fixture loads. `readBytes` returns a Uint8Array or throws.
    _finishLoad(cancellable, readBytes) {
        if (this._cancellable === cancellable)
            this._cancellable = null;
        try {
            const geojson = JSON.parse(new TextDecoder('utf-8').decode(readBytes()));
            if (!geojson || geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features))
                throw new Error('response is not a GeoJSON FeatureCollection');

            this._geojson = geojson;
            this._fetchedAt = GLib.DateTime.new_now_utc();
            this._error = null;
            log(`loaded ${geojson.features.length} feature(s)`);
        } catch (e) {
            if (e instanceof GLib.Error && e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                return;
            this._error = e.message || String(e);
            logError(`load failed: ${this._error}`);
        }
        this._render();
    }

    _onLocationChanged() {
        log(`location set to ${this.latitude}, ${this.longitude}`);
        this._render();     // reclassify from cached data; no refetch needed
    }

    _onTestPointChanged() {
        const tp = this._testPoint();
        log(tp ? `TEST MODE on: ${tp.name}` : 'TEST MODE off');
        // Don't let data from one source show under the other.
        this._geojson = null;
        this._fetchedAt = null;
        this._error = null;
        this._render();
        this._refresh();
    }

    // ---- display -----------------------------------------------------------

    _isExpired() {
        if (this._testPoint())
            return false;   // archived data is always "expired"; ignore in test mode
        const props = SpcGeo.collectionProps(this._geojson);
        const expire = SpcGeo.parseSpcTime(props, 'EXPIRE');
        return expire !== null && GLib.DateTime.new_now_utc().compare(expire) > 0;
    }

    _location() {
        const tp = this._testPoint();
        return tp ? [tp.lat, tp.lon] : [Number(this.latitude), Number(this.longitude)];
    }

    _render() {
        const [lat, lon] = this._location();
        const haveData = this._geojson !== null;
        const feature = haveData ? SpcGeo.classify(this._geojson, lat, lon) : null;
        const stale = haveData && (this._error !== null || this._isExpired());

        let showIcon, color, label, status;
        let iconName = ICON_NAME;

        if (!haveData) {
            // Never had a good load: "…" while the first request is in flight, "?" after it fails.
            showIcon = true;
            color = DIM_COLOR;
            label = this._error ? '?' : '…';
            status = this._error ? 'No data (fetch failed)' : 'Loading…';
        } else if (!feature) {
            // None: no text, dim grey checkmark-in-circle (plus "?" if stale).
            showIcon = true;
            iconName = ICON_NO_RISK;
            color = DIM_COLOR;
            label = stale ? '?' : '';
            status = 'No thunderstorm risk';
        } else {
            const dn = Number(feature.properties.DN);
            const cat = SpcGeo.CATEGORIES[dn] || { label: feature.properties.LABEL || '?', name: '', fill: DIM_COLOR };
            color = SpcGeo.safeColor(feature.properties.fill, cat.fill);
            const name = feature.properties.LABEL2 || cat.name;
            status = `${name} (${cat.label})`;
            if (dn >= SEVERE_DN)
                iconName = ICON_SEVERE;

            const mode = this.displayMode || 'both';
            showIcon = mode !== 'label';
            label = mode === 'icon' ? '' : cat.label;
            if (stale)
                label += '?';
        }

        if (showIcon) {
            this.set_applet_icon_symbolic_name(iconName);
            this._applet_icon.set_style(`color: ${color};`);
            this._applet_icon.opacity = stale ? STALE_OPACITY : 255;
        } else {
            this.hide_applet_icon();
        }
        this.set_applet_label(label);
        this._applet_label.set_style(`color: ${color};`);
        this._applet_label.opacity = stale ? STALE_OPACITY : 255;

        const tp = this._testPoint();
        const prefix = tp ? `[TEST ${tp.name}] ` : '';
        this._statusItem.label.set_text(`${prefix}SPC Day 1: ${status}`);
        this.set_applet_tooltip(this._buildTooltip(status, lat, lon));
    }

    _buildTooltip(status, lat, lon) {
        const lines = [];
        const tp = this._testPoint();
        if (tp)
            lines.push(`⚠ TEST MODE: archived 2024-05-06 1630Z outlook at ${tp.name}`);
        lines.push(`SPC Day 1: ${status}`);
        const props = SpcGeo.collectionProps(this._geojson);
        if (props) {
            const valid = SpcGeo.parseSpcTime(props, 'VALID');
            const expire = SpcGeo.parseSpcTime(props, 'EXPIRE');
            const issue = SpcGeo.parseSpcTime(props, 'ISSUE');
            lines.push(`Valid: ${fmtTime(valid)} – ${fmtTime(expire)}`);
            let issued = `Issued: ${fmtTime(issue)}`;
            if (props.FORECASTER)
                issued += ` (${props.FORECASTER})`;
            lines.push(issued);
        } else if (this._geojson) {
            lines.push('No outlook areas in today\'s outlook');
        }
        lines.push(`Location: ${lat.toFixed(2)}, ${lon.toFixed(2)}`);
        if (this._fetchedAt)
            lines.push(`Updated: ${fmtTime(this._fetchedAt)}`);
        if (this._error)
            lines.push(`⚠ Last fetch failed: ${this._error}`);
        else if (this._geojson && this._isExpired())
            lines.push('⚠ This outlook has expired');
        return lines.join('\n');
    }

    // ---- teardown ----------------------------------------------------------

    on_applet_removed_from_panel() {
        if (this._timerId) {
            GLib.source_remove(this._timerId);
            this._timerId = 0;
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
    return new SpcOutlookApplet(metadata, orientation, panelHeight, instanceId);
}
