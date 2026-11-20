#!/usr/bin/env node
/* ============================================================
   FOG HARNESS — what the screens may publish about a sector
   The app intentionally has no build step, so this harness loads the classic
   browser scripts in a Node VM with element stubs. Run it with:

       node tests/fog-harness.js

   It covers the actual UI gates: an unnamed galaxy node renders no name, no
   meta and no power chip; clicking it is refused; a named-but-uncharted
   sector opens as pure fog with dash summary tiles and no landing lanes; a
   charted sector draws its lanes and real counts but hides player power
   until a ship or colony is there; and the topbar, gate-jump rows and rival
   dispatches obey the same fog.
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
  "js/ui/topbar.js",
  "js/ui/galaxy-view.js",
  "js/ui/map.js",
  "js/ui/planet-screen.js",
  "js/ui/sheet-content.js",
  "js/game/planet-nav.js"
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

/* One fake element covers every DOM read the renderers make. The proxy below
   hands one out for whatever id a renderer asks for, which keeps the harness
   independent of index.html. */
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
    els: els,
    hideToast: function () {},
    closeSheet: function () {},
    showEventLayer: function () {},
    hideEventLayer: function () {},
    renderNav: function () {},
    setResourceTexts: function () {}
  };
  vm.createContext(context);
  files.forEach(function (file) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
  });
  /* toast and renderAll live in the VM so they resolve VM globals (main.js
     and render.js are not loaded: they own browser-only wiring). */
  vm.runInContext(`
    var toastMessages = [];
    function toast(message) { toastMessages.push(message); }
    function renderAll() { renderTopbar(); renderGalaxy(); renderMap(); }

    function freshFog() {
      state = createInitialState(null);
      state.phase = "actions";
      state.ethic = null;
      state.tech.active = null;
      const home = state.galaxy.sectors.find(function (sector) { return sector.home; });
      state.ui.activeSector = home.id;
      state.ui.mapMode = "galaxy";
      state.ui.activeTab = "map";
      state.ui.selectedHex = null;
      state.ui.selectedSystem = null;
      state.ui.shipSelection = [];
      state.ui.move = null;
      state.ui.galaxyLayers = { trade: false };
      toastMessages.length = 0;
      return state;
    }

    function homeSector() {
      return state.galaxy.sectors.find(function (sector) { return sector.home; });
    }

    function unknownSector(minRing) {
      return state.galaxy.sectors.find(function (sector) {
        return sector.ring >= (minRing || 3) && !isSectorNameKnown(sector.id);
      }) || null;
    }

    function namedUnchartedSector() {
      return state.galaxy.sectors.find(function (sector) {
        return !sector.home && isSectorNameKnown(sector.id) && !sectorHasCharts(sector);
      }) || null;
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

    function playerGate(sector) {
      const key = emptyStructureKey(sector);
      sector.structures[key] = {
        type: "gate",
        owner: "player",
        underConstruction: false,
        key: key,
        sectorId: sector.id
      };
      return key;
    }

    function nodeMarkup(sectorId) {
      const html = els.galaxyGraph.innerHTML;
      const start = html.indexOf('data-sector="' + sectorId + '"');
      if (start === -1) return "";
      const next = html.indexOf('data-sector="', start + 1);
      return html.slice(start, next === -1 ? html.length : next);
    }

    function lastToast() {
      return toastMessages.length ? toastMessages[toastMessages.length - 1] : "";
    }
  `, context, { filename: "fog-harness-helpers" });
  return context;
}

const context = createContext();
function run(code) {
  return vm.runInContext(code, context);
}

/* ---------- galaxy map ---------- */

function testGalaxyNamesAndPower() {
  run("freshFog();");
  const unknown = run("(function () {" +
    "  const sector = unknownSector(3);" +
    "  return sector ? { id: sector.id, name: sector.name } : null;" +
    "})()");
  ok(unknown, "an unnamed far sector is available");
  run("renderGalaxy();");

  ok(run("els.galaxyGraph.innerHTML.indexOf(" + JSON.stringify(unknown.name.toUpperCase()) + ")") === -1,
    "an unnamed node never prints its name in the galaxy SVG");
  ok(run("nodeMarkup(" + JSON.stringify(unknown.id) + ").indexOf('node-name')") === -1,
    "an unnamed node draws no label");
  ok(run("nodeMarkup(" + JSON.stringify(unknown.id) + ").indexOf('node-meta')") === -1,
    "an unnamed node draws no colony, fleet, site or threat meta");
  ok(run("els.galaxyGraph.innerHTML.indexOf('⚔')") === -1,
    "hostile power is not published for any sector the player has not charted");

  const nameCount = run("(els.galaxyGraph.innerHTML.match(/node-name/g) || []).length");
  const knownCount = run("state.galaxy.sectors.filter(function (sector) { return isSectorNameKnown(sector.id); }).length");
  eq(nameCount, knownCount, "exactly the known sectors print a name");

  ok(run("nodeMarkup(getCurrentSector().id).indexOf('node-power')") !== -1,
    "the home sector, with its fleet, publishes a PWR chip");

  /* Chart an empty far sector: its name now prints, its power must not. */
  run("markHexExplored(0, 0, " + JSON.stringify(unknown.id) + ");");
  run("renderGalaxy();");
  ok(run("nodeMarkup(" + JSON.stringify(unknown.id) + ").indexOf('node-name')") !== -1,
    "charting the sector publishes its name");
  ok(run("nodeMarkup(" + JSON.stringify(unknown.id) + ").indexOf('node-power')") === -1,
    "a charted sector with no player assets hides player power");

  run("getSector(" + JSON.stringify(unknown.id) + ").fleets['1,1'] = [createShip('corvette')];");
  run("renderGalaxy();");
  ok(run("nodeMarkup(" + JSON.stringify(unknown.id) + ").indexOf('node-power')") !== -1,
    "a player ship in the sector publishes its power");
  ok(run("nodeMarkup(" + JSON.stringify(unknown.id) + ").indexOf('PWR 4')") !== -1,
    "the lone corvette reads PWR 4");

  run("delete getSector(" + JSON.stringify(unknown.id) + ").fleets['1,1'];");
  run("renderGalaxy();");
  ok(run("nodeMarkup(" + JSON.stringify(unknown.id) + ").indexOf('node-power')") === -1,
    "the chip disappears when the last ship leaves");
}

/* ---------- opening a sector ---------- */

function testOpenSectorGate() {
  run("freshFog(); renderGalaxy();");
  const unknown = run("(function () {" +
    "  const sector = unknownSector(3);" +
    "  return sector ? { id: sector.id, name: sector.name } : null;" +
    "})()");
  ok(unknown, "an unnamed far sector is available to click");
  const before = run("state.ui.activeSector");

  run("openSectorView(" + JSON.stringify(unknown.id) + ");");
  eq(run("state.ui.activeSector"), before, "clicking an unnamed sector does not open it");
  eq(run("state.ui.mapMode"), "galaxy", "the galaxy stays on screen");
  ok(run("lastToast().indexOf('No charts')") === 0,
    "the refusal explains that the sector has no charts");
  ok(run("els.sectorTitle.textContent !== " + JSON.stringify(unknown.name)),
    "the refused sector's name never reaches the sector title");
  eq(run("els.sectorMap.innerHTML"), "", "nothing is drawn for the refused sector");

  /* The far sector also stays anonymous for the galaxy view. */
  run("renderGalaxy();");
  ok(run("els.galaxyGraph.innerHTML.indexOf(" + JSON.stringify(unknown.name.toUpperCase()) + ")") === -1,
    "after the refusal the sector still shows no name");
}

function testKnownUnchartedSectorView() {
  run("freshFog();");
  const named = run("(function () {" +
    "  const sector = namedUnchartedSector();" +
    "  return sector ? { id: sector.id, name: sector.name } : null;" +
    "})()");
  ok(named, "a named but uncharted neighbour is available");
  ok(run("getSector(" + JSON.stringify(named.id) + ").neighbors.length > 0"),
    "the neighbour has lanes to check");

  run("openSectorView(" + JSON.stringify(named.id) + ");");
  eq(run("state.ui.activeSector"), named.id, "a known name opens its sector page");
  eq(run("state.ui.mapMode"), "sector", "the sector map is shown");
  eq(run("els.sectorTitle.textContent"), named.name, "the known name is the title");
  eq(run("els.sectorStatCharted.textContent"), "0", "the charted tile starts at 0");
  eq(run("els.sectorStatColonies.textContent"), "—", "colonies stay hidden without a chart");
  eq(run("els.sectorStatSites.textContent"), "—", "survey sites stay hidden without a chart");
  eq(run("els.sectorStatFleets.textContent"), "—", "the fleet count stays hidden without a chart");
  eq(run("els.sectorStatPower.textContent"), "—", "power stays hidden without player activity");
  eq(run("els.sectorStatThreat.textContent"), "—", "hostile power stays hidden without a chart");
  eq(run("els.sectorIntel.textContent"), "—", "INTEL stays hidden without a chart");
  ok(run("els.sectorBadge.getAttribute('title').indexOf('No charts')") === 0,
    "the sector badge explains that nothing is charted");
  ok(run("els.sectorMap.innerHTML.indexOf('landing-marker')") === -1,
    "an uncharted sector draws no lane ports");
  ok(run("els.sectorMap.innerHTML.indexOf('landing-tag')") === -1,
    "an uncharted sector draws no neighbour labels");

  /* No neighbour name may appear on the fogged map. */
  const leaked = run("(function () {" +
    "  const html = els.sectorMap.innerHTML;" +
    "  return getSector(" + JSON.stringify(named.id) + ").neighbors.map(getSector).filter(function (sector) {" +
    "    return !!sector && html.indexOf(sector.name.toUpperCase()) !== -1;" +
    "  }).length;" +
    "})()");
  eq(leaked, 0, "no adjacent sector name leaks into an uncharted sector map");

  /* A named sector with a rival fleet still hides its threat chip until the
     player charts it. */
  const threatHidden = run("els.threatChip.classList.contains('hidden')");
  ok(threatHidden, "the topbar threat chip stays hidden for an uncharted sector");
}

/* A sector can be named (one lane from home) without being charted, and a
   rival power can sit there. Its name is fair game; its hostile power is
   live telemetry that needs the player to be active in the sector, even
   while the sector is being viewed or after it has been charted. */
function testThreatChip() {
  run("freshFog();");
  const rival = run("(function () {" +
    "  const sector = state.galaxy.sectors.find(function (entry) {" +
    "    return !entry.home && isSectorNameKnown(entry.id) && !sectorHasCharts(entry) &&" +
    "      getSectorRivalPower(entry.id) > 0;" +
    "  });" +
    "  return sector ? { id: sector.id, power: getSectorRivalPower(sector.id) } : null;" +
    "})()");
  ok(rival, "a named but uncharted sector with hostile power is available");

  run("state.ui.activeSector = " + JSON.stringify(rival.id) + "; renderGalaxy(); renderTopbar(); renderMap();");
  ok(run("nodeMarkup(" + JSON.stringify(rival.id) + ").indexOf('⚔')") === -1,
    "viewing a named but uncharted sector does not publish hostile power on the galaxy node");
  ok(run("els.threatChip.classList.contains('hidden')"),
    "the topbar threat chip hides an uncharted sector's hostile power");

  run("markHexExplored(0, 0, " + JSON.stringify(rival.id) + "); renderGalaxy(); renderTopbar(); renderMap();");
  ok(run("nodeMarkup(" + JSON.stringify(rival.id) + ").indexOf('⚔" + rival.power + "')") === -1,
    "a chart alone does not publish hostile power on the galaxy node");
  ok(run("els.threatChip.classList.contains('hidden')"),
    "a chart alone does not publish hostile power in the topbar");
  eq(run("els.sectorStatThreat.textContent"), "—",
    "a charted sector with no player presence hides hostile power in the summary");

  run("getSector(" + JSON.stringify(rival.id) + ").fleets['2,2'] = [createShip('corvette')];" +
    "renderGalaxy(); renderTopbar(); renderMap();");
  ok(run("nodeMarkup(" + JSON.stringify(rival.id) + ").indexOf('⚔" + rival.power + "')") !== -1,
    "a ship in the sector publishes hostile power on the galaxy node");
  ok(!run("els.threatChip.classList.contains('hidden')"),
    "a ship in the sector reveals hostile power in the topbar");
  eq(run("els.threatText.textContent"), "PWR " + rival.power,
    "the threat chip reports the hostile power while the player is active");
  eq(run("els.sectorStatThreat.textContent"), String(rival.power),
    "the THREAT tile reports the hostile power while the player is active");

  run("delete getSector(" + JSON.stringify(rival.id) + ").fleets['2,2'];" +
    "renderGalaxy(); renderTopbar(); renderMap();");
  ok(run("nodeMarkup(" + JSON.stringify(rival.id) + ").indexOf('⚔')") === -1,
    "hostile power disappears from the galaxy node when the last ship leaves");
  ok(run("els.threatChip.classList.contains('hidden')"),
    "hostile power disappears from the topbar when the last ship leaves");
  eq(run("els.sectorStatThreat.textContent"), "—",
    "hostile power disappears from the summary when the last ship leaves");
}

/* ---------- charted sector map ---------- */

function testChartedSectorMap() {
  run("freshFog();");
  run("openSectorView(getCurrentSector().id);");
  eq(run("els.sectorTitle.textContent"), run("getCurrentSector().name"),
    "the home sector prints its own name");
  eq(run("els.sectorStatPower.textContent"), "11", "the active home sector publishes POWER 11");
  ok(run("els.sectorStatColonies.textContent") !== "—", "a charted sector publishes its colony count");
  ok(run("els.sectorMap.innerHTML.indexOf('landing-marker')") !== -1,
    "a charted sector draws its lane ports");
  const homeNeighbor = run("getCurrentSector().neighbors.map(getSector)[0].name.toUpperCase()");
  ok(run("els.sectorMap.innerHTML.indexOf(" + JSON.stringify(homeNeighbor) + ")") !== -1,
    "a lane port names its known neighbouring sector");

  /* A charted sector with no player assets keeps its threat readout but
     hides player power. */
  const remote = run("(function () {" +
    "  const sector = unknownSector(3);" +
    "  markHexExplored(0, 0, sector.id);" +
    "  return sector.id;" +
    "})()");
  run("openSectorView(" + JSON.stringify(remote) + ");");
  eq(run("els.sectorStatCharted.textContent"), "1", "the charted hex counts on the summary");
  eq(run("els.sectorStatPower.textContent"), "—", "a charted but empty sector hides player power");
  eq(run("els.sectorStatThreat.textContent"), "—", "a charted but empty sector hides hostile power");
  eq(run("els.sectorIntel.textContent"), "1", "a charted sector publishes its INTEL");
  ok(run("els.sectorMap.innerHTML.indexOf('landing-marker')") !== -1,
    "charted lanes appear once the sector is charted");

  run("(function () {" +
    "  const sector = getSector(" + JSON.stringify(remote) + ");" +
    "  sector.fleets['2,2'] = [createShip('corvette')];" +
    "  renderMap();" +
    "})();");
  eq(run("els.sectorStatPower.textContent"), "4", "a ship in the sector publishes POWER 4");
  eq(run("els.sectorStatThreat.textContent"), run("String(getSectorRivalPower(" + JSON.stringify(remote) + "))"),
    "a ship in the sector publishes the hostile readout");
  run("(function () {" +
    "  delete getSector(" + JSON.stringify(remote) + ").fleets['2,2'];" +
    "  renderMap();" +
    "})();");
  eq(run("els.sectorStatPower.textContent"), "—", "the POWER tile empties again with the last ship");
  eq(run("els.sectorStatThreat.textContent"), "—", "the THREAT tile empties again with the last ship");
}

/* ---------- lane labels and rival dispatches ---------- */

function testLandingNamesAndDispatches() {
  run("freshFog();");
  eq(run("landingNeighborName({ name: 'Hidden Sector' })"), "UNKNOWN",
    "an unnamed lane neighbour reads UNKNOWN");
  eq(run("landingNeighborName(homeSector())"), "CORE",
    "the core lane still reads CORE");
  ok(run("landingNeighborName(state.galaxy.sectors.filter(function (sector) {" +
    "  return !sector.home && isSectorNameKnown(sector.id);" +
    "})[0])") !== "UNKNOWN", "a named lane neighbour keeps its name");

  /* A met empire whose home sector was never charted masks the baked-in name
     in its dispatch text. */
  const rival = run("(function () {" +
    "  const empire = state.empires.find(function (entry) { return !isSectorNameKnown(entry.sectorId); });" +
    "  return empire ? { id: empire.id, sectorName: getSector(empire.sectorId).name } : null;" +
    "})()");
  ok(rival, "a rival with an uncharted home sector is available");
  run("markEmpireMet(getEmpire(" + JSON.stringify(rival.id) + "), 'raid');");
  ok(run("getEmpireActionLabel(getEmpire(" + JSON.stringify(rival.id) + ")).indexOf(" +
    JSON.stringify(rival.sectorName) + ")") === -1,
    "an uncharted home sector name is masked in the dispatch text");
  run("markHexExplored(0, 0, getEmpire(" + JSON.stringify(rival.id) + ").sectorId);");
  ok(run("getEmpireActionLabel(getEmpire(" + JSON.stringify(rival.id) + ")).indexOf(" +
    JSON.stringify(rival.sectorName) + ")") !== -1,
    "charting the home sector restores the name in the dispatch text");
}

/* ---------- gate jump rows ---------- */

function testJumpRows() {
  run("freshFog();");
  const setup = run("(function () {" +
    "  const home = getCurrentSector();" +
    "  const key = emptyStructureKey(home);" +
    "  home.structures[key] = { type: 'gate', owner: 'player', underConstruction: false, key: key, sectorId: home.id };" +
    "  home.fleets[key] = [createShip('corvette')];" +
    "  state.ui.selectedHex = key;" +
    "  state.ui.shipSelection = [];" +
    "  const pos = parseHexKey(key);" +
    "  const rival = home.neighbors.map(getSector).find(function (sector) {" +
    "    return !!sector && !sectorHasCharts(sector) && getSectorRivalPower(sector.id) > 0;" +
    "  });" +
    "  return { row: pos.row, col: pos.col, rivalId: rival ? rival.id : null, rivalPower: rival ? getSectorRivalPower(rival.id) : 0 };" +
    "})()");
  ok(setup.rivalId, "an uncharted neighbour with hostile power is available for the jump rows");
  const html = run("fleetTabHTML(" + setup.row + ", " + setup.col + ")");
  ok(html.indexOf("⚔ " + setup.rivalPower) === -1,
    "the jump list does not publish unseen hostile power");
  ok(html.indexOf("UNCHARTED") !== -1, "the jump list marks the destination UNCHARTED");

  run("markHexExplored(0, 0, " + JSON.stringify(setup.rivalId) + ");");
  const chartedHtml = run("fleetTabHTML(" + setup.row + ", " + setup.col + ")");
  ok(chartedHtml.indexOf("⚔ " + setup.rivalPower) === -1,
    "a chart alone does not publish the destination's hostile power");

  run("getSector(" + JSON.stringify(setup.rivalId) + ").fleets['2,2'] = [createShip('corvette')];");
  const occupiedHtml = run("fleetTabHTML(" + setup.row + ", " + setup.col + ")");
  ok(occupiedHtml.indexOf("⚔ " + setup.rivalPower) !== -1,
    "a player ship at the destination publishes its hostile power");
}

testGalaxyNamesAndPower();
testOpenSectorGate();
testKnownUnchartedSectorView();
testThreatChip();
testChartedSectorMap();
testLandingNamesAndDispatches();
testJumpRows();

console.log("Fog harness: " + checks + " checks passed.");
