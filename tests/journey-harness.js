#!/usr/bin/env node
/* ============================================================
   JOURNEY HARNESS — ordered stops for fleet movement
   The app intentionally has no build step, so this harness loads the classic
   browser scripts in a Node VM with tiny UI stubs. Run it with:

       node tests/journey-harness.js

   It covers the planner state, the long-press stop gesture, stop ordering,
   undo, final-tap completion, turn-by-turn advancement through every stop and
   the cleanup of the route when it finishes or the ship changes orders.
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
  "js/game/planet-nav.js",
  "js/game/quick-move.js",
  "js/game/military-actions.js",
  "js/game/turn.js"
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
function samePath(actual, expected, message) {
  assert.strictEqual(JSON.stringify(actual), JSON.stringify(expected), message +
    " (got " + JSON.stringify(actual) + ", want " + JSON.stringify(expected) + ")");
  checks += 1;
}

function fakeElement() {
  return {
    innerHTML: "",
    textContent: "",
    style: {},
    attributes: {},
    classList: {
      set: new Set(),
      add: function () {
        for (let i = 0; i < arguments.length; i += 1) this.set.add(arguments[i]);
      },
      remove: function () {
        for (let i = 0; i < arguments.length; i += 1) this.set.delete(arguments[i]);
      },
      toggle: function (name, force) {
        const next = force === undefined ? !this.set.has(name) : !!force;
        if (next) this.set.add(name);
        else this.set.delete(name);
        return next;
      },
      contains: function (name) { return this.set.has(name); }
    },
    setAttribute: function (key, value) { this.attributes[key] = String(value); },
    getAttribute: function (key) {
      return Object.prototype.hasOwnProperty.call(this.attributes, key) ? this.attributes[key] : null;
    },
    removeAttribute: function (key) { delete this.attributes[key]; },
    addEventListener: function () {},
    removeEventListener: function () {},
    focus: function () {},
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    getBoundingClientRect: function () { return { left: 0, top: 0, width: 0, height: 0 }; },
    dataset: {}
  };
}

function createContext() {
  const elements = {};
  const els = new Proxy(elements, {
    get: function (target, prop) {
      if (typeof prop === "symbol") return undefined;
      if (!Object.prototype.hasOwnProperty.call(target, prop)) target[prop] = fakeElement();
      return target[prop];
    }
  });
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
    requestAnimationFrame: function () { return 0; },
    setTimeout: function () { return 0; },
    clearTimeout: function () {},
    document: {
      querySelector: function () { return null; },
      querySelectorAll: function () { return []; },
      getElementById: function () { return null; },
      addEventListener: function () {}
    },
    window: {},
    els: els
  };
  vm.createContext(context);
  files.forEach(function (file) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
  });
  vm.runInContext(`
    var toastMessages = [];
    function toast(message) { toastMessages.push(message); }
    function closeSheet() {}
    function openSheet() {}
    function hideToast() {}
    function renderAll() {}
    function renderPlanet() {}
    function renderMap() {}
    function renderTopbar() {}
    function renderNav() {}
    function setResourceTexts() {}
    function openQuickMoveSheet() {}

    function freshRun() {
      state = createInitialState(null);
      state.phase = "actions";
      state.ethic = null;
      state.empires = [];
      state.turn = 1;
      state.ui.activeTab = "map";
      state.ui.mapMode = "sector";
      state.ui.activeSector = "sec-core";
      state.ui.selectedHex = null;
      state.ui.selectedSystem = null;
      state.ui.selectedTab = "world";
      state.ui.shipSelection = [];
      state.ui.move = null;
      state.ui.sheet = null;
      state.galaxy.sectors.forEach(function (sector) {
        sector.fleets = {};
        sector.rivalFleets = {};
        sector.structures = {};
        sector.explored = {};
        sector.economy = { energy: 0, minerals: 0 };
        sector.carry = { energy: 0, minerals: 0 };
        sector.gateOps = null;
      });
      toastMessages.length = 0;
      return state;
    }

    function addShip(sectorId, key, type, id) {
      const ship = createShip(type, { id: id, name: id, owner: "player" });
      const sector = getSector(sectorId);
      sector.fleets[key] = (sector.fleets[key] || []).concat(ship);
      return ship;
    }
  `, context);
  return context;
}

const context = createContext();
function run(code) {
  return vm.runInContext(code, context);
}

const ORIGIN = { row: 0, col: 0, key: "0,0" };
const STOP_A = { row: 0, col: 5, key: "0,5" };
const STOP_B = { row: 3, col: 0, key: "3,0" };
const FINAL = { row: 2, col: 2, key: "2,2" };

function journey(fromKey, stopKeys) {
  return run("buildJourneyPath(" + JSON.stringify(fromKey) + ", " + JSON.stringify(stopKeys) + ")");
}
function beginOrder(id) {
  run("freshRun()");
  run("addShip('sec-core', " + JSON.stringify(ORIGIN.key) + ", 'corvette', " + JSON.stringify(id) + ")");
  run("state.ui.selectedHex = " + JSON.stringify(ORIGIN.key) + "; state.ui.shipSelection = [" + JSON.stringify(id) + "];");
  run("beginFleetMove()");
}
function moveState() {
  return run("state.ui.move");
}
function ship(id) {
  return run("findShipLocation(" + JSON.stringify(id) + ").ship");
}

/* ---------- 1. starting a route opens an empty stop list ---------- */
beginOrder("journey-a");
ok(moveState() !== null, "beginFleetMove opens a route order");
eq(run("state.ui.move.from"), ORIGIN.key, "the order starts in the selected hex");
eq(run("state.ui.move.stops.length"), 0, "a fresh order has no stops yet");
eq(run("state.ui.move.previewPath"), null, "a fresh order draws no preview");
eq(run("state.ui.selectedHex"), null, "the dossier selection is cleared for the map gesture");

/* ---------- 2. the first hold adds the first stop ---------- */
const firstHold = run("handleHexLongPress(" + STOP_A.row + "," + STOP_A.col + ")");
eq(firstHold, true, "a hold during a route order consumes its release click");
eq(run("state.ui.move.stops.length"), 1, "the first hold adds one stop");
eq(run("state.ui.move.stops[0]"), STOP_A.key, "the stop keeps the held hex");
samePath(run("state.ui.move.previewPath"), journey(ORIGIN.key, [STOP_A.key]),
  "the preview runs from the origin to the first stop");
eq(run("state.ui.move.previewDestination"), STOP_A.key, "the preview ends at the stop");
ok(run("toastMessages.join(' ')").indexOf("Stop 1 added") !== -1, "the stop toast counts the stops");

/* ---------- 3. a second hold appends the next stop in order ---------- */
run("handleHexLongPress(" + STOP_B.row + "," + STOP_B.col + ")");
eq(run("state.ui.move.stops.length"), 2, "the second hold adds a second stop");
eq(run("state.ui.move.stops[1]"), STOP_B.key, "the new stop follows the first");
samePath(run("state.ui.move.previewPath"), journey(ORIGIN.key, [STOP_A.key, STOP_B.key]),
  "the preview is rerouted through both stops in order");

/* ---------- 4. undo removes the newest stop and keeps the order intact ---------- */
run("undoFleetMoveStop()");
eq(run("state.ui.move.stops.length"), 1, "undo removes one stop");
eq(run("state.ui.move.stops[0]"), STOP_A.key, "undo keeps the earlier stop");
samePath(run("state.ui.move.previewPath"), journey(ORIGIN.key, [STOP_A.key]),
  "undo rewinds the preview to the remaining stop");
run("handleHexLongPress(" + STOP_B.row + "," + STOP_B.col + ")");
eq(run("state.ui.move.stops.length"), 2, "the re-added stop is restored in order");

/* ---------- 5. a single tap closes the journey at the final hex ---------- */
const expectedJourney = journey(ORIGIN.key, [STOP_A.key, STOP_B.key, FINAL.key]);
run("handleHexTap(" + FINAL.row + "," + FINAL.col + ")");
eq(run("state.ui.move"), null, "the final tap closes the route order");
const ordered = ship("journey-a");
ok(ordered, "the ordered ship still exists");
samePath(ordered.path, expectedJourney, "the ship carries the full route through every stop");
eq(ordered.pathSectorId, "sec-core", "the route is bound to the sector");
samePath(ordered.pathStops, [STOP_A.key, STOP_B.key], "the ordered route remembers its stops");
eq(ordered.patrol, false, "ordering a route stands patrol down");
ok(run("toastMessages.join(' ')").indexOf("2 stops") !== -1, "the order toast counts the stops");
ok(run("toastMessages.join(' ')").indexOf("" + expectedJourney.length + " hexes") !== -1,
  "the order toast reports the full path length");

/* ---------- 6. tapping the last stop promotes it to the final destination ---------- */
beginOrder("journey-promote");
run("handleHexLongPress(" + STOP_A.row + "," + STOP_A.col + ")");
run("handleHexTap(" + STOP_A.row + "," + STOP_A.col + ")");
eq(run("state.ui.move"), null, "a tap on the last stop also closes the order");
const promoted = ship("journey-promote");
samePath(promoted.path, journey(ORIGIN.key, [STOP_A.key]),
  "the promoted tap routes to that hex without an extra leg");
eq(promoted.pathStops, undefined, "a promoted stop is no longer an intermediate stop");

/* ---------- 7. an earlier stop cannot be mistaken for the final hex ---------- */
beginOrder("journey-earlier");
run("handleHexLongPress(" + STOP_A.row + "," + STOP_A.col + ")");
run("handleHexLongPress(" + STOP_B.row + "," + STOP_B.col + ")");
run("handleHexTap(" + STOP_A.row + "," + STOP_A.col + ")");
ok(run("state.ui.move") !== null, "tapping an earlier stop leaves the order open");
eq(run("state.ui.move.stops.length"), 2, "the stop order is unchanged");
ok(run("toastMessages.join(' ')").indexOf("already stop 1") !== -1,
  "the refusal names the earlier stop");

/* ---------- 8. the origin is never a final destination ---------- */
run("handleHexTap(" + ORIGIN.row + "," + ORIGIN.col + ")");
ok(run("state.ui.move") !== null, "tapping the origin leaves the order open");
ok(run("toastMessages.join(' ')").indexOf("other than the origin") !== -1,
  "the refusal explains the origin choice");

/* ---------- 9. a direct tap still orders a plain route ---------- */
beginOrder("journey-direct");
run("handleHexTap(" + FINAL.row + "," + FINAL.col + ")");
eq(run("state.ui.move"), null, "a direct final tap closes the order");
const direct = ship("journey-direct");
samePath(direct.path, journey(ORIGIN.key, [FINAL.key]), "a stopless journey is a direct route");
eq(direct.pathStops, undefined, "a stopless journey carries no stop metadata");

/* ---------- 10. the turn engine follows the stops in order ---------- */
beginOrder("journey-turn");
run("handleHexLongPress(0,1)");
run("handleHexTap(2,2)");
const turnPath = ship("journey-turn").path.slice();
eq(turnPath[0], "0,1", "the first routed hex is the adjacent stop");
eq(ship("journey-turn").pathStops.length, 1, "the turn route keeps its stop");
let arrivedAt = null;
for (let step = 0; step < turnPath.length; step += 1) {
  run("advanceShipOrders()");
  arrivedAt = run("findShipLocation('journey-turn')");
  eq(arrivedAt.key, turnPath[step], "movement step " + (step + 1) + " follows the routed hex order");
  if (step === 0) {
    eq(run("getRemainingPathStops(findShipLocation('journey-turn').ship).length"), 0,
      "a stop drops out of the remaining list once the ship reaches it");
  }
}
eq(arrivedAt.key, FINAL.key, "the ship ultimately reaches the final destination");
eq(arrivedAt.ship.path, undefined, "a finished route leaves no path behind");
eq(arrivedAt.ship.pathSectorId, undefined, "a finished route leaves no sector binding");
eq(arrivedAt.ship.pathStops, undefined, "a finished route leaves no stop metadata");

/* ---------- 11. patrol and jump orders clear a queued journey ---------- */
run("freshRun()");
run("addShip('sec-core', '0,0', 'corvette', 'journey-patrol')");
run("(function(){ var s = getFleetAt(0,0,'sec-core')[0]; s.path = ['0,1']; s.pathSectorId = 'sec-core'; s.pathStops = ['0,1']; state.ui.selectedHex = '0,0'; state.ui.shipSelection = ['journey-patrol']; })()");
run("setSelectedShipsPatrol(true)");
eq(run("getFleetAt(0,0,'sec-core')[0].patrol"), true, "patrol is set");
eq(run("getFleetAt(0,0,'sec-core')[0].path"), undefined, "patrol clears the queued route");
eq(run("getFleetAt(0,0,'sec-core')[0].pathStops"), undefined, "patrol clears the stop metadata");

run("freshRun()");
run("setSectorStock('sec-core', 'energy', 20)");
run("(function(){ var sector = getSector('sec-core'); sector.structures['0,0'] = { type: 'gate', owner: 'player', underConstruction: false, key: '0,0', sectorId: 'sec-core' }; })()");
run("addShip('sec-core', '0,0', 'corvette', 'journey-jump')");
run("(function(){ var s = getFleetAt(0,0,'sec-core')[0]; s.path = ['0,1']; s.pathSectorId = 'sec-core'; s.pathStops = ['0,1']; state.ui.selectedHex = '0,0'; state.ui.shipSelection = ['journey-jump']; })()");
const jumpTarget = run("getSector('sec-core').neighbors[0]");
run("jumpFleetToSector(" + JSON.stringify(jumpTarget) + ")");
const jumped = run("findShipLocation('journey-jump')");
eq(jumped.sectorId, jumpTarget, "the gate jump moves the ship to the target sector");
eq(jumped.ship.path, undefined, "the jump clears the queued route");
eq(jumped.ship.pathStops, undefined, "the jump clears the stop metadata");

console.log("journey harness: " + checks + " checks passed");
