#!/usr/bin/env node
/* ============================================================
   SECTOR NAME HARNESS — fog gates around charts, presence and power
   The app intentionally has no build step, so this harness loads the
   classic browser scripts in a Node VM with tiny UI stubs. Run it with:

       node tests/name-harness.js

   It covers the home/charted name sources, the one-lane halo published by a
   charted sector or by player presence, the promise that a name alone does
   not chart a sector, the exclusion of rival presence, the power gate that
   needs the player to be active in the sector right now, and the promise
   that every trade destination is a named sector.
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
  "js/core/economy.js"
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
    els: {},
    toast: function () {},
    renderAll: function () {},
    renderMap: function () {},
    renderNav: function () {},
    setResourceTexts: function () {},
    hideToast: function () {},
    closeSheet: function () {},
    showEventLayer: function () {},
    hideEventLayer: function () {}
  };
  vm.createContext(context);
  files.forEach(function (file) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
  });
  vm.runInContext(`
    function freshNames() {
      state = createInitialState(null);
      state.phase = "actions";
      state.ethic = null;
      state.tech.active = null;
      state.ui.activeSector = state.galaxy.sectors.find(function (sector) {
        return sector.home;
      }).id;
      state.ui.mapMode = "galaxy";
      state.ui.activeTab = "map";
      state.ui.selectedHex = null;
      state.ui.selectedSystem = null;
      state.ui.shipSelection = [];
      state.ui.move = null;
      return state;
    }

    function emptyStructureKey(sector) {
      for (let row = 0; row < CONFIG.sector.rows; row += 1) {
        for (let col = 0; col < CONFIG.sector.cols; col += 1) {
          const key = row + "," + col;
          if (!sector.structures[key]) return key;
        }
      }
      return "0,0";
    }

    function putPlayerStructure(sector, type, extra) {
      const key = emptyStructureKey(sector);
      const structure = Object.assign({
        type: type,
        owner: "player",
        underConstruction: false,
        key: key,
        sectorId: sector.id
      }, extra || {});
      sector.structures[key] = structure;
      return structure;
    }

    function playerGate(sector) {
      return putPlayerStructure(sector, "gate");
    }

    function playerCenter(sector) {
      return putPlayerStructure(sector, "trading", {
        trade: { targetSectorId: null, energy: 0, minerals: 0 }
      });
    }

    function unknownRemote(minRing) {
      return state.galaxy.sectors.find(function (sector) {
        return sector.ring >= minRing && !isSectorNameKnown(sector.id);
      }) || null;
    }
  `, context, { filename: "name-harness-helpers" });
  return context;
}

const context = createContext();
function run(code) {
  return vm.runInContext(code, context);
}

function testHomeAndFarNames() {
  run("freshNames();");
  ok(run("isSectorNameKnown(getCurrentSector())"), "the home sector name is known");
  ok(run("getAdjacentSectors(getCurrentSector()).every(function (sector) { return isSectorNameKnown(sector.id); })"),
    "home presence names every immediate neighbour");
  ok(run("state.galaxy.sectors.some(function (sector) { return sector.ring >= 2 && !isSectorNameKnown(sector.id); })"),
    "sectors beyond the home halo start unnamed");

  /* Move the active sector far away. Home names must stay known because the
     capital colony and starting spaceport are permanent presence anchors. */
  const observerId = run("(function () {" +
    "  const observer = state.galaxy.sectors.find(function (sector) {" +
    "    return sector.ring >= 4 && sector.neighbors.every(function (id) { return getSector(id).ring >= 3; });" +
    "  });" +
    "  return observer ? observer.id : null;" +
    "})()");
  ok(observerId, "a far-ring observer sector is available");
  run("state.ui.activeSector = " + JSON.stringify(observerId) + ";");
  ok(run("getAdjacentSectors(getSector('sec-core')).every(function (sector) { return isSectorNameKnown(sector.id); })"),
    "home presence keeps neighbour names known from afar");
}

/* Charting one sector is the player's exploration action: it names the
   sector and the ring around it, and the fog stops after one lane. */
function testChartedHalo() {
  run("freshNames();");
  const targetId = run("(function () {" +
    "  const target = state.galaxy.sectors.find(function (sector) {" +
    "    return sector.ring >= 3 && !isSectorNameKnown(sector.id) &&" +
    "      sector.neighbors.some(function (id) { return !isSectorNameKnown(id); });" +
    "  });" +
    "  return target ? target.id : null;" +
    "})()");
  ok(targetId, "an uncharted sector with unnamed neighbours is available");
  ok(!run("sectorHasCharts(" + JSON.stringify(targetId) + ")"),
    "the chosen sector starts without charts");
  ok(!run("isSectorNameKnown(" + JSON.stringify(targetId) + ")"),
    "the chosen sector starts unnamed");
  ok(run("getSector(" + JSON.stringify(targetId) + ").neighbors.some(function (id) { return !isSectorNameKnown(id); })"),
    "the chosen sector has unnamed neighbours before the chart");

  run("markHexExplored(0, 0, " + JSON.stringify(targetId) + ");");
  ok(run("sectorHasCharts(" + JSON.stringify(targetId) + ")"),
    "a charted hex puts the sector in the player's atlas");
  ok(run("isSectorNameKnown(" + JSON.stringify(targetId) + ")"),
    "a charted sector publishes its own name");
  ok(run("getSector(" + JSON.stringify(targetId) + ").neighbors.every(function (id) { return isSectorNameKnown(id); })"),
    "a charted sector names every immediate neighbour");
  ok(run("state.galaxy.sectors.some(function (sector) {" +
    "  return sector.ring >= 4 && getSector(" + JSON.stringify(targetId) + ").neighbors.indexOf(sector.id) === -1 &&" +
    "    !isSectorNameKnown(sector.id);" +
    "})"), "the chart halo stops after one lane");
}

/* A known name is not a chart: opening a named-but-uncharted neighbour must
   not publish its own neighbours, or clicking around the galaxy would peel
   the fog back one sector at a time. */
function testNameDoesNotChart() {
  run("freshNames();");
  const namedId = run("(function () {" +
    "  const named = state.galaxy.sectors.find(function (sector) {" +
    "    return !sector.home && sector.ring >= 1 && isSectorNameKnown(sector.id) &&" +
    "      !sectorHasCharts(sector) && !sectorHasPlayerPresence(sector) &&" +
    "      sector.neighbors.some(function (id) {" +
    "        const neighbor = getSector(id);" +
    "        return neighbor && !isSectorNameKnown(neighbor.id);" +
    "      });" +
    "  });" +
    "  return named ? named.id : null;" +
    "})()");
  ok(namedId, "a named but uncharted neighbour with unnamed neighbours is available");
  ok(!run("sectorHasCharts(" + JSON.stringify(namedId) + ")"),
    "the name-only sector has no charts");
  ok(!run("isSectorPowerVisible(" + JSON.stringify(namedId) + ")"),
    "a name-only sector publishes no power");
  ok(run("getSector(" + JSON.stringify(namedId) + ").neighbors.some(function (id) { return !isSectorNameKnown(id); })"),
    "the name-only sector leaves its own neighbours unnamed");
  run("state.ui.activeSector = " + JSON.stringify(namedId) + ";");
  ok(run("getSector(" + JSON.stringify(namedId) + ").neighbors.some(function (id) { return !isSectorNameKnown(id); })"),
    "looking at the name-only sector does not name another lane");
  ok(run("getSectorLabel(getSector(" + JSON.stringify(namedId) + ")) === getSector(" +
    JSON.stringify(namedId) + ").name"), "the known name still prints through getSectorLabel");
}

function testOrbitalPresence() {
  run("freshNames();");
  const remoteId = run("(function () {" +
    "  const remote = state.galaxy.sectors.find(function (sector) {" +
    "    return sector.ring >= 3 && !isSectorNameKnown(sector.id) &&" +
    "      sector.neighbors.some(function (id) { return !isSectorNameKnown(id); });" +
    "  });" +
    "  return remote ? remote.id : null;" +
    "})()");
  ok(remoteId, "a remote sector with unnamed neighbours is available");
  ok(!run("isSectorNameKnown(" + JSON.stringify(remoteId) + ")"), "the remote sector starts unnamed");
  ok(run("getSector(" + JSON.stringify(remoteId) + ").neighbors.some(function (id) { return !isSectorNameKnown(id); })"),
    "the remote sector has unnamed neighbours before presence");

  run("playerGate(getSector(" + JSON.stringify(remoteId) + "));");
  ok(run("sectorHasPlayerPresence(getSector(" + JSON.stringify(remoteId) + "))"),
    "a player orbital structure is player presence");
  ok(run("isSectorNameKnown(" + JSON.stringify(remoteId) + ")"),
    "player presence names its own sector");
  ok(run("getSector(" + JSON.stringify(remoteId) + ").neighbors.every(function (id) { return isSectorNameKnown(id); })"),
    "player presence names every immediate neighbour");
  ok(run("state.galaxy.sectors.some(function (sector) {" +
    "  return sector.ring >= 4 && sector.id !== " + JSON.stringify(remoteId) + " &&" +
    "    getSector(" + JSON.stringify(remoteId) + ").neighbors.indexOf(sector.id) === -1 &&" +
    "    !isSectorNameKnown(sector.id);" +
    "})"), "the presence halo stops after one lane");
}

function testSurfaceAndColonyPresence() {
  run("freshNames();");
  const surfaceId = run("(function () {" +
    "  const remote = state.galaxy.sectors.find(function (sector) {" +
    "    return sector.ring >= 3 && !isSectorNameKnown(sector.id) &&" +
    "      getSectorSystems(sector.id).some(function (system) { return !system.owner; });" +
    "  });" +
    "  return remote ? remote.id : null;" +
    "})()");
  ok(surfaceId, "a remote sector with a free system is available");
  run("(function () {" +
    "  const system = getSectorSystems(" + JSON.stringify(surfaceId) + ").find(function (entry) { return !entry.owner; });" +
    "  system.colonized = false;" +
    "  system.slots[0] = { type: 'mine', underConstruction: false };" +
    "})();");
  ok(run("sectorHasPlayerPresence(getSector(" + JSON.stringify(surfaceId) + "))"),
    "a player surface building is player presence");
  ok(run("isSectorNameKnown(" + JSON.stringify(surfaceId) + ")"),
    "a player surface building names its own sector");

  run("freshNames();");
  const colonyId = run("(function () {" +
    "  const remote = state.galaxy.sectors.find(function (sector) {" +
    "    return sector.ring >= 3 && !isSectorNameKnown(sector.id) &&" +
    "      getSectorSystems(sector.id).some(function (system) { return !system.owner; });" +
    "  });" +
    "  return remote ? remote.id : null;" +
    "})()");
  ok(colonyId, "a remote sector with a free system is available for a colony");
  run("(function () {" +
    "  const system = getSectorSystems(" + JSON.stringify(colonyId) + ").find(function (entry) { return !entry.owner; });" +
    "  system.colonized = true;" +
    "  system.population = 1;" +
    "})();");
  ok(run("sectorHasPlayerPresence(getSector(" + JSON.stringify(colonyId) + "))"),
    "a player colony is player presence");
  ok(run("isSectorNameKnown(" + JSON.stringify(colonyId) + ")"),
    "a player colony names its own sector");
  ok(run("getSector(" + JSON.stringify(colonyId) + ").neighbors.every(function (id) { return isSectorNameKnown(id); })"),
    "a player colony names every immediate neighbour");
}

function testIgnoredPresence() {
  run("freshNames();");
  const rivalId = run("(function () {" +
    "  const remote = state.galaxy.sectors.find(function (sector) {" +
    "    return sector.ring >= 3 && !isSectorNameKnown(sector.id) &&" +
    "      Object.keys(sector.structures || {}).length === 0 &&" +
    "      getSectorSystems(sector.id).some(function (system) { return !system.owner; });" +
    "  });" +
    "  return remote ? remote.id : null;" +
    "})()");
  ok(rivalId, "a clear remote sector is available for the rival check");
  run("(function () {" +
    "  const sector = getSector(" + JSON.stringify(rivalId) + ");" +
    "  sector.structures['1,1'] = { type: 'stronghold', owner: 'empire-test', underConstruction: false, key: '1,1', sectorId: sector.id };" +
    "  const system = getSectorSystems(sector.id).find(function (entry) { return !entry.owner; });" +
    "  system.colonized = true;" +
    "  system.owner = 'empire-test';" +
    "})();");
  ok(!run("sectorHasPlayerPresence(getSector(" + JSON.stringify(rivalId) + "))"),
    "rival structures and colonies are not player presence");
  ok(!run("isSectorNameKnown(" + JSON.stringify(rivalId) + ")"),
    "rival presence does not publish the sector name");

  /* A ship in a hex is exploration: the hex is charted, so the sector's name
     is known even though the fleet is not a colony anchor. */
  run("freshNames();");
  const fleetId = run("(function () {" +
    "  const remote = state.galaxy.sectors.find(function (sector) {" +
    "    return sector.ring >= 3 && !isSectorNameKnown(sector.id) &&" +
    "      Object.keys(sector.structures || {}).length === 0;" +
    "  });" +
    "  return remote ? remote.id : null;" +
    "})()");
  ok(fleetId, "a clear remote sector is available for the fleet check");
  run("getSector(" + JSON.stringify(fleetId) + ").fleets['1,1'] = [createShip('corvette')];");
  ok(!run("sectorHasPlayerPresence(getSector(" + JSON.stringify(fleetId) + "))"),
    "a fleet is not a building or colony");
  ok(run("sectorHasCharts(" + JSON.stringify(fleetId) + ")"),
    "a fleet in a hex charts that hex");
  ok(run("isSectorNameKnown(" + JSON.stringify(fleetId) + ")"),
    "exploring a sector with one ship publishes its name");
}

/* Power is live telemetry. A charted sector the player has left behind hides
   it; any ship, colony or orbital structure in the sector publishes it. */
function testPowerVisibility() {
  run("freshNames();");
  ok(run("isSectorPowerVisible(getCurrentSector())"),
    "the home sector publishes power: capital colony plus starting fleet");
  eq(run("getSectorPower(getCurrentSector().id)"), 11, "the home fleet plus spaceport power is unchanged");

  const remoteId = run("(function () {" +
    "  const remote = state.galaxy.sectors.find(function (sector) {" +
    "    return sector.ring >= 3 && !isSectorNameKnown(sector.id) &&" +
    "      getSectorFleetCount(sector.id) === 0 && !sectorHasPlayerPresence(sector);" +
    "  });" +
    "  return remote ? remote.id : null;" +
    "})()");
  ok(remoteId, "a remote empty sector is available for the power check");
  ok(!run("isSectorPowerVisible(" + JSON.stringify(remoteId) + ")"),
    "an unknown sector publishes no power");
  run("markHexExplored(0, 0, " + JSON.stringify(remoteId) + ");");
  ok(run("sectorHasCharts(" + JSON.stringify(remoteId) + ")"),
    "the remote sector is charted after a ship visit");
  ok(!run("isSectorPowerVisible(" + JSON.stringify(remoteId) + ")"),
    "a charted but empty sector hides player power");

  run("getSector(" + JSON.stringify(remoteId) + ").fleets['2,2'] = [createShip('corvette')];");
  ok(run("isSectorPowerVisible(" + JSON.stringify(remoteId) + ")"),
    "a ship in the sector publishes its power");
  eq(run("getSectorPower(" + JSON.stringify(remoteId) + ")"), 4, "the lone corvette is 4 power");
  run("delete getSector(" + JSON.stringify(remoteId) + ").fleets['2,2'];");
  ok(!run("isSectorPowerVisible(" + JSON.stringify(remoteId) + ")"),
    "power disappears when the last ship leaves");

  run("(function () {" +
    "  const system = getSectorSystems(" + JSON.stringify(remoteId) + ").find(function (entry) { return !entry.owner; });" +
    "  system.colonized = true;" +
    "  system.population = 1;" +
    "})();");
  ok(run("isSectorPowerVisible(" + JSON.stringify(remoteId) + ")"),
    "a player colony publishes the sector's power");
}

/* Screens print getSectorLabel(), never sector.name, so an unnamed sector can
   only ever read Unknown. */
function testSectorLabels() {
  run("freshNames();");
  const unknownId = run("(function () {" +
    "  const remote = state.galaxy.sectors.find(function (sector) { return !isSectorNameKnown(sector.id); });" +
    "  return remote ? remote.id : null;" +
    "})()");
  ok(unknownId, "an unnamed sector is available for the label check");
  eq(run("getSectorLabel(" + JSON.stringify(unknownId) + ")"), "Unknown sector",
    "an unnamed sector prints the neutral label");
  eq(run("getSectorLabel(getCurrentSector())"), run("getCurrentSector().name"),
    "a known sector prints its own name");
}

function testTradeReachNames() {
  run("freshNames();");
  const lane = run("(function () {" +
    "  const sectors = state.galaxy.sectors;" +
    "  for (let i = 0; i < sectors.length; i += 1) {" +
    "    const source = sectors[i];" +
    "    if (source.ring < 3 || isSectorNameKnown(source.id)) continue;" +
    "    const relay = source.neighbors.map(getSector).find(function (sector) {" +
    "      return !!sector && sector.ring >= 3 && !isSectorNameKnown(sector.id);" +
    "    });" +
    "    if (!relay) continue;" +
    "    const target = relay.neighbors.map(getSector).find(function (sector) {" +
    "      return !!sector && sector.id !== source.id &&" +
    "        source.neighbors.indexOf(sector.id) === -1 && sector.ring >= 3 &&" +
    "        !isSectorNameKnown(sector.id);" +
    "    });" +
    "    if (target) return { source: source.id, relay: relay.id, target: target.id };" +
    "  }" +
    "  return null;" +
    "})()");
  ok(lane, "a source-relay-target lane chain is available");
  ok(!run("isSectorNameKnown(" + JSON.stringify(lane.source) + ")"),
    "the trade source starts unnamed");
  ok(!run("isSectorNameKnown(" + JSON.stringify(lane.target) + ")"),
    "the two-hop trade target starts unnamed");
  run("(function (lane) {" +
    "  playerGate(getSector(lane.source));" +
    "  playerCenter(getSector(lane.source));" +
    "})(" + JSON.stringify(lane) + ");");
  ok(!run("isSectorNameKnown(" + JSON.stringify(lane.target) + ")"),
    "the source gate alone does not name a two-hop target");
  run("playerGate(getSector(" + JSON.stringify(lane.relay) + "));");

  ok(run("getTradeReach(" + JSON.stringify(lane.source) + ").allowed"),
    "the source gate opens trade");
  const hops = run("(function () {" +
    "  const reach = getTradeReach(" + JSON.stringify(lane.source) + ");" +
    "  const entry = reach.targets.find(function (target) { return target.sectorId === " + JSON.stringify(lane.target) + "; });" +
    "  return entry ? entry.hops : null;" +
    "})()");
  eq(hops, 2, "the relay gate extends trade to two hops");
  ok(run("isSectorNameKnown(" + JSON.stringify(lane.target) + ")"),
    "the relay gate names the two-hop target");
  ok(run("getTradeReach(" + JSON.stringify(lane.source) + ").targets.every(function (target) { return isSectorNameKnown(target.sectorId); })"),
    "every trade destination is a named sector");
}

testHomeAndFarNames();
testChartedHalo();
testNameDoesNotChart();
testOrbitalPresence();
testSurfaceAndColonyPresence();
testIgnoredPresence();
testPowerVisibility();
testSectorLabels();
testTradeReachNames();

console.log("Sector name harness: " + checks + " checks passed.");
