#!/usr/bin/env node
/* ============================================================
   STABILITY HARNESS — the population-weighted moving average
   The app intentionally has no build step, so this harness loads the classic
   browser scripts in a Node VM with tiny UI stubs. Run it with:

       node tests/stability-harness.js

   It covers the configured start value and drag, the population-weighted
   happiness target, the turn-pipeline blend, the one-off infrastructure
   penalty, the clamp and collapse rules, and the stability sheet copy.
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
  "js/ui/dom.js",
  "js/ui/sheet-content.js",
  "js/game/planet-nav.js",
  "js/game/actions.js",
  "js/game/military-actions.js",
  "js/game/swipe.js",
  "js/game/event-card.js",
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
  function elementFor(id) {
    if (!Object.prototype.hasOwnProperty.call(elements, id)) elements[id] = fakeElement();
    return elements[id];
  }
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
      getElementById: elementFor,
      addEventListener: function () {},
      activeElement: null
    },
    window: {},
    hideToast: function () {},
    toast: function () {},
    renderAll: function () {},
    renderMap: function () {},
    renderNav: function () {},
    setResourceTexts: function () {},
    closeSheet: function () {},
    showEventLayer: function () {},
    hideEventLayer: function () {}
  };
  vm.createContext(context);
  files.forEach(function (file) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
  });
  vm.runInContext(`
    function reset() {
      state = createInitialState(null);
      state.phase = "actions";
      state.ethic = null;
      state.tech.active = null;
      state.empires = [];
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

    function addColony(id, sectorId, options) {
      const opts = options || {};
      const system = {
        id: id,
        sectorId: sectorId,
        name: opts.name || id,
        home: !!opts.home,
        colonized: true,
        planetSize: opts.planetSize || "medium",
        bonusSlots: 0,
        unlockedBonusSlots: 0,
        population: opts.population == null ? 5 : opts.population,
        maintenance: {
          energy: opts.energyPercent == null ? 0 : opts.energyPercent,
          minerals: opts.mineralsPercent == null ? 0 : opts.mineralsPercent
        },
        workerOrders: {},
        economyReport: null,
        growthProgress: 0,
        foundedTurn: 1,
        emoji: "🪐",
        color: "#7cb8ff",
        type: "terran",
        row: 0,
        col: 0,
        blurb: "Test world"
      };
      system.slots = createPlanetSlots(system);
      state.systems.push(system);
      return system;
    }

    function setStocks(sectorId, energy, minerals) {
      setSectorStock(sectorId, "energy", energy);
      setSectorStock(sectorId, "minerals", minerals);
    }
  `, context, { filename: "stability-harness-helpers" });
  return context;
}

const context = createContext();
function run(code) {
  return vm.runInContext(code, context);
}
function reset() {
  return run("reset()");
}

/* ---------- the knob and the start value ---------- */

function testConfigAndStart() {
  eq(run("CONFIG.stability.start"), 70, "stability starts at 70");
  eq(run("CONFIG.stability.drag"), 0.7, "the default drag keeps 70% of the bar");
  near(run("getStabilityConfig().weight"), 0.3, 1e-12, "the remaining 30% is the new mood");
  eq(run("getStabilityConfig().drag"), 0.7, "the config reader surfaces the drag");
  eq(run("(function () { const fresh = createInitialState(null); return fresh.stability; })()"), 70,
    "a new run opens at 70");
  eq(run("formatStability(79.4)"), "79", "the bar reads whole numbers");
  eq(run("formatStability(0.4)"), "0", "a value the bar rounds to zero reads as zero");
  eq(run("formatStability(100.7)"), "100", "the bar never prints above 100");
  eq(run("formatStability(-4)"), "0", "the bar never prints below zero");
}

/* ---------- the population-weighted happiness target ---------- */

function testWeightedSummary() {
  const mixed = run("summarizeColonyHappiness([{ population: 10, happiness: 100 }, { population: 5, happiness: 0 }])");
  near(mixed.happiness, 66.6666666667, 1e-6, "happiness is weighted by population");
  eq(mixed.population, 15, "the target records the population behind it");
  eq(mixed.colonies, 2, "the target records how many colonies contribute");
  near(mixed.contributions[0].share, 2 / 3, 1e-9, "a 10-person colony carries two thirds of the weight");
  near(mixed.contributions[1].share, 1 / 3, 1e-9, "a 5-person colony carries one third of the weight");

  eq(run("summarizeColonyHappiness([]).happiness"), null, "no colonies means no target");
  eq(run("summarizeColonyHappiness([{ population: 0, happiness: 100 }]).happiness"), null,
    "a colony with nobody in it carries no weight");

  const clamped = run("summarizeColonyHappiness([{ population: 2, happiness: 150 }, { population: 2, happiness: -10 }])");
  near(clamped.happiness, 50, 1e-9, "happiness is clamped to the 0-100 band before weighting");

  const lone = run("summarizeColonyHappiness([{ population: 7, happiness: 42 }])");
  near(lone.happiness, 42, 1e-9, "one colony is its own weighted average");
  eq(run("summarizeColonyHappiness([{ population: 7, happiness: 42 }]).contributions[0].share"), 1,
    "a lone colony carries all of the weight");
}

/* ---------- the turn pipeline ---------- */

function testOneFundedColony() {
  reset();
  run("addColony('capital', 'sec-core', { name: 'Terra', home: true, population: 10, energyPercent: 100, mineralsPercent: 100 })");
  run("setStocks('sec-core', 100, 100)");
  const projection = run("getStabilityProjection()");
  near(projection.target, 100, 1e-9, "a fully funded colony is 100% happy");
  near(projection.blend, 79, 1e-9, "70 keeps 49 and the 100% mood adds 30");
  near(projection.next, 79, 1e-9, "with no shortfall the next turn is the blend");
  run("endTurn()");
  eq(run("state.turn"), 2, "the turn advances");
  near(run("state.stability"), 79, 1e-9, "the turn pipeline applies the weighted blend");
  near(run("getUnrestChance(79)"), 0.75 * 0.21 * 0.21, 1e-9,
    "a healthy bar carries only a small per-turn unrest risk");
}

function testPopulationWeightBeatsColonyCount() {
  reset();
  const neighbor = run("getSector('sec-core').neighbors[0]");
  run("addColony('big', 'sec-core', { name: 'Terra', population: 10, energyPercent: 100, mineralsPercent: 100 })");
  run("addColony('small', " + JSON.stringify(neighbor) + ", { name: 'Vesta', population: 5 })");
  run("setStocks('sec-core', 100, 100); setStocks(" + JSON.stringify(neighbor) + ", 100, 100)");

  const happyBig = run("getStabilityProjection()");
  near(happyBig.target, 100 * 10 / 15, 1e-9, "the 10-person happy world outweighs the 5-person unhappy one");
  near(happyBig.next, 69, 1e-9, "70 moves 30% of the way to the 66.7% target");
  eq(happyBig.targetPopulation, 15, "both colonies are in the population total");
  eq(happyBig.targetColonies, 2, "both colonies are counted");

  run("state.stability = 70;");
  run("getSystem('big').maintenance = { energy: 0, minerals: 0 };");
  run("getSystem('small').maintenance = { energy: 100, minerals: 100 };");
  const happySmall = run("getStabilityProjection()");
  near(happySmall.target, 100 * 5 / 15, 1e-9, "the same two colonies now pull from the 5-person side");
  near(happySmall.next, 59, 1e-9, "the target follows the population, not the colony count");
  run("endTurn()");
  near(run("state.stability"), 59, 1e-9, "the turn pipeline agrees with the preview");
}

function testNoColoniesHolds() {
  reset();
  run("state.stability = 42;");
  const projection = run("getStabilityProjection()");
  eq(projection.target, null, "an empire with no people has no mood target");
  near(projection.next, 42, 1e-9, "the projection holds the current value");
  run("endTurn()");
  near(run("state.stability"), 42, 1e-9, "the pipeline holds the current value with no colonies");
  eq(run("state.turn"), 2, "the turn still advances");
}

function testDeficitPenalty() {
  reset();
  run("addColony('capital', 'sec-core', { name: 'Terra', population: 10, energyPercent: 100, mineralsPercent: 100 })");
  /* Enough energy for the population bill, not for the colony overhead. */
  run("setStocks('sec-core', 12.6, 100)");
  const projection = run("getStabilityProjection(null, true)");
  near(projection.target, 100, 1e-9, "the colony is still fully maintained");
  near(projection.blend, 79, 1e-9, "the blend ignores the shortfall");
  near(projection.penalty, 2, 1e-9, "the penalty comes from the config");
  near(projection.next, 77, 1e-9, "the penalty is charged on top of the blend");
  eq(run("getSectorsInDeficit().length"), 1,
    "the projected deficit check sees the bill this turn's maintenance will leave unpaid");
  run("endTurn()");
  near(run("state.stability"), 77, 1e-9,
    "the turn pipeline charges one infrastructure penalty after the blend");
}

function testDragKnob() {
  reset();
  run("addColony('capital', 'sec-core', { name: 'Terra', population: 10, energyPercent: 100, mineralsPercent: 100 })");
  run("setStocks('sec-core', 100, 100)");

  run("CONFIG.stability.drag = 0.5;");
  near(run("getStabilityConfig().drag"), 0.5, 1e-12, "the drag is read from the config");
  near(run("getStabilityConfig().weight"), 0.5, 1e-12, "the weight is the rest of the drag");
  near(run("getStabilityProjection().next"), 85, 1e-9, "a 0.5 drag moves half the way to the mood");

  run("CONFIG.stability.drag = 2;");
  near(run("getStabilityConfig().drag"), 1, 1e-12, "a drag above 1 clamps to 1");
  near(run("getStabilityProjection().next"), 70, 1e-9, "a full drag holds the bar");

  run("CONFIG.stability.drag = -1;");
  near(run("getStabilityConfig().drag"), 0, 1e-12, "a negative drag clamps to 0");
  near(run("getStabilityProjection().next"), 100, 1e-9, "a zero drag jumps straight to the mood");

  run("CONFIG.stability.drag = 0.7;");
  near(run("getStabilityProjection().next"), 79, 1e-9, "restoring the default restores the blend");
}

function testClampAndCollapse() {
  reset();
  run("addColony('capital', 'sec-core', { name: 'Terra', population: 10, energyPercent: 100, mineralsPercent: 100 })");
  run("setStocks('sec-core', 100, 100)");

  run("state.stability = 100;");
  near(run("getStabilityProjection().next"), 100, 1e-9, "a perfect empire never exceeds 100");

  run("state.stability = 0; getSystem('capital').maintenance = { energy: 0, minerals: 0 };");
  near(run("getStabilityProjection().next"), 0, 1e-9, "a failed empire never drops below 0");

  run("state.stability = 0.3;");
  run("advanceStability()");
  eq(run("state.stability"), 0,
    "a value the bar would round to zero is stored as zero, so the rebellion branch fires");

  run("state.stability = 0.9;");
  run("advanceStability()");
  near(run("state.stability"), 0.63, 1e-9, "a value the bar still shows is kept");
}

/* ---------- civil unrest ---------- */

function testUnrestChance() {
  eq(run("getUnrestChance(100)"), 0, "100 stability never rolls unrest");
  near(run("getUnrestChance(0)"), 0.75, 1e-9, "the configured maximum sits at 0 stability");
  near(run("getUnrestChance(50)"), 0.75 * 0.25, 1e-9, "50 stability is a quarter of the maximum");
  near(run("getUnrestChance(90)"), 0.75 * 0.01, 1e-9, "90 stability is a hundredth of the maximum");
  const chances = [95, 85, 70, 50, 30, 10].map(function (value) {
    return run("getUnrestChance(" + value + ")");
  });
  ok(chances.every(function (value, index) { return index === 0 || value > chances[index - 1]; }),
    "the chance rises monotonically as stability falls");
  eq(run("getUnrestChance(140)"), 0, "a bar above 100 is treated as 100");
  eq(run("getUnrestChance(-10)"), run("getUnrestChance(0)"), "a bar below 0 is treated as 0");

  run("CONFIG.stability.unrest.exponent = 1; CONFIG.stability.unrest.maxChance = 0.5;");
  near(run("getUnrestChance(50)"), 0.25, 1e-9, "the config owns the curve");
  run("CONFIG.stability.unrest.exponent = 2; CONFIG.stability.unrest.maxChance = 0.75;");
}

function testUnrestPool() {
  eq(run("getUnrestEvents().length"), 6, "six unrest cards are defined");
  eq(run("getUnrestEventById('breadRiot').title"), "Bread Riot", "the pool is addressable by id");
  eq(run("getUnrestEventById('nope')"), null, "an unknown unrest id has no card");
  const ids = run("getUnrestEvents().map(function (event) { return event.id; })");
  eq(new Set(ids).size, ids.length, "the unrest ids are unique");
  eq(run("getUnrestEvents().filter(function (event) { return String(event.text).indexOf('{colony}') !== -1; }).length"),
    6, "every unrest card names the colony it breaks out in");
  ok(run("getUnrestEvents().every(function (event) { return event.category === 'unrest' && event.choices.length >= 2; })"),
    "every unrest card is an unrest card with at least two responses");
  eq(run("validateEventDeck()").length, 0, "the deck and unrest pools validate together");
}

function testUnrestDraw() {
  reset();
  run("addColony('happy', 'sec-core', { name: 'Terra', population: 10, energyPercent: 100, mineralsPercent: 100 })");
  const neighbor = run("getSector('sec-core').neighbors[0]");
  run("addColony('grumpy', " + JSON.stringify(neighbor) + ", { name: 'Vesta', population: 5 })");
  run("setStocks('sec-core', 100, 100); setStocks(" + JSON.stringify(neighbor) + ", 100, 100)");

  run("state.stability = 100; state.rng = function () { return 0; };");
  eq(run("rollUnrestEvent()"), null, "100 stability never draws unrest even with a rigged roll");
  eq(run("state.events.unrestCount"), 0, "a quiet bar does not count an unrest card");

  run("state.stability = 30;");
  const card = run("rollUnrestEvent()");
  ok(!!card, "low stability can draw an unrest card");
  eq(card.unrest, true, "the card is marked as unrest");
  eq(card.category, "unrest", "the card wears the unrest category");
  includes(card.text, "Vesta", "the card names the unhappiest colony");
  eq(card.colonyName, "Vesta", "the card records its colony");
  eq(card.sectorId, neighbor, "the card points at that colony's sector");
  excludes(card.text, "{colony}", "the colony token is replaced");
  eq(run("state.events.unrestCount"), 1, "the draw is counted");
  eq(run("state.events.lastUnrestId"), card.id, "the draw is remembered");
  eq(run("state.events.lastUnrestTurn"), run("state.turn"), "the draw records the turn");
  eq(run("state.events.lastUnrestColony"), "Vesta", "the draw records the colony");

  const next = run("rollUnrestEvent()");
  ok(!!next, "a second roll can draw again");
  ok(next.id !== card.id, "the same unrest card never fires twice in a row");
}

function testPopulationEffects() {
  reset();
  run("addColony('happy', 'sec-core', { name: 'Terra', population: 10, energyPercent: 100, mineralsPercent: 100 })");
  const neighbor = run("getSector('sec-core').neighbors[0]");
  run("addColony('grumpy', " + JSON.stringify(neighbor) + ", { name: 'Vesta', population: 5 })");
  run("setStocks('sec-core', 100, 100); setStocks(" + JSON.stringify(neighbor) + ", 100, 100)");

  run("applyEffects({ population: -1 }, " + JSON.stringify(neighbor) + ")");
  eq(run("getSystem('grumpy').population"), 4, "emigration removes a person from the unhappy colony");
  eq(run("getSystem('happy').population"), 10, "the happy colony keeps its people");

  run("getSystem('grumpy').population = 1;");
  run("applyEffects({ population: -5 }, " + JSON.stringify(neighbor) + ")");
  eq(run("getSystem('grumpy').population"), 0, "a population loss never pushes a colony below zero");

  const pills = run("renderEffectPills({ population: -1 })");
  includes(pills, "👥", "population effects carry the people icon");
  includes(pills, "-1", "population effects show their amount");
}

function testUnrestTurn() {
  reset();
  run("addColony('capital', 'sec-core', { name: 'Terra', home: true, population: 10, energyPercent: 100, mineralsPercent: 100 })");
  run("setStocks('sec-core', 200, 200);");
  run("state.stability = 20;");
  run("state.rng = (function () { var rolls = [0.05, 0]; return function () { return rolls.length ? rolls.shift() : 0; }; })();");
  run("state.phase = 'actions'; state.currentEvent = null;");
  run("endTurn()");
  eq(run("state.phase"), "event", "the unrest card takes the turn's card slot");
  eq(run("state.currentEvent.unrest"), true, "the forced card is the unrest card");
  eq(run("state.events.count"), 0, "unrest does not advance the encounter deck");
  eq(run("state.events.nextTurn"), 1, "the deck stays due after an unrest turn");
  near(run("state.stability"), 44, 1e-9, "the blend still runs before the card");

  const beforeEnergy = run("getSectorStock('sec-core', 'energy')");
  const beforeStability = run("state.stability");
  run("resolveEvent(0)");
  eq(run("state.phase"), "actions", "resolving the card returns to actions");
  near(run("getSectorStock('sec-core', 'energy')"), beforeEnergy - 6, 1e-9,
    "the bread riot's energy cost is paid from the colony's sector");
  near(run("state.stability"), beforeStability + 4, 1e-9, "the chosen response shifts stability");
  eq(run("state.currentEvent"), null, "the card is consumed");

  run("state.rng = function () { return 0.99; };");
  run("endTurn()");
  eq(run("state.events.count"), 1,
    "with no unrest the encounter deck resumes and consumes its slot");
}

function testDeckSheetExcludesUnrest() {
  reset();
  const deck = run("eventDeckSheetHTML()");
  includes(deck, "Civil unrest is not part of this deck",
    "the deck sheet explains the separate unrest pool");
  excludes(deck, "Bread Riot", "unrest cards are not listed in the encounter deck");
}

/* ---------- the stability sheet ---------- */

function testSheet() {
  reset();
  const neighbor = run("getSector('sec-core').neighbors[0]");
  run("addColony('big', 'sec-core', { name: 'Terra', population: 10, energyPercent: 100, mineralsPercent: 100 })");
  run("addColony('small', " + JSON.stringify(neighbor) + ", { name: 'Vesta', population: 5 })");
  run("setStocks('sec-core', 100, 100); setStocks(" + JSON.stringify(neighbor) + ", 100, 100)");
  run("state.stability = 40;");

  const html = run("stabilitySheetHTML()");
  includes(html, "EMPIRE MOOD", "the sheet names the mood section");
  includes(html, "Colony happiness H̄", "the sheet names the weighted target");
  includes(html, "66.7%", "the sheet shows the population-weighted happiness");
  includes(html, "15 people in 2 colonies", "the sheet explains what the average covers");
  includes(html, "0.7 × 40 + 0.3 × 66.7 = 48",
    "the sheet spells out the blend the player is about to see");
  includes(html, "RISING", "the sheet forecasts the direction");
  includes(html, "Next turn", "the sheet forecasts the next value");
  includes(html, "COLONY PRESSURE", "the sheet lists the colonies behind the target");
  includes(html, "Terra", "the sheet names the biggest colony");
  includes(html, "Vesta", "the sheet names the smaller colony");
  includes(html, "67% of the weight", "the sheet shows the big colony's share");
  includes(html, "33% of the weight", "the sheet shows the small colony's share");
  includes(html, "Every sector covered its infrastructure upkeep",
    "the sheet explains the missing penalty");
  includes(html, "moving average", "the sheet explains the rule");
  includes(html, "Unrest chance", "the sheet shows the per-turn unrest risk");
  includes(html, "27% / turn", "the chance follows the stability bar");
  includes(html, "Last unrest", "the sheet tracks the last unrest card");
  includes(html, "None yet", "no unrest has happened yet");
  excludes(html, "All production", "stability no longer modifies production");
  excludes(html, "There is no passive recovery", "the old static-stability copy is gone");

  run("state.stability = 20;");
  const low = run("stabilitySheetHTML()");
  includes(low, "UNREST", "a low bar is labelled unrest");
  includes(low, 'big-delta text-bad">UNREST', "a low bar is flagged as unrest");

  run("state.rng = function () { return 0; }; rollUnrestEvent();");
  const after = run("stabilitySheetHTML()");
  includes(after, "Bread Riot", "the sheet names the last unrest card");
  includes(after, "Turn 1", "the sheet dates the last unrest card");
  includes(after, "Vesta", "the sheet names the colony the unrest broke out in");
}

try {
  testConfigAndStart();
  testWeightedSummary();
  testOneFundedColony();
  testPopulationWeightBeatsColonyCount();
  testNoColoniesHolds();
  testDeficitPenalty();
  testDragKnob();
  testClampAndCollapse();
  testUnrestChance();
  testUnrestPool();
  testUnrestDraw();
  testPopulationEffects();
  testUnrestTurn();
  testDeckSheetExcludesUnrest();
  testSheet();
  console.log("stability harness: " + checks + " checks passed");
} catch (error) {
  console.error("stability harness: FAILED after " + checks + " checks");
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
}
