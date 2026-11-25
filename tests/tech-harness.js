#!/usr/bin/env node
/* ============================================================
   TECH HARNESS — categories, building refits, ship refits, gate ops and
   multi-route trade
   The app intentionally has no build step, so this harness loads the classic
   browser scripts in a Node VM with tiny UI stubs. Run it with:

       node tests/tech-harness.js

   It covers the three tech categories and their catalogue integrity, the rule
   that a completed tech never upgrades a standing building or ship by itself,
   the half-build-cost building refit and its population gate (a facility is
   never promoted into a level the colony cannot crew), the spaceport-gated
   ship refit and repair, the stronghold line, the radar and gate throughput
   lines and the trading center's extra routes.
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
  "js/ui/tech-view.js",
  "js/ui/battle-view.js",
  "js/ui/planet-screen.js",
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
  /* Helpers run inside the VM so generated systems share the game's lookups. */
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

    function freshTech() {
      state = createInitialState(null);
      state.phase = "actions";
      state.ethic = null;
      state.empires = [];
      state.tech.active = null;
      state.tech.progress = {};
      TECH_ORDER.forEach(function (id) { state.tech.progress[id] = 0; });
      state.tech.done = [];
      state.tech.exclusiveChoice = null;
      state.resources.research = 0;
      state.resources.influence = 5;
      state.stability = CONFIG.stability.start;
      state.turn = 1;
      state.ui.activeTab = "tech";
      state.ui.techCategory = "building";
      state.ui.activeSector = "sec-core";
      state.ui.selectedHex = null;
      state.ui.selectedSystem = null;
      state.ui.selectedTab = "world";
      state.ui.shipSelection = [];
      state.ui.move = null;
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

    /* Research a tech without going through the UI: sets the same state a
       completed project would. */
    /* Research a tech through the real completion path, so its side effects
       (the A/B choice and the stronghold plating) apply exactly as in play. */
    function grantTech(id) {
      if (!TECHS[id] || hasTech(id)) return false;
      completeTech(id);
      return true;
    }

    function homeSystem() {
      return state.systems.find(function (system) { return system.home; });
    }

    function addShip(sectorId, key, type, id) {
      const sector = getSector(sectorId);
      const ship = createShip(type, { id: id || (type + "-test"), name: id || type, owner: "player" });
      sector.fleets[key] = (sector.fleets[key] || []).concat(ship);
      return ship;
    }

    function addStructure(sectorId, key, type, online, owner) {
      const sector = getSector(sectorId);
      const structure = {
        type: type,
        owner: owner || "player",
        underConstruction: online === false,
        startedTurn: 1,
        key: key,
        sectorId: sectorId
      };
      if (type === "stronghold") {
        structure.hull = STRUCTURE_TYPES.stronghold.hull;
      }
      if (type === "trading") {
        structure.trade = { targetSectorId: null, energy: 0, minerals: 0 };
      }
      sector.structures[key] = structure;
      return structure;
    }

    function emptyHex(sectorId) {
      const sector = getSector(sectorId);
      for (let row = 0; row < CONFIG.sector.rows; row += 1) {
        for (let col = 0; col < CONFIG.sector.cols; col += 1) {
          if (getSystemAtHex(row, col, sectorId)) continue;
          if (sector.structures[hexKey(row, col)]) continue;
          return hexKey(row, col);
        }
      }
      return null;
    }

    function finishConstruction() {
      state.systems.forEach(function (system) {
        (system.slots || []).forEach(function (slot) {
          if (slot) slot.underConstruction = false;
        });
      });
    }
  `, context, { filename: "tech-harness-helpers" });
  return context;
}

const context = createContext();
function run(code) {
  return vm.runInContext(code, context);
}

/* ---------- catalogue integrity ---------- */

function testCatalogue() {
  eq(run("TECH_CATEGORIES.length"), 3, "the tech tab has three categories");
  eq(run("TECH_CATEGORIES.map(function (c) { return c.id; }).join(',')"), "building,military,trade",
    "the categories are Buildings, Military and Trade & Exploration");
  eq(run("Object.keys(TECHS).length"), run("TECH_ORDER.length"), "every tech is in the display order");
  eq(run("new Set(TECH_ORDER).size"), run("TECH_ORDER.length"), "the display order has no duplicates");
  ok(run("TECH_ORDER.every(function (id) { return !!TECHS[id] && TECHS[id].id === id; })"),
    "every tech id matches its key");
  ok(run("TECH_ORDER.every(function (id) { return typeof TECHS[id].cost === 'number' && TECHS[id].cost > 0; })"),
    "every tech has a research cost");
  ok(run("TECH_ORDER.every(function (id) { return !!TECHS[id].effect && !!TECHS[id].category; })"),
    "every tech declares an effect and a category");
  ok(run("TECH_ORDER.every(function (id) { return TECH_GROUPS[TECHS[id].group] !== undefined; })"),
    "every tech belongs to a known group");
  ok(run("TECH_ORDER.every(function (id) { return (TECHS[id].requiresTech || []).every(function (req) { return !!TECHS[req]; }); })"),
    "every prerequisite exists");
  ok(run("TECH_ORDER.every(function (id) { return (TECHS[id].requiresTech || []).every(function (req) { return TECH_ORDER.indexOf(req) < TECH_ORDER.indexOf(id); }); })"),
    "prerequisites always appear before the tech that needs them");
  ok(run("TECH_ORDER.every(function (id) { const tech = TECHS[id]; return !tech.exclusive || !!TECHS[tech.exclusive]; })"),
    "every exclusive partner exists");

  const counts = run(`(function () {
    const out = { building: {}, ship: {}, trade: {}, group: {} };
    TECH_ORDER.forEach(function (id) {
      const tech = TECHS[id];
      out.group[tech.group] = (out.group[tech.group] || 0) + 1;
      if (tech.building) out.building[tech.building] = (out.building[tech.building] || 0) + 1;
      if (tech.shipType) {
        out.ship[tech.shipType] = (out.ship[tech.shipType] || 0) + 1;
        out.trade[tech.shipType + "." + tech.stat] = (out.trade[tech.shipType + "." + tech.stat] || 0) + 1;
      }
    });
    return out;
  })()`);

  ["mine", "power", "lab", "embassy"].forEach(function (building) {
    eq(counts.building[building], 3, building + " has three techs (one per extra level)");
  });
  ["corvette", "science", "builder"].forEach(function (ship) {
    eq(counts.ship[ship], 6, ship + " has two levels for each of power, hull and speed");
  });
  SHIP_STATS_CHECK(counts);
  eq(counts.group.stronghold, 5, "the stronghold line has five techs");
  eq(counts.group.radar, 2, "the radar line has two techs");
  eq(counts.group.gate, 3, "the gate throughput line has three techs");
  eq(counts.group.trading, 3, "the trading center line has three techs");
  ok(counts.group.final >= 1, "the final project is still in the catalogue");

  function SHIP_STATS_CHECK(map) {
    ["corvette", "science", "builder"].forEach(function (ship) {
      ["power", "hull", "speed"].forEach(function (stat) {
        eq(map.trade[ship + "." + stat], 2, ship + " " + stat + " has two refit levels");
      });
    });
  }
}

/* ---------- building levels ---------- */

function testBuildingLevels() {
  run("freshTech()");
  eq(run("getBuildingMaxLevel('mine')"), 4, "a building caps at level 4");
  eq(run("getBuildingOutput('mine', 1).minerals"), 8, "a level 1 mine yields 8 minerals");
  eq(run("getBuildingOutput('mine', 2).minerals"), 16, "a level 2 mine yields 16 minerals");
  eq(run("getBuildingOutput('mine', 4).minerals"), 64, "a level 4 mine follows the shared facility table");
  eq(run("getBuildingOutput('power', 2).energy"), 16, "a level 2 power plant yields 16 energy");
  eq(run("getBuildingOutput('lab', 3).research"), 4, "a level 3 lab yields 4 research");
  eq(run("getBuildingOutput('embassy', 4).influence"), 5, "a level 4 embassy yields 5 influence");
  eq(run("getBuildingUpgradeCost('mine').minerals"), 3, "a 5 mineral mine refits for half its value, rounded up");
  eq(run("getBuildingUpgradeCost('power').minerals"), 3, "a power plant refits for 3");
  eq(run("getBuildingUpgradeCost('lab').minerals"), 4, "an 8 mineral lab refits for 4");
  eq(run("getBuildingUpgradeCost('embassy').minerals"), 4, "an embassy refits for 4");

  run("setSectorStock('sec-core', 'minerals', 60)");
  const systemId = run("homeSystem().id");
  run("homeSystem().slots = createPlanetSlots(homeSystem()); homeSystem().population = 12");
  run("buildInSlot(" + JSON.stringify(systemId) + ", 0, 'mine')");
  run("finishConstruction()");
  eq(run("getBuildingLevel(getSystem(" + JSON.stringify(systemId) + ").slots[0])"), 1,
    "a newly built mine starts at level 1");
  eq(run("getBuildingUnlockedLevel('mine')"), 1, "no refit is unlocked before the tech");

  /* Production facilities have a population gate per level. The raw rule still
     blocks a facility that sits under its gate ... */
  run("getSystem(" + JSON.stringify(systemId) + ").slots[0].level = 2");
  eq(run("getWorkforcePlan(getSystem(" + JSON.stringify(systemId) + ")).entries[0].eligible"), false,
    "a level 2 facility is blocked below its 15 population gate");
  eq(run("getPlanetBreakdown(getSystem(" + JSON.stringify(systemId) + ")).typeStats.mine.output.minerals"), 0,
    "a blocked facility produces nothing");
  run("getSystem(" + JSON.stringify(systemId) + ").slots[0].level = 1");

  /* ... and the refit order refuses to create that state by promotion. */
  const gateReason = run("getBuildingRefitPopulationReason(getSystem(" +
    JSON.stringify(systemId) + "), 'mine', 2)");
  ok(typeof gateReason === "string" && gateReason.indexOf("15 population") !== -1 &&
    gateReason.indexOf("12") !== -1, "the gate names the level's minimum population and the colony's people");
  eq(run("getBuildingRefitPopulationReason(getSystem(" + JSON.stringify(systemId) + "), 'lab', 2)"), null,
    "support buildings have no population gate");

  /* The researched tech must not touch the standing building. */
  run("grantTech('mineTech1')");
  eq(run("getBuildingUnlockedLevel('mine')"), 2, "the tech unlocks level 2");
  eq(run("getBuildingLevel(getSystem(" + JSON.stringify(systemId) + ").slots[0])"), 1,
    "a completed tech does not upgrade a standing building");
  eq(run("getPlanetBreakdown(getSystem(" + JSON.stringify(systemId) + ")).typeStats.mine.output.minerals"), 8,
    "the standing mine keeps its level 1 yield after the tech");

  /* Level 2 needs 15 people: 12 is not enough, so the order is refused and the
     working level 1 mine keeps producing. */
  const before = run("getSectorStock('sec-core', 'minerals')");
  eq(run("upgradeBuilding(" + JSON.stringify(systemId) + ", 0)"), false,
    "a refit is refused while the colony is below the new level's population gate");
  eq(run("getBuildingLevel(getSystem(" + JSON.stringify(systemId) + ").slots[0])"), 1,
    "the refused refit leaves the working mine at level 1");
  eq(run("getSectorStock('sec-core', 'minerals')"), before,
    "the refused refit spends no minerals");
  eq(run("getPlanetBreakdown(getSystem(" + JSON.stringify(systemId) + ")).typeStats.mine.output.minerals"), 8,
    "the refused refit keeps the level 1 yield online");

  run("homeSystem().population = 20");
  eq(run("getBuildingRefitPopulationReason(getSystem(" + JSON.stringify(systemId) + "), 'mine', 2)"), null,
    "the gate clears once the colony reaches it");
  ok(run("upgradeBuilding(" + JSON.stringify(systemId) + ", 0)"), "the refit button applies the level");
  eq(run("getBuildingLevel(getSystem(" + JSON.stringify(systemId) + ").slots[0])"), 2,
    "the building is refitted to level 2");
  eq(run("getSectorStock('sec-core', 'minerals')"), before - 3, "the refit costs half the build cost");
  eq(run("getWorkforcePlan(getSystem(" + JSON.stringify(systemId) + ")).entries[0].eligible"), true,
    "a level 2 facility runs at 20 population");
  eq(run("getPlanetBreakdown(getSystem(" + JSON.stringify(systemId) + ")).typeStats.mine.output.minerals"), 16,
    "once the colony reaches the gate the refitted mine yields 16 minerals");

  /* No further level is unlocked yet. */
  const level = run("getBuildingLevel(getSystem(" + JSON.stringify(systemId) + ").slots[0])");
  eq(run("upgradeBuilding(" + JSON.stringify(systemId) + ", 0)"), false,
    "a refit is refused while no level is unlocked");
  eq(run("getBuildingLevel(getSystem(" + JSON.stringify(systemId) + ").slots[0])"), level,
    "the refused refit leaves the level alone");

  run("grantTech('mineTech2')");
  eq(run("getBuildingUnlockedLevel('mine')"), 3, "the second tech unlocks level 3");

  /* Level 3 needs 40 people: the mine stays at its working level 2 instead of
     being promoted into a blocked level 3. */
  eq(run("upgradeBuilding(" + JSON.stringify(systemId) + ", 0)"), false,
    "the level 3 refit is refused below its 40 population gate");
  eq(run("getBuildingLevel(getSystem(" + JSON.stringify(systemId) + ").slots[0])"), 2,
    "the refused level 3 refit leaves the level 2 mine standing");
  eq(run("getPlanetBreakdown(getSystem(" + JSON.stringify(systemId) + ")).typeStats.mine.output.minerals"), 16,
    "the refused level 3 refit keeps the level 2 production online");

  run("homeSystem().population = 40");
  run("setSectorStock('sec-core', 'minerals', 60)");
  ok(run("upgradeBuilding(" + JSON.stringify(systemId) + ", 0)"),
    "the level 3 refit is allowed once the colony reaches 40 population");
  eq(run("getBuildingOutput(getSystem(" + JSON.stringify(systemId) + ").slots[0].type, 3).minerals"), 32,
    "level 3 produces 32 minerals");

  /* Level 4 needs 100 people. The gate wins over the ledger while it applies;
     with the colony large enough an empty ledger is the remaining refusal. */
  run("grantTech('mineTech3')");
  eq(run("getBuildingLevel(getSystem(" + JSON.stringify(systemId) + ").slots[0])"), 3,
    "the level 4 tech does not promote the standing mine");
  eq(run("upgradeBuilding(" + JSON.stringify(systemId) + ", 0)"), false,
    "the level 4 refit is refused below its 100 population gate");
  run("homeSystem().population = 100");
  run("setSectorStock('sec-core', 'minerals', 0)");
  eq(run("upgradeBuilding(" + JSON.stringify(systemId) + ", 0)"), false,
    "the refit is refused without minerals in the sector");
  eq(run("getBuildingLevel(getSystem(" + JSON.stringify(systemId) + ").slots[0])"), 3,
    "the refused refit leaves the building at level 3");
  run("setSectorStock('sec-core', 'minerals', 60)");
  ok(run("upgradeBuilding(" + JSON.stringify(systemId) + ", 0)"),
    "the level 4 refit lands once the colony and the ledger both allow it");
  eq(run("getPlanetBreakdown(getSystem(" + JSON.stringify(systemId) + ")).typeStats.mine.output.minerals"), 64,
    "level 4 produces 64 minerals");

  /* The tech line is per building, and a support building has no population
     gate: a Lab refits at any colony size. */
  run("homeSystem().population = 12");
  run("setSectorStock('sec-core', 'minerals', 60)");
  run("buildInSlot(" + JSON.stringify(systemId) + ", 1, 'lab')");
  run("finishConstruction()");
  eq(run("getBuildingLevel(getSystem(" + JSON.stringify(systemId) + ").slots[1])"), 1,
    "the Lab opens at level 1 before its own tech");
  run("grantTech('labTech1')");
  eq(run("getBuildingUnlockedLevel('lab')"), 2, "the lab line is independent");
  eq(run("getBuildingUnlockedLevel('mine')"), 4, "the mine line remembers its own techs");
  ok(run("upgradeBuilding(" + JSON.stringify(systemId) + ", 1)"),
    "a Lab refits without a population gate");
  eq(run("getBuildingLevel(getSystem(" + JSON.stringify(systemId) + ").slots[1])"), 2,
    "the Lab reaches level 2 at 12 population");

  /* A building laid down AFTER the tech opens at the unlocked level, which is
     what makes the half-price refit a retrofit rather than a rebuild. */
  run("setSectorStock('sec-core', 'minerals', 60)");
  run("buildInSlot(" + JSON.stringify(systemId) + ", 2, 'mine')");
  eq(run("getBuildingLevel(getSystem(" + JSON.stringify(systemId) + ").slots[2])"), 4,
    "new construction carries the researched level");
  run("grantTech('labTech2')");
  run("buildInSlot(" + JSON.stringify(systemId) + ", 3, 'lab')");
  eq(run("getBuildingLevel(getSystem(" + JSON.stringify(systemId) + ").slots[3])"), 3,
    "the lab opens at its own unlocked level");
}

/* ---------- ship refits ---------- */

function testShipRefits() {
  run("freshTech()");
  run("addShip('sec-core', '2,2', 'corvette', 'cv-1')");
  eq(run("getShipPower(findShipLocation('cv-1').ship)"), 4, "a corvette starts at 4 power");
  eq(run("getShipSpeed(findShipLocation('cv-1').ship)"), 1, "a corvette starts at speed 1");
  eq(run("getShipHullMax(findShipLocation('cv-1').ship)"), 5, "a corvette starts at 5 hull");
  eq(run("getShipPendingUpgrades(findShipLocation('cv-1').ship).length"), 0,
    "nothing is waiting on a hull before research");

  run("grantTech('corvettePower1')");
  eq(run("getShipUpgradeAvailableLevel('corvette', 'power')"), 1, "the tech unlocks power level 1");
  eq(run("getShipPower(findShipLocation('cv-1').ship)"), 4,
    "a completed tech does not refit a standing hull");
  eq(run("getShipPendingUpgrades(findShipLocation('cv-1').ship).length"), 1,
    "the hull reports a waiting refit");

  /* No spaceport in the sector: the order is refused. */
  ok(run("getShipRefitBlockReason(findShipLocation('cv-1').ship, 'sec-core').indexOf('spaceport') !== -1"),
    "a refit without a spaceport is refused with a spaceport reason");
  eq(run("upgradeShip('cv-1')"), false, "the refit is refused with no spaceport in the sector");
  eq(run("getShipPower(findShipLocation('cv-1').ship)"), 4, "the refused refit changes nothing");

  run("addStructure('sec-core', '0,5', 'spaceport', true)");
  run("setSectorStock('sec-core', 'minerals', 10)");
  ok(run("upgradeShip('cv-1')"), "the drydock refits the hull");
  eq(run("getShipPower(findShipLocation('cv-1').ship)"), 6, "the refitted corvette has 6 power");
  eq(run("getSectorStock('sec-core', 'minerals')"), 9, "a refit costs 1 mineral per installed level");
  eq(run("getShipInstalledTotalLevels(findShipLocation('cv-1').ship)"), 1,
    "one refit level is installed");

  /* A second hull is untouched until it is refitted too. */
  run("addShip('sec-core', '2,2', 'corvette', 'cv-2')");
  eq(run("getShipPower(findShipLocation('cv-2').ship)"), 4,
    "a second hull keeps its old stats until it is refitted");

  /* Hull refits raise the maximum and restore the plating they add. */
  run("grantTech('corvetteHull1')");
  const hullBefore = run("getShipHull(findShipLocation('cv-1').ship)");
  const maxBefore = run("getShipHullMax(findShipLocation('cv-1').ship)");
  run("setSectorStock('sec-core', 'minerals', 10)");
  ok(run("upgradeShip('cv-1')"));
  eq(run("getShipHullMax(findShipLocation('cv-1').ship)"), maxBefore + 2,
    "the hull refit raises the maximum");
  eq(run("getShipHull(findShipLocation('cv-1').ship)"), hullBefore + 2,
    "the new plating arrives fitted");
  eq(run("getSectorStock('sec-core', 'minerals')"), 9,
    "the refit charged one level, not the whole line");

  run("grantTech('corvetteSpeed1')");
  run("setSectorStock('sec-core', 'minerals', 10)");
  ok(run("upgradeShip('cv-1')"));
  eq(run("getShipSpeed(findShipLocation('cv-1').ship)"), 2, "the speed refit shows on the hull");
  eq(run("getPathEta(4, findShipLocation('cv-1').ship)"), 2, "the refitted hull walks the path faster");
  eq(run("getPathEta(4, 'corvette')"), 4, "the bare hull keeps its base ETA");

  /* Level 2 unlocks but the hull must be refitted again. */
  run("grantTech('corvettePower2')");
  eq(run("getShipPower(findShipLocation('cv-1').ship)"), 6,
    "the second power level waits for its own refit");
  run("setSectorStock('sec-core', 'minerals', 10)");
  ok(run("upgradeShip('cv-1')"));
  eq(run("getShipPower(findShipLocation('cv-1').ship)"), 9, "power level 2 adds three more points");

  /* A hull built after the tech launches already refitted. */
  run("grantTech('corvetteHull2')");
  run("addStructure('sec-core', '0,5', 'spaceport', true)");
  run("state.ui.selectedHex = '0,5'");
  run("setSectorStock('sec-core', 'minerals', 20)");
  run("buildShipAtSpaceport('corvette')");
  const newShipId = run("getSector('sec-core').structures['0,5'].queue[0].ship.id");
  eq(run("findShipLocation(" + JSON.stringify(newShipId) + ")"), null,
    "a queued hull is not in a fleet yet");
  run("state.turn += 1; completeShipConstruction();");
  eq(run("getShipPower(findShipLocation(" + JSON.stringify(newShipId) + ").ship)"), 9,
    "a hull built after the tech launches with the researched refits");
  eq(run("getShipHull(findShipLocation(" + JSON.stringify(newShipId) + ").ship)"),
    run("getShipHullMax(findShipLocation(" + JSON.stringify(newShipId) + ").ship)"),
    "a pre-refitted hull launches at full hull");

  /* Repair. */
  run("findShipLocation('cv-1').ship.hull = 1");
  const missing = run("getShipHullMax(findShipLocation('cv-1').ship) - 1");
  const repairCost = run("getShipRepairCost(findShipLocation('cv-1').ship).minerals");
  eq(repairCost, Math.max(1, Math.ceil(missing * run("CONFIG.upgrades.repairMineralsPerHull"))),
    "a repair is priced from the missing hull");
  run("setSectorStock('sec-core', 'minerals', 10)");
  ok(run("repairShip('cv-1')"), "the drydock repairs the damaged hull");
  eq(run("getShipHull(findShipLocation('cv-1').ship)"),
    run("getShipHullMax(findShipLocation('cv-1').ship)"), "the repair tops the hull up");
  eq(run("getSectorStock('sec-core', 'minerals')"), 10 - repairCost, "the repair is paid from the sector");
  eq(run("repairShip('cv-1')"), false, "an undamaged hull cannot be repaired");
}

/* ---------- stronghold line ---------- */

function testStrongholdTechs() {
  run("freshTech()");
  run("addStructure('sec-core', '1,1', 'stronghold', true)");
  run("addStructure('sec-core', '3,3', 'stronghold', true, 'rival-test')");
  eq(run("getStructureAttack(getStructureAt(1,1,'sec-core'))"), 3, "a stronghold starts at 3 attack");
  eq(run("getStructureHullMax(getStructureAt(1,1,'sec-core'))"), 10, "a stronghold starts at 10 hull max");
  eq(run("getStructurePatrolRadius(getStructureAt(1,1,'sec-core'))"), 2, "a stronghold starts at radius 2");

  run("grantTech('planetaryDefense')");
  eq(run("getStructureAttack(getStructureAt(1,1,'sec-core'))"), 4, "Planetary Defense adds 1 attack");
  run("grantTech('planetaryDefense2')");
  eq(run("getStructureAttack(getStructureAt(1,1,'sec-core'))"), 5, "the second attack tech stacks");
  eq(run("getStructureAttack(getStructureAt(3,3,'sec-core'))"), 3,
    "rival strongholds keep their base attack");
  eq(run("getStructureHullMax(getStructureAt(3,3,'sec-core'))"), 10,
    "rival strongholds keep their base hull");

  run("grantTech('strongholdHull1')");
  eq(run("getStructureHullMax(getStructureAt(1,1,'sec-core'))"), 14, "Bastion Plating adds 4 hull");
  eq(run("getStructureHull(getStructureAt(1,1,'sec-core'))"), 14,
    "a standing stronghold takes the new plating at once");
  run("grantTech('strongholdHull2')");
  eq(run("getStructureHullMax(getStructureAt(1,1,'sec-core'))"), 18, "the second hull tech stacks");
  run("grantTech('strongholdRadius')");
  eq(run("getStructurePatrolRadius(getStructureAt(1,1,'sec-core'))"), 3,
    "Extended Coverage grows the zone to 3 hexes");
  eq(run("getStructurePatrolRadius(getStructureAt(3,3,'sec-core'))"), 2,
    "rival strongholds keep their base radius");

  /* A stronghold built after the tech launches at the full player maximum. */
  const buildKey = run("emptyHex('sec-core')");
  ok(!!buildKey, "the home sector has an empty hex for a new stronghold");
  run("state.ui.selectedHex = " + JSON.stringify(buildKey) + ";");
  run("addShip('sec-core', " + JSON.stringify(buildKey) + ", 'builder', 'builder-1');");
  run("setSectorStock('sec-core', 'minerals', 20)");
  run("buildStructure('stronghold')");
  eq(run("getStructureAt(parseHexKey(" + JSON.stringify(buildKey) + ").row, parseHexKey(" + JSON.stringify(buildKey) + ").col, 'sec-core').hull"), 18,
    "a new stronghold launches at the upgraded maximum hull");
}

/* ---------- radar line ---------- */

function testRadarTechs() {
  run("freshTech()");
  eq(run("getSectorIntelligence('sec-core')"), 1, "a sector starts at INTEL 1");
  run("addStructure('sec-core', '2,2', 'radar', true)");
  eq(run("getSectorIntelligence('sec-core')"), 2, "a radar adds 1 INTEL");
  run("grantTech('radarTech1')");
  eq(run("getRadarIntelBonus()"), 1, "Signal Analysis I adds a radar bonus");
  eq(run("getSectorIntelligence('sec-core')"), 3, "the radar is now worth 2 INTEL");
  run("grantTech('radarTech2')");
  eq(run("getSectorIntelligence('sec-core')"), 4, "the second radar tech is worth 3 INTEL per radar");
  run("addStructure('sec-core', '2,3', 'radar', true)");
  eq(run("getSectorIntelligence('sec-core')"), 7, "every radar uses the tech bonus");
}

/* ---------- gate throughput ---------- */

function testGateOps() {
  run("freshTech()");
  eq(run("getGateOpsPerGate()"), 1, "a gate allows one jump per turn before research");
  eq(run("getSectorGateOps('sec-core').cap"), 0, "a sector without a gate has no ops");
  run("addStructure('sec-core', '2,2', 'gate', true)");
  eq(run("getSectorGateOps('sec-core').cap"), 1, "one gate allows one op");
  eq(run("consumeGateOp('sec-core')"), true, "the first op is spent");
  eq(run("getSectorGateOps('sec-core').left"), 0, "the gate is spent for the turn");
  eq(run("consumeGateOp('sec-core')"), false, "a spent gate refuses another op");

  run("state.turn += 1");
  eq(run("getSectorGateOps('sec-core').left"), 1, "ops refresh when the turn changes");

  run("grantTech('gateTech1')");
  eq(run("getGateOpsPerGate()"), 2, "Gate Throughput I doubles the ops per gate");
  eq(run("getSectorGateOps('sec-core').cap"), 2, "one gate now allows two ops");
  run("addStructure('sec-core', '0,1', 'gate', true)");
  eq(run("getSectorGateOps('sec-core').cap"), 4, "a second gate doubles the sector capacity");
  run("grantTech('gateTech2')");
  eq(run("getGateOpsPerGate()"), 3, "Gate Throughput II raises the per-gate rate");
  run("grantTech('gateTech3')");
  eq(run("getGateOpsPerGate()"), 4, "Gate Throughput III caps the per-gate rate at four");

  /* The jump order enforces the cap. */
  run("freshTech()");
  run("addStructure('sec-core', '0,0', 'gate', true)");
  run("addShip('sec-core', '0,0', 'builder', 'jump-builder')");
  run("addShip('sec-core', '0,0', 'builder', 'jump-builder-2')");
  run("setSectorStock('sec-core', 'energy', 20)");
  const neighbour = run("getSector('sec-core').neighbors[0]");
  run("state.ui.activeSector = 'sec-core'; state.ui.selectedHex = '0,0'; state.ui.shipSelection = ['jump-builder'];");
  run("jumpFleetToSector(" + JSON.stringify(neighbour) + ")");
  eq(run("getSectorGateOps('sec-core').used"), 1, "a jump spends one op");
  run("state.ui.activeSector = 'sec-core'; state.ui.selectedHex = '0,0'; state.ui.shipSelection = ['jump-builder-2'];");
  const energyBefore = run("getSectorStock('sec-core', 'energy')");
  run("jumpFleetToSector(" + JSON.stringify(neighbour) + ")");
  eq(run("getSectorStock('sec-core', 'energy')"), energyBefore,
    "a second jump is refused once the gate is spent, so no energy is burned");
  ok(run("toastMessages.join(' ').indexOf('jump op') !== -1"), "the refusal explains the op limit");
}

/* ---------- trading center routes ---------- */

function testTradeRoutes() {
  run("freshTech()");
  eq(run("getTradeRouteCap()"), 1, "a trading center runs one route before research");
  run("addStructure('sec-core', '1,1', 'trading', true)");
  eq(run("getCenterRoutes(getStructureAt(1,1,'sec-core')).length"), 1, "a center exposes one route slot");

  run("grantTech('tradeRouteTech1')");
  eq(run("getTradeRouteCap()"), 2, "Trade Network I raises the route cap to 2");
  eq(run("getCenterRoutes(getStructureAt(1,1,'sec-core')).length"), 2, "the center now offers two slots");
  run("grantTech('tradeRouteTech2')");
  eq(run("getTradeRouteCap()"), 3, "Trade Network II raises the cap to 3");
  run("grantTech('tradeRouteTech3')");
  eq(run("getTradeRouteCap()"), 4, "Trade Network III raises the cap to 4");
  eq(run("getCenterRoutes(getStructureAt(1,1,'sec-core')).length"), 4, "the center offers four slots");

  /* Two live routes ship independently. */
  run("addStructure('sec-core', '0,0', 'gate', true)");
  run("addStructure('sec-core', '0,1', 'gate', true)");
  const targets = run("getTradeReach('sec-core').targets.slice(0, 2).map(function (t) { return t.sectorId; })");
  eq(targets.length, 2, "the gate reaches at least two sectors");
  run("setTradingCenterTarget('sec-core', '1,1', " + JSON.stringify(targets[0]) + ", 0)");
  run("setTradingCenterTarget('sec-core', '1,1', " + JSON.stringify(targets[1]) + ", 1)");
  eq(run("getStructureAt(1,1,'sec-core').trade.targetSectorId"), targets[0],
    "route 0 is still exposed as structure.trade");
  eq(run("getCenterRoutes(getStructureAt(1,1,'sec-core'))[1].targetSectorId"), targets[1],
    "route 1 keeps its own destination");
  eq(run("getTradingCenterRouteSummary(getStructureAt(1,1,'sec-core')).used"), 2,
    "the summary counts both routes");

  run("adjustTradingCenterAmount('sec-core', '1,1', 'energy', 2, 0)");
  run("adjustTradingCenterAmount('sec-core', '1,1', 'energy', 3, 1)");
  eq(run("getTradeConfig(getStructureAt(1,1,'sec-core'), 0).energy"), 2, "route 0 has its own amount");
  eq(run("getTradeConfig(getStructureAt(1,1,'sec-core'), 1).energy"), 3, "route 1 has its own amount");

  run("setSectorStock('sec-core', 'energy', 20)");
  run("setSectorStock(" + JSON.stringify(targets[0]) + ", 'energy', 0)");
  run("setSectorStock(" + JSON.stringify(targets[1]) + ", 'energy', 0)");
  run("resolveTradeTransfers()");
  eq(run("getSectorStock(" + JSON.stringify(targets[0]) + ", 'energy')"), 2, "route 0 delivered its shipment");
  eq(run("getSectorStock(" + JSON.stringify(targets[1]) + ", 'energy')"), 3, "route 1 delivered its own shipment");
  eq(run("getSectorStock('sec-core', 'energy')"), 15, "both routes drew from the same source ledger");
  eq(run("getTradeSummary().centerCount"), 1, "the summary counts centers, not routes");
  eq(run("getTradeSummary().routeCount"), 2, "the summary counts the live routes");

  /* Clearing one route leaves the other alone. */
  run("clearTradingCenterRoute('sec-core', '1,1', 1)");
  eq(run("getTradeConfig(getStructureAt(1,1,'sec-core'), 1).targetSectorId"), null, "route 1 is cleared");
  eq(run("getTradeConfig(getStructureAt(1,1,'sec-core'), 0).targetSectorId"), targets[0],
    "route 0 survives the clear");
  eq(run("getStructureAt(1,1,'sec-core').trade.targetSectorId"), targets[0],
    "the legacy alias still follows route 0");
}

/* ---------- tech gating ---------- */

function testTechGating() {
  run("freshTech()");
  eq(run("startResearch('mineTech2')"), undefined, "starting a locked tech runs its guard");
  ok(run("toastMessages.join(' ').indexOf('Deep Core Drilling I') !== -1"),
    "the lock reason names the missing prerequisite");
  eq(run("hasTech('mineTech2')"), false, "a locked tech is not researched");

  run("grantTech('mineTech1')");
  eq(run("techLockReason('mineTech2')"), null, "the prerequisite unlocks the next tech");

  run("grantTech('planetaryDefense')");
  ok(run("techLockReason('diplomacyNetwork') !== null"), "the exclusive partner stays locked");
  run("grantTech('tradeRouteTech1')");
  eq(run("techLockReason('tradeRouteTech2')"), null, "a chained tech is reachable once its parent is done");
}

/* ---------- UI ---------- */

function testTechViewUI() {
  run("freshTech()");
  run("renderTechView()");
  let html = run("els.techList.innerHTML");
  ok(html.indexOf("tech-categories") !== -1, "the tech tab renders the category switch");
  ok(html.indexOf('data-tech-category="building"') !== -1, "the buildings tab is rendered");
  ok(html.indexOf('data-tech-category="military"') !== -1, "the military tab is rendered");
  ok(html.indexOf('data-tech-category="trade"') !== -1, "the trade tab is rendered");
  ok(html.indexOf("Deep Core Drilling I") !== -1, "the open category lists its techs");
  ok(html.indexOf("Corvette Weapon Lattice I") === -1, "a closed category stays hidden");
  ok(html.indexOf('data-tech-category="building" aria-selected="true"') !== -1 ||
    html.indexOf('aria-selected="true" data-tech-category="building"') !== -1 ||
    html.indexOf('data-tech-category="building"') !== -1, "the buildings category is selected");
  ok(html.indexOf("FINAL PROJECT") === -1, "no final project section is pinned below the category");
  ok(html.indexOf(">Ascension<") === -1, "the final project card is not listed in the tab");
  ok(run("!!TECHS.ascension"), "the final project stays in the data table for the win condition");
  const banner = run("els.researchBanner.innerHTML");
  ok(banner.indexOf("RESEARCH STOCKPILE") !== -1, "the banner still renders");

  ok(run("setActiveTechCategory('military')"), "the category switch takes");
  html = run("els.techList.innerHTML");
  ok(html.indexOf("Corvette Weapon Lattice I") !== -1, "the military category lists hull techs");
  ok(html.indexOf("Deep Core Drilling I") === -1, "the building category is hidden now");
  eq(run("getActiveTechCategory()"), "military", "the selected category is remembered");
  ok(html.indexOf("FINAL PROJECT") === -1, "the military category has no final project section");
  ok(html.indexOf(">Ascension<") === -1, "the military category does not list the final project");

  run("setActiveTechCategory('trade')");
  html = run("els.techList.innerHTML");
  ok(html.indexOf("Signal Analysis I") !== -1, "the trade category lists the radar line");
  ok(html.indexOf("Trade Network III") !== -1, "the trade category lists the route line");
  ok(html.indexOf("Gate Throughput III") !== -1, "the trade category lists the gate line");
  ok(html.indexOf("FINAL PROJECT") === -1, "the trade category has no final project section");
  ok(html.indexOf(">Ascension<") === -1, "the trade category does not list the final project");
  ok(html.indexOf("Stronghold") === -1, "the trade category does not leak military groups");

  eq(run("setActiveTechCategory('nonsense')"), false, "an unknown category is refused");
  eq(run("getActiveTechCategory()"), "trade", "the refused switch leaves the selection alone");
}

function testColonyRefitUI() {
  run("freshTech()");
  run("setSectorStock('sec-core', 'minerals', 60)");
  const systemId = run("homeSystem().id");
  run("homeSystem().slots = createPlanetSlots(homeSystem()); homeSystem().population = 12");
  run("buildInSlot(" + JSON.stringify(systemId) + ", 0, 'mine')");
  run("finishConstruction()");
  let tile = run("slotTileHTML(getSystem(" + JSON.stringify(systemId) + "), 0, getWorkforcePlan(getSystem(" + JSON.stringify(systemId) + ")))");
  ok(tile.indexOf("data-upgrade-building") === -1,
    "no refit button while nothing is unlocked");

  /* The unlocked refit is advertised, but a colony below the next level's
     population gate disables it and says why. */
  run("grantTech('mineTech1')");
  tile = run("slotTileHTML(getSystem(" + JSON.stringify(systemId) + "), 0, getWorkforcePlan(getSystem(" + JSON.stringify(systemId) + ")))");
  ok(tile.indexOf('data-upgrade-building="0"') !== -1, "the slot grows a refit button");
  ok(tile.indexOf("REFIT") !== -1, "the refit button is labelled");
  ok(tile.indexOf("NEEDS 15 POP") !== -1, "the gated button names the population the level needs");
  ok(tile.indexOf('data-upgrade-building="0" disabled') !== -1,
    "the population gate disables the refit");
  ok(tile.indexOf("needs a colony of 15 population") !== -1,
    "the disabled button explains the gate in its title");
  ok(tile.indexOf("slot-refit gated") !== -1, "the gated button wears its own style");
  eq(run("getBuildingLevel(getSystem(" + JSON.stringify(systemId) + ").slots[0])"), 1,
    "the gated button leaves the working mine alone");

  /* The colony grows past the gate: the same button becomes actionable. */
  run("homeSystem().population = 20");
  tile = run("slotTileHTML(getSystem(" + JSON.stringify(systemId) + "), 0, getWorkforcePlan(getSystem(" + JSON.stringify(systemId) + ")))");
  ok(tile.indexOf('data-upgrade-building="0" disabled') === -1, "the refit unlocks once the colony can support it");
  ok(tile.indexOf("slot-refit gated") === -1, "the gate style is gone");
  ok(tile.indexOf("· 3 ⛏") !== -1, "the priced refit is back");

  ok(run("upgradeBuilding(" + JSON.stringify(systemId) + ", 0)"), "the allowed refit applies");
  tile = run("slotTileHTML(getSystem(" + JSON.stringify(systemId) + "), 0, getWorkforcePlan(getSystem(" + JSON.stringify(systemId) + ")))");
  ok(tile.indexOf("LVL 2") !== -1, "the slot shows its level");
  ok(tile.indexOf("data-upgrade-building") === -1, "the button disappears once refitted");

  /* The level 3 gate (40) disables the next refit; with the colony large
     enough, a short ledger becomes the reason the button shows instead. */
  run("grantTech('mineTech2')");
  tile = run("slotTileHTML(getSystem(" + JSON.stringify(systemId) + "), 0, getWorkforcePlan(getSystem(" + JSON.stringify(systemId) + ")))");
  ok(tile.indexOf("NEEDS 40 POP") !== -1, "the level 3 gate is named at 20 population");
  ok(tile.indexOf('data-upgrade-building="0" disabled') !== -1, "the level 3 refit is disabled");
  run("homeSystem().population = 40");
  run("setSectorStock('sec-core', 'minerals', 0)");
  tile = run("slotTileHTML(getSystem(" + JSON.stringify(systemId) + "), 0, getWorkforcePlan(getSystem(" + JSON.stringify(systemId) + ")))");
  ok(tile.indexOf("data-upgrade-building") !== -1, "the waiting refit is still advertised");
  ok(tile.indexOf('data-upgrade-building="0" disabled') !== -1, "a short ledger disables the refit");
  ok(tile.indexOf("slot-refit short") !== -1, "the short-ledger style is used");
  ok(tile.indexOf("Need 3 minerals") !== -1, "the disabled button explains the ledger in its title");
}

function testDrydockUI() {
  run("freshTech()");
  run("addShip('sec-core', '2,2', 'corvette', 'cv-ui')");
  run("state.ui.selectedHex = '2,2'");
  run("grantTech('corvettePower1')");
  let html = run("fleetTabHTML(2, 2)");
  ok(html.indexOf("DRYDOCK") !== -1, "the fleet tab has a drydock section");
  ok(html.indexOf("NO SPACEPORT IN SECTOR") !== -1, "a sector without a spaceport is called out");
  ok(html.indexOf("data-ship-upgrade") === -1, "no refit button without a spaceport");

  run("addStructure('sec-core', '0,5', 'spaceport', true)");
  run("setSectorStock('sec-core', 'minerals', 10)");
  html = run("fleetTabHTML(2, 2)");
  ok(html.indexOf('data-ship-upgrade="cv-ui"') !== -1, "the refit button appears with a spaceport in the sector");
  ok(html.indexOf('data-ship-repair="cv-ui"') !== -1, "the repair button appears with a spaceport in the sector");
  ok(html.indexOf("SPACEPORT IN SECTOR") !== -1, "the drydock names the spaceport service");

  run("findShipLocation('cv-ui').ship.hull = 1");
  html = run("fleetTabHTML(2, 2)");
  ok(html.indexOf("REPAIR +") !== -1, "a damaged hull offers a priced repair");
}

function testGateOpsUI() {
  run("freshTech()");
  run("addStructure('sec-core', '0,0', 'gate', true)");
  run("addShip('sec-core', '0,0', 'corvette', 'gate-ui')");
  run("state.ui.selectedHex = '0,0'");
  let html = run("fleetTabHTML(0, 0)");
  ok(html.indexOf("OPS LEFT") !== -1, "the jump section reports the ops left");
  ok(html.indexOf("1 / 1") !== -1 || html.indexOf("1 / 2") !== -1, "the ops counter shows used and cap");

  run("consumeGateOp('sec-core')");
  html = run("fleetTabHTML(0, 0)");
  ok(html.indexOf("NO JUMP OPS LEFT") !== -1, "a spent gate says so");
  ok(html.indexOf("Every operational gate in this sector allows") !== -1 ||
    html.indexOf("spent every jump op") !== -1, "the spent gate explains the limit");

  run("grantTech('gateTech1')");
  html = run("fleetTabHTML(0, 0)");
  ok(html.indexOf("2 fleet jumps") !== -1 || html.indexOf("2 / 2") !== -1,
    "the jump section reports the researched rate");
}

function testTradeEditorUI() {
  run("freshTech()");
  run("addStructure('sec-core', '1,1', 'trading', true)");
  run("addStructure('sec-core', '0,0', 'gate', true)");
  let html = run("tradingCenterHTML(getStructureAt(1,1,'sec-core'), 'sec-core', '1,1')");
  ok(html.indexOf("ROUTE 1") !== -1, "the first route is editable");
  ok(html.indexOf("ROUTE 2") === -1, "only one route exists before research");
  ok(html.indexOf("Trade Network") !== -1, "the editor names the tech that adds routes");

  run("grantTech('tradeRouteTech1')");
  html = run("tradingCenterHTML(getStructureAt(1,1,'sec-core'), 'sec-core', '1,1')");
  ok(html.indexOf("ROUTE 2") !== -1, "the second route appears after the tech");
  ok(html.indexOf('data-trade-target="1"') !== -1, "route 2 has its own destination picker");
  ok(html.indexOf('data-trade-amount="1:energy:-1"') !== -1, "route 2 has its own amount steppers");
  ok(html.indexOf('data-trade-clear="1"') !== -1, "route 2 can be cleared on its own");
  ok(html.indexOf("2 routes") !== -1 || html.indexOf("2 routes</b>") !== -1,
    "the editor explains the new capacity");
}

/* ---------- run ---------- */

testCatalogue();
testBuildingLevels();
testShipRefits();
testStrongholdTechs();
testRadarTechs();
testGateOps();
testTradeRoutes();
testTechGating();
testTechViewUI();
testColonyRefitUI();
testDrydockUI();
testGateOpsUI();
testTradeEditorUI();

console.log("tech harness: " + checks + " checks passed");
