// spcgeo.js — pure helpers for parsing SPC outlook GeoJSON.
//
// No Cinnamon imports here so this file can be loaded both by the applet
// (via require('./spcgeo')) and by tests/classify-test.js under plain cjs
// (via imports.spcgeo). Both loaders export top-level `var` and `function`
// declarations, so keep public symbols declared that way.

const GLib = imports.gi.GLib;

// SPC categorical risk levels keyed by the GeoJSON DN property.
// `fill` is SPC's lighter shading color (used for the panel label/icon,
// readable on dark panels); `stroke` is the darker outline color.
var CATEGORIES = {
    2: { label: 'TSTM', name: 'General Thunderstorms Risk', fill: '#C1E9C1', stroke: '#55BB55' },
    3: { label: 'MRGL', name: 'Marginal Risk',              fill: '#66A366', stroke: '#005500' },
    4: { label: 'SLGT', name: 'Slight Risk',                fill: '#FFE066', stroke: '#DDAA00' },
    5: { label: 'ENH',  name: 'Enhanced Risk',              fill: '#FFA366', stroke: '#FF6600' },
    6: { label: 'MDT',  name: 'Moderate Risk',              fill: '#E06666', stroke: '#CC0000' },
    8: { label: 'HIGH', name: 'High Risk',                  fill: '#EE99EE', stroke: '#CC00CC' },
};

// Even-odd ray cast. `ring` is an array of [lon, lat] positions.
function pointInRing(lon, lat, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0], yi = ring[i][1];
        const xj = ring[j][0], yj = ring[j][1];
        if ((yi > lat) !== (yj > lat) &&
            lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)
            inside = !inside;
    }
    return inside;
}

// `rings` = GeoJSON Polygon coordinates: [outer, hole1, hole2, ...]
function pointInPolygon(lon, lat, rings) {
    if (!rings || rings.length === 0 || !pointInRing(lon, lat, rings[0]))
        return false;
    for (let h = 1; h < rings.length; h++) {
        if (pointInRing(lon, lat, rings[h]))
            return false;
    }
    return true;
}

function pointInGeometry(lon, lat, geometry) {
    if (!geometry || !geometry.coordinates)
        return false;
    switch (geometry.type) {
    case 'Polygon':
        return pointInPolygon(lon, lat, geometry.coordinates);
    case 'MultiPolygon':
        return geometry.coordinates.some(rings => pointInPolygon(lon, lat, rings));
    default:
        return false;
    }
}

// Returns the containing feature with the highest DN, or null if the point
// is outside every risk area (or the collection is empty). Picking the max
// DN works for both the layered (overlapping) and non-layered files.
function classify(geojson, lat, lon) {
    const features = (geojson && Array.isArray(geojson.features)) ? geojson.features : [];
    let best = null;
    for (const f of features) {
        const dn = f && f.properties ? Number(f.properties.DN) : NaN;
        if (!Number.isFinite(dn))
            continue;
        if ((best === null || dn > Number(best.properties.DN)) &&
            pointInGeometry(lon, lat, f.geometry))
            best = f;
    }
    return best;
}

// First feature's properties carry the outlook-wide times; useful on days
// where we're outside every polygon but still want valid/issue times.
function collectionProps(geojson) {
    const features = (geojson && Array.isArray(geojson.features)) ? geojson.features : [];
    return features.length > 0 && features[0].properties ? features[0].properties : null;
}

// Parse an SPC time. Live files have VALID_ISO etc.; archived files only
// have VALID = "YYYYMMDDHHMM" (UTC). Returns a GLib.DateTime (UTC) or null.
function parseSpcTime(props, key) {
    if (!props)
        return null;
    const iso = props[key + '_ISO'];
    if (typeof iso === 'string' && iso.length > 0) {
        const dt = GLib.DateTime.new_from_iso8601(iso, null);
        if (dt)
            return dt;
    }
    const raw = props[key];
    if (raw === undefined || raw === null)
        return null;
    const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(String(raw));
    if (!m)
        return null;
    return GLib.DateTime.new_utc(+m[1], +m[2], +m[3], +m[4], +m[5], 0);
}

// Only accept plain hex colors from the feed before putting them in CSS.
function safeColor(value, fallback) {
    return (typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value)) ? value : fallback;
}
