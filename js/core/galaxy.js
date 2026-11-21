/* ============================================================
   GALAXY — seeded ring topology, sector maps and rival spawn
   The home sector sits at the centre. Sector rings surround it: the
   core links to 4-6 ring-one sectors, and every ring sector links
   inward to a seeded parent, outward to children, and sideways around
   its ring. A few seeded ring shortcuts vary the lane graph, and every
   sector map gets its own seed derived from CONFIG.galaxy.seed. Rival
   empires are seeded here too, after the maps exist.

   Lane landings are assigned from the same graph: every sector keeps a
   port on its perimeter for each neighbour, placed by the neighbour's
   bearing in the galaxy view. Opposite ports are paired, so the return
   lane lands on the mirrored hex.
   ============================================================ */

/* Shared by the galaxy view and by lane-landing assignment. Ring 0 is the
   core at the centre; the radius curve spreads the inner rings out. */
function galaxyOrbit(ring) {
  const layout = CONFIG.galaxy.layout;
  const outerRings = Math.max(1, CONFIG.galaxy.outerRings);
  if (ring <= 0) return { radius: 0 };
  const t = outerRings <= 1 ? 1 : (ring - 1) / (outerRings - 1);
  const curve = layout.radiusCurve == null ? 1 : layout.radiusCurve;
  const radius = layout.innerRadius +
    (layout.outerRadius - layout.innerRadius) * Math.pow(t, curve);
  return { radius: radius };
}

function galaxyNodePosition(sector) {
  const layout = CONFIG.galaxy.layout;
  if (sector.ring <= 0) {
    return { x: layout.centerX, y: layout.centerY };
  }
  const orbit = galaxyOrbit(sector.ring);
  return {
    x: layout.centerX + Math.cos(sector.angle) * orbit.radius,
    y: layout.centerY + Math.sin(sector.angle) * orbit.radius
  };
}

function createGalaxy(seed) {
  /* The debug console can rewrite sector geometry before a new match. Clamp
     the shape here, then let the fixed capital follow the entry hex instead
     of the values it was built with when this script loaded. */
  const sectorCfg = CONFIG.sector;
  sectorCfg.rows = Math.max(1, Math.floor(sectorCfg.rows) || 1);
  sectorCfg.cols = Math.max(1, Math.floor(sectorCfg.cols) || 1);
  sectorCfg.entryRow = Math.max(0, Math.min(sectorCfg.rows - 1, Math.floor(sectorCfg.entryRow) || 0));
  sectorCfg.entryCol = Math.max(0, Math.min(sectorCfg.cols - 1, Math.floor(sectorCfg.entryCol) || 0));
  HOME_CAPITAL.row = sectorCfg.entryRow;
  HOME_CAPITAL.col = sectorCfg.entryCol;

  const topologyRng = createRng(seed);
  const layout = createGalaxyLayout(topologyRng);
  const sectors = layout.sectors;

  const nameRng = createRng((seed ^ 0x5bd1e995) >>> 0);
  const sectorNames = rngShuffle(nameRng, SECTOR_NAMES);
  let nameIndex = 0;
  sectors.forEach(function (sector) {
    if (sector.home) {
      sector.name = HOME_SECTOR_NAME;
      return;
    }
    sector.name = sectorNames[nameIndex] || "Sector " + (nameIndex + 1);
    nameIndex += 1;
  });

  const usedNames = new Set([HOME_CAPITAL.name]);
  const systems = [];
  sectors.forEach(function (sector) {
    const sectorRng = createRng(deriveSectorSeed(seed, sector));
    const sectorSystems = createSectorSystems(sector, sectorRng, usedNames, seed);
    sectorSystems.forEach(function (system) {
      systems.push(system);
    });
    /* Survey sites are rolled from the same sector RNG, after systems, so
       the system layout is unchanged and sites stay reproducible per seed. */
    sector.anomalies = createSectorAnomalies(sector, sectorRng, sectorSystems);
  });

  /* Rival powers are seeded after every sector and system exists, so their
     capitals, fleets and strongholds can be written straight into the
     sector maps. The same galaxy seed always places the same powers. */
  const empires = createRivalEmpires(seed, sectors, systems);

  return {
    galaxy: {
      seed: seed,
      sectors: sectors,
      rings: layout.rings,
      extraLinks: layout.extraLinks,
      outerRings: layout.rings.length - 1
    },
    systems: systems,
    empires: empires
  };
}

function deriveSectorSeed(seed, sector) {
  let hash = (seed >>> 0) ^ 0x9e3779b9;
  const text = sector.id;
  for (let i = 0; i < text.length; i += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
  }
  hash = Math.imul(hash ^ (sector.index + 1), 0x85ebca6b);
  return hash >>> 0;
}

/* Landing ports are chosen together for the whole lane graph. Each lane
   consumes one perimeter hex in each of its two sectors, and the two hexes
   are always mirror images through the sector centre. A small backtracking
   search assigns the ports by bearing while keeping every sector's ports
   unique. If the search ever fails, the empty landing map falls back to the
   central entry hex for that sector. */
function assignGalaxyLandings(sectors, byId) {
  sectors.forEach(function (sector) {
    sector.landings = {};
  });
  if (typeof getSectorLandingSlots !== "function") return;
  const slots = getSectorLandingSlots();
  if (!slots.length) return;
  const slotByKey = {};
  slots.forEach(function (slot) { slotByKey[slot.key] = slot; });

  const edges = [];
  sectors.forEach(function (a) {
    (a.neighbors || []).forEach(function (bid) {
      if (a.id >= bid) return;
      const b = byId[bid];
      if (!b) return;
      const from = galaxyNodePosition(a);
      const to = galaxyNodePosition(b);
      const bearing = Math.atan2(to.y - from.y, to.x - from.x);
      const choices = slots.map(function (slot) {
        const other = slotByKey[slot.oppositeKey];
        if (!other) return null;
        return {
          slot: slot,
          other: other,
          error: shortestAngleDelta(bearing, slot.angle)
        };
      }).filter(Boolean).sort(function (left, right) {
        if (left.error !== right.error) return left.error - right.error;
        return left.slot.key.localeCompare(right.slot.key);
      });
      if (!choices.length) return;
      edges.push({ a: a, b: b, choices: choices, index: edges.length });
    });
  });
  if (!edges.length) return;

  const used = {};
  sectors.forEach(function (sector) { used[sector.id] = new Set(); });
  const assigned = new Array(edges.length).fill(null);
  let steps = 0;

  function options(edge) {
    return edge.choices.filter(function (choice) {
      return !used[edge.a.id].has(choice.slot.key) &&
        !used[edge.b.id].has(choice.other.key);
    });
  }

  function solve() {
    steps += 1;
    if (steps > 200000) return false;
    let edge = null;
    let available = null;
    for (let i = 0; i < edges.length; i += 1) {
      const candidate = edges[i];
      if (assigned[candidate.index]) continue;
      const opts = options(candidate);
      if (!opts.length) return false;
      if (!available || opts.length < available.length) {
        edge = candidate;
        available = opts;
        if (available.length === 1) break;
      }
    }
    if (!edge) return true;
    for (let i = 0; i < available.length; i += 1) {
      const choice = available[i];
      assigned[edge.index] = choice;
      used[edge.a.id].add(choice.slot.key);
      used[edge.b.id].add(choice.other.key);
      if (solve()) return true;
      used[edge.a.id].delete(choice.slot.key);
      used[edge.b.id].delete(choice.other.key);
      assigned[edge.index] = null;
    }
    return false;
  }

  if (!solve()) {
    sectors.forEach(function (sector) { sector.landings = {}; });
    return;
  }

  edges.forEach(function (edge) {
    const choice = assigned[edge.index];
    if (!choice) return;
    edge.a.landings[edge.b.id] = choice.slot.key;
    edge.b.landings[edge.a.id] = choice.other.key;
  });
}

function createGalaxyLayout(rng) {
  const cfg = CONFIG.galaxy;
  const sectors = [];
  const rings = [];
  const byId = {};
  const ringOneCount = rngInt(rng, cfg.ringOneMin, cfg.ringOneMax);

  function addSector(ring, ringIndex, ringCount, angle) {
    const sector = {
      id: ring === 0 ? "sec-core" : "sec-r" + ring + "-" + (ringIndex + 1),
      index: sectors.length + 1,
      ring: ring,
      ringIndex: ringIndex,
      ringCount: ringCount,
      angle: angle,
      parentId: null,
      name: "",
      home: false,
      visited: false,
      entryRow: CONFIG.sector.entryRow,
      entryCol: CONFIG.sector.entryCol,
      explored: {},
      fleets: {},
      rivalFleets: {},
      structures: {},
      anomalies: {},
      neighbors: [],
      /* neighbourId -> landing hex key. Assigned once the lane graph is
         complete, before systems and sites are placed. */
      landings: {},
      /* Energy and minerals are held by the sector itself. The home sector
         is seeded with the starting stockpile in createInitialState; every
         other sector opens at zero and is supplied by trade. */
      economy: { energy: 0, minerals: 0 },
      carry: { energy: 0, minerals: 0 }
    };
    sectors.push(sector);
    byId[sector.id] = sector;
    return sector;
  }

  const home = addSector(0, 0, 1, 0);
  home.home = true;
  home.visited = true;
  rings.push({ ring: 0, count: 1, sectorIds: [home.id] });

  for (let ring = 1; ring <= cfg.outerRings; ring += 1) {
    const count = ringOneCount + (ring - 1) * cfg.ringGrowth;
    const angleOffset = ring % 2 === 0 ? Math.PI / count : 0;
    const ringSectors = [];
    for (let i = 0; i < count; i += 1) {
      const angle = -Math.PI / 2 + angleOffset + (Math.PI * 2 * i) / count;
      ringSectors.push(addSector(ring, i, count, angle));
    }
    rings.push({ ring: ring, count: count, sectorIds: ringSectors.map(function (sector) { return sector.id; }) });
  }

  function link(a, b) {
    if (!a || !b || a === b) return;
    if (a.neighbors.indexOf(b.id) === -1) a.neighbors.push(b.id);
    if (b.neighbors.indexOf(a.id) === -1) b.neighbors.push(a.id);
  }

  /* Core spokes: every ring-one sector is reachable from the centre. */
  rings[1].sectorIds.forEach(function (id) {
    const sector = byId[id];
    sector.parentId = home.id;
    link(home, sector);
  });

  /* Rings are sequences: each sector links to its two ring neighbours. */
  for (let ring = 1; ring < rings.length; ring += 1) {
    const ids = rings[ring].sectorIds;
    for (let i = 0; i < ids.length; i += 1) {
      link(byId[ids[i]], byId[ids[(i + 1) % ids.length]]);
    }
  }

  /* Every sector in ring r gets a seeded parent in ring r-1. Every parent
     gets at least one child, so each inner ring can expand outward. */
  for (let ring = 2; ring < rings.length; ring += 1) {
    assignOutwardParents(rings[ring - 1], rings[ring], byId, link, rng);
  }

  /* A few seeded shortcuts inside the outer rings vary the lane graph.
     Skip-2 and skip-3 chords stay close to their own ring. */
  const extraLinks = [];
  for (let ring = 2; ring < rings.length; ring += 1) {
    const wanted = rngInt(rng, cfg.ringShortcutsMin, cfg.ringShortcutsMax);
    const ringSectors = rings[ring].sectorIds.map(function (id) { return byId[id]; });
    let added = 0;
    let attempts = 0;
    while (added < wanted && attempts < 16) {
      attempts += 1;
      const index = rngInt(rng, 0, ringSectors.length - 1);
      const step = ring === 2 ? 2 : rngInt(rng, 2, 3);
      const a = ringSectors[index];
      const b = ringSectors[(index + step) % ringSectors.length];
      if (!a || !b || a === b) continue;
      if (a.neighbors.indexOf(b.id) !== -1) continue;
      link(a, b);
      extraLinks.push({ a: a.id, b: b.id });
      added += 1;
    }
  }

  /* Systems and survey sites are placed after this call, so every landing
     port is reserved before the sector map is populated. */
  assignGalaxyLandings(sectors, byId);

  return { sectors: sectors, rings: rings, extraLinks: extraLinks };
}

function shortestAngleDelta(a, b) {
  const fullTurn = Math.PI * 2;
  let delta = Math.abs(a - b) % fullTurn;
  if (delta > Math.PI) delta = fullTurn - delta;
  return delta;
}

function assignOutwardParents(parentRing, childRing, byId, link, rng) {
  const parents = parentRing.sectorIds.map(function (id) { return byId[id]; });
  const children = childRing.sectorIds.map(function (id) { return byId[id]; });
  const assignments = {};
  const counts = parents.map(function () { return 1; });

  /* Reserve one child for every parent, then distribute the rest randomly. */
  const extra = children.length - parents.length;
  for (let i = 0; i < extra; i += 1) {
    counts[rngInt(rng, 0, parents.length - 1)] += 1;
  }

  children.forEach(function (child) {
    const available = [];
    parents.forEach(function (parent, index) {
      if (counts[index] <= 0) return;
      available.push({
        parent: parent,
        index: index,
        delta: shortestAngleDelta(child.angle, parent.angle)
      });
    });
    available.sort(function (a, b) { return a.delta - b.delta; });
    const windowSize = Math.max(1, Math.min(CONFIG.galaxy.parentWindow || 2, available.length));
    const window = available.slice(0, windowSize);
    if (!window.length) return;

    const choice = window[rngInt(rng, 0, window.length - 1)];
    assignments[child.id] = choice.parent.id;
    counts[choice.index] -= 1;
  });

  children.forEach(function (child) {
    const parent = byId[assignments[child.id]];
    if (!parent) return;
    child.parentId = parent.id;
    link(parent, child);
  });
}

/* Sizes and bonus slots are rolled from their own stream so adding planet
   profiles never shifts system placement or survey sites. */
function rollPlanetSize(rng) {
  const sizes = CONFIG.planetSlots.sizes;
  const totalWeight = sizes.reduce(function (sum, size) { return sum + (size.weight || 0); }, 0);
  let roll = rng() * totalWeight;
  for (let i = 0; i < sizes.length; i += 1) {
    roll -= sizes[i].weight || 0;
    if (roll < 0) return sizes[i].id;
  }
  return sizes[sizes.length - 1].id;
}

function rollBonusSlots(rng) {
  const bonus = CONFIG.planetSlots.bonus;
  const roll = rng();
  if (roll < bonus.twoChance) return Math.min(bonus.max, 2);
  if (roll < bonus.twoChance + bonus.oneChance) return 1;
  return 0;
}

function rollPlanetProfile(system, rng) {
  system.planetSize = rollPlanetSize(rng);
  system.bonusSlots = rollBonusSlots(rng);
  return system;
}

function getSectorLandingKeys(sector) {
  const keys = new Set();
  Object.keys(sector.landings || {}).forEach(function (neighborId) {
    keys.add(sector.landings[neighborId]);
  });
  return keys;
}

function createSectorSystems(sector, rng, usedNames, seed) {
  const cfg = CONFIG.galaxy;
  const systems = [];

  /* The capital is fixed; the rest of the home sector is seeded. */
  if (sector.home) {
    systems.push({
      id: sector.id + "-" + HOME_CAPITAL.id,
      sectorId: sector.id,
      name: HOME_CAPITAL.name,
      emoji: HOME_CAPITAL.emoji,
      color: HOME_CAPITAL.color,
      type: HOME_CAPITAL.type,
      row: HOME_CAPITAL.row,
      col: HOME_CAPITAL.col,
      home: true,
      blurb: HOME_CAPITAL.blurb
    });
  }

  const targetCount = sector.home ? 5 : rngInt(rng, cfg.minSystems, cfg.maxSystems);
  const count = Math.max(0, targetCount - systems.length);
  /* Landing ports stay empty: they are the lane threshold, not a system
     site. The central entry hex is reserved as well for the home capital. */
  const reserved = getSectorLandingKeys(sector);
  reserved.add(hexKey(sector.entryRow, sector.entryCol));
  const cells = [];
  for (let row = 0; row < CONFIG.sector.rows; row += 1) {
    for (let col = 0; col < CONFIG.sector.cols; col += 1) {
      if (reserved.has(hexKey(row, col))) continue;
      cells.push([row, col]);
    }
  }

  rngShuffle(rng, cells).slice(0, count).forEach(function (cell, index) {
    const type = pickPlanetType(rng);
    systems.push({
      id: sector.id + "-s" + (index + 1),
      sectorId: sector.id,
      name: createSystemName(rng, usedNames),
      emoji: type.emoji,
      color: type.color,
      type: type.id,
      row: cell[0],
      col: cell[1],
      home: false,
      blurb: rngPick(rng, type.blurbs)
    });
  });

  /* The planet profile stream is derived from the galaxy seed and the
     sector id, exactly like the sector stream. Every planet, including the
     capital, gets a size and a chance at locked bonus slots. */
  const galaxySeed = seed == null ? CONFIG.galaxy.seed : seed;
  const profileRng = createRng((deriveSectorSeed(galaxySeed, sector) ^ 0x51ed270b) >>> 0);
  systems.forEach(function (system) {
    rollPlanetProfile(system, profileRng);
  });

  return systems;
}

/* Survey sites are placed on empty hexes: never on a system and never on
   the sector entry hex. The home sector always gets homeSites so the survey
   loop is available immediately; outer sectors roll independently. */
function createSectorAnomalies(sector, rng, systems) {
  const cfg = CONFIG.anomalies || {};
  if (cfg.enabled === false) return {};
  const maxPerSector = Math.max(0, cfg.maxPerSector || 0);
  if (!maxPerSector) return {};

  let count = 0;
  if (sector.home) {
    count = Math.min(maxPerSector, Math.max(0, cfg.homeSites || 0));
  } else {
    const baseChance = cfg.chancePerSector || 0;
    const chance = Math.min(
      cfg.maxChance == null ? 0.9 : cfg.maxChance,
      baseChance + sector.ring * (cfg.ringChanceBonus || 0)
    );
    if (rng() < chance) count = rngInt(rng, 1, maxPerSector);
  }
  if (!count) return {};

  const taken = getSectorLandingKeys(sector);
  systems.forEach(function (system) {
    taken.add(hexKey(system.row, system.col));
  });
  taken.add(hexKey(sector.entryRow, sector.entryCol));

  const cells = [];
  for (let row = 0; row < CONFIG.sector.rows; row += 1) {
    for (let col = 0; col < CONFIG.sector.cols; col += 1) {
      if (!taken.has(hexKey(row, col))) cells.push([row, col]);
    }
  }

  const anomalies = {};
  rngShuffle(rng, cells).slice(0, count).forEach(function (cell, index) {
    const type = pickAnomalyType(rng);
    const key = hexKey(cell[0], cell[1]);
    anomalies[key] = {
      id: sector.id + "-site" + (index + 1),
      typeId: type.id,
      sectorId: sector.id,
      row: cell[0],
      col: cell[1],
      studyTurns: type.studyTurns,
      discovered: false,
      discoveredTurn: null,
      resolved: false,
      resolvedTurn: null,
      study: null,
      lastReward: null
    };
  });
  return anomalies;
}

function pickAnomalyType(rng) {
  const total = ANOMALY_TYPES.reduce(function (sum, type) {
    return sum + (type.weight || 1);
  }, 0);
  let roll = rng() * total;
  for (let i = 0; i < ANOMALY_TYPES.length; i += 1) {
    roll -= ANOMALY_TYPES[i].weight || 1;
    if (roll < 0) return ANOMALY_TYPES[i];
  }
  return ANOMALY_TYPES[0];
}

function pickPlanetType(rng) {
  const total = PLANET_TYPES.reduce(function (sum, type) {
    return sum + type.weight;
  }, 0);
  let roll = rng() * total;
  for (let i = 0; i < PLANET_TYPES.length; i += 1) {
    roll -= PLANET_TYPES[i].weight;
    if (roll < 0) return PLANET_TYPES[i];
  }
  return PLANET_TYPES[0];
}

function createSystemName(rng, usedNames) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const base = rngPick(rng, SYSTEM_NAME_WORDS);
    const suffix = rng() < 0.45 ? rngPick(rng, SYSTEM_NAME_SUFFIXES) : "";
    const candidate = base + suffix;
    if (candidate.length <= 11 && !usedNames.has(candidate)) {
      usedNames.add(candidate);
      return candidate;
    }
  }
  let n = usedNames.size + 1;
  while (usedNames.has("System " + n)) n += 1;
  usedNames.add("System " + n);
  return "System " + n;
}