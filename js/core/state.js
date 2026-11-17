/* ============================================================
   STATE — the single mutable game-state object
   createInitialState() is the only place a run is born. main.js assigns
   the result to the global 'state' binding during boot.
   ============================================================ */

let runCounter = 0;
let shipIdCounter = 0;

/* One factory for every hull, player or rival. 'hull' is the live health
   pool; combat writes to it. 'upgrades' holds the refit levels installed on
   this hull ({ power, hull, speed }); researching a tech does not touch it,
   the player orders the refit at a spaceport. Patrol is opt-in, so a freshly
   built corvette sits on station until the player orders it to patrol. */
function createShip(typeId, options) {
  const type = SHIP_TYPES[typeId];
  if (!type) return null;
  const opts = options || {};
  const ship = {
    id: opts.id || ("ship-" + (shipIdCounter += 1)),
    type: typeId,
    name: opts.name || type.name,
    owner: opts.owner || "player",
    hull: typeof opts.hull === "number" ? opts.hull : type.hull,
    patrol: !!opts.patrol,
    upgrades: Object.assign({ power: 0, hull: 0, speed: 0 }, opts.upgrades || {})
  };
  /* A hull ordered with refits already installed launches at the matching
     maximum hull, so it never arrives pre-damaged. */
  if (typeof opts.hull !== "number" && getShipInstalledTotalLevels(ship) > 0) {
    ship.hull = getShipHullMax(ship);
  }
  return ship;
}

/* Older ships (or hand-built test state) may not carry the upgrades map.
   Refits and stat readers call this before writing, so a plain ship object
   always upgrades cleanly. */
function ensureShipUpgrades(ship) {
  if (!ship) return null;
  if (!ship.upgrades || typeof ship.upgrades !== "object") {
    ship.upgrades = { power: 0, hull: 0, speed: 0 };
  }
  SHIP_UPGRADE_STATS.forEach(function (stat) {
    if (typeof ship.upgrades[stat] !== "number" || !isFinite(ship.upgrades[stat])) {
      ship.upgrades[stat] = 0;
    }
  });
  return ship.upgrades;
}

function createStartingFleet(runId) {
  return [
    createShip("corvette", { id: "ship-" + runId + "-corvette-a", name: "Corvette A" }),
    createShip("corvette", { id: "ship-" + runId + "-corvette-b", name: "Corvette B" }),
    createShip("science", { id: "ship-" + runId + "-science", name: "Science Ship" }),
    createShip("builder", { id: "ship-" + runId + "-builder", name: "Builder" })
  ];
}

function createInitialState(ethicId) {
  runCounter += 1;

  const generated = createGalaxy(CONFIG.galaxy.seed);
  const galaxy = generated.galaxy;
  const systems = generated.systems.map(function (system) {
    return Object.assign({}, system, {
      colonized: !!system.home,
      foundedTurn: system.home ? 1 : null,
      population: system.home ? CONFIG.population.homeStart : 0,
      slots: createPlanetSlots(system),
      unlockedBonusSlots: 0,
      /* Standing population upkeep: minerals buy houses, energy buys
         sustenance. Both are set from the colony's population menu. */
      populationUpkeep: { housing: 0, sustenance: 0 },
      growthProgress: 0,
      completedNow: false
    });
  });

  const homeSector = galaxy.sectors.find(function (sector) { return sector.home; }) || galaxy.sectors[0];
  const homeKey = hexKey(homeSector.entryRow, homeSector.entryCol);
  const startingFleet = createStartingFleet(runCounter);
  homeSector.explored[homeKey] = true;
  homeSector.visited = true;
  homeSector.fleets[homeKey] = startingFleet;

  /* The capital hex starts with an orbital spaceport; its first ships are
     built there. Builders can add further spaceports, gates, radars, trading centers
     and strongholds in empty hexes. */
  homeSector.structures[homeKey] = {
    type: "spaceport",
    owner: "player",
    underConstruction: false,
    startedTurn: 1,
    key: homeKey,
    sectorId: homeSector.id,
    queue: []
  };

  /* Energy and minerals start in the home sector only. Research and
     influence are empire-wide, so they live in state.resources. */
  homeSector.economy = {
    energy: CONFIG.startingResources.energy,
    minerals: CONFIG.startingResources.minerals
  };
  homeSector.carry = { energy: 0, minerals: 0 };

  return {
    runId: runCounter,
    phase: ethicId ? "event" : "start",
    turn: 1,
    ethic: ethicId,
    /* Seeded stream for event draws, so the same galaxy seed deals the same
       deck given the same choices. */
    rng: createRng(((galaxy.seed >>> 0) ^ 0x9e3779b9) >>> 0),
    events: createEventState(),
    stats: {
      anomaliesFound: 0,
      anomaliesSurveyed: 0,
      surveysStarted: 0
    },
    /* Empire-wide stockpiles. Energy and minerals are held per sector in
       sector.economy; research and influence are shared by the whole empire. */
    resources: {
      research: CONFIG.startingResources.research,
      influence: CONFIG.startingResources.influence
    },
    /* Fractional income is carried between turns so 0.25 research per turn
       pays one point every four turns. Energy and mineral carry lives on each
       sector in sector.carry. */
    resourceCarry: { research: 0, influence: 0 },
    stability: CONFIG.stability.start,
    galaxy: galaxy,
    systems: systems,
    /* Rival powers are generated with the galaxy; their ships live in
       per-sector rivalFleets. Military state owns combat/AI randomness,
       battle reports and the one-line military log. */
    empires: generated.empires || [],
    military: createMilitaryState(galaxy.seed),
    shipSerial: startingFleet.length,
    tech: {
      active: null,
      progress: TECH_ORDER.reduce(function (map, id) {
        map[id] = 0;
        return map;
      }, {}),
      done: [],
      exclusiveChoice: null
    },
    currentEvent: null,
    endResult: null,
    ui: {
      activeTab: "map",
      mapMode: "galaxy",
      /* Tech tab: the selected category (building / military / trade). The
         final project is pinned below whichever category is open. */
      techCategory: "building",
      activeSector: homeSector.id,
      selectedHex: null,
      selectedSystem: null,
      selectedTab: "world",
      /* The ship-construction list stays collapsed until the player
         opens the spaceport menu on a colony. */
      spaceportOpen: false,
      shipSelection: [],
      move: null,
      sheet: null,
      /* Sector map overlays. Patrol coverage and lane landings are on by
         default; charted space is an optional blue wash over every visited
         hex. The VIEW menu toggles all three. */
      mapLayers: {
        charted: false,
        patrol: true,
        landing: true
      },
      /* Galaxy overlays. The trade view draws every sector-to-sector trade
         route and the ledger panel under the ring graph. */
      galaxyLayers: {
        trade: false
      },
      eventResolving: false
    }
  };
}

let state = null; // Created in main.js once every script is loaded.