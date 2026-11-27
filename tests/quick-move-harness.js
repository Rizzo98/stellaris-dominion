#!/usr/bin/env node
/* ============================================================
   QUICK-MOVE HARNESS — long press a hex, pick a ship, pick a destination
   The app intentionally has no build step, so this harness loads the classic
   browser scripts in a Node VM with tiny UI stubs. Run it with:

       node tests/quick-move-harness.js

   It covers the long-press routing (no ships, one ship, several ships),
   the picker hand-off, the ordered-stop gesture while a route is pending,
   the phase guards, the sheet markup and the fact that the quick path lands
   in the same state.ui.move pipeline the fleet tab uses. It does not simulate
   pointers; see the README for the headless-Chrome check of the gesture.
   ============================================================ */

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const root = path.resolve(__dirname, "..");
const files = [
  "js/data/config.js",
  "js/data/ethics.js",
  "js/data/buildings.js",
  "js/data/structures.js",
  "js/data/ships.js",
  "js/data/empires.js",
  "js/data/techs.js",
  "js/data/events.js",
  "js/data/anomalies.js",
  "js/data/resources.js",
  "js/data/systems.js",
  "js/core/rng.js",
  "js/core/galaxy.js",
  "js/core/state.js",
  "js/core/run-rules.js",
  "js/core/helpers.js",
  "js/core/colony.js",
  "js/core/colony-economy.js",
  "js/core/hex-grid.js",
  "js/core/empires.js",
  "js/core/combat.js",
  "js/core/rival-ai.js",
  "js/core/effects.js",
  "js/core/survey.js",
  "js/core/event-engine.js",
  "js/core/trade.js",
  "js/core/economy.js",
  "js/ui/sheet-content.js",
  "js/game/quick-move.js"
];

let checks = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  checks += 1;
}
function eq(actual, expected, message) {
  assert.strictEqual(actual, expected, message + " (got " + actual + ", want " + expected + ")");
  checks += 1;
}

function createContext() {
  const context = {
    console: console,
    Math: Math,
    Date: Date,
    JSON: JSON,
    Set: Set,
    Map: Map,
    Object: Object,
    Array: Array,
    Number: Number,
    String: String,
    Boolean: Boolean,
    isFinite: isFinite,
    parseInt: parseInt,
    parseFloat: parseFloat,
    performance: { now: function () { return 0; } },
    setTimeout: function () { return 0; },
    clearTimeout: function () {},
    document: {
      querySelector: function () { return null; },
      querySelectorAll: function () { return []; },
      getElementById: function () { return null; },
      addEventListener: function () {}
    },
    window: {},
    els: {},
    toastLog: [],
    sheetLog: [],
    toast: function (message) { context.toastLog.push(String(message)); },
    openQuickMoveSheet: function (ships, hexKeyValue, sectorId) {
      context.sheetLog.push({ ships: ships, hexKey: hexKeyValue, sectorId: sectorId });
    },
    renderAll: function () {}
  };
  vm.createContext(context);
  files.forEach(function (file) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
  });
  /* Stand-in for planet-nav.js: the real beginFleetMove validates the
     selection against the hex and paints the move banner. The harness only
     needs the state hand-off it performs, so the quick path can be checked
     without the renderers. */
  vm.runInContext("closeSheet = function () { state.ui.sheet = null; };", context);
  vm.runInContext(
    "beginFleetMove = function () {" +
    "  var pos = parseHexKey(state.ui.selectedHex);" +
    "  var fleet = getFleetAt(pos.row, pos.col);" +
    "  var ids = state.ui.shipSelection.filter(function (id) {" +
    "    return fleet.some(function (ship) { return ship.id === id; });" +
    "  });" +
    "  if (!ids.length) return;" +
    "  state.ui.move = { sectorId: state.ui.activeSector, from: state.ui.selectedHex, ids: ids.slice() };" +
    "  state.ui.shipSelection = [];" +
    "  state.ui.selectedHex = null;" +
    "  state.ui.activeTab = 'map';" +
    "};",
    context
  );
  return context;
}

const context = createContext();
function run(code) {
  return vm.runInContext(code, context);
}

function homeSector() {
  return run("state.galaxy.sectors.filter(function (s) { return s.home; })[0]");
}
function homeHex() {
  const sector = homeSector();
  return { row: sector.entryRow, col: sector.entryCol, key: run("hexKey(" + sector.entryRow + "," + sector.entryCol + ")") };
}
function reset() {
  context.toastLog = [];
  context.sheetLog = [];
  run("state = createInitialState(null);");
  run("state.phase = 'actions';");
  run("state.ui.activeSector = state.galaxy.sectors.filter(function (s) { return s.home; })[0].id;");
  run("state.ui.mapMode = 'sector';");
  run("state.ui.move = null;");
  run("state.ui.shipSelection = [];");
  run("state.ui.selectedHex = null;");
  run("state.ui.sheet = null;");
}
/* Replace the home hex fleet with a known set so each case is explicit. */
function stageFleet(count) {
  const hex = homeHex();
  const ships = [];
  for (let i = 0; i < count; i += 1) {
    ships.push(count === 1 && i === 0 ? "corvette" : ["corvette", "science", "builder"][i % 3]);
  }
  run("(function () {" +
    "  var sector = state.galaxy.sectors.filter(function (s) { return s.home; })[0];" +
    "  sector.fleets['" + hex.key + "'] = [" +
    ships.map(function (type) {
      return "createShip('" + type + "', { id: 'test-" + type + "' })";
    }).join(",") +
    "];" +
    "})()");
  return run("getFleetAt(" + hex.row + "," + hex.col + ")").map(function (ship) { return ship.id; });
}

/* ---------- 1. no ships: the hold explains itself and consumes the gesture ---------- */
reset();
const empty = (function () {
  const sector = homeSector();
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 6; col += 1) {
      const fleet = run("getFleetAt(" + row + "," + col + ")");
      if (!fleet.length) return { row: row, col: col };
    }
  }
  return null;
})();
ok(empty, "found an empty hex to hold");
const noShipsResult = run("handleHexLongPress(" + empty.row + "," + empty.col + ")");
eq(noShipsResult, true, "a hold on an empty hex is consumed, so the tap does not also open the dossier");
eq(context.sheetLog.length, 0, "no ship picker opens for an empty hex");
ok(context.toastLog.length === 1 && /No ships/.test(context.toastLog[0]), "the empty hex raises an explanatory toast");
eq(run("state.ui.move"), null, "no route order starts from an empty hex");

/* ---------- 2. one ship: straight to the final-destination step ---------- */
reset();
const solo = stageFleet(1);
eq(solo.length, 1, "staged exactly one ship in the home hex");
const soloResult = run("handleHexLongPress(" + homeHex().row + "," + homeHex().col + ")");
eq(soloResult, true, "a hold on a single-ship hex is consumed");
eq(context.sheetLog.length, 0, "a single ship skips the picker");
ok(run("state.ui.move") !== null, "a single ship enters the route order at once");
eq(run("state.ui.move.ids.length"), 1, "the order carries one ship");
eq(run("state.ui.move.ids[0]"), solo[0], "the order carries the ship that was in the hex");
eq(run("state.ui.move.from"), homeHex().key, "the order starts in the held hex");
eq(run("state.ui.selectedHex"), null, "the dossier selection is cleared, so the map owns the next tap");
ok(context.toastLog.some(function (message) { return /tap a final hex/.test(message); }), "the toast names the final-destination step");
ok(context.toastLog.some(function (message) { return /hold hexes to add stops/.test(message); }), "the toast advertises the stop gesture");

/* ---------- 3. several ships: the picker opens and carries every ship ---------- */
reset();
const trio = stageFleet(3);
const trioResult = run("handleHexLongPress(" + homeHex().row + "," + homeHex().col + ")");
eq(trioResult, true, "a hold on a multi-ship hex is consumed");
eq(context.sheetLog.length, 1, "a multi-ship hex opens the picker exactly once");
eq(context.sheetLog[0].hexKey, homeHex().key, "the picker remembers the held hex");
eq(context.sheetLog[0].sectorId, run("state.ui.activeSector"), "the picker remembers the sector");
eq(context.sheetLog[0].ships.length, 3, "the picker lists every ship in the hex");
eq(run("state.ui.move"), null, "opening the picker does not start a route order yet");

/* ---------- 4. the picker row hands its ship to the same pipeline ---------- */
reset();
const picked = stageFleet(3);
run("state.ui.sheet = { kind: 'quick-move', hexKey: '" + homeHex().key + "', sectorId: state.ui.activeSector };");
const selectResult = run("selectQuickMoveShip('" + picked[1] + "')");
eq(selectResult, true, "picking a row starts the quick move");
eq(run("state.ui.sheet"), null, "picking a row closes the picker");
eq(run("state.ui.move.ids.length"), 1, "picking a row orders one ship");
eq(run("state.ui.move.ids[0]"), picked[1], "the picked ship is the one that moves");
eq(context.sheetLog.length, 0, "a row selection does not reopen the picker");

/* ---------- 5. a pending order turns the next hold into an ordered stop ---------- */
reset();
stageFleet(3);
const pendingOrigin = homeHex();
const pendingStop = (function () {
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 6; col += 1) {
      if (row !== pendingOrigin.row || col !== pendingOrigin.col) {
        return { row: row, col: col, key: run("hexKey(" + row + "," + col + ")") };
      }
    }
  }
  return null;
})();
run("state.ui.move = { sectorId: state.ui.activeSector, from: '" + pendingOrigin.key + "', ids: [] };");
const pendingResult = run("handleHexLongPress(" + pendingStop.row + "," + pendingStop.col + ")");
eq(pendingResult, true, "a long press during a pending order adds a stop and swallows its release click");
eq(context.sheetLog.length, 0, "no picker opens during a pending order");
eq(run("state.ui.move") !== null, true, "the pending order survives the hold");
eq(run("state.ui.move.stops.length"), 1, "the held hex is recorded as the first stop");
eq(run("state.ui.move.stops[0]"), pendingStop.key, "the stop is stored in journey order");
ok(run("state.ui.move.previewPath") !== null, "adding a stop previews the leg to it");
ok(context.toastLog.some(function (message) { return /Stop 1 added/.test(message); }), "the stop toast names the order");
const pendingOriginResult = run("handleHexLongPress(" + pendingOrigin.row + "," + pendingOrigin.col + ")");
eq(pendingOriginResult, true, "holding the origin during a pending order is handled, not routed");
eq(run("state.ui.move.stops.length"), 1, "the origin is never appended as a stop");
ok(context.toastLog.some(function (message) { return /origin hex is the start/.test(message); }), "the origin hold explains itself");
const duplicateResult = run("handleHexLongPress(" + pendingStop.row + "," + pendingStop.col + ")");
eq(duplicateResult, true, "holding an existing stop is handled");
eq(run("state.ui.move.stops.length"), 1, "an existing stop is not added twice");
ok(context.toastLog.some(function (message) { return /already stop 1/.test(message); }), "the duplicate hold names the existing stop");
const pendingStop2 = (function () {
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 6; col += 1) {
      const key = run("hexKey(" + row + "," + col + ")");
      if (key !== pendingOrigin.key && key !== pendingStop.key) {
        return { row: row, col: col, key: key };
      }
    }
  }
  return null;
})();
const secondStopResult = run("handleHexLongPress(" + pendingStop2.row + "," + pendingStop2.col + ")");
eq(secondStopResult, true, "a second hold adds the next stop");
eq(run("state.ui.move.stops.length"), 2, "the journey keeps every stop");
eq(run("state.ui.move.stops[0]"), pendingStop.key, "the first stop keeps its position");
eq(run("state.ui.move.stops[1]"), pendingStop2.key, "the second stop follows it");
eq(run("state.ui.move.previewDestination"), pendingStop2.key, "the preview ends at the newest stop");
ok(run("buildJourneyPath(state.ui.move.from, state.ui.move.stops).length") > 0,
  "the journey path can be built through both stops");

/* ---------- 6. guards: wrong phase, wrong view, outside the grid ---------- */
reset();
run("state.phase = 'event';");
eq(run("handleHexLongPress(" + homeHex().row + "," + homeHex().col + ")"), false, "an event phase declines the hold");
reset();
run("state.ui.mapMode = 'galaxy';");
eq(run("handleHexLongPress(" + homeHex().row + "," + homeHex().col + ")"), false, "the galaxy view declines the hold");
reset();
eq(run("handleHexLongPress(9, 9)"), false, "a hex outside the grid declines the hold");

/* ---------- 7. a stale ship id is refused, not moved ---------- */
reset();
stageFleet(1);
eq(run("startQuickMove('ghost-ship', '" + homeHex().key + "')"), false, "a ship that is not in the hex is refused");
ok(context.toastLog.some(function (message) { return /no longer in this hex/.test(message); }), "the stale ship raises a toast");
eq(run("state.ui.move"), null, "a refused ship starts no route order");

/* ---------- 8. the picker markup: one action row per ship ---------- */
reset();
const markupShips = stageFleet(3);
const markup = run("quickMoveSheetHTML(getFleetAt(" + homeHex().row + "," + homeHex().col + "))");
const rowCount = (markup.match(/data-quick-move-ship=/g) || []).length;
eq(rowCount, 3, "the picker renders one row per ship");
markupShips.forEach(function (id) {
  ok(markup.indexOf('data-quick-move-ship="' + id + '"') !== -1, "the picker carries the ship id " + id);
});
ok(/quick-move-arrow/.test(markup), "each row advertises the destination hand-off");
ok(/stationed here/.test(markup), "the picker explains what the rows do");
eq((markup.match(/ship-row-icon/g) || []).length, 3, "the picker reuses the fleet-tab hull icons");
console.log("quick-move harness: " + checks + " checks passed");
