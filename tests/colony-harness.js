#!/usr/bin/env node
/* ============================================================
   COLONY HARNESS — the new colony economy
   The app intentionally has no build step, so this harness loads the
   classic browser scripts in a Node VM with tiny UI stubs. Run it with:

       node tests/colony-harness.js

   It covers planet size and slots, the four facility levels, minimum
   population gates, worker allocation (automatic and pinned), the
   P^1.1 / M^0.9 formulas, happiness, growth, the maintenance percentage
   policy, sector allocation and the guarantee that no ledger goes negative.
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
  "js/game/actions.js",
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
  /* Helpers used by the tests. Test systems are plain data, created inside
     the VM so createPlanetSlots() can size them correctly. */
  vm.runInContext(`
    function testSystem(opts) {
      const base = {
        id: "test-planet",
        sectorId: "sec-core",
        name: "Test",
        home: false,
        colonized: true,
        planetSize: "large",
        bonusSlots: 0,
        unlockedBonusSlots: 0,
        population: 5,
        maintenance: { energy: 100, minerals: 100 },
        workerOrders: {},
        economyReport: null,
        growthProgress: 0,
        foundedTurn: 1
      };
      const options = opts || {};
      const system = Object.assign(base, options);
      system.slots = createPlanetSlots(system);
      (options.buildings || []).forEach(function (building, index) {
        if (building) system.slots[index] = building;
      });
      return system;
    }
    function useSystems(list) {
      state.systems = list;
    }
    function stock(energy, minerals) {
      setSectorStock("sec-core", "energy", energy);
      setSectorStock("sec-core", "minerals", minerals);
    }
  `, context, { filename: "colony-harness-helpers" });
  return context;
}

const context = createContext();
function run(code) {
  return vm.runInContext(code, context);
}
function reset(ethic) {
  run("state = createInitialState(" + (ethic ? JSON.stringify(ethic) : "null") + "); state.phase = 'actions'; state.ethic = " + (ethic ? JSON.stringify(ethic) : "null") + "; state.ui.activeSector = 'sec-core';");
}

function testPlanetSizeRolls() {
  const sizes = run("(function(){ const rng=createRng(98765); const c={small:0,medium:0,large:0}; for(let i=0;i<20000;i+=1) c[rollPlanetSize(rng)] += 1; return c; })()");
  near(sizes.small / 20000, 0.25, 0.02, "small planets roll at about 25%");
  near(sizes.medium / 20000, 0.50, 0.02, "medium planets roll at about 50%");
  near(sizes.large / 20000, 0.25, 0.02, "large planets roll at about 25%");

  const bonus = run("(function(){ const rng=createRng(24680); const c=[0,0,0]; for(let i=0;i<20000;i+=1) c[rollBonusSlots(rng)] += 1; return c; })()");
  near(bonus[0] / 20000, 0.85, 0.015, "most planets have no bonus slots");
  near(bonus[1] / 20000, 0.10, 0.015, "10% of planets roll one bonus slot");
  near(bonus[2] / 20000, 0.05, 0.015, "5% of planets roll two bonus slots");
  eq(bonus[3], undefined, "bonus slots never exceed 2");

  reset();
  ok(run("state.systems.every(s => !!getPlanetSizeDef(s.planetSize) && s.planetSize === getPlanetSizeDef(s.planetSize).id)"),
    "every generated system has a valid planet size");
  ok(run("state.systems.every(s => s.bonusSlots >= 0 && s.bonusSlots <= CONFIG.planetSlots.bonus.max)"),
    "every generated system has 0-2 bonus slots");
  ok(run("!!state.systems.find(s => s.home)"), "the capital is generated");
  eq(run("getColonyPopulation(state.systems.find(s => s.home))"),
    run("getEconomyConfig().startingPopulation.home"),
    "the capital starts at the configured home population");
}

function testStartingColony() {
  reset();
  const home = run("state.systems.find(function (system) { return system.home; })");
  eq(home.population, 3, "the capital starts at 3 population");
  eq(home.slots[0].type, "power", "the first starter facility is a Power Plant");
  eq(home.slots[1].type, "mine", "the second starter facility is a Mine");
  eq(home.slots[0].level, 1, "the starter Power Plant is level 1");
  eq(home.slots[1].level, 1, "the starter Mine is level 1");
  eq(home.slots[0].underConstruction, false, "the starter Power Plant is already built");
  eq(home.slots[1].underConstruction, false, "the starter Mine is already built");

  let plan = context.getWorkforcePlan(home);
  eq(plan.strategy, "roundRobin", "the capital starts on round robin");
  eq(context.getWorkerStrategy(home), "roundRobin", "the default strategy is round robin");
  eq(plan.entries.length, 2, "the capital has two starting facilities");
  eq(plan.entries[0].eligible, true, "the level 1 gate opens at 3 population");
  eq(plan.entries[0].workersAssigned, 2, "round robin gives the Power Plant 2 workers");
  eq(plan.entries[1].workersAssigned, 1, "round robin gives the Mine 1 worker");
  eq(plan.entries[0].staffedRatio, 0.5, "two of four Power Plant workers is 50% output");
  eq(plan.entries[1].staffedRatio, 0.25, "one of four Mine workers is 25% output");
  eq(plan.partialBuildings, 2, "both starter facilities are understaffed");
  eq(plan.idleBuildings, 0, "round robin leaves no starter facility idle");
  eq(plan.blockedBuildings, 0, "neither starter facility is below its gate");
  eq(plan.availableWorkers, 0, "every opening worker is assigned");

  let production = context.getColonyProduction(home, plan);
  eq(production.resources.energy, 8, "the 2-worker Power Plant adds 4 energy to the 4-energy baseline");
  eq(production.resources.minerals, 6, "the 1-worker Mine adds 2 minerals to the 4-mineral baseline");

  home.workerStrategy = "greedy";
  plan = context.getWorkforcePlan(home);
  eq(plan.strategy, "greedy", "the colony can switch to greedy");
  eq(plan.entries[0].workersAssigned, 3, "greedy gives the Power Plant all 3 workers");
  eq(plan.entries[1].workersAssigned, 0, "greedy leaves the Mine idle");
  eq(plan.partialBuildings, 1, "the Power Plant is still understaffed");
  eq(plan.idleBuildings, 1, "the Mine is idle under greedy");
  production = context.getColonyProduction(home, plan);
  eq(production.resources.energy, 10, "the greedy Power Plant adds 6 energy");
  eq(production.resources.minerals, 4, "the idle Mine leaves only the baseline");
}

function testSlotModel() {
  reset();
  const small = context.testSystem({ id: "small", planetSize: "small", bonusSlots: 0 });
  eq(context.getStandardSlots(small), 3, "small planets have 3 standard slots");
  eq(context.getTotalSlots(small), 3, "small planets without bonus slots have 3 total slots");
  eq(context.getMaxSlots(small), 3, "all small slots start open");
  eq(small.slots.length, 3, "the slot array matches the planet size");

  const medium = context.testSystem({ id: "medium", planetSize: "medium", bonusSlots: 2 });
  eq(context.getStandardSlots(medium), 4, "medium planets have 4 standard slots");
  eq(context.getTotalSlots(medium), 6, "medium planets with 2 bonus slots have 6 total slots");
  eq(context.getMaxSlots(medium), 4, "bonus slots start locked");
  eq(medium.slots.length, 6, "locked slots are part of the slot array");
  ok(context.isSlotLocked(medium, 4), "the first bonus slot is locked");
  ok(context.isSlotLocked(medium, 5), "the second bonus slot is locked");
  ok(context.isSlotBuildable(medium, 3), "the last standard slot is buildable");
  ok(!context.isSlotBuildable(medium, 4), "a locked bonus slot cannot be built in");

  const large = context.testSystem({ id: "large", planetSize: "large", bonusSlots: 0 });
  eq(context.getStandardSlots(large), 6, "large planets have 6 standard slots");
  eq(context.getStandardSlots(context.testSystem({ planetSize: "unknown", bonusSlots: 0 })), 4,
    "unknown sizes fall back to medium");
}

function testSlotUnlocking() {
  reset();
  const system = context.testSystem({ id: "unlock", planetSize: "medium", bonusSlots: 2 });
  context.useSystems([system]);
  run("setSectorStock('sec-core', 'energy', 10); setSectorStock('sec-core', 'minerals', 20);");

  eq(run("getSlotUnlockBlockReason(getSystem('unlock'), 4)"), null, "the first bonus slot can be unlocked");
  eq(run("getSlotUnlockBlockReason(getSystem('unlock'), 5)"), "Open the earlier bonus slot first",
    "bonus slots unlock in order");

  run("unlockPlanetSlot('unlock', 4)");
  eq(run("getSectorStock('sec-core', 'energy')"), 5, "unlocking costs the sector's energy");
  eq(run("getSectorStock('sec-core', 'minerals')"), 12, "unlocking costs the sector's minerals");
  eq(run("getSystem('unlock').unlockedBonusSlots"), 1, "the bonus slot counter advances");
  eq(run("getMaxSlots(getSystem('unlock'))"), 5, "the unlocked slot becomes buildable");
  ok(!run("isSlotLocked(getSystem('unlock'), 4)"), "the first bonus slot is now open");
  ok(run("isSlotLocked(getSystem('unlock'), 5)"), "the second bonus slot is still locked");

  run("unlockPlanetSlot('unlock', 5)");
  eq(run("getMaxSlots(getSystem('unlock'))"), 6, "the second bonus slot opens");
  eq(run("getSectorStock('sec-core', 'energy')"), 0, "the second unlock costs energy too");
  eq(run("getSectorStock('sec-core', 'minerals')"), 4, "the second unlock costs minerals too");
  eq(run("getSlotUnlockBlockReason(getSystem('unlock'), 6)"), "This slot is already open",
    "there is no third bonus slot");

  reset();
  const poor = context.testSystem({ id: "poor", planetSize: "medium", bonusSlots: 1 });
  context.useSystems([poor]);
  run("setSectorStock('sec-core', 'energy', 1); setSectorStock('sec-core', 'minerals', 20);");
  ok(run("getSlotUnlockBlockReason(getSystem('poor'), 4)").indexOf("more energy") !== -1,
    "unlocking is refused without enough energy");
  run("unlockPlanetSlot('poor', 4)");
  eq(run("getSystem('poor').unlockedBonusSlots"), 0, "a refused unlock does not open the slot");
}

function testFacilityLevels() {
  eq(run("getBuildingOutput('mine', 1).minerals"), 8, "a level 1 mine yields 8 minerals");
  eq(run("getBuildingOutput('mine', 2).minerals"), 16, "a level 2 mine yields 16 minerals");
  eq(run("getBuildingOutput('mine', 3).minerals"), 32, "a level 3 mine yields 32 minerals");
  eq(run("getBuildingOutput('mine', 4).minerals"), 64, "a level 4 mine yields 64 minerals");
  eq(run("getBuildingOutput('power', 1).energy"), 8, "a level 1 power plant yields 8 energy");
  eq(run("getBuildingOutput('power', 4).energy"), 64, "a level 4 power plant yields 64 energy");
  eq(run("getBuildingOutput('power', 2).minerals"), undefined, "a power plant has no mineral output");

  eq(run("getBuildingWorkers('mine', 1)"), 4, "level 1 needs 4 workers");
  eq(run("getBuildingWorkers('mine', 2)"), 6, "level 2 needs 6 workers");
  eq(run("getBuildingWorkers('mine', 3)"), 9, "level 3 needs 9 workers");
  eq(run("getBuildingWorkers('mine', 4)"), 14, "level 4 needs 14 workers");
  eq(run("getBuildingMinPopulation('mine', 1)"), 3, "level 1 needs a colony of 3");
  eq(run("getBuildingMinPopulation('mine', 2)"), 15, "level 2 needs a colony of 15");
  eq(run("getBuildingMinPopulation('mine', 3)"), 40, "level 3 needs a colony of 40");
  eq(run("getBuildingMinPopulation('mine', 4)"), 100, "level 4 needs a colony of 100");
  eq(run("getBuildingLevelName('power', 1)"), "Primitive", "level 1 is Primitive");
  eq(run("getBuildingLevelName('power', 2)"), "Industrial", "level 2 is Industrial");
  eq(run("getBuildingLevelName('power', 3)"), "Advanced", "level 3 is Advanced");
  eq(run("getBuildingLevelName('power', 4)"), "Megastructural", "level 4 is Megastructural");

  eq(run("getBuildingOutput('lab', 3).research"), 4, "the lab keeps its support-building table");
  eq(run("getBuildingWorkers('lab', 3)"), 1, "a lab still needs one worker");
  eq(run("getBuildingMinPopulation('lab', 1)"), 0, "a lab has no population gate");
  eq(run("getBuildingUpkeep('mine')"), 0, "a mine pays no energy upkeep");
  eq(run("getBuildingUpkeep('lab')"), 1, "a lab still draws one energy");
}

function testWorkforceAndProduction() {
  reset();
  const low = context.testSystem({
    id: "low-pop",
    population: 2,
    buildings: [
      { type: "mine", level: 1, underConstruction: false },
      { type: "power", level: 1, underConstruction: false }
    ]
  });
  context.useSystems([low]);
  let plan = context.getWorkforcePlan(low);
  eq(plan.population, 2, "the plan reads the population");
  eq(plan.entries[0].eligible, false, "a level 1 facility is blocked below 3 population");
  eq(plan.entries[0].workersAssigned, 0, "a blocked facility cannot take workers");
  eq(plan.blockedBuildings, 2, "both facilities are blocked");
  eq(plan.blockedJobs, 8, "the blocked posts are reported");
  eq(plan.availableWorkers, 2, "everyone is free while the gate is closed");
  let production = context.getColonyProduction(low, plan);
  eq(production.resources.energy, 0, "a blocked power plant produces nothing");
  eq(production.resources.minerals, 0, "a blocked mine produces nothing");

  low.population = 4;
  plan = context.getWorkforcePlan(low);
  eq(plan.strategy, "roundRobin", "the fixture defaults to round robin");
  eq(plan.entries[0].eligible, true, "the level 1 gate opens at 3 population");
  eq(plan.entries[0].workersAssigned, 2, "round robin gives the mine 2 workers");
  eq(plan.entries[1].workersAssigned, 2, "round robin gives the power plant 2 workers");
  eq(plan.idleBuildings, 0, "nobody is idle at four population");
  eq(plan.partialBuildings, 2, "both facilities are half staffed");
  production = context.getColonyProduction(low, plan);
  eq(production.resources.minerals, 4, "a half mine produces 4 minerals");
  eq(production.resources.energy, 4, "a half power plant produces 4 energy");

  low.workerStrategy = "greedy";
  plan = context.getWorkforcePlan(low);
  eq(plan.entries[0].workersAssigned, 4, "greedy fills the first facility");
  eq(plan.entries[1].workersAssigned, 0, "greedy leaves the second facility idle");
  eq(plan.idleBuildings, 1, "the second facility is idle under greedy");
  production = context.getColonyProduction(low, plan);
  eq(production.resources.minerals, 8, "the greedy mine produces 8 minerals");
  eq(production.resources.energy, 0, "the idle power plant produces nothing");
  low.workerStrategy = "roundRobin";

  low.population = 6;
  plan = context.getWorkforcePlan(low);
  eq(plan.entries[0].workersAssigned, 3, "round robin gives the mine 3 of 6");
  eq(plan.entries[1].workersAssigned, 3, "round robin gives the power plant 3 of 6");
  eq(plan.entries[1].staffedRatio, 0.75, "the power plant is three-quarters staffed");
  eq(plan.partialBuildings, 2, "both facilities are understaffed");
  eq(plan.availableWorkers, 0, "everyone is assigned");
  production = context.getColonyProduction(low, plan);
  eq(production.resources.minerals, 6, "a three-quarter mine produces 6 minerals");
  eq(production.resources.energy, 6, "a three-quarter power plant produces 6 energy");

  low.population = 10;
  plan = context.getWorkforcePlan(low);
  eq(plan.entries[0].workersAssigned, 4, "the mine keeps 4 workers");
  eq(plan.entries[1].workersAssigned, 4, "the power plant fills its crew");
  eq(plan.availableWorkers, 2, "two people remain free");
  eq(plan.jobsStaffed, 8, "eight posts are staffed");
  eq(plan.jobsTotal, 8, "there are eight total posts");
  production = context.getColonyProduction(low, plan);
  eq(production.resources.minerals, 8, "the mine produces its full output");
  eq(production.resources.energy, 8, "the power plant produces its full output");

  const tech = context.testSystem({
    id: "level-two",
    population: 15,
    buildings: [
      { type: "mine", level: 2, underConstruction: false },
      { type: "power", level: 2, underConstruction: false }
    ]
  });
  context.useSystems([tech]);
  plan = context.getWorkforcePlan(tech);
  eq(plan.entries[0].workersAssigned, 6, "a level 2 mine takes 6 workers");
  eq(plan.entries[1].workersAssigned, 6, "a level 2 power plant takes 6 workers");
  eq(plan.availableWorkers, 3, "three people remain free");
  production = context.getColonyProduction(tech, plan);
  eq(production.resources.minerals, 16, "a level 2 mine produces 16");
  eq(production.resources.energy, 16, "a level 2 power plant produces 16");

  tech.population = 12;
  plan = context.getWorkforcePlan(tech);
  eq(plan.entries[0].eligible, false, "a level 2 facility is blocked below 15");
  eq(plan.entries[0].workersAssigned, 0, "the blocked mine takes no workers");
}

function testPinnedCrews() {
  reset();
  const system = context.testSystem({
    id: "pinned",
    population: 10,
    buildings: [
      { type: "mine", level: 1, underConstruction: false },
      { type: "power", level: 1, underConstruction: false }
    ]
  });
  context.useSystems([system]);
  let plan = context.getWorkforcePlan(system);
  eq(plan.hasOrders, false, "a fresh colony has no explicit orders");
  eq(plan.entries[0].workersAssigned, 4, "automatic round robin fills the mine");
  eq(plan.entries[1].workersAssigned, 4, "automatic round robin fills the power plant");

  let result = context.adjustFacilityWorkersOrder(system, 0, -1);
  eq(result.ok, true, "the mine can give up a worker");
  eq(system.workerOrders[0], 3, "the mine is pinned at 3");
  eq(system.workerOrders[1], 4, "the other crew is pinned too, so nothing reshuffles");
  plan = context.getWorkforcePlan(system);
  eq(plan.hasOrders, true, "the colony now uses explicit orders");
  eq(plan.entries[0].workersAssigned, 3, "the mine runs one worker short");
  eq(plan.entries[0].staffedRatio, 0.75, "three of four is 75% output");
  eq(plan.availableWorkers, 3, "three workers are free");
  eq(plan.partialBuildings, 1, "the mine is understaffed");

  result = context.adjustFacilityWorkersOrder(system, 0, 1);
  eq(result.ok, true, "the free worker can return to the mine");
  eq(system.workerOrders[0], 4, "the mine is back to a full crew");
  eq(context.getWorkforcePlan(system).availableWorkers, 2, "two workers remain free");

  result = context.adjustFacilityWorkersOrder(system, 1, 1);
  eq(result.ok, false, "a full crew cannot grow");
  ok(result.reason.indexOf("full crew") !== -1, "the refusal explains the full crew");

  context.clearWorkerOrders(system);
  plan = context.getWorkforcePlan(system);
  eq(plan.hasOrders, false, "clearing the orders returns to automatic staffing");
  eq(plan.entries[0].workersAssigned, 4, "the mine is auto-staffed again");

  system.population = 6;
  system.workerOrders = { 0: 4, 1: 4 };
  plan = context.getWorkforcePlan(system);
  eq(plan.entries[0].workersAssigned, 4, "the first order keeps its full crew");
  eq(plan.entries[1].workersAssigned, 2, "later orders are capped by the population");
  eq(plan.assignedWorkers, 6, "total assigned workers never exceeds population");
  ok(context.adjustFacilityWorkersOrder(system, 1, 1).ok === false,
    "a full population cannot be over-assigned");
  system.population = 2;
  plan = context.getWorkforcePlan(system);
  eq(plan.entries[0].eligible, false, "the population gate blocks the facility again");
  eq(plan.entries[1].eligible, false, "and blocks the second facility too");
  eq(plan.assignedWorkers, 0, "a blocked colony assigns nobody");
}

function testWorkerStrategies() {
  reset();
  const home = run("state.systems.find(function (system) { return system.home; })");
  eq(context.getWorkerStrategy(home), "roundRobin", "new colonies default to round robin");
  home.workerStrategy = "bogus";
  eq(context.getWorkerStrategy(home), "roundRobin", "an unknown strategy falls back to round robin");
  home.workerStrategy = "greedy";
  eq(context.getWorkerStrategy(home), "greedy", "a valid strategy is kept");
  eq(context.getWorkerStrategyLabel("greedy"), "GREEDY", "strategy labels come from config");

  const system = context.testSystem({
    id: "strategy-three",
    population: 3,
    buildings: [
      { type: "power", level: 1, underConstruction: false },
      { type: "mine", level: 1, underConstruction: false },
      { type: "lab", level: 1, underConstruction: false }
    ]
  });
  context.useSystems([system]);
  let plan = context.getWorkforcePlan(system);
  eq(plan.strategy, "roundRobin", "the three-facility fixture starts on round robin");
  eq(plan.entries[0].workersAssigned, 1, "round robin gives the Power Plant one worker");
  eq(plan.entries[1].workersAssigned, 1, "round robin gives the Mine one worker");
  eq(plan.entries[2].workersAssigned, 1, "round robin gives the Lab one worker");
  eq(plan.assignedWorkers, 3, "three people fill three posts");

  system.workerStrategy = "greedy";
  plan = context.getWorkforcePlan(system);
  eq(plan.entries[0].workersAssigned, 3, "greedy fills the first facility first");
  eq(plan.entries[1].workersAssigned, 0, "the second facility waits under greedy");
  eq(plan.entries[2].workersAssigned, 0, "the third facility waits under greedy");

  system.workerStrategy = "roundRobin";
  system.workerOrders = { 0: 0, 1: 0, 2: 0 };
  plan = context.getWorkforcePlan(system);
  eq(plan.assignedWorkers, 0, "explicit zero orders override the strategy");
  eq(plan.availableWorkers, 3, "three workers stay free under explicit orders");
  context.clearWorkerOrders(system);
  plan = context.getWorkforcePlan(system);
  eq(plan.entries[0].workersAssigned, 1, "clearing orders returns to round robin");
  eq(plan.entries[1].workersAssigned, 1, "the second facility shares again");
  eq(plan.entries[2].workersAssigned, 1, "the third facility shares again");
}

function testFormulas() {
  const cfg = context.getEconomyConfig();
  eq(cfg.growthRate, 0.05, "the base growth rate is 5%");
  eq(cfg.energyExponent, 1.1, "energy scales at P^1.1");
  eq(cfg.housingExponent, 0.9, "housing scales at M^0.9");

  near(context.getPopulationEnergyRequirement(10), Math.pow(10, 1.1), 1e-9,
    "E_required is P^1.1");
  near(context.getRequiredHousingMinerals(10), Math.pow(10, 1 / 0.9), 1e-9,
    "the full housing investment is P^(1/0.9)");
  near(context.getHousingCapacity(5), Math.pow(5, 0.9), 1e-9, "H is M^0.9");
  eq(context.getPopulationEnergyRequirement(0), 0, "no population needs no energy");
  eq(context.getRequiredHousingMinerals(0), 0, "no population needs no housing minerals");

  const full = context.getColonyHappiness(12.5892541179, 12.9154966501, 10);
  near(full.happiness, 100, 1e-6, "full energy and full housing are 100% happiness");
  eq(full.housingDeficit, 0, "full housing leaves no deficit");
  eq(full.normalizedHousingDeficit, 0, "the normalized deficit is zero");

  const halfEnergy = context.getColonyHappiness(6.2946270589, 12.9154966501, 10);
  near(halfEnergy.happiness, 50, 1e-6, "half the energy is half the happiness");
  near(halfEnergy.energyFulfillment, 0.5, 1e-9, "G is 0.5");

  const halfHousing = context.getColonyHappiness(12.5892541179, 5, 10);
  near(halfHousing.housingCapacity, Math.pow(5, 0.9), 1e-9, "H uses the minerals spent");
  near(halfHousing.normalizedHousingDeficit, (10 - Math.pow(5, 0.9)) / 10, 1e-9,
    "h is the housing deficit over population");
  near(halfHousing.happiness, 100 * (Math.pow(5, 0.9) / 10), 1e-9,
    "housing fulfillment multiplies happiness");

  const excess = context.getColonyHappiness(100, 100, 10);
  eq(excess.happiness, 100, "excess energy and housing never exceed 100");
  eq(excess.housingDeficit, 0, "excess housing leaves no deficit");

  eq(context.getColonyHappiness(0, 0, 5).happiness, 0, "no energy and no housing is zero happiness");
  eq(context.getColonyHappiness(0, 100, 0).happiness, 100, "an empty colony is trivially happy");

  near(context.getPopulationGrowthForHappiness(10, 100), 0.5, 1e-9,
    "10 people at 100% happiness grow by 0.5");
  near(context.getPopulationGrowthForHappiness(10, 80), 0.4, 1e-9,
    "10 people at 80% happiness grow by 0.4");
  near(context.getPopulationGrowthForHappiness(10, 50), 0.25, 1e-9,
    "10 people at 50% happiness grow by 0.25");
  eq(context.getPopulationGrowthForHappiness(10, 0), 0, "0% happiness means no growth");
}

function testGrowthMultiplier() {
  const cfg = context.getEconomyConfig();
  eq(cfg.maxPercent, 200, "maintenance can reach 200%");
  eq(cfg.maxGrowthMultiplier, 2, "the growth bonus caps at 2x");
  const p = 3;
  const e = context.getPopulationEnergyRequirement(p);
  const m = context.getRequiredHousingMinerals(p);
  near(context.getMaintenanceGrowthMultiplier(e, m, p), 1, 1e-9,
    "100% on both lines is the normal rate");
  near(context.getMaintenanceGrowthMultiplier(e * 2, m * 2, p), 2, 1e-9,
    "200% on both lines doubles growth");
  near(context.getMaintenanceGrowthMultiplier(e * 2, m, p), 1.5, 1e-9,
    "200% energy and 100% housing is 1.5x");
  near(context.getMaintenanceGrowthMultiplier(e, m * 2, p), 1.5, 1e-9,
    "200% housing and 100% energy is 1.5x");
  near(context.getMaintenanceGrowthMultiplier(e * 1.5, m * 1.5, p), 1.5, 1e-9,
    "150% on both lines is 1.5x");
  near(context.getMaintenanceGrowthMultiplier(0, 0, p), 1, 1e-9,
    "no maintenance never earns a bonus");

  const system = context.testSystem({ id: "growth-bonus", population: 3, maintenance: { energy: 200, minerals: 200 } });
  context.useSystems([system]);
  run("stock(100, 100)");
  let report = context.getColonyEconomy(system);
  near(report.baseGrowthAmount, 0.15, 1e-9, "base growth at three people is 0.15");
  near(report.growthMultiplier, 2, 1e-9, "the report carries the 2x multiplier");
  near(report.growthAmount, 0.30, 1e-9, "the final growth is doubled");
  eq(report.turnsToNextPop, 4, "0.30 per turn reaches a person in four turns");
  near(report.energyFunding, 200, 1e-9, "energy funding is the spent share");
  near(report.mineralsFunding, 200, 1e-9, "housing funding is the spent share");

  run("stock(3, 3)");
  report = context.getColonyEconomy(system);
  near(report.growthMultiplier, 1, 1e-9, "a stock-poor colony cannot buy the bonus");
}

function testColonyReports() {
  reset();
  const system = context.testSystem({
    id: "report",
    population: 10,
    maintenance: { energy: 50, minerals: 100 }
  });
  context.useSystems([system]);
  run("stock(100, 100)");
  const report = context.getColonyEconomy(system);
  near(report.energyRequired, Math.pow(10, 1.1), 1e-9, "the report carries E_required");
  near(report.energySpent, Math.pow(10, 1.1) * 0.5, 1e-9, "50% energy buys half the requirement");
  near(report.energyFulfillment, 0.5, 1e-9, "G follows the percentage");
  near(report.housingCapacity, 10, 1e-6, "100% housing buys full capacity");
  near(report.happiness, 50, 1e-6, "50% energy and full housing is 50% happiness");
  near(report.growthAmount, 0.25, 1e-9, "growth is 10 × 5% × 50%");
  eq(report.canGrow, true, "the colony can grow");
  eq(report.growthBlockedBy, null, "nothing blocks growth");

  system.maintenance = { energy: 100, minerals: 50 };
  const housing = context.getColonyEconomy(system);
  near(housing.mineralsSpent, Math.pow(10, 1 / 0.9) * 0.5, 1e-9,
    "50% housing invests half the required minerals");
  near(housing.normalizedHousingDeficit, (10 - housing.housingCapacity) / 10, 1e-9,
    "the report carries the normalized housing deficit");
  near(housing.happiness, (housing.housingCapacity / 10) * 100, 1e-9,
    "happiness is the housing factor times full energy");

  run("stock(0, 0)");
  system.maintenance = { energy: 100, minerals: 100 };
  const poor = context.getColonyEconomy(system);
  eq(poor.energySpent, 0, "no stock means no energy spent");
  eq(poor.mineralsSpent, 0, "no stock means no minerals spent");
  eq(poor.happiness, 0, "no maintenance means no happiness");
  eq(poor.growthAmount, 0, "no happiness means no growth");
}

function testGrowth() {
  const system = context.testSystem({ id: "growth", population: 10 });
  system.economyReport = { growthAmount: 0.5, happiness: 100 };
  system.growthProgress = 0.4;
  context.applyColonyGrowth(system);
  eq(system.population, 10, "half a person is banked, not rounded up");
  near(system.growthProgress, 0.9, 1e-9, "the fraction carries between turns");
  context.applyColonyGrowth(system);
  eq(system.population, 11, "the banked fraction completes a person");
  near(system.growthProgress, 0.4, 1e-9, "the leftover fraction carries");

  system.population = 10;
  system.growthProgress = 0;
  system.economyReport = { growthAmount: 5, happiness: 100 };
  context.applyColonyGrowth(system);
  eq(system.population, 15, "large growth adds all of its whole people");
  near(system.growthProgress, 0, 1e-9, "no fraction is left");

  system.population = 10;
  system.growthProgress = 0;
  system.economyReport = { growthAmount: 0, happiness: 0 };
  context.applyColonyGrowth(system);
  eq(system.population, 10, "zero happiness means zero growth");
  eq(system.growthProgress, 0, "no progress is banked without growth");

  system.population = 10.9;
  eq(context.getColonyPopulation(system), 10, "population is read as a whole number");
  eq(context.getPopulationGrowthForHappiness(-5, 100), 0, "negative population never grows");
}

function testMaintenancePolicy() {
  const system = context.testSystem({ id: "policy", population: 5 });
  system.maintenance = undefined;
  let policy = context.getColonyMaintenancePolicy(system);
  eq(policy.energy, 100, "the default energy maintenance is 100%");
  eq(policy.minerals, 100, "the default housing investment is 100%");

  system.maintenance = { energy: 250, minerals: -10 };
  policy = context.getColonyMaintenancePolicy(system);
  eq(policy.energy, 200, "percentages are clamped to 200");
  eq(policy.minerals, 0, "percentages are clamped to 0");

  system.maintenance = { energy: 200, minerals: 200 };
  eq(context.getColonyMaintenanceChangeReason(system, "energy", 1),
    "At the maximum 200% maintenance.", "the plus stepper stops at 200");
  system.maintenance = { energy: 100, minerals: 100 };
  eq(context.getColonyMaintenanceChangeReason(system, "energy", 1), null,
    "the plus stepper can cross 100");
  system.maintenance = { energy: 0, minerals: 100 };
  eq(context.getColonyMaintenanceChangeReason(system, "energy", -1),
    "Already at 0% maintenance.", "the minus stepper stops at 0");
  eq(context.getColonyMaintenanceChangeReason(system, "nonsense", 1),
    "Unknown maintenance axis.", "an unknown axis is refused");

  system.maintenance = { energy: 100, minerals: 100 };
  const lower = context.adjustColonyMaintenance(system, "energy", -1);
  eq(lower.ok, true, "a normal step is allowed");
  eq(system.maintenance.energy, 90, "the step is 10%");
  eq(context.adjustColonyMaintenance(system, "minerals", -1).ok, true, "housing can step down too");
  eq(system.maintenance.minerals, 90, "the mineral policy is independent");

  reset();
  const actionSystem = context.testSystem({ id: "action-policy", population: 5 });
  actionSystem.maintenance = { energy: 100, minerals: 100 };
  context.useSystems([actionSystem]);
  run("state.phase = 'actions';");
  eq(context.adjustPopulationUpkeep("action-policy", "energy", -1), true,
    "the UI's energy stepper succeeds");
  eq(actionSystem.maintenance.energy, 90, "energy maintenance falls by 10%");
  eq(context.adjustPopulationUpkeep("action-policy", "housing", -1), true,
    "the legacy housing axis is an alias for minerals");
  eq(actionSystem.maintenance.minerals, 90, "housing investment falls by 10%");
  eq(context.adjustPopulationUpkeep("action-policy", "sustenance", -1), true,
    "the legacy sustenance axis is an alias for energy");
  eq(actionSystem.maintenance.energy, 80, "energy maintenance falls again");
}

function testSectorAllocation() {
  reset();
  const a = context.testSystem({ id: "alloc-a", population: 10 });
  const b = context.testSystem({ id: "alloc-b", population: 5 });
  context.useSystems([a, b]);
  run("stock(15, 20)");

  const allocations = context.getSectorColonyAllocations("sec-core");
  eq(allocations.systems.length, 2, "both colonies are allocated");
  eq(allocations.energy.available, 15, "the allocation sees the sector energy");
  near(allocations.energy.requested, Math.pow(10, 1.1) + Math.pow(5, 1.1), 1e-9,
    "both colonies request their full energy");
  near(allocations.energy.spent, 15, 1e-9, "the short stock is fully spent");
  near(allocations.byId["alloc-a"].energySpent / Math.pow(10, 1.1),
    allocations.byId["alloc-b"].energySpent / Math.pow(5, 1.1), 1e-9,
    "scarce energy is shared proportionally");
  near(allocations.byId["alloc-a"].energyFulfillment, 15 / (Math.pow(10, 1.1) + Math.pow(5, 1.1)), 1e-9,
    "the fulfillment ratio is the same for both colonies");
  eq(allocations.minerals.spent > 0, true, "the sector spends its mineral stock too");
  eq(run("getSectorStock('sec-core', 'energy')"), 15,
    "building the allocation does not mutate the ledger");

  const resolved = context.resolvePopulationMaintenance();
  eq(resolved.colonies, 2, "the turn summary counts both colonies");
  near(run("getSectorStock('sec-core', 'energy')"), 0, 1e-9, "energy is paid up to the stock");
  near(run("getSectorStock('sec-core', 'minerals')"), 20 - allocations.minerals.spent, 1e-9,
    "housing is paid from the same ledger");
  ok(run("getSectorStock('sec-core', 'energy') >= 0"), "the energy ledger never goes negative");
  ok(run("getSectorStock('sec-core', 'minerals') >= 0"), "the mineral ledger never goes negative");
  ok(!!a.economyReport, "the resolved report is stored on the colony");
  eq(a.economyReport.resolvedTurn, 1, "the report records the turn it was resolved on");
}

function testSectorEconomyAndUpkeep() {
  reset();
  const system = context.testSystem({ id: "ledger", population: 10 });
  context.useSystems([system]);
  run("stock(100, 100)");

  const sectorEcon = context.getSectorEconomy("sec-core");
  near(sectorEcon.populationUpkeepEnergy, Math.pow(10, 1.1), 1e-9,
    "the sector ledger carries the population energy request");
  near(sectorEcon.populationUpkeepMinerals, Math.pow(10, 1 / 0.9), 1e-9,
    "the sector ledger carries the housing request");
  eq(sectorEcon.infrastructureUpkeep, 1, "colony overhead is infrastructure upkeep");
  near(sectorEcon.upkeep, 1 + Math.pow(10, 1.1), 1e-9,
    "total energy upkeep is infrastructure plus population");
  near(sectorEcon.net.energy, -(1 + Math.pow(10, 1.1)), 0.05,
    "the projected net subtracts both bills");
  near(sectorEcon.net.minerals, -Math.pow(10, 1 / 0.9), 0.05,
    "the projected net subtracts housing");

  context.resolvePopulationMaintenance();
  const report = context.paySectorUpkeep();
  eq(report.deficit, false, "infrastructure could be paid in full");
  near(run("getSectorStock('sec-core', 'energy')"), 100 - Math.pow(10, 1.1) - 1, 1e-9,
    "population energy is paid first, then colony overhead");
  near(run("getSectorStock('sec-core', 'minerals')"), 100 - Math.pow(10, 1 / 0.9), 1e-9,
    "housing is paid from the mineral ledger");

  run("stock(0.5, 0)");
  context.resolvePopulationMaintenance();
  const short = context.paySectorUpkeep();
  eq(short.deficit, true, "a sector that cannot pay infrastructure is in deficit");
  eq(run("getSectorStock('sec-core', 'energy')"), 0, "the energy ledger stops at zero");
  eq(run("getSectorStock('sec-core', 'minerals')"), 0, "the mineral ledger stops at zero");
  eq(short.paid["sec-core"].shortfallEnergy, 1, "the shortfall is reported");
  ok(context.getSectorsInDeficit().some(function (sector) { return sector.id === "sec-core"; }),
    "the stability sheet lists the sector");

  run("setSectorStock('sec-core', 'minerals', 5); addSectorStock('sec-core', 'minerals', -50);");
  eq(run("getSectorStock('sec-core', 'minerals')"), 0, "no ledger path can go negative");
}

function testIncomeCarry() {
  reset();
  run("setSectorStock('sec-core', 'minerals', 0);");
  context.applySectorIncome("sec-core", "minerals", 1.5);
  eq(run("getSectorStock('sec-core', 'minerals')"), 1, "1.5 income pays 1 whole mineral");
  near(run("getSectorCarry('sec-core').minerals"), 0.5, 1e-9, "the half mineral is carried in the sector");
  context.applySectorIncome("sec-core", "minerals", 1.5);
  eq(run("getSectorStock('sec-core', 'minerals')"), 3, "the carried half completes the next unit");

  reset();
  run("state.resources.research = 0;");
  context.applyResourceIncome("research", 0.25);
  context.applyResourceIncome("research", 0.25);
  context.applyResourceIncome("research", 0.25);
  eq(run("state.resources.research"), 0, "fractions below one pay nothing yet");
  context.applyResourceIncome("research", 0.25);
  eq(run("state.resources.research"), 1, "four quarter ticks pay one research");
  near(run("state.resourceCarry.research"), 0, 1e-9, "no carry is left after an exact unit");
}

function testColonization() {
  reset();
  const target = run("state.systems.find(s => !s.colonized && !s.owner)");
  ok(!!target, "found an unowned system to colonise");
  run("markHexExplored(" + target.row + ", " + target.col + ", " + JSON.stringify(target.sectorId) + ")");
  run("setSectorStock(" + JSON.stringify(target.sectorId) + ", 'minerals', 20); state.resources.influence = 10;");
  context.colonizeSystem(target.id);
  const system = context.getSystem(target.id);
  const startingColony = run("getEconomyConfig().startingPopulation.colony");
  eq(system.colonized, true, "colonisation marks the system colonised");
  eq(system.unlockedBonusSlots, 0, "a new colony starts with every bonus slot locked");
  eq(system.growthProgress, 0, "a new colony starts with no growth carry");
  eq(system.population, startingColony, "a new colony starts at the configured population");
  eq(system.workerStrategy, "roundRobin", "a new colony starts on round robin");
  eq(system.maintenance.energy, 100, "a new colony starts with full energy maintenance");
  eq(system.maintenance.minerals, 100, "a new colony starts with full housing investment");
  eq(Object.keys(system.workerOrders).length, 0, "a new colony starts on automatic crew order");
  eq(context.getWorkforcePlan(system).jobsTotal, 0, "a new colony has no worker posts yet");
  eq(context.getWorkforcePlan(system).availableWorkers, startingColony,
    "every colonist is free at founding");
  eq(system.slots.length, context.getTotalSlots(system),
    "the colony slot array matches the planet size plus bonus slots");
  ok(system.slots.every(function (slot) { return slot === null; }), "a new colony has no buildings");
}

function main() {
  testPlanetSizeRolls();
  testStartingColony();
  testSlotModel();
  testSlotUnlocking();
  testFacilityLevels();
  testWorkforceAndProduction();
  testPinnedCrews();
  testWorkerStrategies();
  testFormulas();
  testGrowthMultiplier();
  testColonyReports();
  testGrowth();
  testMaintenancePolicy();
  testSectorAllocation();
  testSectorEconomyAndUpkeep();
  testIncomeCarry();
  testColonization();
  console.log("colony harness: " + checks + " checks passed");
}

main();
