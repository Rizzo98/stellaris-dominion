#!/usr/bin/env node
/* ============================================================
   SAVE HARNESS — snapshot, validation, restore and continuation
   The app intentionally has no build step, so this harness loads the
   classic browser scripts in a Node VM with tiny UI stubs. Run it with:

       node tests/save-harness.js

   It covers the JSON snapshot shape, the transient UI reset, the RNG
   stream positions, event-deck continuation, save-file validation and
   metadata, and a full turn played on a restored run.
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
  "js/core/save.js",
  "js/game/planet-nav.js",
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
function sameJson(actual, expected, message) {
  if (actual !== expected) {
    let index = 0;
    while (index < actual.length && index < expected.length && actual[index] === expected[index]) {
      index += 1;
    }
    assert.fail(message + " at character " + index +
      " (got " + JSON.stringify(actual.slice(index, index + 140)) +
      ", want " + JSON.stringify(expected.slice(index, index + 140)) + ")");
  }
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
  return context;
}

const context = createContext();
function run(code) {
  return vm.runInContext(code, context);
}
function reset(ethic) {
  const id = ethic || null;
  run("state = createInitialState(" + (id ? JSON.stringify(id) : "null") + ");" +
    "state.phase = 'actions'; state.ethic = " + (id ? JSON.stringify(id) : "null") + ";" +
    "state.ui.activeSector = 'sec-core'; state.currentEvent = null;");
}
function snapshotText() {
  return run("JSON.stringify(createSaveSnapshot(state))");
}
function restoreFromText(text) {
  context.__saveText = text;
  const restored = run("restoreSaveSnapshot(parseSaveText(__saveText))");
  context.restoredState = restored;
  return restored;
}
function advanceTurn() {
  run("state.phase = 'actions'; state.currentEvent = null; endTurn();");
}
function turnFingerprint() {
  return run("(function () {" +
    "  const military = Object.assign({}, state.military);" +
    "  delete military.rng;" +
    "  return JSON.stringify({" +
    "    turn: state.turn," +
    "    phase: state.phase," +
    "    stability: state.stability," +
    "    resources: state.resources," +
    "    resourceCarry: state.resourceCarry," +
    "    galaxy: state.galaxy," +
    "    systems: state.systems," +
    "    empires: state.empires," +
    "    military: military," +
    "    tech: state.tech," +
    "    events: state.events," +
    "    currentEvent: state.currentEvent" +
    "  });" +
    "})()");
}

/* ---------- snapshot shape and round trip ---------- */

function testSnapshotRoundTrip() {
  reset("militarist");
  run("state.turn = 7;" +
    "state.stability = 63;" +
    "state.resources.research = 12;" +
    "state.resources.influence = 4;" +
    "state.resourceCarry.research = 0.25;" +
    "state.tech.done.push(TECH_ORDER[0]);" +
    "state.tech.progress[TECH_ORDER[0]] = TECHS[TECH_ORDER[0]].cost;" +
    "state.tech.active = TECH_ORDER[1];" +
    "state.tech.progress[TECH_ORDER[1]] = 3;" +
    "state.shipSerial = 9;" +
    "markHexExplored(1, 1, 'sec-core');" +
    "getSector('sec-core').economy.energy = 21;" +
    "getSector('sec-core').economy.minerals = 9;" +
    "const testShip = getSector('sec-core').fleets['2,3'][0];" +
    "testShip.hull = 3;" +
    "testShip.upgrades.power = 1;" +
    "const home = state.systems.find(function (system) { return system.home; });" +
    "home.population = 20;" +
    "home.maintenance.energy = 40;" +
    "home.maintenance.minerals = 60;" +
    "home.workerStrategy = 'greedy';" +
    "home.workerOrders = { 0: 3, 1: 4 };" +
    "home.growthProgress = 0.5;" +
    "state.military.kills = 3;" +
    "state.military.battles = 2;" +
    "state.military.log.push({ turn: 6, text: 'Test dispatch' });" +
    "state.ui.activeTab = 'tech';" +
    "state.ui.techCategory = 'military';" +
    "state.ui.mapMode = 'sector';" +
    "state.ui.mapLayers.charted = true;");

  const before = run("(function () {" +
    "  const military = Object.assign({}, state.military);" +
    "  delete military.rng;" +
    "  return JSON.stringify({" +
    "    galaxy: state.galaxy, systems: state.systems, empires: state.empires," +
    "    tech: state.tech, resources: state.resources, resourceCarry: state.resourceCarry," +
    "    events: state.events, military: military, shipSerial: state.shipSerial" +
    "  });" +
    "})()");

  const text = snapshotText();
  ok(text.length > 10000, "the snapshot is a full JSON dump, not a bookmark (" + text.length + " bytes)");
  const raw = JSON.parse(text);
  eq(raw.format, "stellar-dominion-save", "the snapshot carries the save format id");
  eq(raw.version, 3, "the snapshot carries the format version");
  eq(raw.state.turn, 7, "the turn is in the snapshot");
  ok(typeof raw.savedAt === "string" && raw.savedAt.length > 10, "the snapshot records when it was made");
  ok(typeof raw.rngStreams.events === "number" && typeof raw.rngStreams.military === "number",
    "both RNG stream positions are recorded");
  ok(raw.state.rng === undefined && raw.state.military.rng === undefined,
    "the live RNG closures are not part of the JSON");

  const restored = restoreFromText(text);
  const after = run("(function () {" +
    "  const military = Object.assign({}, restoredState.military);" +
    "  delete military.rng;" +
    "  return JSON.stringify({" +
    "    galaxy: restoredState.galaxy, systems: restoredState.systems, empires: restoredState.empires," +
    "    tech: restoredState.tech, resources: restoredState.resources, resourceCarry: restoredState.resourceCarry," +
    "    events: restoredState.events, military: military, shipSerial: restoredState.shipSerial" +
    "  });" +
    "})()");
  sameJson(after, before, "every saved game field survives the JSON round trip");

  eq(restored.turn, 7, "the restored run resumes on the saved turn");
  eq(restored.phase, "actions", "the restored run is ready for actions");
  eq(restored.ui.activeTab, "tech", "the open tab is restored");
  eq(restored.ui.techCategory, "military", "the open tech category is restored");
  eq(restored.ui.mapMode, "sector", "the sector map reopens on the same sector");
  eq(restored.ui.mapLayers.charted, true, "layer preferences are restored");
  eq(restored.rng.getState(), raw.rngStreams.events, "the event stream resumes at the saved position");
  eq(restored.military.rng.getState(), raw.rngStreams.military, "the military stream resumes at the saved position");
  const ship = restored.galaxy.sectors.find(function (sector) { return sector.id === "sec-core"; })
    .fleets["2,3"][0];
  eq(ship.hull, 3, "ship hull damage is saved");
  eq(ship.upgrades.power, 1, "ship refit levels are saved");
  const restoredHome = restored.systems.find(function (system) { return system.home; });
  eq(restoredHome.population, 20, "the colony population is saved");
  eq(restoredHome.maintenance.energy, 40, "the energy maintenance percentage is saved");
  eq(restoredHome.maintenance.minerals, 60, "the housing investment percentage is saved");
  eq(restoredHome.workerStrategy, "greedy", "the automatic crew strategy is saved");
  eq(restoredHome.workerOrders[0], 3, "pinned worker orders are saved");
  eq(restoredHome.growthProgress, 0.5, "banked population growth is saved");
}

/* ---------- RNG and event deck continuation ---------- */

function testRngContinuation() {
  reset("pacifist");
  run("state.turn = 9; state.events.nextTurn = 11;");
  const text = snapshotText();
  const expected = run("(function () { const out = []; for (let i = 0; i < 6; i += 1) out.push(state.rng()); return out; })()");
  const expectedMilitary = run("(function () { const out = []; for (let i = 0; i < 6; i += 1) out.push(state.military.rng()); return out; })()");
  const restored = restoreFromText(text);
  const actual = run("(function () { const out = []; for (let i = 0; i < 6; i += 1) out.push(restoredState.rng()); return out; })()");
  const actualMilitary = run("(function () { const out = []; for (let i = 0; i < 6; i += 1) out.push(restoredState.military.rng()); return out; })()");
  sameJson(JSON.stringify(actual), JSON.stringify(expected),
    "the event stream continues with the same six draws");
  sameJson(JSON.stringify(actualMilitary), JSON.stringify(expectedMilitary),
    "the military stream continues with the same six draws");
}

function testEventDrawContinuation() {
  reset("militarist");
  run("state.turn = 5; state.events.nextTurn = 5; state.events.lastEventId = null;" +
    "state.events.count = 1; state.events.history = [{ turn: 2, id: 'old', category: 'discovery' }];");
  const text = snapshotText();
  const expected = run("drawEvent()");
  ok(!!expected && !!expected.id, "the deck deals a card before the save");
  const restored = restoreFromText(text);
  const actual = run("(function () {" +
    "  const keep = state;" +
    "  state = restoredState;" +
    "  const event = drawEvent();" +
    "  state = keep;" +
    "  return event;" +
    "})()");
  eq(actual.id, expected.id, "a restored run draws the same next encounter card");
  eq(actual.category, expected.category, "the drawn card keeps its category");
  eq(restored.events.count, 2, "the saved deck count carries into the next draw");
  eq(restored.events.history.length, 2, "the saved history is extended by the new draw");
  eq(restored.events.history[0].id, "old", "the saved history entry is restored");
}

/* ---------- event overlay ---------- */

function testEventPhaseRestore() {
  reset("militarist");
  run("state.turn = 4;" +
    "state.phase = 'event';" +
    "state.currentEvent = getEventById(EVENT_BUCKETS[EVENT_CATEGORY_ORDER[0]][0]);" +
    "state.events.lastEventId = state.currentEvent.id;");
  const eventId = run("state.currentEvent.id");
  const text = snapshotText();
  const restored = restoreFromText(text);
  eq(restored.phase, "event", "a save taken between draw and choice stays on the event phase");
  ok(!!restored.currentEvent, "the pending card is restored");
  eq(restored.currentEvent.id, eventId, "the pending card keeps its id");
  ok(Array.isArray(restored.currentEvent.choices) && restored.currentEvent.choices.length >= 2,
    "the pending card still carries its choices");
}

/* ---------- transient UI reset ---------- */

function testTransientUiReset() {
  reset("militarist");
  run("state.ui.sheet = { kind: 'build', systemId: 'system-1', slotIndex: 0 };" +
    "state.ui.move = { sectorId: 'sec-core', route: ['1,1'] };" +
    "state.ui.selectedHex = '1,1';" +
    "state.ui.selectedSystem = 'system-1';" +
    "state.ui.selectedTab = 'fleet';" +
    "state.ui.spaceportOpen = true;" +
    "state.ui.shipSelection = ['ship-1']; " +
    "state.ui.eventResolving = true;" +
    "state.ui.galaxyLayers.trade = true;");
  const restored = restoreFromText(snapshotText());
  ok(restored.ui.sheet === null, "an open sheet is not restored");
  ok(restored.ui.move === null, "a half-ordered fleet move is not restored");
  ok(restored.ui.selectedHex === null && restored.ui.selectedSystem === null,
    "hex and system selections are not restored");
  eq(restored.ui.selectedTab, "world", "the hex screen reopens on the world tab");
  eq(restored.ui.spaceportOpen, false, "the spaceport menu starts collapsed");
  eq(restored.ui.shipSelection.length, 0, "the fleet selection starts empty");
  eq(restored.ui.eventResolving, false, "the event resolve lock is cleared");
  eq(restored.ui.galaxyLayers.trade, true, "the trade layer preference survives");
  eq(restored.ui.activeSector, "sec-core", "the viewed sector survives");
}

/* ---------- validation ---------- */

function testValidation() {
  reset("militarist");
  const valid = JSON.parse(snapshotText());

  assert.throws(function () { run("parseSaveText('not json')"); }, /not valid JSON/);
  checks += 1;

  context.rawSave = { format: "something-else", version: 1, state: valid.state };
  assert.throws(function () { run("readSaveSnapshot(rawSave)"); }, /not a Stellar Dominion save/);
  checks += 1;

  context.rawSave = Object.assign({}, valid, { version: 99 });
  assert.throws(function () { run("readSaveSnapshot(rawSave)"); }, /format version 99/);
  checks += 1;

  const ended = JSON.parse(JSON.stringify(valid));
  ended.state.phase = "ended";
  context.rawSave = ended;
  assert.throws(function () { run("readSaveSnapshot(rawSave)"); }, /not from a playable turn/);
  checks += 1;

  const noGalaxy = JSON.parse(JSON.stringify(valid));
  delete noGalaxy.state.galaxy;
  context.rawSave = noGalaxy;
  assert.throws(function () { run("readSaveSnapshot(rawSave)"); }, /no galaxy/);
  checks += 1;

  run("state.phase = 'ended';");
  assert.throws(function () { run("createSaveSnapshot(state)"); }, /playable turn/);
  checks += 1;
}

/* ---------- metadata and file name ---------- */

function testMetadataAndFileName() {
  reset("militarist");
  run("state.turn = 12; state.galaxy.seed = 424242;");
  const raw = JSON.parse(snapshotText());
  context.__saveRaw = raw;
  const meta = run("getSaveMetadata(__saveRaw)");
  eq(meta.turn, 12, "metadata reports the saved turn");
  eq(meta.seed, 424242, "metadata reports the galaxy seed");
  eq(meta.ethicName, "Militarist", "metadata names the ethic");
  eq(meta.colonies, 1, "metadata counts the colonies");
  eq(meta.sectors, run("state.galaxy.sectors.length"), "metadata counts the sectors");
  const fileName = run("getSaveFileName(__saveRaw)");
  ok(fileName.indexOf("turn-12") !== -1, "the file name carries the turn");
  ok(fileName.indexOf("seed-424242") !== -1, "the file name carries the seed");
  ok(/\.json$/.test(fileName), "the file name ends in .json");
  ok(run("formatSavedAt(__saveRaw.savedAt)").length > 0, "the saved time has a readable label");
  eq(run("formatSavedAt(null)"), "unknown time", "a missing timestamp is labelled");
}

/* ---------- full turn continuation ---------- */

function testTurnContinuation() {
  reset("militarist");
  run("state.ui.activeSector = 'sec-core';");
  advanceTurn();
  advanceTurn();
  run("state.phase = 'actions'; state.currentEvent = null;");
  const text = snapshotText();
  run("endTurn();");
  const expected = turnFingerprint();
  context.__saveText = text;
  run("state = restoreSaveSnapshot(parseSaveText(__saveText));" +
    "state.phase = 'actions'; state.currentEvent = null; endTurn();");
  const actual = turnFingerprint();
  sameJson(actual, expected, "a restored run plays the next turn identically");
  eq(run("state.turn"), 4, "the restored run advanced from turn 3 to turn 4");
}

/* ---------- run ---------- */

testSnapshotRoundTrip();
testRngContinuation();
testEventDrawContinuation();
testEventPhaseRestore();
testTransientUiReset();
testValidation();
testMetadataAndFileName();
testTurnContinuation();

console.log("save-harness: " + checks + " checks passed");
