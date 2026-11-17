#!/usr/bin/env node
/* ============================================================
   COLONY HARNESS — logic checks for planet size, slots, population
   houses/sustenance, growth and partial staffing
   The app intentionally has no build step, so this harness loads the
   classic browser scripts in a Node VM with tiny UI stubs. Run it with:

       node tests/colony-harness.js

   It covers the 25/50/25 planet-size roll, locked bonus slots, slot
   unlocking, worker assignment by slot order, partial production, full
   upkeep for unstaffed buildings, the population housing/sustenance
   policy, saturating growth, the hard house cap, mineral/energy
   population upkeep and fractional income carry.
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
        population: 1,
        populationUpkeep: { housing: 0, sustenance: 0 },
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
  ok(run("state.systems.find(s => s.home).planetSize === getPlanetSizeDef(state.systems.find(s => s.home).planetSize).id"),
    "the capital gets a planet size too");

  const a = run("JSON.stringify(createGalaxy(CONFIG.galaxy.seed).systems.map(s => [s.id, s.planetSize, s.bonusSlots]))");
  const b = run("JSON.stringify(createGalaxy(CONFIG.galaxy.seed).systems.map(s => [s.id, s.planetSize, s.bonusSlots]))");
  eq(a, b, "planet sizes and bonus slots are deterministic per seed");
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

function testWorkforceAndUpkeep() {
  reset();
  const system = context.testSystem({
    id: "workforce",
    name: "Workforce",
    planetSize: "large",
    bonusSlots: 0,
    population: 3,
    /* The founding shelter holds 1; two paid houses make room for 3. */
    populationUpkeep: { housing: 4, sustenance: 0 },
    buildings: [
      { type: "mine", underConstruction: false },
      { type: "power", underConstruction: false },
      { type: "lab", underConstruction: false }
    ]
  });
  context.useSystems([system]);

  let plan = context.getWorkforcePlan(system);
  eq(plan.jobsTotal, 4, "mine 2 + power 1 + lab 1 = 4 worker posts");
  eq(plan.jobsStaffed, 3, "three population staff the first three posts");
  eq(plan.idleJobs, 1, "the lab has no worker");
  eq(plan.idleBuildings, 1, "one completed building is idle");
  eq(plan.partialBuildings, 0, "no building is partial at three population");
  eq(plan.availableWorkers, 0, "all three population are assigned");
  eq(plan.baseHousing, 1, "a normal colony starts with one founding shelter");
  eq(plan.paidHouses, 2, "4 minerals of housing upkeep pay for two houses");
  eq(plan.cap, 3, "housing cap is the founding shelter plus paid houses");
  eq(plan.housingUpkeep, 4, "the housing upkeep is the mineral cost of those houses");
  eq(plan.sustenanceUpkeep, 0, "no sustenance upkeep is set yet");
  eq(plan.sustenance.percent, 0, "sustenance is at 0% without energy upkeep");
  eq(plan.entries[0].workersAssigned, 2, "the mine takes two workers first");
  eq(plan.entries[1].workersAssigned, 1, "the power plant takes the third worker");
  eq(plan.entries[2].workersAssigned, 0, "the lab gets none");

  let planet = context.getPlanetBreakdown(system);
  eq(planet.output.minerals, 3, "a fully staffed mine produces its full 3 minerals");
  eq(planet.output.energy, 4, "the power plant produces 4 energy");
  eq(planet.output.research, 0, "the idle lab produces no research");
  eq(planet.buildingUpkeep, 2, "mine and lab upkeep are paid even with the lab idle");
  eq(planet.mineralUpkeep, 4, "the planet pays its population housing upkeep in minerals");
  eq(planet.populationUpkeep.minerals, 4, "the population upkeep names the housing draw");
  eq(planet.populationUpkeep.energy, 0, "no sustenance energy is drawn yet");
  eq(planet.upkeep, 3, "colony overhead and building energy upkeep are unchanged");
  eq(planet.mineralUpkeepItems[0].label, "Population housing", "the housing draw is itemised");
  eq(planet.counts.lab, 1, "idle buildings still count as built");
  eq(planet.idleBuildings, 1, "the breakdown reports the idle building");

  system.population = 2;
  plan = context.getWorkforcePlan(system);
  eq(plan.entries[0].workersAssigned, 2, "the mine keeps its two workers");
  eq(plan.entries[1].workersAssigned, 0, "the power plant is idle at two population");
  eq(plan.jobsStaffed, 2, "only the mine is staffed");
  eq(plan.idleBuildings, 2, "power and lab are both idle");
  planet = context.getPlanetBreakdown(system);
  eq(planet.output.energy, 0, "an idle power plant produces nothing");
  eq(planet.output.minerals, 3, "the mine still produces full output");
  eq(planet.buildingUpkeep, 2, "idle buildings still pay upkeep");
  eq(planet.mineralUpkeep, 4, "housing is paid for the houses, not the heads");

  system.population = 1;
  plan = context.getWorkforcePlan(system);
  eq(plan.entries[0].workersAssigned, 1, "one worker goes to the 2-worker mine");
  eq(plan.entries[0].staffedRatio, 0.5, "the mine is half staffed");
  eq(plan.partialBuildings, 1, "the mine is counted as understaffed");
  eq(plan.idleBuildings, 2, "power and lab are still idle");
  planet = context.getPlanetBreakdown(system);
  eq(planet.output.minerals, 1.5, "one of two mine workers produces 50% of 3 minerals");
  eq(planet.output.energy, 0, "the power plant is idle");
  eq(planet.sources.minerals[0].sub.indexOf("1/2 workers") !== -1, true,
    "the mineral source shows the partial crew");
  eq(planet.buildingUpkeep, 2, "upkeep is not reduced by partial staffing");
  eq(planet.upkeep, 3, "colony overhead plus both building upkeeps");

  const econ = context.getEconomy();
  eq(econ.income.minerals, 1.5, "empire mineral income keeps the half-staffed yield");
  eq(econ.upkeep, 3, "empire upkeep includes idle buildings");
  eq(econ.mineralUpkeep, 4, "empire upkeep includes the population housing draw");
  eq(econ.netMinerals, -2.5, "net minerals subtract housing upkeep");
  eq(econ.sources.minerals[0].label, "Solara Core · Workforce · Mines ×1",
    "empire sources name the sector, colony and building");
  eq(econ.sources.minerals[0].amount, 1.5, "empire sources carry the partial amount");

  const sectorEcon = context.getSectorEconomy("sec-core");
  eq(sectorEcon.income.minerals, 1.5, "the sector ledger keeps the half-staffed yield");
  eq(sectorEcon.net.minerals, -2.5, "the sector's net minerals subtract housing upkeep");
  eq(sectorEcon.upkeep, 3, "the sector pays its colony and building upkeep");
  eq(sectorEcon.mineralUpkeep, 4, "the sector pays the population housing upkeep too");
  eq(sectorEcon.mineralUpkeepItems[0].label, "Population housing ×1", "the housing draw is aggregated");
}

function testPopulationHousing() {
  reset();
  ok(run("!BUILDINGS.residential"), "the residential building is gone from the build table");
  eq(run("BUILDING_ORDER.indexOf('residential')"), -1, "housing is no longer a building type");

  const small = context.testSystem({ id: "small-colony", planetSize: "small", population: 1 });
  eq(context.getMaxExtraHouses(small), 3, "a small planet can pay for 3 extra houses");
  eq(context.getMaxHousingUpkeep(small), 6, "3 extra houses cost 6 minerals of upkeep");
  eq(context.getPopulationHousingCap(small), 1, "with no policy the cap is the founding shelter");
  eq(context.getHousingCapForUpkeep(small, 2), 2, "2 minerals of upkeep buys one house");
  eq(context.getHousingCapForUpkeep(small, 6), 4, "6 minerals of upkeep fills the small planet");
  eq(context.getHousingCapForUpkeep(small, 100), 4, "housing never exceeds what the planet can pay for");

  const large = context.testSystem({ id: "large-colony", planetSize: "large", population: 1 });
  eq(context.getMaxExtraHouses(large), 6, "a large planet can pay for 6 extra houses");
  eq(context.getMaxHousingUpkeep(large), 12, "6 extra houses cost 12 minerals of upkeep");

  large.populationUpkeep = { housing: 999, sustenance: 999 };
  const policy = context.getPopulationPolicy(large);
  eq(policy.housing, 12, "housing upkeep is clamped to the planet's extra houses");
  eq(policy.sustenance, context.getMaxSustenanceUpkeep(large), "sustenance upkeep is clamped too");
  eq(context.getPopulationHousingCap(large), 7, "the cap stops at the founding shelter plus six houses");

  const colony = context.testSystem({
    id: "hard-cap",
    planetSize: "medium",
    population: 3,
    populationUpkeep: { housing: 4, sustenance: 0 }
  });
  context.useSystems([colony]);
  eq(context.getPopulationHousingCap(colony), 3, "two paid houses house exactly three people");
  eq(context.getPopulationUpkeepChangeReason(colony, "housing", -1),
    "Housing can't fall below the current population.",
    "a housing cut that would evict people is refused");
  eq(context.getPopulationUpkeepChangeReason(colony, "housing", 1), null,
    "raising housing is allowed");
  eq(context.getPopulationUpkeepChangeReason(colony, "sustenance", -1),
    "Already at zero sustenance upkeep.",
    "the sustenance stepper stops at zero");
}

function testPopulationSustenance() {
  const cfg = context.getPopulationSustenanceConfig();
  eq(cfg.populationPerEnergy, 2, "one energy feeds two population");
  eq(cfg.maxMult, 1.25, "sustenance tops out at 125%");

  let state = context.getSustenanceState(3, 0);
  eq(state.percent, 0, "no upkeep means 0% sustenance");
  eq(state.tier.id, "starving", "0% is starving");
  eq(state.mult, 0, "starvation stops growth");

  state = context.getSustenanceState(3, 1);
  eq(state.supply, 2, "1 energy feeds 2 people");
  eq(state.demand, 3, "3 people need 3 servings");
  eq(state.percent, 67, "2 of 3 fed is 67%");
  eq(state.tier.id, "frugal", "67% is frugal");
  near(state.mult, 2 / 3, 1e-9, "the growth multiplier is 2/3");

  state = context.getSustenanceState(2, 1);
  eq(state.percent, 100, "1 energy feeds 2 people exactly");
  eq(state.tier.id, "content", "100% is content");
  eq(state.mult, 1, "content means full growth");

  state = context.getSustenanceState(3, 5);
  eq(state.supply, 10, "5 energy feeds 10");
  eq(state.capped, true, "surplus food is capped");
  eq(state.percent, 125, "the multiplier caps at 125%");
  eq(state.tier.id, "thriving", "125% is thriving");

  eq(context.getSustenanceState(1, 1).tier.id, "thriving", "a surplus at low population is thriving");
  eq(context.getSustenanceState(8, 1).tier.id, "malnourished", "1 energy for 8 people is malnourishment");
}

function testPopulationGrowth() {
  reset();
  const barren = context.testSystem({ id: "barren", planetSize: "small", population: 1 });
  context.useSystems([barren]);
  let plan = context.getWorkforcePlan(barren);
  eq(plan.cap, 1, "without paid houses the cap is the founding shelter");
  eq(plan.growthBlockedBy, "housing", "the founding shelter is full");
  eq(plan.growthPerTurn, 0, "growth is zero at the cap");
  context.growPopulations();
  eq(barren.population, 1, "population stays at the cap");

  const colony = context.testSystem({
    id: "growth",
    planetSize: "small",
    population: 2,
    populationUpkeep: { housing: 4, sustenance: 1 }
  });
  context.useSystems([colony]);
  plan = context.getWorkforcePlan(colony);
  eq(plan.cap, 3, "two paid houses raise the cap to 3");
  eq(plan.sustenance.percent, 100, "1 energy feeds the colony exactly");
  near(plan.growthPerTurn, 0.5, 1e-9, "growth is 1.5 * 1.0 * 1/3");
  eq(plan.turnsToNextPop, 2, "the next population needs two turns");
  context.growPopulations();
  eq(colony.population, 2, "half a population is banked after the first tick");
  near(colony.growthProgress, 0.5, 1e-9, "the fraction is carried");
  context.growPopulations();
  eq(colony.population, 3, "the banked fraction completes the population");
  eq(colony.growthProgress, 0, "the carry resets at the cap");
  eq(context.getWorkforcePlan(colony).canGrow, false, "the colony stops at the house cap");

  /* Housing room without sustenance does not grow. */
  colony.population = 1;
  colony.growthProgress = 0;
  colony.populationUpkeep.sustenance = 0;
  plan = context.getWorkforcePlan(colony);
  eq(plan.housingRoom, 2, "there are empty houses");
  eq(plan.sustenance.percent, 0, "but nothing feeds the colony");
  eq(plan.growthBlockedBy, "sustenance", "growth is blocked by sustenance");
  eq(plan.growthPerTurn, 0, "no sustenance means no growth");
  context.growPopulations();
  eq(colony.population, 1, "the colony does not grow unfed");

  /* Sustenance scales growth: a surplus goes past the 100% rate. */
  colony.populationUpkeep.sustenance = 1;
  plan = context.getWorkforcePlan(colony);
  eq(plan.sustenance.percent, 125, "a surplus is thriving at 125%");
  near(plan.growthPerTurn, 1.25, 1e-9, "growth is 1.5 * 1.25 * 2/3");

  /* The hard cap also settles a stale state above the houses. */
  colony.population = 5;
  colony.growthProgress = 0.5;
  context.growPopulations();
  eq(colony.population, 3, "population is clamped to the houses at the growth step");
  eq(colony.growthProgress, 0, "the growth carry is dropped on the clamp");
}

function testPopulationActions() {
  reset();
  const system = context.testSystem({ id: "menu-colony", planetSize: "small", population: 1 });
  context.useSystems([system]);
  run("state.phase = 'actions';");

  eq(context.adjustPopulationUpkeep("menu-colony", "housing", 1), true, "raising the housing stepper succeeds");
  eq(system.populationUpkeep.housing, 2, "one housing step costs 2 minerals");
  eq(context.getPopulationHousingCap(system), 2, "the colony now has two houses");
  eq(context.adjustPopulationUpkeep("menu-colony", "sustenance", 1), true, "raising sustenance succeeds");
  eq(system.populationUpkeep.sustenance, 1, "one sustenance step costs 1 energy");
  eq(context.getWorkforcePlan(system).sustenance.percent, 125,
    "one energy feeds the single colonist with a surplus");

  eq(context.adjustPopulationUpkeep("menu-colony", "housing", 1), true, "a second house can be funded");
  eq(context.getPopulationHousingCap(system), 3, "two paid houses hold three people");
  eq(context.adjustPopulationUpkeep("menu-colony", "housing", 1), true, "a third house fills the small planet");
  eq(context.getPopulationHousingCap(system), 4, "the small planet reaches its size cap");
  eq(context.getPopulationUpkeepChangeReason(system, "housing", 1), "At the maximum housing upkeep.",
    "housing cannot exceed the planet size");
  eq(context.adjustPopulationUpkeep("menu-colony", "housing", 1), false, "the extra step is refused");

  system.population = 4;
  eq(context.getPopulationUpkeepChangeReason(system, "housing", -1),
    "Housing can't fall below the current population.",
    "the menu refuses to evict people");
  eq(context.adjustPopulationUpkeep("menu-colony", "housing", -1), false, "the eviction step is refused");
  eq(system.populationUpkeep.housing, 6, "the refused step changes nothing");
  eq(context.getPopulationHousingCap(system), 4, "the houses are unchanged");

  system.population = 3;
  eq(context.adjustPopulationUpkeep("menu-colony", "housing", -1), true,
    "lowering housing is allowed above the population");
  eq(system.populationUpkeep.housing, 4, "the mineral upkeep falls by one step");
  eq(context.getPopulationHousingCap(system), 3, "the cap falls with it");
}

function testPopulationUpkeepPayment() {
  reset();
  const system = context.testSystem({
    id: "upkeep-colony",
    planetSize: "small",
    population: 2,
    populationUpkeep: { housing: 4, sustenance: 1 }
  });
  context.useSystems([system]);
  run("setSectorStock('sec-core','energy',10); setSectorStock('sec-core','minerals',10);");

  const sectorEcon = context.getSectorEconomy("sec-core");
  eq(sectorEcon.upkeep, 2, "colony overhead + 1 sustenance energy = 2 energy upkeep");
  eq(sectorEcon.populationUpkeepEnergy, 1, "the sector carries the sustenance draw");
  eq(sectorEcon.mineralUpkeep, 4, "the housing draw is the sector's mineral upkeep");
  eq(sectorEcon.net.energy, -2, "the ledger shows the energy bill");
  eq(sectorEcon.net.minerals, -4, "the ledger subtracts the housing bill");

  const report = context.paySectorUpkeep();
  eq(run("getSectorStock('sec-core','energy')"), 8, "upkeep subtracts the sustenance energy");
  eq(run("getSectorStock('sec-core','minerals')"), 6, "upkeep subtracts the housing minerals");
  eq(report.deficit, false, "the sector could pay in full");
  eq(report.paid["sec-core"].energy, 2, "the report carries the energy paid");
  eq(report.paid["sec-core"].minerals, 4, "the report carries the minerals paid");

  context.growPopulations();
  eq(system.population, 2, "one 0.5 growth tick is banked, not rounded up");
  near(system.growthProgress, 0.5, 1e-9, "the growth tick is fractional");
  context.growPopulations();
  eq(system.population, 3, "the second tick completes the population");

  run("setSectorStock('sec-core','minerals',1)");
  const shortReport = context.paySectorUpkeep();
  eq(run("getSectorStock('sec-core','minerals')"), -3, "an unpaid housing bill runs a mineral deficit");
  eq(shortReport.deficit, true, "the report flags the mineral deficit");
  ok(context.getSectorsInDeficit().some(function (sector) { return sector.id === "sec-core"; }),
    "the stability sheet lists the sector in deficit");
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
  eq(system.colonized, true, "colonisation marks the system colonised");
  eq(system.unlockedBonusSlots, 0, "a new colony starts with every bonus slot locked");
  eq(system.growthProgress, 0, "a new colony starts with no growth carry");
  eq(system.population, 1, "a new colony starts with one population");
  eq(system.populationUpkeep.housing, 0, "a new colony has no housing upkeep yet");
  eq(system.populationUpkeep.sustenance, 0, "a new colony has no sustenance upkeep yet");
  eq(context.getWorkforcePlan(system).cap, 1, "its founding shelter holds exactly one person");
  eq(system.slots.length, context.getTotalSlots(system), "the colony slot array matches the planet size plus bonus slots");
  ok(system.slots.every(function (slot) { return slot === null; }), "a new colony has no buildings");
}

function main() {
  testPlanetSizeRolls();
  testSlotModel();
  testSlotUnlocking();
  testWorkforceAndUpkeep();
  testPopulationHousing();
  testPopulationSustenance();
  testPopulationGrowth();
  testPopulationActions();
  testPopulationUpkeepPayment();
  testIncomeCarry();
  testColonization();
  console.log("colony harness: " + checks + " checks passed");
}

main();
