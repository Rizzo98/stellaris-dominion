#!/usr/bin/env node
/* ============================================================
   POPULATION HARNESS — the colony maintenance card, menu and crew controls
   The app intentionally has no build step, so this harness loads the classic
   browser scripts in a Node VM with element stubs. Run it with:

       node tests/population-harness.js

   It covers the clickable population card, the energy/housing readout, the
   two maintenance steppers, happiness/growth copy, the workforce section and
   reset button, the facility crew buttons, the build sheet's level/minimum
   population copy, and the resource/detail sheet rows.
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
  "js/ui/planet-screen.js",
  "js/ui/sheet-content.js",
  "js/ui/sheets.js",
  "js/game/actions.js"
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
function includes(haystack, needle, message) {
  assert.ok(String(haystack).indexOf(needle) !== -1,
    message + " (missing " + JSON.stringify(needle) + ")");
  checks += 1;
}
function excludes(haystack, needle, message) {
  assert.ok(String(haystack).indexOf(needle) === -1,
    message + " (unexpected " + JSON.stringify(needle) + ")");
  checks += 1;
}
function balanced(html, tag, message) {
  const opens = (String(html).match(new RegExp("<" + tag + "(?:\\s|>)", "g")) || []).length;
  const closes = (String(html).match(new RegExp("</" + tag + ">", "g")) || []).length;
  assert.strictEqual(opens, closes, message + " (got " + opens + " <" + tag + "> and " + closes + " </" + tag + ">)");
  checks += 1;
}

/* One fake element covers every DOM read the renderers make. */
function fakeElement() {
  return {
    innerHTML: "",
    textContent: "",
    style: {},
    attributes: {},
    dataset: {},
    scrollTop: 0,
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
    getBoundingClientRect: function () { return { left: 0, top: 0, width: 0, height: 0 }; }
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
    els: els,
    hideToast: function () {},
    toast: function () {},
    renderAll: function () {},
    renderMap: function () {},
    setResourceTexts: function () {}
  };
  vm.createContext(context);
  files.forEach(function (file) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
  });
  vm.runInContext(`
    var toastMessages = [];
    toast = function (message) { toastMessages.push(message); };

    /* dom.js is not loaded (it caches real elements), so the shared markup
       helpers it provides are mirrored here for the renderers under test. */
    function signedClass(value) {
      if (value > 0) return "text-good";
      if (value < 0) return "text-bad";
      return "";
    }
    function deltaClass(value) {
      if (value > 0) return "good";
      if (value < 0) return "bad";
      return "";
    }
    function breakdownRow(label, amount, options) {
      const opts = options || {};
      const sub = opts.sub ? '<span class="breakdown-sub">' + opts.sub + "</span>" : "";
      const extraClass = opts.className ? " " + opts.className : "";
      return '<div class="breakdown-row' + extraClass + '">' +
        '<span class="breakdown-label">' + label + sub + "</span>" +
        '<span class="breakdown-amount ' + (opts.amountClass || "") + '">' + amount + "</span>" +
      "</div>";
    }
    function signedBreakdownRow(label, amount, sub) {
      return breakdownRow(
        label,
        formatSigned(amount),
        { sub: sub || "", amountClass: amount > 0 ? "text-good" : amount < 0 ? "text-bad" : "" }
      );
    }
    function renderEffectPills() { return ""; }

    function freshPopulation() {
      state = createInitialState(null);
      state.phase = "actions";
      state.ethic = null;
      state.tech.active = null;
      state.empires = [];
      state.stability = CONFIG.stability.start;
      const home = state.galaxy.sectors.find(function (sector) { return sector.home; });
      state.ui.activeSector = home.id;
      state.ui.activeTab = "map";
      state.ui.mapMode = "sector";
      state.ui.selectedHex = hexKey(home.entryRow, home.entryCol);
      state.ui.selectedSystem = null;
      state.ui.shipSelection = [];
      state.ui.move = null;
      state.ui.sheet = null;
      state.ui.spaceportOpen = false;
      toastMessages.length = 0;
      /* These UI fixtures use a mature 12-person capital so the card, crew
         and build-sheet tests can exercise full crews. The actual 3-person
         opening layout is covered by the colony and economy harnesses. */
      const capital = state.systems.find(function (system) { return system.home; });
      capital.population = 12;
      /* The UI fixtures are fully funded; the 15/15 opening stock is covered
         by the colony and economy harnesses. */
      setSectorStock(home.id, "energy", 100);
      setSectorStock(home.id, "minerals", 100);
      return capital;
    }

    function homeSectorId() {
      return state.galaxy.sectors.find(function (sector) { return sector.home; }).id;
    }

    function setMaintenance(system, energy, minerals) {
      system.maintenance = { energy: energy, minerals: minerals };
      return system;
    }

    function setStock(energy, minerals) {
      const sectorId = homeSectorId();
      setSectorStock(sectorId, "energy", energy);
      setSectorStock(sectorId, "minerals", minerals);
    }

    function finishBuildings(system) {
      (system.slots || []).forEach(function (slot) {
        if (slot) slot.underConstruction = false;
      });
      return system;
    }
  `, context, { filename: "population-harness-helpers" });
  return { context: context, els: els };
}

const harness = createContext();
const context = harness.context;
const els = harness.els;
function run(code) {
  return vm.runInContext(code, context);
}
function reset() {
  return run("freshPopulation()");
}

/* ---------- population card ---------- */

function testPopulationCard() {
  let system = reset();
  let planet = context.getPlanetBreakdown(system);
  let html = context.populationCardHTML(system, planet);
  includes(html, 'data-population-menu="' + system.id + '"', "the population card opens the menu");
  includes(html, "👥", "the card carries the population glyph");
  includes(html, "PEOPLE", "the card labels the population");
  includes(html, "100% ENERGY", "the card shows energy fulfillment");
  includes(html, "12 / 12 HOUSED", "the card shows the housed population");
  includes(html, "100% FLOURISHING", "the card shows happiness and its tier");
  includes(html, "+0.6 / TURN", "the card forecasts the 5% growth");
  includes(html, "MANAGE MAINTENANCE &amp; WORKFORCE", "the card names the management menu");
  ok(html.indexOf('<button class="population-card"') === 0, "the card is a real button");
  balanced(html, "span", "the card markup is balanced");
  balanced(html, "button", "the card buttons are balanced");

  /* No stock: the colony reports the shortfall and stops growing. */
  run("setStock(0, 0)");
  planet = context.getPlanetBreakdown(system);
  html = context.populationCardHTML(system, planet);
  includes(html, "0% ENERGY", "the card reports zero energy supply");
  includes(html, "0 / 12 HOUSED", "the card reports the housing deficit");
  includes(html, "0% MISERABLE", "zero maintenance is miserable");
  includes(html, "UNFUNDED", "the card explains why growth stopped");

  /* A facility under its minimum population is called out. */
  run("setStock(100, 100)");
  system.slots[0] = { type: "mine", level: 3, underConstruction: false };
  planet = context.getPlanetBreakdown(system);
  html = context.populationCardHTML(system, planet);
  includes(html, "1 BLOCKED", "the card counts facilities below their population gate");
  includes(html, "below its minimum population", "the card explains the blocked facility");
}

function testLowPopulationGrowthCopy() {
  const system = reset();
  system.population = 3;
  eq(context.formatGrowthAmount(0.15), "0.15", "growth keeps two decimals at three population");
  eq(context.formatGrowthAmount(0.6), "0.6", "larger growth still trims trailing zeros");
  eq(context.formatGrowthAmount(0.165), "0.16", "the readout rounds down rather than overstating growth");
  const planet = context.getPlanetBreakdown(system);
  eq(context.formatGrowthAmount(planet.populationMaintenance.growthAmount), "0.15",
    "the three-person colony grows by 0.15");
  eq(planet.populationMaintenance.turnsToNextPop, 7, "0.15 per turn reaches a whole person in 7 turns");
  const card = context.populationCardHTML(system, planet);
  includes(card, "+0.15 / TURN", "the card shows the real growth rate");
  includes(card, "Next population in 7 turns", "the card's turn count matches that rate");
  const sheet = context.populationSheetHTML(system);
  includes(sheet, "+0.15 / turn", "the population sheet shows the real growth rate");
  includes(sheet, "7 turns", "the population sheet agrees with the card");
}

/* ---------- population / maintenance menu ---------- */

function testOverfundedGrowth() {
  const system = reset();
  system.population = 3;
  system.maintenance = { energy: 200, minerals: 200 };
  const planet = context.getPlanetBreakdown(system);
  eq(planet.populationMaintenance.growthMultiplier, 2, "200% on both lines doubles growth");
  eq(context.formatGrowthAmount(planet.populationMaintenance.growthAmount), "0.3",
    "three people grow by 0.30 per turn at 2x");
  eq(planet.populationMaintenance.turnsToNextPop, 4, "0.30 per turn reaches a person in four turns");
  let card = context.populationCardHTML(system, planet);
  includes(card, "+0.3 / TURN", "the card shows the accelerated rate");
  includes(card, "Next population in 4 turns", "the card's turn count is accelerated too");
  includes(card, "×2.00 GROWTH", "the card shows the surplus multiplier chip");
  includes(card, "Maintenance surplus ×2.00", "the card explains the surplus multiplier");
  let sheet = context.populationSheetHTML(system);
  includes(sheet, "200%", "the maintenance row shows the raised cap");
  includes(sheet, "Maintenance growth multiplier", "the sheet has a growth multiplier row");
  includes(sheet, "×2.00", "the sheet reports the 2x multiplier");
  includes(sheet, "+0.3 / turn", "the sheet reports the accelerated growth");
  includes(sheet, "4 turns", "the sheet reports the shorter forecast");

  system.maintenance = { energy: 200, minerals: 100 };
  const oneLine = context.getPlanetBreakdown(system);
  eq(Math.round(oneLine.populationMaintenance.growthMultiplier * 100) / 100, 1.5,
    "one overfunded line is a 1.5x bonus");
  includes(context.populationCardHTML(system, oneLine), "×1.50 GROWTH", "the card shows the one-line bonus");
  includes(context.populationSheetHTML(system), "×1.50", "the sheet shows the one-line bonus");
}

function testPopulationSheet() {
  const system = reset();
  let html = context.populationSheetHTML(system);
  includes(html, "MAINTENANCE", "the menu has a maintenance section");
  includes(html, "Energy maintenance", "the energy row is labelled");
  includes(html, "Housing investment", "the housing row is labelled");
  includes(html, "data-pop-upkeep=\"energy:-1\"", "the energy stepper can go down");
  includes(html, "data-pop-upkeep=\"energy:1\"", "the energy stepper can go up");
  includes(html, "data-pop-upkeep=\"minerals:-1\"", "the housing stepper can go down");
  includes(html, "data-pop-upkeep=\"minerals:1\"", "the housing stepper can go up");
  includes(html, "E_required = P^1.1", "the menu states the energy formula");
  includes(html, "H = M_spent^0.9", "the menu states the housing formula");
  includes(html, "F = 100 × min(1, G) × max(0, 1 − h)", "the menu states the happiness formula");
  includes(html, "ENERGY", "the menu has an energy section");
  includes(html, "HOUSING", "the menu has a housing section");
  includes(html, "HAPPINESS", "the menu has a happiness section");
  includes(html, "GROWTH", "the menu has a growth section");
  includes(html, "WORKFORCE", "the menu has a workforce section");
  includes(html, "AUTO CREW ORDER", "the menu has an automatic crew strategy control");
  includes(html, 'data-worker-strategy="roundRobin"', "round robin is offered");
  includes(html, 'data-worker-strategy="greedy"', "greedy is offered");
  includes(html, 'class="strategy-btn active" data-worker-strategy="roundRobin"', "round robin is selected by default");
  includes(html, "ROUND ROBIN", "the default strategy is labelled");
  includes(html, "GREEDY", "the greedy strategy is labelled");
  includes(html, "Growth at current happiness", "the menu forecasts growth");
  includes(html, "Next population", "the menu forecasts the next arrival");
  includes(html, "Energy maintenance (actual)", "the sector bill itemises energy");
  includes(html, "Housing investment (actual)", "the sector bill itemises housing");
  excludes(html, "SUSTENANCE", "the old sustenance model is gone");
  excludes(html, "HARD CAP", "the old house cap is gone");
  balanced(html, "div", "the menu markup keeps divs balanced");
  balanced(html, "span", "the menu markup keeps spans balanced");
  balanced(html, "button", "the menu markup keeps buttons balanced");

  html = context.populationSheetHTML(system);
  excludes(html, "RESET CREWS TO AUTO", "auto orders have no reset button until the player pins a crew");
}

function testPopulationSheetActions() {
  const system = reset();
  run("openPopulationSheet(" + JSON.stringify(system.id) + ")");
  eq(run("state.ui.sheet.kind"), "population", "the population menu opens");
  includes(els.sheetBody.innerHTML, 'data-pop-upkeep="energy:1"', "the open sheet carries the steppers");

  eq(context.adjustPopulationUpkeep(system.id, "energy", -1), true, "the energy stepper succeeds");
  eq(system.maintenance.energy, 90, "the energy policy falls by 10%");
  includes(els.sheetBody.innerHTML, '<b class="upkeep-step-value">90%</b>', "the sheet repaints the new percentage");

  eq(context.adjustPopulationUpkeep(system.id, "minerals", -1), true, "the housing stepper succeeds");
  eq(system.maintenance.minerals, 90, "the housing policy falls by 10%");

  /* The legacy axes still map onto the new policy. */
  eq(context.adjustPopulationUpkeep(system.id, "sustenance", -1), true, "the legacy sustenance axis works");
  eq(system.maintenance.energy, 80, "sustenance changes energy maintenance");
  eq(context.adjustPopulationUpkeep(system.id, "housing", -1), true, "the legacy housing axis works");
  eq(system.maintenance.minerals, 80, "housing changes the mineral investment");

  run("setMaintenance(state.systems.find(function (s) { return s.home; }), 0, 0)");
  includes(context.populationSheetHTML(system), 'data-pop-upkeep="energy:-1" disabled',
    "the energy stepper stops at zero");
  includes(context.populationSheetHTML(system), 'data-pop-upkeep="minerals:-1" disabled',
    "the housing stepper stops at zero");
  includes(context.populationSheetHTML(system), "Already at 0% maintenance.", "the zero bound is explained");

  run("setMaintenance(state.systems.find(function (s) { return s.home; }), 100, 100)");
  excludes(context.populationSheetHTML(system), 'data-pop-upkeep="energy:1" disabled',
    "the energy stepper can cross 100%");
  excludes(context.populationSheetHTML(system), 'data-pop-upkeep="minerals:1" disabled',
    "the housing stepper can cross 100%");

  run("setMaintenance(state.systems.find(function (s) { return s.home; }), 200, 200)");
  includes(context.populationSheetHTML(system), 'data-pop-upkeep="energy:1" disabled',
    "the energy stepper stops at 200%");
  includes(context.populationSheetHTML(system), 'data-pop-upkeep="minerals:1" disabled',
    "the housing stepper stops at 200%");
  includes(context.populationSheetHTML(system), "At the maximum 200% maintenance.", "the gold bound is explained");
}

function testWorkerStrategyControls() {
  const system = reset();
  system.population = 3;
  eq(system.workerStrategy, "roundRobin", "the colony starts on round robin");
  let plan = context.getWorkforcePlan(system);
  eq(plan.entries[0].workersAssigned, 2, "round robin splits the opening 3 workers 2/1");
  eq(plan.entries[1].workersAssigned, 1, "the second starter gets the remaining worker");

  let html = context.populationSheetHTML(system);
  includes(html, 'class="strategy-btn active" data-worker-strategy="roundRobin"',
    "the round-robin button is active");
  includes(html, "Share workers across every eligible facility", "the active strategy is explained");

  eq(context.setWorkerStrategy(system.id, "greedy"), true, "the greedy switch succeeds");
  eq(system.workerStrategy, "greedy", "the colony stores the new strategy");
  plan = context.getWorkforcePlan(system);
  eq(plan.entries[0].workersAssigned, 3, "greedy hands all 3 workers to the first facility");
  eq(plan.entries[1].workersAssigned, 0, "greedy leaves the second facility idle");
  html = context.populationSheetHTML(system);
  includes(html, 'class="strategy-btn active" data-worker-strategy="greedy"',
    "the greedy button is active after the switch");
  includes(html, "Fill the earliest facility slots first", "the greedy strategy is explained");

  eq(context.setWorkerStrategy(system.id, "bogus"), false, "an unknown strategy is refused");
  eq(system.workerStrategy, "greedy", "the refused switch leaves the strategy alone");

  /* Explicit orders stay pinned when the strategy changes; reset applies it. */
  eq(context.setWorkerStrategy(system.id, "roundRobin"), true, "round robin can be selected again");
  eq(context.adjustFacilityWorkers(system.id, 0, -1), true, "the crew stepper pins the current split");
  eq(context.hasWorkerOrders(system), true, "the split is now an explicit order");
  eq(context.getWorkforcePlan(system).entries[0].workersAssigned, 1, "the pinned Power Plant drops to 1");
  eq(context.getWorkforcePlan(system).entries[1].workersAssigned, 1, "the Mine keeps its 1 worker");
  eq(context.setWorkerStrategy(system.id, "greedy"), true, "greedy can be selected with pinned crews");
  plan = context.getWorkforcePlan(system);
  eq(plan.entries[0].workersAssigned, 1, "pinned orders override the new strategy");
  eq(plan.entries[1].workersAssigned, 1, "the other pinned crew also stays put");
  includes(context.populationSheetHTML(system), "Explicit orders are pinned",
    "the sheet explains that reset is needed");
  eq(context.resetFacilityWorkers(system.id), true, "the reset action succeeds");
  plan = context.getWorkforcePlan(system);
  eq(plan.entries[0].workersAssigned, 3, "the reset applies greedy");
  eq(plan.entries[1].workersAssigned, 0, "the second facility is idle again");
}

/* ---------- crew controls ---------- */

function testCrewControls() {
  const system = reset();
  system.slots[0] = { type: "mine", level: 1, underConstruction: false };
  system.slots[1] = { type: "power", level: 1, underConstruction: false };
  let plan = context.getWorkforcePlan(system);
  let tile = context.slotTileHTML(system, 0, plan);
  includes(tile, 'data-facility-workers="0:-1"', "the mine has a crew down button");
  includes(tile, 'data-facility-workers="0:1"', "the mine has a crew up button");
  includes(tile, "4/4", "the mine reports its full crew");
  includes(tile, "ONLINE", "the staffed mine is online");
  includes(tile, "8 ⛏", "the mine reports its level 1 output");

  eq(context.adjustFacilityWorkers(system.id, 0, -1), true, "the crew action takes a worker");
  plan = context.getWorkforcePlan(system);
  eq(plan.entries[0].workersAssigned, 3, "the mine is pinned at three workers");
  tile = context.slotTileHTML(system, 0, plan);
  includes(tile, "3/4", "the slot reports the pinned crew");
  includes(tile, "UNDERSTAFFED", "the slot flags the partial crew");

  run("openPopulationSheet(" + JSON.stringify(system.id) + ")");
  includes(context.populationSheetHTML(system), 'data-worker-auto="' + system.id + '"',
    "pinned crews grow a reset button");
  eq(context.resetFacilityWorkers(system.id), true, "the reset action succeeds");
  eq(Object.keys(system.workerOrders).length, 0, "the reset clears explicit orders");
  eq(context.getWorkforcePlan(system).entries[0].workersAssigned, 4,
    "automatic round robin refills the mine");

  system.slots[0] = { type: "mine", level: 2, underConstruction: false };
  plan = context.getWorkforcePlan(system);
  tile = context.slotTileHTML(system, 0, plan);
  includes(tile, "BLOCKED · NEEDS 15 POPULATION", "a level 2 facility is blocked below 15 population");
  includes(tile, 'data-facility-workers="0:-1" disabled', "a blocked facility disables its crew controls");

  system.slots[1] = { type: "power", level: 1, underConstruction: true };
  plan = context.getWorkforcePlan(system);
  tile = context.slotTileHTML(system, 1, plan);
  includes(tile, "UNDER CONSTRUCTION", "a building site is marked");
  includes(tile, "needs 4 workers", "the site reports its future crew");
  includes(tile, "3 population", "the site reports its future population gate");
}

/* ---------- build sheet ---------- */

function testBuildSheet() {
  const system = reset();
  let html = context.buildSheetHTML(system, 0);
  includes(html, "needs 4 workers · colony 3+", "the level 1 facility crew and gate are shown");
  includes(html, "builds at LVL 1 (Primitive)", "the build sheet names the level");
  includes(html, "+8 ⛏", "the mine's level 1 output is shown");
  includes(html, "+8 ⚡", "the power plant's level 1 output is shown");
  includes(html, "Population 12", "the build sheet reads the colony population");
  includes(html, "free workers", "the build sheet reads the free workforce");
  balanced(html, "div", "the build sheet keeps divs balanced");
  balanced(html, "button", "the build sheet keeps buttons balanced");

  run("state.tech.done.push('mineTech1');");
  html = context.buildSheetHTML(system, 0);
  includes(html, "needs 6 workers · colony 15+", "the level 2 facility crew and gate are shown");
  includes(html, "builds at LVL 2 (Industrial)", "the build sheet names the unlocked level");
  includes(html, "+16 ⛏", "the mine's level 2 output is shown");

  includes(context.buildingYieldText("mine", 1), "4 workers", "the yield text names the crew");
  includes(context.buildingYieldText("mine", 1), "needs 3 pop", "the yield text names the population gate");
  includes(context.buildingYieldText("mine", 1), "+8 ⛏", "the yield text names the output");
  includes(context.buildingYieldText("lab", 1), "1 worker", "support buildings keep their crew text");
  excludes(context.buildingYieldText("lab", 1), "needs 0 pop", "support buildings have no population line");
}

/* ---------- resource and details sheets ---------- */

function testResourceAndDetailsSheets() {
  const system = reset();
  const energySheet = context.resourceSheetHTML("energy");
  includes(energySheet, "Population energy maintenance", "the energy sheet lists the population draw");
  includes(energySheet, "Population maintenance is paid first", "the energy sheet explains the order");
  const mineralSheet = context.resourceSheetHTML("minerals");
  includes(mineralSheet, "Population housing investment", "the mineral sheet lists the housing draw");
  includes(mineralSheet, "never overdraws", "the mineral sheet explains the no-negative rule");

  const details = context.planetDetailsHTML(system);
  includes(details, "Happiness", "the details sheet lists happiness");
  includes(details, "Energy supplied", "the details sheet lists energy supply");
  includes(details, "Housing", "the details sheet lists housing");
  includes(details, "Blocked by population", "the details sheet lists the population gate");
  includes(details, "Population energy maintenance", "the details sheet itemises the energy draw");
  includes(details, "Population housing investment", "the details sheet itemises the housing draw");
  excludes(details, "Population sustenance", "the details sheet no longer uses the old sustenance label");
  includes(details, "Net local energy", "the details sheet carries the net local energy line");
  includes(details, "Net local minerals", "the details sheet carries the net local mineral line");
  balanced(details, "div", "the details sheet keeps divs balanced");
  balanced(details, "span", "the details sheet keeps spans balanced");
}

/* ---------- removed model ---------- */

function testRemovedModel() {
  eq(typeof context.getPopulationPolicy, "undefined", "the old housing policy helper is gone");
  eq(typeof context.getMaxHousingUpkeep, "undefined", "the old housing cap helper is gone");
  eq(typeof context.getSustenanceState, "undefined", "the old sustenance helper is gone");
  eq(run("typeof CONFIG.population"), "undefined", "the old population config block is gone");
  eq(run("typeof CONFIG.economy"), "object", "the colony economy config block exists");
  eq(run("CONFIG.economy.facilities.levels.length"), 4, "four shared facility levels are configured");
  eq(run("CONFIG.economy.facilities.levels[3].output"), 64, "level 4 output is 64");
}

function main() {
  testPopulationCard();
  testLowPopulationGrowthCopy();
  testOverfundedGrowth();
  testPopulationSheet();
  testPopulationSheetActions();
  testWorkerStrategyControls();
  testCrewControls();
  testBuildSheet();
  testResourceAndDetailsSheets();
  testRemovedModel();
  console.log("population harness: " + checks + " checks passed");
}

main();
