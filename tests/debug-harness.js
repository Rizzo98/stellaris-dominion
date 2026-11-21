#!/usr/bin/env node
/* ============================================================
   DEBUG HARNESS — per-match rulebook, save round-trip and the console UI
   The app has no build step, so this harness loads the classic browser
   scripts in a Node VM with element stubs. Run it with:

       node tests/debug-harness.js

   It covers the defaults snapshot, capture/apply/reset of CONFIG, event deck
   and content tables, nullable event turn gates, the save-file round-trip and
   v2 compatibility, plus the HTML the six debug tabs build and the delegated
   input/toggle handlers.
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
  "js/data/debug-schema.js",
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
  "js/core/save.js",
  "js/ui/dom.js",
  "js/ui/debug-screen.js"
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
      add: function () { for (let i = 0; i < arguments.length; i += 1) this.set.add(arguments[i]); },
      remove: function () { for (let i = 0; i < arguments.length; i += 1) this.set.delete(arguments[i]); },
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
    focus: function () {},
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; }
  };
}

function createContext() {
  const elements = {};
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
    setTimeout: function () { return 1; },
    clearTimeout: function () {},
    document: {
      querySelector: function () { return null; },
      querySelectorAll: function () { return []; },
      getElementById: function (id) {
        if (!elements[id]) elements[id] = fakeElement();
        return elements[id];
      },
      addEventListener: function () {}
    },
    window: {}
  };
  vm.createContext(context);
  files.forEach(function (file) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
  });
  vm.runInContext(`
    var toastMessages = [];
    toast = function (message) { toastMessages.push(message); };
    renderAll = function () {};
    renderSeedInput = function () {};
    function fakeControl(attrs, value) {
      return {
        value: value,
        getAttribute: function (name) {
          return Object.prototype.hasOwnProperty.call(attrs, name) ? String(attrs[name]) : null;
        }
      };
    }
    function fakeTarget(attrs) {
      return {
        getAttribute: function (name) {
          return Object.prototype.hasOwnProperty.call(attrs, name) ? String(attrs[name]) : null;
        },
        closest: function (selector) {
          const match = /^\\[([^\\]]+)\\]$/.exec(selector);
          if (!match) return null;
          return Object.prototype.hasOwnProperty.call(attrs, match[1]) ? this : null;
        }
      };
    }
    state = createInitialState(null);
    state.phase = "start";
  `, context, { filename: "debug-harness-bootstrap.js" });
  return context;
}

const context = createContext();
function run(code) {
  return vm.runInContext(code, context);
}

/* ---------- 1. defaults ---------- */
eq(run("countRuleOverrides()"), 0, "a fresh page reports no rule overrides");
eq(run("RUN_RULE_DEFAULTS.version"), 1, "the default rulebook carries a version");
includes(run("JSON.stringify(RUN_RULE_DEFAULTS.config.economy.population)"), "baseGrowthRate", "the default rulebook holds CONFIG");
includes(run("JSON.stringify(RUN_RULE_DEFAULTS.events.cards)"), "pirateRaiders", "the default rulebook holds event cards");
includes(run("JSON.stringify(RUN_RULE_DEFAULTS.content.ships)"), "corvette", "the default rulebook holds content");

/* ---------- 2. capture / reset / apply ---------- */
run(`
  CONFIG.economy.population.energyExponent = 1.75;
  CONFIG.startingResources.energy = 99;
  CONFIG.galaxy.seed = 12345;
  CONFIG.economy.facilities.levels[1].output = 44;
  EVENTS.find(function (e) { return e.id === "pirateRaiders"; }).weight = 42;
  removeEventFromBucket("hazard", "pirateRaiders");
  EVENT_CATEGORIES.hazard.weightMult = 0.5;
  UNREST_EVENTS[0].weight = 77;
  SHIP_TYPES.corvette.attack = 9;
  TECHS.ascension.cost = 1;
  ANOMALY_TYPES[0].studyTurns = 1;
  var customRules = captureRunRules();
`);
eq(run("customRules.config.economy.population.energyExponent"), 1.75, "capture keeps a CONFIG edit");
eq(run("customRules.events.cards.pirateRaiders.weight"), 42, "capture keeps an event weight");
eq(run("customRules.events.buckets.hazard.indexOf('pirateRaiders')"), -1, "capture keeps a retired card");
eq(run("customRules.content.ships.corvette.attack"), 9, "capture keeps a content edit");
ok(run("countRuleOverrides()") > 0, "edits raise the override count");

run("resetRunRules();");
eq(run("CONFIG.economy.population.energyExponent"), 1.1, "reset restores the energy exponent");
eq(run("CONFIG.startingResources.energy"), 15, "reset restores starting energy");
eq(run("CONFIG.economy.facilities.levels[1].output"), 16, "reset restores the facility levels in place");
eq(run("getEventById('pirateRaiders').weight"), 12, "reset restores an event weight");
ok(run("EVENT_BUCKETS.hazard.indexOf('pirateRaiders') !== -1"), "reset restores a retired card");
eq(run("SHIP_TYPES.corvette.attack"), 2, "reset restores a hull stat");
eq(run("countRuleOverrides()"), 0, "reset clears every override");

run("applyRunRules(customRules);");
eq(run("CONFIG.economy.population.energyExponent"), 1.75, "apply restores the energy exponent");
eq(run("CONFIG.galaxy.seed"), 12345, "apply restores the seed");
eq(run("getEventById('pirateRaiders').weight"), 42, "apply restores an event weight");
eq(run("EVENT_CATEGORIES.hazard.weightMult"), 0.5, "apply restores a category multiplier");
ok(run("EVENT_BUCKETS.hazard.indexOf('pirateRaiders') === -1"), "apply keeps a card retired");
eq(run("UNREST_EVENTS[0].weight"), 77, "apply restores an unrest weight");
eq(run("SHIP_TYPES.corvette.attack"), 9, "apply restores a hull stat");
eq(run("TECHS.ascension.cost"), 1, "apply restores a tech cost");
eq(run("ANOMALY_TYPES[0].studyTurns"), 1, "apply restores a survey-site duration");
eq(run("BUILDINGS.mine.levels === CONFIG.economy.facilities.levels"), true, "the shared facility-levels array keeps its identity");
run("resetRunRules();");

/* ---------- 3. nullable event gates ---------- */
run(`
  delete getEventById("solarFlare").minTurn;
  getEventById("solarFlare").maxTurn = 20;
  var gateRules = captureRunRules();
  resetRunRules();
  applyRunRules(gateRules);
`);
eq(run("typeof getEventById('solarFlare').minTurn"), "undefined", "a cleared minimum turn stays cleared after a round-trip");
eq(run("getEventById('solarFlare').maxTurn"), 20, "an explicit maximum turn survives a round-trip");
run("resetRunRules();");

/* ---------- 3b. critical lists never normalise to empty ---------- */
run(`
  var brokenRules = normalizeRunRules({
    config: {
      economy: { happinessTiers: [], facilities: { levels: [] } },
      planetSlots: { sizes: [] }
    }
  });
`);
eq(run("brokenRules.config.economy.happinessTiers.length"), 5, "an empty happiness-tier list falls back to the defaults");
eq(run("brokenRules.config.economy.facilities.levels.length"), 4, "an empty facility-level list falls back to the defaults");
eq(run("brokenRules.config.planetSlots.sizes.length"), 3, "an empty planet-size list falls back to the defaults");

/* ---------- 4. save round-trip ---------- */
run(`
  state = createInitialState("xenophile");
  state.phase = "actions";
  CONFIG.economy.population.baseGrowthRate = 0.09;
  CONFIG.baseIncome.energy = 11;
  getEventById("mineralVein").weight = 3;
  removeEventFromBucket("economy", "mineralVein");
  STRUCTURE_TYPES.gate.cost.minerals = 1;
  var customSaveText = JSON.stringify(createSaveSnapshot(state));
  var customSave = JSON.parse(customSaveText);
`);
ok(run("!!customSave.rules"), "the save carries a rulebook");
eq(run("customSave.rules.config.economy.population.baseGrowthRate"), 0.09, "the save carries the growth rate");
eq(run("customSave.rules.events.cards.mineralVein.weight"), 3, "the save carries an event weight");
eq(run("getSaveMetadata(customSave).rulesOverrides > 0"), true, "save metadata counts the tweaks");

run("state = createInitialState(null); state.phase = 'actions'; resetRunRules();");
run("var restored = restoreSaveSnapshot(customSave); state = restored;");
eq(run("CONFIG.economy.population.baseGrowthRate"), 0.09, "loading restores the growth rate");
eq(run("CONFIG.baseIncome.energy"), 11, "loading restores base income");
eq(run("getEventById('mineralVein').weight"), 3, "loading restores an event weight");
ok(run("EVENT_BUCKETS.economy.indexOf('mineralVein') === -1"), "loading keeps the card retired");
eq(run("STRUCTURE_TYPES.gate.cost.minerals"), 1, "loading restores a structure cost");
eq(run("state.galaxy.seed"), 20261112, "loading restores the run seed");
run("resetRunRules();");

/* ---------- 5. version compatibility ---------- */
run(`
  var oldSave = JSON.parse(customSaveText);
  oldSave.version = 2;
  delete oldSave.rules;
  CONFIG.baseIncome.energy = 400;
  resetRunRules();
  var oldRestored = restoreSaveSnapshot(oldSave);
`);
eq(run("CONFIG.baseIncome.energy"), 4, "a v2 save loads with the default rulebook");
eq(run("getSaveMetadata(oldSave).rulesOverrides"), 0, "a v2 save reports no tweaks");
assert.throws(function () {
  run("readSaveSnapshot(Object.assign({}, customSave, { version: 1 }))");
}, /format version 1/, "v1 is rejected");
checks += 1;
eq(run("!!oldRestored.galaxy"), true, "the v2 snapshot still rebuilds a run");

/* ---------- 6. tab markup ---------- */
run("debugTabId = 'general'; renderDebugScreen();");
let html = run("els.debugBody.innerHTML");
includes(html, "Starting stockpile", "the general tab builds its first section");
includes(html, 'data-debug-path="startingResources.energy"', "the general tab renders CONFIG fields");
includes(html, 'data-debug-path="stability.drag"', "the general tab renders stability controls");
excludes(html, "undefined", "the general tab never prints undefined");
includes(run("els.debugTabs.innerHTML"), 'data-debug-tab="events"', "the tab strip builds every tab");

run("debugTabId = 'economy'; renderDebugScreen();");
html = run("els.debugBody.innerHTML");
includes(html, "Colony equations", "the economy tab reports the equations");
includes(html, "E_required = P ^ a", "the economy tab prints the energy formula");
includes(html, 'data-debug-path="economy.population.energyExponent"', "the economy tab exposes the exponent");
includes(html, "Growth multiplier ceiling", "the economy preview reports the growth ceiling");
includes(html, 'id="debug-econ-preview"', "the economy preview has a refresh target");
excludes(html, "undefined", "the economy tab never prints undefined");

run("debugTabId = 'events'; renderDebugScreen();");
html = run("els.debugBody.innerHTML");
includes(html, "Pirate Raiders", "the events tab lists an encounter card");
includes(html, "Mineral Vein", "the events tab lists an economy card");
includes(html, "Bread Riot", "the events tab lists an unrest card");
includes(html, 'data-debug-event-field="weight"', "each event card has a weight field");
includes(html, 'data-debug-category-weight="hazard"', "each category has a weight multiplier");
includes(html, 'data-debug-event-bucket=', "each card can be retired or restored");
includes(html, "DRAW ODDS", "each card reports its live draw odds");
includes(html, 'id="debug-events-next"', "the cadence note has a live target");
excludes(html, "undefined", "the events tab never prints undefined");

run("debugTabId = 'galaxy'; renderDebugScreen();");
html = run("els.debugBody.innerHTML");
includes(html, "Galaxy generation", "the galaxy tab reports generation");
includes(html, 'data-debug-path="galaxy.outerRings"', "the galaxy tab exposes the ring count");
includes(html, 'data-debug-path="sector.rows"', "the galaxy tab exposes the sector geometry");
includes(html, "RANDOMIZE SEED", "the galaxy tab can reroll the seed");
excludes(html, "undefined", "the galaxy tab never prints undefined");

run("debugTabId = 'military'; renderDebugScreen();");
html = run("els.debugBody.innerHTML");
includes(html, "Combat rules", "the military tab reports combat rules");
includes(html, 'data-debug-path="military.patrolRadius"', "the military tab exposes the patrol radius");
includes(html, "Corvette", "the military tab lists hull classes");
includes(html, "Marauders", "the military tab lists rival archetypes");
excludes(html, "undefined", "the military tab never prints undefined");

run("debugTabId = 'content'; renderDebugScreen();");
html = run("els.debugBody.innerHTML");
includes(html, "Colony buildings", "the content tab lists buildings");
includes(html, "Orbital structures", "the content tab lists structures");
includes(html, "Survey sites", "the content tab lists survey sites");
includes(html, "Research costs", "the content tab lists tech prices");
includes(html, "Ascension", "the content tab lists the final project");
excludes(html, "undefined", "the content tab never prints undefined");

/* Every rendered control binds to a real path. This catches a wrapper object
   rendered with the wrong base path, which would look editable and do nothing. */
const unresolved = run(`
  (function () {
    const bad = [];
    DEBUG_TABS.forEach(function (tab) {
      debugTabId = tab.id;
      renderDebugScreen();
      const html = els.debugBody.innerHTML;
      const pattern = /data-debug-source="([^"]*)"(?: data-debug-id="([^"]*)")? data-debug-path="([^"]*)"/g;
      let match;
      while ((match = pattern.exec(html))) {
        const target = debugSourceTarget(match[1], match[2] || null);
        const value = target ? getRulePathValue(target, match[3]) : undefined;
        if (value === undefined) bad.push(tab.id + " :: " + match[3]);
      }
    });
    return bad;
  })()
`);
eq(unresolved.length, 0, "every rendered field path resolves against its target" +
  (unresolved.length ? " (" + unresolved.slice(0, 8).join(" | ") + ")" : ""));

/* ---------- 7. delegated controls ---------- */
run(`
  debugTabId = "events";
  renderDebugScreen();
  handleDebugScreenClick({ target: fakeTarget({ "data-debug-event-enabled": "pirateRaiders" }) });
`);
eq(run("getEventById('pirateRaiders').enabled"), false, "the event switch disables a card");
run("handleDebugScreenClick({ target: fakeTarget({ \"data-debug-event-enabled\": \"pirateRaiders\" }) });");
eq(run("getEventById('pirateRaiders').enabled"), true, "the event switch re-enables it");

run("handleDebugScreenClick({ target: fakeTarget({ \"data-debug-event-bucket\": \"pirateRaiders\" }) });");
eq(run("getEventBucketFor('pirateRaiders')"), null, "the deck button retires a card");
run("handleDebugScreenClick({ target: fakeTarget({ \"data-debug-event-bucket\": \"pirateRaiders\" }) });");
eq(run("getEventBucketFor('pirateRaiders')"), "hazard", "the deck button restores a card");

run("handleDebugScreenInput({ target: fakeControl({ \"data-debug-category-weight\": \"hazard\" }, \"4\") });");
eq(run("EVENT_CATEGORIES.hazard.weightMult"), 4, "the category weight field retunes the deck");
run("EVENT_CATEGORIES.hazard.weightMult = 1;");

run(`
  UNREST_EVENTS[0].enabled = false;
  handleDebugScreenInput({ target: fakeControl({ "data-debug-unrest-weight": UNREST_EVENTS[0].id }, "5") });
`);
eq(run("UNREST_EVENTS[0].weight"), 5, "the unrest weight field works while the card is disabled");
run("handleDebugScreenClick({ target: fakeTarget({ \"data-debug-unrest-enabled\": UNREST_EVENTS[0].id }) });");
eq(run("UNREST_EVENTS[0].enabled !== false"), true, "the unrest switch re-enables a disabled card");

run(`
  debugTabId = "economy";
  renderDebugScreen();
  handleDebugScreenInput({ target: fakeControl({
    "data-debug-type": "number",
    "data-debug-source": "config",
    "data-debug-path": "economy.population.energyExponent"
  }, "2.5") });
`);
eq(run("CONFIG.economy.population.energyExponent"), 2.5, "a generic number field writes CONFIG");
includes(run("byId('debug-econ-live').innerHTML"), "P = 3", "the preview refreshes from the live formula");

run("handleDebugScreenInput({ target: fakeControl({ \"data-debug-sample-population\": \"\" }, \"20\") });");
includes(run("byId('debug-econ-live').innerHTML"), "P = 20", "the sample population changes the preview");

run(`
  handleDebugScreenInput({ target: fakeControl({
    "data-debug-type": "text",
    "data-debug-source": "config",
    "data-debug-path": "economy.happinessTiers.0.label"
  }, "ECSTATIC") });
`);
eq(run("CONFIG.economy.happinessTiers[0].label"), "ECSTATIC", "a text field writes the tier label");

run(`
  debugTabId = "general";
  renderDebugScreen();
  handleDebugScreenInput({ target: fakeControl({
    "data-debug-type": "number",
    "data-debug-source": "config",
    "data-debug-path": "stability.start"
  }, "88") });
`);
eq(run("CONFIG.stability.start"), 88, "the wrapped opening-stability field writes CONFIG.stability.start");

run(`
  debugTabId = "economy";
  renderDebugScreen();
  handleDebugScreenChange({ target: fakeControl({
    "data-debug-type": "select",
    "data-debug-source": "config",
    "data-debug-path": "economy.workforce.defaultStrategy"
  }, "greedy") });
`);
eq(run("CONFIG.economy.workforce.defaultStrategy"), "greedy", "the workforce select writes the nested strategy");

run(`
  handleDebugScreenInput({ target: fakeControl({
    "data-debug-type": "number",
    "data-debug-source": "config",
    "data-debug-path": "economy.startingFacilities.0.level"
  }, "2") });
`);
eq(run("CONFIG.economy.startingFacilities[0].level"), 2, "a starting-facility row writes its level");

run(`
  debugTabId = "galaxy";
  renderDebugScreen();
  handleDebugScreenInput({ target: fakeControl({
    "data-debug-type": "number",
    "data-debug-source": "config",
    "data-debug-path": "galaxy.jumpEnergyCost"
  }, "5") });
`);
eq(run("CONFIG.galaxy.jumpEnergyCost"), 5, "the wrapped jump-cost field writes CONFIG.galaxy.jumpEnergyCost");

run(`
  debugTabId = "economy";
  renderDebugScreen();
  handleDebugScreenClick({ target: fakeTarget({
    "data-debug-list-add": "",
    "data-debug-source": "config",
    "data-debug-path": "economy.happinessTiers"
  }) });
`);
eq(run("CONFIG.economy.happinessTiers.length"), 6, "the happiness-tier list adds a row");
run(`
  handleDebugScreenClick({ target: fakeTarget({
    "data-debug-list-remove": "",
    "data-debug-source": "config",
    "data-debug-path": "economy.happinessTiers",
    "data-debug-list-index": "5"
  }) });
`);
eq(run("CONFIG.economy.happinessTiers.length"), 5, "the happiness-tier list removes a row");

run(`
  handleDebugScreenClick({ target: fakeTarget({
    "data-debug-list-add": "",
    "data-debug-source": "config",
    "data-debug-path": "economy.startingFacilities"
  }) });
`);
eq(run("CONFIG.economy.startingFacilities.length"), 3, "the starting-facility list adds a row");
run(`
  handleDebugScreenClick({ target: fakeTarget({
    "data-debug-list-remove": "",
    "data-debug-source": "config",
    "data-debug-path": "economy.startingFacilities",
    "data-debug-list-index": "2"
  }) });
`);
eq(run("CONFIG.economy.startingFacilities.length"), 2, "the starting-facility list removes a row");
run("resetRunRules();");

run(`
  debugTabId = "content";
  renderDebugScreen();
  handleDebugScreenInput({ target: fakeControl({
    "data-debug-type": "number",
    "data-debug-source": "ships",
    "data-debug-id": "corvette",
    "data-debug-path": "attack"
  }, "7") });
`);
eq(run("SHIP_TYPES.corvette.attack"), 7, "a content number field writes the hull table");
run(`
  handleDebugScreenClick({ target: fakeTarget({
    "data-debug-list-add": "",
    "data-debug-source": "ships",
    "data-debug-id": "corvette",
    "data-debug-path": "upgrades.power"
  }) });
`);
eq(run("SHIP_TYPES.corvette.upgrades.power.length"), 3, "a content list adds a refit step");
run(`
  handleDebugScreenClick({ target: fakeTarget({
    "data-debug-list-remove": "",
    "data-debug-source": "ships",
    "data-debug-id": "corvette",
    "data-debug-path": "upgrades.power",
    "data-debug-list-index": "2"
  }) });
`);
eq(run("SHIP_TYPES.corvette.upgrades.power.length"), 2, "a content list removes a refit step");
run("resetRunRules();");

run(`
  handleDebugScreenClick({ target: fakeTarget({
    "data-debug-toggle": "",
    "data-debug-source": "config",
    "data-debug-path": "anomalies.enabled"
  }) });
`);
eq(run("CONFIG.anomalies.enabled"), false, "a boolean switch writes CONFIG");
run("CONFIG.anomalies.enabled = true;");

run(`
  debugTabId = "events";
  renderDebugScreen();
  handleDebugScreenClick({ target: fakeTarget({
    "data-debug-list-add": "",
    "data-debug-source": "config",
    "data-debug-path": "events.intervalRamp"
  }) });
`);
eq(run("CONFIG.events.intervalRamp.length"), 1, "the list add button appends a template");
run(`
  handleDebugScreenClick({ target: fakeTarget({
    "data-debug-list-remove": "",
    "data-debug-source": "config",
    "data-debug-path": "events.intervalRamp",
    "data-debug-list-index": "0"
  }) });
`);
eq(run("CONFIG.events.intervalRamp.length"), 0, "the list remove button splices the row");

/* ---------- 8. reset button ---------- */
run("CONFIG.baseIncome.energy = 77; debugTabId = 'general'; renderDebugScreen();");
run("handleDebugReset();");
eq(run("debugResetArmed"), true, "the first reset press arms the confirmation");
run("handleDebugReset();");
eq(run("CONFIG.baseIncome.energy"), 4, "the second reset press restores the defaults");
eq(run("debugResetArmed"), false, "the confirmation disarms itself");
eq(run("countRuleOverrides()"), 0, "reset leaves no rule overrides");
includes(run("toastMessages[toastMessages.length - 1]"), "reset", "reset reports back to the player");

console.log("debug harness: " + checks + " checks passed");
