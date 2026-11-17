/* ============================================================
   SAVE — snapshot, validation and restore of a whole run
   The prototype stores a run as plain JSON. Almost everything the game
   needs already lives in the mutable 'state' object, so a snapshot is that
   object minus the two live RNG closures, plus their stream positions.
   A snapshot round-trips through localStorage or a downloaded file and
   rebuilds a run that continues where it stopped, with the same deck.

   Bump SAVE_VERSION whenever the state shape changes incompatibly.
   ============================================================ */

const SAVE_FORMAT = "stellar-dominion-save";
const SAVE_VERSION = 1;
const SAVE_STORAGE_KEY = "stellar-dominion-mvp3-save";

function isSaveablePhase(phase) {
  return phase === "actions" || phase === "event";
}

function canSaveState(source) {
  return !!source && isSaveablePhase(source.phase);
}

/* ---------- RNG positions ---------- */

function getRngPosition(rng) {
  if (typeof rng !== "function" || typeof rng.getState !== "function") return null;
  return rng.getState();
}

function setRngPosition(rng, position) {
  if (typeof rng !== "function") return rng;
  if (typeof position === "number" && isFinite(position) && typeof rng.setState === "function") {
    rng.setState(position);
  }
  return rng;
}

/* ---------- snapshot ---------- */

/* JSON drops the rng functions by itself. The UI writes are reset because a
   snapshot should open on a screen the restored DOM can actually build: no
   open sheet, no half-finished move order, no stale hex selection. Tab,
   sector and layer preferences are kept so the run reopens where it was. */
function cloneSaveState(source) {
  const game = JSON.parse(JSON.stringify(source));
  const ui = game.ui || (game.ui = {});
  ui.sheet = null;
  ui.move = null;
  ui.shipSelection = [];
  ui.eventResolving = false;
  ui.spaceportOpen = false;
  ui.selectedHex = null;
  ui.selectedSystem = null;
  ui.selectedTab = "world";
  return game;
}

function createSaveSnapshot(source) {
  const game = source || state;
  if (!game) throw new Error("There is no run to save.");
  if (!canSaveState(game)) throw new Error("Saving is only available during a playable turn.");
  const military = game.military || {};
  return {
    format: SAVE_FORMAT,
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    state: cloneSaveState(game),
    rngStreams: {
      events: getRngPosition(game.rng),
      military: getRngPosition(military.rng)
    }
  };
}

/* ---------- validation ---------- */

function readSaveSnapshot(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("That file is not a Stellar Dominion save.");
  }
  if (raw.format !== SAVE_FORMAT) {
    throw new Error("That file is not a Stellar Dominion save.");
  }
  if (raw.version !== SAVE_VERSION) {
    throw new Error("That save uses format version " + raw.version +
      "; this build reads version " + SAVE_VERSION + ".");
  }
  const game = raw.state;
  if (!game || typeof game !== "object") throw new Error("The save has no game state.");
  if (!game.galaxy || !Array.isArray(game.galaxy.sectors) || !game.galaxy.sectors.length) {
    throw new Error("The save has no galaxy.");
  }
  if (!Array.isArray(game.systems) || !game.systems.length) {
    throw new Error("The save has no colonies or systems.");
  }
  if (game.systems.some(function (system) { return !system || typeof system !== "object"; })) {
    throw new Error("The save has unreadable systems.");
  }
  if (!isSaveablePhase(game.phase)) {
    throw new Error("That save is not from a playable turn.");
  }
  return raw;
}

function parseSaveText(text) {
  let raw;
  try {
    raw = JSON.parse(String(text || ""));
  } catch (error) {
    throw new Error("That save file is not valid JSON.");
  }
  return readSaveSnapshot(raw);
}

/* ---------- restore ---------- */

function normalizeSavedShips(list) {
  if (!Array.isArray(list)) return;
  list.forEach(ensureShipUpgrades);
}

function normalizeSavedSector(sector) {
  sector.explored = sector.explored || {};
  sector.fleets = sector.fleets || {};
  sector.rivalFleets = sector.rivalFleets || {};
  sector.structures = sector.structures || {};
  sector.anomalies = sector.anomalies || {};
  sector.neighbors = Array.isArray(sector.neighbors) ? sector.neighbors : [];
  sector.landings = sector.landings || {};
  sector.economy = Object.assign({ energy: 0, minerals: 0 }, sector.economy || {});
  sector.carry = Object.assign({ energy: 0, minerals: 0 }, sector.carry || {});
  Object.keys(sector.fleets).forEach(function (key) {
    normalizeSavedShips(sector.fleets[key]);
  });
  Object.keys(sector.rivalFleets).forEach(function (key) {
    normalizeSavedShips(sector.rivalFleets[key]);
  });
  Object.keys(sector.structures).forEach(function (key) {
    const structure = sector.structures[key];
    if (!structure || !Array.isArray(structure.queue)) return;
    structure.queue.forEach(function (order) {
      if (order && order.ship) normalizeSavedShips([order.ship]);
    });
  });
}

function normalizeSavedSystem(system) {
  system.colonized = !!system.colonized;
  system.population = typeof system.population === "number" ? system.population : 0;
  system.populationUpkeep = Object.assign({ housing: 0, sustenance: 0 }, system.populationUpkeep || {});
  system.growthProgress = typeof system.growthProgress === "number" ? system.growthProgress : 0;
  system.unlockedBonusSlots = typeof system.unlockedBonusSlots === "number" ? system.unlockedBonusSlots : 0;
  system.completedNow = !!system.completedNow;
  if (!Array.isArray(system.slots)) system.slots = createPlanetSlots(system);
}

/* Defaults cover a save made before a field existed. The values are chosen
   to match a run's opening state; current saves already carry every field. */
function normalizeRestoredState(game) {
  game.galaxy.sectors = game.galaxy.sectors.filter(function (sector) {
    return !!sector && typeof sector.id === "string";
  });
  if (!game.galaxy.sectors.length) throw new Error("The save has no readable sectors.");
  const sectors = game.galaxy.sectors;
  const home = sectors.find(function (sector) { return sector.home; }) || sectors[0];
  const sectorIds = {};

  game.galaxy.seed = typeof game.galaxy.seed === "number" && isFinite(game.galaxy.seed)
    ? game.galaxy.seed >>> 0
    : CONFIG.galaxy.seed >>> 0;
  sectors.forEach(function (sector) {
    sectorIds[sector.id] = true;
    normalizeSavedSector(sector);
  });
  game.systems = game.systems.filter(Boolean);
  game.systems.forEach(normalizeSavedSystem);

  game.turn = typeof game.turn === "number" && game.turn > 0 ? game.turn : 1;
  game.runId = typeof game.runId === "number" ? game.runId : 1;
  game.ethic = ETHICS[game.ethic] ? game.ethic : null;
  game.stability = typeof game.stability === "number" ? game.stability : CONFIG.stability.start;
  game.stats = Object.assign({ anomaliesFound: 0, anomaliesSurveyed: 0, surveysStarted: 0 }, game.stats || {});
  game.resources = Object.assign({ research: 0, influence: 0 }, game.resources || {});
  game.resourceCarry = Object.assign({ research: 0, influence: 0 }, game.resourceCarry || {});
  game.events = Object.assign(createEventState(), game.events || {});
  game.tech = Object.assign({
    active: null,
    progress: {},
    done: [],
    exclusiveChoice: null
  }, game.tech || {});
  if (!game.tech.progress || typeof game.tech.progress !== "object") game.tech.progress = {};
  TECH_ORDER.forEach(function (id) {
    if (typeof game.tech.progress[id] !== "number") game.tech.progress[id] = 0;
  });
  if (!Array.isArray(game.tech.done)) game.tech.done = [];
  if (game.tech.active && !TECHS[game.tech.active]) game.tech.active = null;
  game.military = Object.assign(createMilitaryState(game.galaxy.seed), game.military || {});
  delete game.military.rng;
  if (!Array.isArray(game.military.log)) game.military.log = [];
  game.shipSerial = typeof game.shipSerial === "number" ? game.shipSerial : 0;
  game.endResult = game.endResult || null;

  if (game.currentEvent && !Array.isArray(game.currentEvent.choices)) game.currentEvent = null;
  if (game.phase === "event" && !game.currentEvent) game.phase = "actions";
  if (game.phase === "actions") game.currentEvent = null;

  const ui = Object.assign({
    activeTab: "map",
    mapMode: "galaxy",
    techCategory: "building",
    activeSector: home ? home.id : null,
    selectedHex: null,
    selectedSystem: null,
    selectedTab: "world",
    spaceportOpen: false,
    shipSelection: [],
    move: null,
    sheet: null,
    mapLayers: { charted: false, patrol: true, landing: true },
    galaxyLayers: { trade: false },
    eventResolving: false
  }, game.ui || {});
  if (["map", "tech", "empire"].indexOf(ui.activeTab) === -1) ui.activeTab = "map";
  if (ui.mapMode !== "sector") ui.mapMode = "galaxy";
  if (!sectorIds[ui.activeSector]) ui.activeSector = home ? home.id : null;
  if (!TECH_CATEGORIES.some(function (category) { return category.id === ui.techCategory; })) {
    ui.techCategory = TECH_CATEGORIES[0].id;
  }
  ui.mapLayers = Object.assign({ charted: false, patrol: true, landing: true }, ui.mapLayers || {});
  ui.galaxyLayers = Object.assign({ trade: false }, ui.galaxyLayers || {});
  ui.sheet = null;
  ui.move = null;
  ui.shipSelection = [];
  ui.eventResolving = false;
  ui.spaceportOpen = false;
  ui.selectedHex = null;
  ui.selectedSystem = null;
  ui.selectedTab = "world";
  game.ui = ui;

  return game;
}

/* A loaded run keeps its ids. Later content in this page may create more
   ships, so the unnamed-ship counter has to move past what the save holds. */
function syncSaveCounters(game) {
  if (typeof game.runId === "number" && game.runId > runCounter) runCounter = game.runId;
  let highest = shipIdCounter;
  function scanShips(list) {
    (list || []).forEach(function (ship) {
      const match = ship && typeof ship.id === "string" ? /^ship-(\d+)$/.exec(ship.id) : null;
      if (match) highest = Math.max(highest, Number(match[1]));
    });
  }
  game.galaxy.sectors.forEach(function (sector) {
    Object.keys(sector.fleets || {}).forEach(function (key) { scanShips(sector.fleets[key]); });
    Object.keys(sector.rivalFleets || {}).forEach(function (key) { scanShips(sector.rivalFleets[key]); });
    Object.keys(sector.structures || {}).forEach(function (key) {
      const structure = sector.structures[key];
      ((structure && structure.queue) || []).forEach(function (order) {
        if (order) scanShips([order.ship]);
      });
    });
  });
  shipIdCounter = highest;
}

function restoreSaveSnapshot(raw) {
  const save = readSaveSnapshot(raw);
  /* A fresh copy keeps the caller's object (often parsed storage) untouched. */
  const game = normalizeRestoredState(JSON.parse(JSON.stringify(save.state)));
  const seed = game.galaxy.seed >>> 0;
  const streams = save.rngStreams || {};
  game.rng = createRng(((seed ^ 0x9e3779b9) >>> 0));
  setRngPosition(game.rng, streams.events);
  game.military.rng = createRng(((seed ^ 0xa53c9e21) >>> 0));
  setRngPosition(game.military.rng, streams.military);
  syncSaveCounters(game);
  return game;
}

/* ---------- metadata ---------- */

function getSaveMetadata(raw) {
  const save = readSaveSnapshot(raw);
  const game = save.state;
  const ethic = game.ethic && ETHICS[game.ethic] ? ETHICS[game.ethic] : null;
  return {
    format: save.format,
    version: save.version,
    savedAt: save.savedAt || null,
    turn: game.turn,
    seed: typeof game.galaxy.seed === "number" ? game.galaxy.seed : null,
    ethic: game.ethic || null,
    ethicName: ethic ? ethic.name : "No ethic",
    colonies: game.systems.filter(function (system) { return system && system.colonized; }).length,
    sectors: game.galaxy.sectors.length,
    phase: game.phase
  };
}

function formatSavedAt(value) {
  if (!value) return "unknown time";
  const when = new Date(value);
  if (isNaN(when.getTime())) return "unknown time";
  const delta = Date.now() - when.getTime();
  if (delta < 0) return "just now";
  const minute = 60000;
  const hour = minute * 60;
  const day = hour * 24;
  if (delta < minute) return "just now";
  if (delta < hour) return Math.floor(delta / minute) + " min ago";
  if (delta < day) return Math.floor(delta / hour) + " h ago";
  if (delta < day * 7) return Math.floor(delta / day) + " d ago";
  return when.toLocaleDateString();
}

function getSaveFileName(raw) {
  const meta = getSaveMetadata(raw);
  const stamp = (meta.savedAt || new Date().toISOString()).slice(0, 10);
  return "stellar-dominion-" + stamp + "-turn-" + meta.turn + "-seed-" + meta.seed + ".json";
}

function stringifySave(raw) {
  return JSON.stringify(raw, null, 2);
}
