// Standalone test for spcgeo.js. Run from the repo root:
//     cjs tests/classify-test.js
// Exits non-zero on failure.

const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;

const testsDir = GLib.path_get_dirname(Gio.File.new_for_path(
    imports.system.programInvocationName || 'tests/classify-test.js').get_path());
const repoDir = GLib.path_get_dirname(testsDir);
imports.searchPath.unshift(repoDir);
const SpcGeo = imports.spcgeo;

let passed = 0, failed = 0;
function check(name, actual, expected) {
    if (actual === expected) {
        passed++;
        print(`  ok   ${name}`);
    } else {
        failed++;
        print(`  FAIL ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
}

function loadFixture(name) {
    const [ok, bytes] = GLib.file_get_contents(`${testsDir}/fixtures/${name}`);
    if (!ok)
        throw new Error(`cannot read fixture ${name}`);
    return JSON.parse(new TextDecoder('utf-8').decode(bytes));
}

function labelAt(geojson, lat, lon) {
    const f = SpcGeo.classify(geojson, lat, lon);
    return f ? f.properties.LABEL : 'NONE';
}

// --- synthetic geometry -----------------------------------------------------
print('synthetic geometry');
const square = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
const donut = { type: 'Polygon', coordinates: [square(0, 0, 10, 10), square(4, 4, 6, 6)] };
check('donut: in ring',          SpcGeo.pointInGeometry(2, 2, donut), true);
check('donut: in hole',          SpcGeo.pointInGeometry(5, 5, donut), false);
check('donut: outside',          SpcGeo.pointInGeometry(11, 5, donut), false);

const multi = { type: 'MultiPolygon', coordinates: [[square(0, 0, 1, 1)], [square(5, 5, 6, 6), square(5.4, 5.4, 5.6, 5.6)]] };
check('multi: first part',       SpcGeo.pointInGeometry(0.5, 0.5, multi), true);
check('multi: second part',      SpcGeo.pointInGeometry(5.2, 5.2, multi), true);
check('multi: hole in second',   SpcGeo.pointInGeometry(5.5, 5.5, multi), false);
check('multi: between parts',    SpcGeo.pointInGeometry(3, 3, multi), false);
check('unknown geometry type',   SpcGeo.pointInGeometry(0.5, 0.5, { type: 'Point', coordinates: [0.5, 0.5] }), false);

// Overlapping (layered-style) features: highest DN wins.
const layered = { type: 'FeatureCollection', features: [
    { properties: { DN: 2, LABEL: 'TSTM' }, geometry: { type: 'Polygon', coordinates: [square(0, 0, 10, 10)] } },
    { properties: { DN: 4, LABEL: 'SLGT' }, geometry: { type: 'Polygon', coordinates: [square(2, 2, 8, 8)] } },
    { properties: { DN: 3, LABEL: 'MRGL' }, geometry: { type: 'Polygon', coordinates: [square(1, 1, 9, 9)] } },
] };
check('layered: innermost wins', labelAt(layered, 5, 5), 'SLGT');
check('layered: middle',         labelAt(layered, 1.5, 1.5), 'MRGL');
check('layered: outer',          labelAt(layered, 0.5, 0.5), 'TSTM');

check('empty features -> NONE',  labelAt({ type: 'FeatureCollection', features: [] }, 40, -86), 'NONE');
check('null geojson -> NONE',    labelAt(null, 40, -86), 'NONE');

// --- real archived outlook: 2024-05-06 1630Z (HIGH risk in OK) --------------
print('archived outlook 2024-05-06 1630Z');
const arch = loadFixture('day1otlk_20240506_1630_cat.nolyr.geojson');
const cities = [
    ['Oklahoma City (in MDT hole)', 35.47, -97.52, 'HIGH'],
    ['Wichita',                     37.69, -97.34, 'MDT'],
    ['Tulsa',                       36.15, -95.99, 'MDT'],
    ['Kansas City',                 39.10, -94.58, 'ENH'],
    ['Omaha',                       41.26, -95.94, 'SLGT'],
    ['Des Moines',                  41.59, -93.62, 'SLGT'],
    ['Dallas',                      32.78, -96.80, 'MRGL'],
    ['Chicago',                     41.88, -87.63, 'TSTM'],
    ['West Lafayette',              40.43, -86.91, 'TSTM'],
    ['Seattle',                     47.61, -122.33, 'TSTM'],
    ['Denver',                      39.74, -104.99, 'NONE'],
    ['Miami',                       25.76, -80.19, 'NONE'],
];
for (const [name, lat, lon, want] of cities)
    check(name, labelAt(arch, lat, lon), want);

const mrgl = arch.features.find(f => f.properties.LABEL === 'MRGL');
check('Omaha is inside MRGL hole', SpcGeo.pointInGeometry(-95.94, 41.26, mrgl.geometry), false);

// Archived files have no *_ISO fields; compact form must parse.
const archValid = SpcGeo.parseSpcTime(SpcGeo.collectionProps(arch), 'VALID');
check('compact VALID parses',    archValid ? archValid.format('%Y-%m-%dT%H:%MZ') : null, '2024-05-06T16:30Z');

// --- live-format file (has *_ISO fields) -----------------------------------
print('live-format outlook 2026-11-16');
const live = loadFixture('day1otlk_20261116_live_cat.nolyr.geojson');
const liveIssue = SpcGeo.parseSpcTime(SpcGeo.collectionProps(live), 'ISSUE');
check('ISO ISSUE parses',        liveIssue ? liveIssue.to_utc().format('%Y-%m-%dT%H:%MZ') : null, '2026-11-16T19:47Z');
check('safeColor accepts hex',   SpcGeo.safeColor('#C1E9C1', 'x'), '#C1E9C1');
check('safeColor rejects junk',  SpcGeo.safeColor('red; font-size: 99px', '#888888'), '#888888');

print(`\n${passed} passed, ${failed} failed`);
if (failed > 0)
    imports.system.exit(1);
