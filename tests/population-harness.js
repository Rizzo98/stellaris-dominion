#!/usr/bin/env node
/* ============================================================
   POPULATION HARNESS — the population card, menu and standing upkeep
   The app intentionally has no build step, so this harness loads the classic
   browser scripts in a Node VM with element stubs. Run it with:

       node tests/population-harness.js

   It covers the clickable population card, the houses/sustenance readout, the
   two upkeep steppers in the population menu, the hard house cap, sustenance
   tiers, the mineral and energy upkeep lines in the economy sheets, and the
   removed Residential Block.
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
      return state.systems.find(function (system) { return system.home; });
    }

    function homeSectorId() {
      return state.galaxy.sectors.find(function (sector) { return sector.home; }).id;
    }

    function setPolicy(system, housing, sustenance) {
      system.populationUpkeep = { housing: housing, sustenance: sustenance };
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

function testCard() {
  let system = run("freshPopulation()");
  run("setPolicy(state.systems.find(function (s) { return s.home; }), 4, 2)");
  const planet = context.getPlanetBreakdown(system);
  const html = context.populationCardHTML(system, planet);

  includes(html, 'data-population-menu="' + system.id + '"', "the population card opens the menu");
  includes(html, 'aria-haspopup="dialog"', "the card announces a dialog");
  includes(html, "👥", "the card carries the population glyph");
  includes(html, "3 <small>/ 5</small>", "the card shows three people in five houses");
  includes(html, "🏠 5 HOUSING", "the card shows the housing stat");
  includes(html, "🍲 125% SUSTENANCE", "the card shows the sustenance stat");
  includes(html, "+0.8 / TURN", "the card shows the projected growth");
  includes(html, "MANAGE HOUSING &amp; SUSTENANCE", "the card invites the player in");
  excludes(html, "Residential", "the card no longer mentions residential blocks");
  ok(html.indexOf('<button class="population-card"') === 0, "the card is a real button");
  ok(html.indexOf("</button>") === html.length - 9, "the card closes cleanly");
  balanced(html, "span", "the card closes every span");
  balanced(html, "button", "the card closes every button");

  /* No sustenance: the card calls out the stalled growth. */
  run("setPolicy(state.systems.find(function (s) { return s.home; }), 4, 0)");
  const starved = context.populationCardHTML(system, context.getPlanetBreakdown(system));
  includes(starved, "0% SUSTENANCE", "the card reports zero sustenance");
  includes(starved, "NO SUSTENANCE", "the card explains why growth is paused");
  includes(starved, "No sustenance is funded", "the card tells the player what to do");

  /* Full houses. */
  run("setPolicy(state.systems.find(function (s) { return s.home; }), 0, 2)");
  const full = context.populationCardHTML(system, context.getPlanetBreakdown(system));
  includes(full, "🏠 3 HOUSING", "the founding shelter holds three at the capital");
  includes(full, "HOUSING FULL", "the card reports the hard cap");
  includes(full, "raise the mineral upkeep", "the card points at the housing stepper");

  /* Both stats are unfunded on a fresh capital. */
  run("setPolicy(state.systems.find(function (s) { return s.home; }), 0, 0)");
  const unfunded = context.populationCardHTML(system, context.getPlanetBreakdown(system));
  includes(unfunded, "set both upkeeps to grow", "the card asks for both upkeeps on a new colony");

  /* A planet at its size limit says so instead of promising more houses. */
  run("setPolicy(state.systems.find(function (s) { return s.home; }), 8, 2); state.systems.find(function (s) { return s.home; }).population = 7");
  const sizeLimited = context.populationCardHTML(system, context.getPlanetBreakdown(system));
  includes(sizeLimited, "SIZE LIMIT", "the card names the size limit");
  includes(sizeLimited, "cannot grow further", "the card explains the size limit");

  /* World tab: the card is embedded inside the colony screen. */
  run("setPolicy(state.systems.find(function (s) { return s.home; }), 4, 2); state.systems.find(function (s) { return s.home; }).population = 3");
  const world = context.worldTabHTML(system, true, system.row, system.col);
  includes(world, 'data-population-menu="' + system.id + '"', "the colony screen renders the population card");
  includes(world, "<h3>POPULATION</h3>", "the colony section is named Population");
}

function testMenu() {
  let system = run("freshPopulation()");
  run("setPolicy(state.systems.find(function (s) { return s.home; }), 4, 2)");
  let html = context.populationSheetHTML(system);

  includes(html, "HOUSING", "the menu has a housing section");
  includes(html, "HARD CAP", "the menu marks housing as the hard cap");
  includes(html, "SUSTENANCE", "the menu has a sustenance section");
  includes(html, "THRIVING", "the menu names the top sustenance tier");
  includes(html, "125%", "the menu caps sustenance at 125%");
  includes(html, "data-pop-upkeep=\"housing:-1\"", "the housing stepper can go down");
  includes(html, "data-pop-upkeep=\"housing:1\"", "the housing stepper can go up");
  includes(html, "data-pop-upkeep=\"sustenance:-1\"", "the sustenance stepper can go down");
  includes(html, "data-pop-upkeep=\"sustenance:1\"", "the sustenance stepper can go up");
  includes(html, "Housing upkeep", "the housing row is labelled");
  includes(html, "Sustenance upkeep", "the sustenance row is labelled");
  includes(html, "2 ⛏ / turn buys 1 house", "the housing conversion is explained");
  includes(html, "1 ⚡ / turn feeds 2 pop", "the sustenance conversion is explained");
  includes(html, "Projected growth", "the menu forecasts growth");
  includes(html, "Next population", "the menu forecasts the next arrival");
  includes(html, "UPKEEP · PAID BY", "the menu names who pays the upkeep");
  includes(html, "Population housing", "the menu itemises the mineral draw");
  includes(html, "Population sustenance", "the menu itemises the energy draw");
  excludes(html, "Residential", "the menu has no residential block");
  balanced(html, "div", "the menu closes every div");
  balanced(html, "span", "the menu closes every span");
  balanced(html, "button", "the menu closes every button");
  balanced(html, "p", "the menu closes every paragraph");

  /* At zero the down stepper is disabled with a reason. */
  run("setPolicy(state.systems.find(function (s) { return s.home; }), 0, 0)");
  html = context.populationSheetHTML(system);
  includes(html, 'data-pop-upkeep="housing:-1" disabled', "housing cannot go below zero");
  includes(html, 'data-pop-upkeep="sustenance:-1" disabled', "sustenance cannot go below zero");
  includes(html, "Already at zero housing upkeep.", "the housing reason is explained");
  includes(html, "Starving", "empty sustenance is called starving");

  /* At the planet's size cap the up stepper is disabled. */
  run("setPolicy(state.systems.find(function (s) { return s.home; }), 8, 2); state.systems.find(function (s) { return s.home; }).population = 7");
  html = context.populationSheetHTML(system);
  includes(html, 'data-pop-upkeep="housing:1" disabled', "housing stops at the planet's size");
  includes(html, "size limit", "the menu names the size limit");
  run("state.systems.find(function (s) { return s.home; }).population = 3");

  /* Lowering housing below the population is refused in the UI. */
  run("setPolicy(state.systems.find(function (s) { return s.home; }), 2, 2); state.systems.find(function (s) { return s.home; }).population = 4");
  html = context.populationSheetHTML(system);
  includes(html, 'data-pop-upkeep="housing:-1" disabled', "the UI blocks an eviction");
  includes(html, "Housing can't fall below the current population.", "the UI explains the block");
}

function testMenuInteractions() {
  const system = run("freshPopulation()");
  run("setPolicy(state.systems.find(function (s) { return s.home; }), 4, 1)");

  context.openPopulationSheet(system.id);
  eq(run("state.ui.sheet.kind"), "population", "the population menu opens from the card");
  eq(run("state.ui.sheet.systemId"), system.id, "the menu is bound to the colony");
  eq(els.sheetTitle.textContent, "Population", "the sheet is titled Population");
  includes(els.sheetKicker.textContent, system.name.toUpperCase(), "the sheet kicker names the colony");
  includes(els.sheetBody.innerHTML, 'data-pop-upkeep="housing:1"', "the open sheet carries the steppers");

  /* Raising housing repaints the open sheet. */
  eq(context.adjustPopulationUpkeep(system.id, "housing", 1), true, "the housing stepper succeeds");
  eq(system.populationUpkeep.housing, 6, "the standing mineral upkeep rises by one step");
  eq(context.getPopulationHousingCap(system), 6, "a sixth house is funded");
  includes(els.sheetBody.innerHTML, 'data-pop-upkeep="housing:-1"', "the repainted sheet keeps the minus button");
  includes(els.sheetBody.innerHTML, "6", "the repainted sheet shows the new upkeep");

  /* Raising sustenance repaints too. */
  eq(context.adjustPopulationUpkeep(system.id, "sustenance", 1), true, "the sustenance stepper succeeds");
  eq(system.populationUpkeep.sustenance, 2, "the standing energy upkeep rises by one step");
  eq(context.getWorkforcePlan(system).sustenance.percent, 125, "two energy feed three people with a surplus");

  /* The hard cap refuses an eviction and explains it. */
  system.population = 6;
  const before = system.populationUpkeep.housing;
  eq(context.adjustPopulationUpkeep(system.id, "housing", -1), false, "the eviction step is refused");
  eq(system.populationUpkeep.housing, before, "the refused step leaves the policy alone");
  includes(els.sheetBody.innerHTML, "Housing can't fall below the current population.",
    "the sheet keeps the eviction warning");
  ok(run("toastMessages").some(function (message) {
    return message.indexOf("Housing can't fall below") !== -1;
  }), "the refusal raises a toast");
}

function testEconomySheets() {
  const system = run("freshPopulation()");
  run("setPolicy(state.systems.find(function (s) { return s.home; }), 4, 2)");
  run("setSectorStock(homeSectorId(), 'energy', 10); setSectorStock(homeSectorId(), 'minerals', 10);");

  const energySheet = context.resourceSheetHTML("energy");
  includes(energySheet, "Population sustenance", "the energy sheet lists the sustenance draw");
  includes(energySheet, "SECTOR UPKEEP", "the energy sheet has an upkeep section");

  const mineralSheet = context.resourceSheetHTML("minerals");
  includes(mineralSheet, "Population housing", "the mineral sheet lists the housing draw");
  includes(mineralSheet, "SECTOR UPKEEP", "the mineral sheet now has an upkeep section");
  includes(mineralSheet, "NET MINERALS / TURN", "the mineral sheet keeps its net row");

  const details = context.planetDetailsHTML(system);
  includes(details, "Housing", "the details sheet lists housing");
  includes(details, "Sustenance", "the details sheet lists sustenance");
  includes(details, "Population housing", "the details sheet itemises the mineral draw");
  includes(details, "Population sustenance", "the details sheet itemises the energy draw");
  excludes(details, "Residential", "the details sheet drops the residential block");

  const build = context.buildSheetHTML(system, 0);
  excludes(build, "Residential", "the build picker no longer offers a residential block");
  excludes(build, 'data-build="residential"', "there is no residential build action");
  includes(build, 'data-build="mine"', "the build picker still offers the mine");

  run("setSectorStock(homeSectorId(), 'minerals', -2)");
  const stability = context.stabilitySheetHTML();
  includes(stability, "Negative sector balance after upkeep", "stability names both deficits");
  includes(stability, "Solara Core", "the stability sheet lists the sector in deficit");
  includes(stability, "mineral or energy deficit", "the stability note explains the mineral case");
}

function main() {
  testCard();
  testMenu();
  testMenuInteractions();
  testEconomySheets();
  console.log("population harness: " + checks + " checks passed");
}

main();
