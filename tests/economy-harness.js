#!/usr/bin/env node
/* ============================================================
   ECONOMY HARNESS — per-sector ledgers, local costs and gate trade
   The app intentionally has no build step, so this harness loads the
   classic browser scripts in a Node VM with tiny UI stubs. Run it with:

       node tests/economy-harness.js

   It covers the local energy/mineral stockpiles, empire-wide research and
   influence, sector upkeep, local construction costs, the trading center
   gate requirement and reach, per-turn transfers, trade upkeep and the
   turn pipeline that applies all of it.
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
  "js/game/actions.js",
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
function near(actual, expected, tolerance, message) {
  assert.ok(Math.abs(actual - expected) <= tolerance,
    message + " (got " + actual + ", want " + expected + " ± " + tolerance + ")");
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
    els: {
      planetScroll: { scrollTop: 0 },
      planetScreen: { classList: { add: function () {}, remove: function () {} } }
    },
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
  /* Test helpers run inside the VM so generated systems and galaxy sectors
     share the game's prototypes and lookups. */
  vm.runInContext(`
    function resetEconomy() {
      state = createInitialState(null);
      state.phase = "actions";
      state.ethic = null;
      state.empires = [];
      state.tech.active = null;
      state.stability = CONFIG.stability.start;
      state.resources.research = 0;
      state.resources.influence = 5;
      state.ui.activeSector = "sec-core";
      state.ui.selectedHex = null;
      state.ui.shipSelection = [];
      state.ui.move = null;
      state.turn = 1;
      state.galaxy.sectors.forEach(function (sector) {
        sector.fleets = {};
        sector.rivalFleets = {};
        sector.structures = {};
        sector.explored = {};
        sector.economy = { energy: 0, minerals: 0 };
        sector.carry = { energy: 0, minerals: 0 };
      });
      state.systems = [];
      return state;
    }

    function addColony(id, sectorId, opts) {
      const options = opts || {};
      const population = options.population == null ? 5 : options.population;
      const maintenance = options.maintenance || { energy: 0, minerals: 0 };
      const system = {
        id: id,
        sectorId: sectorId,
        name: options.name || id,
        home: !!options.home,
        colonized: options.colonized !== false,
        planetSize: options.planetSize || "large",
        bonusSlots: 0,
        unlockedBonusSlots: 0,
        population: population,
        maintenance: {
          energy: maintenance.energy,
          minerals: maintenance.minerals
        },
        workerOrders: {},
        economyReport: null,
        growthProgress: 0,
        foundedTurn: 1,
        emoji: "🪐",
        color: "#7cb8ff",
        type: "terran",
        row: options.row == null ? 0 : options.row,
        col: options.col == null ? 0 : options.col,
        blurb: "Test world"
      };
      system.slots = createPlanetSlots(system);
      (options.buildings || []).forEach(function (type, index) {
        if (!type) return;
        system.slots[index] = { type: type, level: 1, underConstruction: false };
      });
      state.systems.push(system);
      return system;
    }

    function emptyHex(sectorId) {
      const sector = getSector(sectorId);
      for (let row = 0; row < CONFIG.sector.rows; row += 1) {
        for (let col = 0; col < CONFIG.sector.cols; col += 1) {
          if (getSystemAtHex(row, col, sectorId)) continue;
          if (sector.structures[hexKey(row, col)]) continue;
          if (getStructureAt(row, col, sectorId)) continue;
          return hexKey(row, col);
        }
      }
      return null;
    }

    function addStructure(sectorId, key, type, online, options) {
      const sector = getSector(sectorId);
      const opts = options || {};
      const structure = {
        type: type,
        owner: "player",
        underConstruction: online === false,
        startedTurn: 1,
        key: key,
        sectorId: sectorId
      };
      if (type === "stronghold") structure.hull = STRUCTURE_TYPES.stronghold.hull;
      if (type === "trading") structure.trade = { targetSectorId: null, energy: 0, minerals: 0 };
      sector.structures[key] = structure;
      if (opts.trade) structure.trade = Object.assign({}, opts.trade);
      return structure;
    }

    function addShip(sectorId, key, type, id) {
      const sector = getSector(sectorId);
      sector.fleets[key] = (sector.fleets[key] || []).concat(
        createShip(type, { id: id || (type + "-test"), name: id || type, owner: "player" })
      );
    }

    function setAllStocks(energy, minerals) {
      state.galaxy.sectors.forEach(function (sector) {
        sector.economy = { energy: energy, minerals: minerals };
        sector.carry = { energy: 0, minerals: 0 };
      });
    }
  `, context, { filename: "economy-harness-helpers" });
  return context;
}

const context = createContext();
function run(code) {
  return vm.runInContext(code, context);
}

/* ---------- starting state ---------- */

function testStartingLedgers() {
  run("state = createInitialState(null); state.phase = 'actions'; state.ui.activeSector = 'sec-core';");
  const home = run("getSector('sec-core')");
  eq(home.economy.energy, run("CONFIG.startingResources.energy"), "the home sector holds the starting energy");
  eq(home.economy.minerals, run("CONFIG.startingResources.minerals"), "the home sector holds the starting minerals");
  const other = run("state.galaxy.sectors.find(s => !s.home)");
  eq(other.economy.energy, 0, "every other sector starts with no energy");
  eq(other.economy.minerals, 0, "every other sector starts with no minerals");
  eq(run("state.resources.research"), 0, "research starts in the empire stockpile");
  eq(run("state.resources.influence"), 5, "influence starts in the empire stockpile");
  eq(run("state.resources.energy"), undefined, "energy no longer lives in the empire stockpile");
  eq(run("state.resources.minerals"), undefined, "minerals no longer live in the empire stockpile");

  const display = run("getDisplayResources()");
  eq(display.energy, run("CONFIG.startingResources.energy"),
    "the topbar snapshot reads the current sector's energy");
  eq(display.minerals, run("CONFIG.startingResources.minerals"),
    "the topbar snapshot reads the current sector's minerals");
  eq(display.research, 0, "the topbar snapshot reads the global research");
  eq(display.influence, 5, "the topbar snapshot reads the global influence");

  const homeSystem = run("state.systems.find(function (system) { return system.home; })");
  eq(homeSystem.population, 3, "the capital starts at 3 population");
  eq(homeSystem.slots[0].type, "power", "the capital starts with a Power Plant");
  eq(homeSystem.slots[1].type, "mine", "the capital starts with a Mine");
  eq(homeSystem.slots[0].underConstruction, false, "the starter Power Plant is online");
  eq(homeSystem.slots[1].underConstruction, false, "the starter Mine is built");

  eq(run("CONFIG.startingResources.energy"), 15, "the home sector starts with 15 energy");
  eq(run("CONFIG.startingResources.minerals"), 15, "the home sector starts with 15 minerals");

  const homeEcon = run("getSectorEconomy('sec-core')");
  eq(homeEcon.income.energy, 8, "the capital earns base energy plus a 2-worker Power Plant");
  eq(homeEcon.income.minerals, 6, "the capital earns base minerals plus a 1-worker Mine");
  ok(homeEcon.net.energy > 0, "the opening energy bill is covered");
  ok(homeEcon.net.minerals > 0, "the opening mineral bill is covered");
}

/* ---------- sector economies ---------- */

function setupThreeSectors() {
  run("resetEconomy()");
  const homeId = "sec-core";
  const neighbors = run("getSector('sec-core').neighbors.slice()");
  const aId = neighbors[0];
  const bId = neighbors[1] || neighbors[0];
  run("addColony('home-test', 'sec-core', { home: true, population: 12, buildings: ['power', 'mine', 'lab'] })");
  run("addColony('colony-a', " + JSON.stringify(aId) + ", { population: 10, buildings: ['mine', 'lab'] })");
  run("addColony('colony-b', " + JSON.stringify(bId) + ", { population: 8, buildings: ['lab'] })");
  run("setAllStocks(10, 10)");
  return { homeId: homeId, aId: aId, bId: bId };
}

function testSectorEconomies() {
  const ids = setupThreeSectors();
  eq(run("CONFIG.startingResources.energy"), 15, "the home sector starts with 15 energy");
  eq(run("CONFIG.startingResources.minerals"), 15, "the home sector starts with 15 minerals");

  const homeEcon = run("getSectorEconomy('sec-core')");
  eq(homeEcon.income.energy, 12, "the capital sector earns base + power plant energy");
  eq(homeEcon.income.minerals, 12, "the capital sector earns base + mine minerals");
  eq(homeEcon.income.research, 2, "the capital lab produces research at 12 population");
  eq(homeEcon.upkeep, 2, "the capital sector pays colony and lab upkeep (facilities draw no energy)");
  eq(homeEcon.net.energy, 10, "the capital sector nets energy after its own upkeep");

  const aEcon = run("getSectorEconomy(" + JSON.stringify(ids.aId) + ")");
  eq(aEcon.income.minerals, 8, "the frontier colony keeps its own level 1 mine income");
  eq(aEcon.income.energy, 0, "a colony without a power plant earns no energy");
  eq(aEcon.upkeep, 2, "the frontier sector pays its own colony and lab upkeep");
  eq(aEcon.net.energy, -2, "the frontier sector can run an energy deficit alone");
  eq(aEcon.net.minerals, 8, "the frontier sector banks its minerals (fixture maintenance is zero)");
  eq(aEcon.mineralUpkeep, 0, "the fixture requests no population housing by default");

  const bEcon = run("getSectorEconomy(" + JSON.stringify(ids.bId) + ")");
  eq(bEcon.income.research, 2, "a lab feeds the shared research pool");
  eq(bEcon.upkeep, 2, "the third sector pays its own upkeep");
  eq(bEcon.net.energy, -2, "the third sector's energy is local too");

  const econ = run("getEconomy()");
  eq(econ.income.energy, 12, "empire energy income is the sum of every sector");
  eq(econ.income.minerals, 20, "empire mineral income is the sum of every sector");
  eq(econ.income.research, 6, "empire research is the sum of every sector's labs");
  eq(econ.netEnergy, 6, "empire net energy sums the sector nets");
  eq(econ.netMinerals, 20, "empire net minerals sums the sector nets");
  eq(econ.populationMaintenance.energyRequested, 0,
    "the fixture maintenance policy requests no population upkeep");
  eq(run("state.resources.research"), 0, "sector production is not banked in a global mineral/energy pool");

  run("setSectorStock(" + JSON.stringify(ids.aId) + ", 'minerals', 0)");
  eq(run("getSectorStock('sec-core', 'minerals')"), 10, "spending in one sector leaves the others untouched");
  eq(run("getSectorStock(" + JSON.stringify(ids.bId) + ", 'minerals')"), 10, "the third sector keeps its stock");

  run("state.ui.activeSector = " + JSON.stringify(ids.aId));
  eq(run("getDisplayResources().minerals"), 0, "the topbar follows the active sector's ledger");
  run("state.ui.activeSector = 'sec-core'");
}

/* ---------- local costs ---------- */

function testLocalCosts() {
  run("resetEconomy()");
  const home = run("addColony('home-test', 'sec-core', { home: true, population: 12 })");
  const neighbors = run("getSector('sec-core').neighbors.slice()");
  const aId = neighbors[0];
  run("addColony('frontier-a', " + JSON.stringify(aId) + ", { population: 5 })");
  run("setSectorStock('sec-core', 'minerals', 20); setSectorStock('sec-core', 'energy', 5);");
  run("setSectorStock(" + JSON.stringify(aId) + ", 'minerals', 0)");

  run("buildInSlot('home-test', 0, 'mine')");
  eq(run("getSectorStock('sec-core', 'minerals')"), 15, "a building is paid from its own sector");
  eq(run("getSectorStock(" + JSON.stringify(aId) + ", 'minerals')"), 0, "the other sector is not charged");

  run("buildInSlot('home-test', 1, 'power')");
  eq(run("getSectorStock('sec-core', 'minerals')"), 10, "the second building is charged locally too");

  run("addStructure('sec-core', '2,3', 'spaceport', true); state.ui.selectedHex = '2,3';");
  run("buildShipAtSpaceport('corvette')");
  eq(run("getSectorStock('sec-core', 'minerals')"), 6, "a ship is paid by the sector that builds it");
  eq(run("getSector('" + aId + "').structures[hexKey(2,3)]"), undefined, "no structure is created in the other sector");

  run("addStructure('sec-core', '0,0', 'gate', true); addShip('sec-core', '0,0', 'builder', 'jump-builder');");
  run("state.ui.selectedHex = '0,0'; state.ui.shipSelection = ['jump-builder'];");
  run("jumpFleetToSector(" + JSON.stringify(aId) + ")");
  const landingKey = run("getLandingHexFor(" + JSON.stringify(aId) + ", 'sec-core')");
  eq(run("getFleetAt(parseHexKey('" + landingKey + "').row, parseHexKey('" + landingKey + "').col, " + JSON.stringify(aId) + ").filter(function (ship) { return ship.id === 'jump-builder'; }).length"),
    1, "a gate jump lands on the lane's landing hex");
  ok(landingKey !== run("hexKey(getSector(" + JSON.stringify(aId) + ").entryRow, getSector(" + JSON.stringify(aId) + ").entryCol)"),
    "the landing hex is not the generic central entry hex");
  eq(run("getSectorStock('sec-core', 'energy')"), 3, "a gate jump burns the origin sector's energy");
  eq(run("getSectorStock(" + JSON.stringify(aId) + ", 'energy')"), 0, "the destination sector is not charged");

  run("state.ui.selectedHex = null; state.ui.shipSelection = [];");
  const targetId = run("(function(){ const a = getSector(" + JSON.stringify(aId) + "); const sys = addColony('frontier-target', a.id, { colonized: false, row: 3, col: 0 }); markHexExplored(3, 0, a.id); return sys.id; })()");
  ok(run("getColonizeBlockReason(getSystem('" + targetId + "')).indexOf('minerals in') !== -1"),
    "colonisation is refused without minerals in the target sector");
  run("colonizeSystem('" + targetId + "')");
  eq(run("getSystem('" + targetId + "').colonized"), false, "a refused colonisation changes nothing");
  run("setSectorStock(" + JSON.stringify(aId) + ", 'minerals', 12); state.ui.activeSector = " + JSON.stringify(aId) + ";");
  run("colonizeSystem('" + targetId + "')");
  eq(run("getSystem('" + targetId + "').colonized"), true, "a funded colonisation succeeds");
  eq(run("getSectorStock(" + JSON.stringify(aId) + ", 'minerals')"), 2, "colonisation costs the target sector's minerals");
  eq(run("state.resources.influence"), 2, "colonisation costs the empire's shared influence");
  eq(run("getSectorStock('sec-core', 'minerals')"), 6, "the home sector's minerals are untouched by the colony");
}

/* ---------- trade gates and reach ---------- */

function testTradeGateAndReach() {
  run("resetEconomy()");
  const homeId = "sec-core";
  const centerKey = "1,1";
  run("addStructure('sec-core', '" + centerKey + "', 'trading', true)");
  eq(run("getTradeReach('sec-core').allowed"), false, "a trading center without a gate cannot trade");
  eq(run("getSectorTrades()[0].status"), "no-gate", "the route reports NO GATE");

  run("addStructure('sec-core', '0,0', 'gate', true)");
  const reach = run("getTradeReach('sec-core')");
  eq(reach.allowed, true, "an operational gate opens trade reach");
  const neighbors = run("getSector('sec-core').neighbors.slice()");
  ok(reach.targets.some(function (target) { return target.sectorId === neighbors[0]; }),
    "direct neighbours are in reach");
  const direct = run("(function(){ const home = getSector('sec-core'); return home.neighbors.find(function (id) { const s = getSector(id); return s.neighbors.some(function (n) { return n !== 'sec-core' && home.neighbors.indexOf(n) === -1; }); }); })()");
  ok(!!direct, "found a sector one hop beyond a direct neighbour");
  const twoHop = run("(function(){ const home = getSector('sec-core'); const direct = getSector(" + JSON.stringify(direct) + "); return direct.neighbors.find(function (n) { return n !== 'sec-core' && home.neighbors.indexOf(n) === -1; }); })()");
  ok(!!twoHop, "found the two-hop sector");
  ok(!run("getTradeReach('sec-core').targets.some(function (t) { return t.sectorId === " + JSON.stringify(twoHop) + "; })"),
    "a two-hop sector is out of reach without a relay gate");
  run("addStructure(" + JSON.stringify(direct) + ", '0,0', 'gate', true)");
  const relayed = run("getTradeReach('sec-core')");
  const twoHopTarget = relayed.targets.find(function (target) { return target.sectorId === twoHop; });
  ok(!!twoHopTarget, "a relay gate extends trade reach");
  eq(twoHopTarget.hops, 2, "the relayed route counts two hops");

  const far = run("state.galaxy.sectors.find(function (s) { return s.id !== 'sec-core' && !getTradeReach('sec-core').targets.some(function (t) { return t.sectorId === s.id; }); })");
  ok(!!far, "found a sector beyond the trade network");
  const rejected = run("setTradingCenterTarget('sec-core', '" + centerKey + "', " + JSON.stringify(far.id) + ")");
  eq(rejected.ok, false, "an unreachable destination is refused");
  eq(run("getStructureAt(1,1,'sec-core').trade.targetSectorId"), null, "a refused target is not saved");

  const accepted = run("setTradingCenterTarget('sec-core', '" + centerKey + "', " + JSON.stringify(twoHop) + ")");
  eq(accepted.ok, true, "a reachable destination is accepted");
  eq(run("getStructureAt(1,1,'sec-core').trade.targetSectorId"), twoHop, "the target is saved on the center");
  eq(run("getSectorTrades()[0].status"), "empty", "a saved route with no amount is idle");
}

/* ---------- trade amounts, transfers and upkeep ---------- */

function testTradeTransfersAndUpkeep() {
  run("resetEconomy()");
  const target = run("getSector('sec-core').neighbors.slice()[0]");
  run("addStructure('sec-core', '0,0', 'gate', true)");
  run("addStructure('sec-core', '1,1', 'trading', true)");
  run("addStructure('sec-core', '1,2', 'stronghold', true)");
  run("addStructure('sec-core', '1,3', 'trading', false)");
  eq(run("getSectorEconomy('sec-core').tradeCenterCount"), 1, "only online trading centers count");
  eq(run("getSectorEconomy('sec-core').tradeCenterUpkeep"), 1, "an online trading center draws 1 energy upkeep");
  eq(run("getSectorEconomy('sec-core').upkeep"), 3, "stronghold and trading center upkeep are added to the sector");

  run("setTradingCenterTarget('sec-core', '1,1', " + JSON.stringify(target) + ")");
  for (let i = 0; i < 30; i += 1) run("adjustTradingCenterAmount('sec-core', '1,1', 'energy', 1)");
  eq(run("getStructureAt(1,1,'sec-core').trade.energy"), 20, "trade amounts clamp at the configured maximum");
  run("adjustTradingCenterAmount('sec-core', '1,1', 'minerals', 4)");
  eq(run("getStructureAt(1,1,'sec-core').trade.minerals"), 4, "mineral amounts can differ from energy amounts");
  eq(run("getSectorTrades()[0].status"), "active", "a funded route is active");

  const projection = run("getSectorEconomy('sec-core')");
  eq(projection.trade.out.energy, 20, "the sector preview includes its outbound energy");
  eq(run("getSectorEconomy(" + JSON.stringify(target) + ").trade.in.energy"), 20,
    "the target sector preview includes inbound energy");

  run("setSectorStock('sec-core', 'energy', 7); setSectorStock('sec-core', 'minerals', 2);");
  run("setSectorStock(" + JSON.stringify(target) + ", 'energy', 0); setSectorStock(" + JSON.stringify(target) + ", 'minerals', 0);");
  const report = run("resolveTradeTransfers()");
  eq(report.energy, 7, "a transfer is limited by the source stock");
  eq(report.minerals, 2, "minerals are limited by the source stock too");
  eq(run("getSectorStock('sec-core', 'energy')"), 0, "the source sector is debited");
  eq(run("getSectorStock(" + JSON.stringify(target) + ", 'energy')"), 7, "the target sector is credited");
  eq(run("getSectorStock('sec-core', 'minerals')"), 0, "the source sector never goes below zero minerals");
  eq(run("getSectorStock(" + JSON.stringify(target) + ", 'minerals')"), 2, "the target receives the mineral shipment");
  const center = run("getStructureAt(1,1,'sec-core')");
  eq(center.lastTrade.status, "shipped", "the center records the shipment");
  eq(center.lastTrade.short, true, "a stock-limited shipment is marked as short");
  eq(run("state.resources.research"), 0, "trade never touches research");
  eq(run("state.resources.influence"), 5, "trade never touches influence");

  run("resolveTradeTransfers()");
  eq(run("getStructureAt(1,1,'sec-core').lastTrade.status"), "short", "an empty sector ships nothing");
  eq(run("state.resources.research"), 0, "an empty trade does not create research");

  run("clearTradingCenterRoute('sec-core', '1,1')");
  eq(run("getStructureAt(1,1,'sec-core').trade.targetSectorId"), null, "the route can be cleared");
}

/* ---------- full turn pipeline ---------- */

function testTurnPipeline() {
  const ids = setupThreeSectors();
  run("state.tech.active = null; state.turn = 1; state.stability = 70;");
  run("addStructure('sec-core', '0,0', 'gate', true)");
  run("addStructure('sec-core', '1,1', 'trading', true)");
  run("setTradingCenterTarget('sec-core', '1,1', " + JSON.stringify(ids.aId) + ")");
  run("adjustTradingCenterAmount('sec-core', '1,1', 'energy', 2)");
  run("adjustTradingCenterAmount('sec-core', '1,1', 'minerals', 3)");
  run("setAllStocks(10, 10);");
  run("state.resources.research = 0; state.resources.influence = 5;");

  run("endTurn()");
  eq(run("state.turn"), 2, "the turn advances");
  eq(run("getSectorStock('sec-core', 'energy')"), 17,
    "the capital pays infrastructure, earns 12, and ships 2 energy");
  eq(run("getSectorStock('sec-core', 'minerals')"), 19, "the capital earns 12 and ships 3 minerals");
  eq(run("getSectorStock(" + JSON.stringify(ids.aId) + ", 'energy')"), 10,
    "the target sector pays 2 energy upkeep, then receives 2 energy");
  eq(run("getSectorStock(" + JSON.stringify(ids.aId) + ", 'minerals')"), 21,
    "the target sector keeps its 8 mined minerals and receives 3");
  eq(run("getSectorStock(" + JSON.stringify(ids.bId) + ", 'energy')"), 8,
    "the third sector pays its own 2 energy upkeep from its own stock");
  eq(run("getSectorStock(" + JSON.stringify(ids.bId) + ", 'minerals')"), 10,
    "the third sector's minerals are untouched");
  eq(run("state.resources.research"), 6, "research from every sector lands in the shared stockpile");
  eq(run("state.resources.influence"), 6, "influence lands in the shared stockpile");
  eq(run("state.stability"), 70, "no sector was in deficit, so stability holds");
  const center = run("getStructureAt(1,1,'sec-core')");
  eq(center.lastTrade.energy, 2, "the trade center shipped 2 energy");
  eq(center.lastTrade.minerals, 3, "the trade center shipped 3 minerals");
  eq(center.lastTrade.status, "shipped", "the turn resolved the route");
}

/* ---------- population maintenance in the real turn pipeline ---------- */

function testMaintenanceTurnOrder() {
  run("resetEconomy()");
  const system = run("addColony('maint-colony', 'sec-core', { population: 10, maintenance: { energy: 100, minerals: 100 } })");
  run("setSectorStock('sec-core', 'energy', 20); setSectorStock('sec-core', 'minerals', 20);");
  run("state.phase = 'actions'; state.currentEvent = null; state.turn = 1;");
  run("endTurn()");

  const energyRequired = Math.pow(10, 1.1);
  const mineralsRequired = Math.pow(10, 1 / 0.9);
  eq(run("state.turn"), 2, "the maintenance turn advances");
  near(run("getSectorStock('sec-core', 'energy')"), 20 - energyRequired - 1, 1e-6,
    "population energy is paid first, then the colony overhead");
  near(run("getSectorStock('sec-core', 'minerals')"), 20 - mineralsRequired, 1e-6,
    "housing is paid from the mineral ledger");
  eq(run("state.lastMaintenance.colonies"), 1, "the turn records the resolved maintenance");
  near(run("state.lastMaintenance.energySpent"), energyRequired, 1e-6,
    "the resolved energy spend matches the formula");
  near(run("state.lastMaintenance.mineralsSpent"), mineralsRequired, 1e-6,
    "the resolved housing spend matches the formula");
  eq(run("getColonyPopulation(getSystem('maint-colony'))"), 10,
    "no whole person arrives on the first 0.5-growth tick");
  near(run("getSystem('maint-colony').growthProgress"), 0.5, 1e-9,
    "the growth fraction is banked after maintenance");
  eq(run("Math.round(state.lastMaintenance.happiness)"), 100,
    "full maintenance resolves to full happiness");
  ok(run("getSectorStock('sec-core', 'energy') >= 0 && getSectorStock('sec-core', 'minerals') >= 0"),
    "the turn pipeline leaves no negative ledger");

  run("state.phase = 'actions'; state.currentEvent = null;");
  run("setSectorStock('sec-core', 'energy', 20); setSectorStock('sec-core', 'minerals', 20);");
  run("endTurn()");
  eq(run("getColonyPopulation(getSystem('maint-colony'))"), 11,
    "the second 0.5 tick completes the population");
  eq(run("getSystem('maint-colony').growthProgress"), 0,
    "the banked fraction is consumed");
}

/* ---------- deficit penalty ---------- */

function testDeficitPenalty() {
  run("resetEconomy()");
  const neighbors = run("getSector('sec-core').neighbors.slice(0, 2)");
  run("addColony('deficit-a', " + JSON.stringify(neighbors[0]) + ", { population: 5 })");
  run("addColony('deficit-b', " + JSON.stringify(neighbors[1]) + ", { population: 5 })");
  run("state.stability = CONFIG.stability.start; state.phase = 'actions';");
  run("endTurn()");
  eq(run("state.stability"), 68,
    "any number of deficit sectors costs the stability penalty once, not per sector");
  eq(run("getSectorStock(" + JSON.stringify(neighbors[0]) + ", 'energy')"), 0,
    "an unpaid infrastructure bill stops at zero, never negative");
  eq(run("getSectorStock(" + JSON.stringify(neighbors[1]) + ", 'energy')"), 0,
    "the second deficit also stops at zero");
  eq(run("getSectorStock('sec-core', 'energy')"), 0,
    "a sector in balance is not dragged down by another sector's deficit");
}

/* ---------- sector effects ---------- */

function testSectorEffects() {
  run("resetEconomy()");
  const neighbor = run("getSector('sec-core').neighbors.slice()[0]");
  run("state.ui.activeSector = 'sec-core'");
  run("applyEffects({ energy: 4, minerals: 6, research: 3, influence: 2 }, " + JSON.stringify(neighbor) + ")");
  eq(run("getSectorStock(" + JSON.stringify(neighbor) + ", 'energy')"), 4, "event energy lands in the target sector");
  eq(run("getSectorStock(" + JSON.stringify(neighbor) + ", 'minerals')"), 6, "event minerals land in the target sector");
  eq(run("getSectorStock('sec-core', 'minerals')"), 0, "the current sector is not credited when a sector is given");
  eq(run("state.resources.research"), 3, "event research is empire-wide");
  eq(run("state.resources.influence"), 7, "event influence is empire-wide");

  run("applyEffects({ energy: 2, minerals: 1 })");
  eq(run("getSectorStock('sec-core', 'energy')"), 2, "an event without a sector credits the current sector");
  eq(run("getSectorStock('sec-core', 'minerals')"), 1, "the current sector receives the minerals");
}

/* ---------- builder flow ---------- */

function testTradingCenterBuild() {
  run("resetEconomy()");
  const key = run("emptyHex('sec-core')");
  ok(!!key, "found an empty hex for the trading center");
  run("addShip('sec-core', " + JSON.stringify(key) + ", 'builder', 'trade-builder');");
  run("state.ui.activeSector = 'sec-core'; state.ui.selectedHex = " + JSON.stringify(key) + ";");
  run("setSectorStock('sec-core', 'minerals', 20); setSectorStock('sec-core', 'energy', 10);");
  eq(run("STRUCTURE_ORDER.indexOf('trading') !== -1"), true, "the builder build list includes the trading center");
  eq(run("STRUCTURE_TYPES.trading.cost.minerals"), 8, "the trading center costs 8 minerals");

  run("buildStructure('trading')");
  eq(run("getSectorStock('sec-core', 'minerals')"), 12, "the trading center is paid from its own sector");
  eq(run("getStructureAt(parseHexKey('" + key + "').row, parseHexKey('" + key + "').col, 'sec-core').underConstruction"), true,
    "a new trading center starts under construction");
  eq(run("getSectorEconomy('sec-core').tradeCenterUpkeep"), 0, "an unfinished center draws no upkeep");

  run("completeConstruction()");
  eq(run("getStructureAt(parseHexKey('" + key + "').row, parseHexKey('" + key + "').col, 'sec-core').underConstruction"), false,
    "the center comes online on the next turn");
  eq(run("getSectorEconomy('sec-core').tradeCenterUpkeep"), 1, "an online center draws 1 energy upkeep");
  eq(run("getSectorTrades()[0].status"), "no-gate", "the center stays offline without a gate in its sector");

  const gateKey = run("emptyHex('sec-core')");
  run("addStructure('sec-core', " + JSON.stringify(gateKey) + ", 'gate', true)");
  eq(run("getSectorTrades()[0].status"), "idle", "a gate brings the center online with no destination");

  const target = run("getSector('sec-core').neighbors[0]");
  const result = run("setTradingCenterTarget('sec-core', " + JSON.stringify(key) + ", " + JSON.stringify(target) + ")");
  eq(result.ok, true, "the built center accepts a reachable destination");
  run("adjustTradingCenterAmount('sec-core', " + JSON.stringify(key) + ", 'energy', 2)");
  eq(run("getSectorTrades()[0].status"), "active", "the built center ships once its route is set");
}

/* ---------- summary ---------- */

function testTradeSummary() {
  run("resetEconomy()");
  const target = run("getSector('sec-core').neighbors.slice()[0]");
  run("addStructure('sec-core', '0,0', 'gate', true)");
  run("addStructure('sec-core', '1,1', 'trading', true)");
  run("setTradingCenterTarget('sec-core', '1,1', " + JSON.stringify(target) + ")");
  run("adjustTradingCenterAmount('sec-core', '1,1', 'energy', 4)");
  run("adjustTradingCenterAmount('sec-core', '1,1', 'minerals', 2)");
  const summary = run("getTradeSummary()");
  eq(summary.centerCount, 1, "the summary counts trading centers");
  eq(summary.active.length, 1, "the summary counts shipping routes");
  eq(summary.energy, 4, "the summary totals outbound energy");
  eq(summary.minerals, 2, "the summary totals outbound minerals");
  eq(run("getTradeStatusLabel(getSectorTrades()[0])"), "SHIPPING", "the route status label is human readable");
  eq(run("getSectorTrades()[0].hops"), 1, "the route records its hop count");
}

try {
  testStartingLedgers();
  testSectorEconomies();
  testLocalCosts();
  testTradeGateAndReach();
  testTradeTransfersAndUpkeep();
  testTurnPipeline();
  testMaintenanceTurnOrder();
  testDeficitPenalty();
  testSectorEffects();
  testTradingCenterBuild();
  testTradeSummary();
  console.log("economy harness: " + checks + " checks passed");
} catch (error) {
  console.error("economy harness: FAILED after " + checks + " checks");
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
}
