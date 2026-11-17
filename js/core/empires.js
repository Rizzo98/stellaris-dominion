/* ============================================================
   EMPIRES — rival power spawning, lookups and presence
   Rival powers are created with the galaxy (see core/galaxy.js) so the
   same seed always places the same empires. Their tier is their galaxy
   ring: ring 1 is a small near-core neighbour, ring 4 is a rim power.
   Their ships live in sector.rivalFleets, separate from the player's
   sector.fleets. Their colonies are uncolonised systems flagged with
   system.owner, so the player's economy never counts them.
   ============================================================ */

function createRivalShip(empire, patrol) {
  empire.shipSerial += 1;
  return createShip("corvette", {
    id: "rival-" + empire.id + "-" + empire.shipSerial,
    name: empire.short + " Corvette " + empire.shipSerial,
    owner: empire.id,
    patrol: !!patrol
  });
}

function createRivalEmpires(seed, sectors, systems) {
  const cfg = CONFIG.rivals || {};
  if (cfg.enabled === false) return [];

  const rng = createRng((seed ^ 0x27d4eb2d) >>> 0);
  const pool = rngShuffle(rng, RIVAL_EMPIRE_POOL);
  const wanted = Math.max(0, rngInt(rng, cfg.minCount == null ? 5 : cfg.minCount,
    cfg.maxCount == null ? 7 : cfg.maxCount));
  if (!wanted) return [];

  const byRing = {};
  sectors.forEach(function (sector) {
    if (sector.home || sector.ring <= 0) return;
    if (!byRing[sector.ring]) byRing[sector.ring] = [];
    byRing[sector.ring].push(sector);
  });
  Object.keys(byRing).forEach(function (ring) {
    byRing[ring] = rngShuffle(rng, byRing[ring]);
  });

  const chosen = [];
  const taken = new Set();

  /* One empire per ring first: this guarantees that the player can meet a
     weaker power before the rim powers, no matter how the seed rolls. */
  if (cfg.onePerRing !== false) {
    Object.keys(byRing).map(Number).sort(function (a, b) { return a - b; }).forEach(function (ring) {
      if (chosen.length >= wanted) return;
      const sector = byRing[ring].shift();
      if (!sector) return;
      chosen.push(sector);
      taken.add(sector.id);
    });
  }

  const rest = [];
  sectors.forEach(function (sector) {
    if (sector.home || sector.ring <= 0 || taken.has(sector.id)) return;
    rest.push(sector);
  });
  rngShuffle(rng, rest).forEach(function (sector) {
    if (chosen.length >= wanted) return;
    chosen.push(sector);
    taken.add(sector.id);
  });

  const empires = [];
  chosen.forEach(function (sector) {
    if (empires.length >= wanted) return;
    const candidates = systems.filter(function (system) {
      return system.sectorId === sector.id && !system.owner;
    });
    if (!candidates.length) return;
    const capital = rngShuffle(rng, candidates)[0];
    const profile = pool[empires.length % pool.length];
    const archetype = RIVAL_ARCHETYPES[profile.archetype] || RIVAL_ARCHETYPES.opportunist;
    const ring = sector.ring;

    const empire = {
      id: "emp-" + (empires.length + 1),
      name: profile.name,
      short: profile.name.split(" ")[0],
      emoji: profile.emoji,
      color: profile.color,
      archetype: archetype.id,
      ring: ring,
      tier: ring,
      sectorId: sector.id,
      capitalSystemId: capital.id,
      capitalKey: hexKey(capital.row, capital.col),
      systems: [capital.id],
      minerals: 4 + ring * 2,
      fleetCap: 2 + ring + (archetype.fleetCapBonus || 0),
      colonyCap: 1 + Math.ceil(ring / 2) + (archetype.colonyCapBonus || 0),
      aggression: clamp((0.18 + ring * 0.09) * (archetype.aggressionMult || 1), 0.08, 0.95),
      stateId: "patrol",
      stateTurns: 2 + rngInt(rng, 0, 1),
      stateSinceTurn: 1,
      shipSerial: 0,
      active: true,
      met: false,
      discoveredTurn: null,
      contactTurn: null,
      raidStartedTurn: null,
      raidTargetSectorId: null,
      lastAction: "Established a foothold in " + sector.name,
      lastActionTurn: 1,
      stats: { battles: 0, kills: 0, losses: 0, raids: 0, shipsBuilt: 0, coloniesFounded: 1 }
    };

    capital.owner = empire.id;
    capital.rivalSinceTurn = 1;
    capital.rivalCapital = true;

    /* Every ring adds one opening corvette, so a rim power always starts
       with a larger fleet than an inner-ring neighbour. */
    const startingCorvettes = 1 + ring;
    for (let i = 0; i < startingCorvettes; i += 1) {
      const ship = createRivalShip(empire, true);
      sector.rivalFleets[empire.capitalKey] = (sector.rivalFleets[empire.capitalKey] || []).concat(ship);
    }

    /* Deeper rings open the game with a static defence over their entry
       lane. Near-core powers have to build one first. */
    if (ring >= 3) {
      const entryKey = hexKey(sector.entryRow, sector.entryCol);
      if (!sector.structures[entryKey]) {
        sector.structures[entryKey] = {
          type: "stronghold",
          owner: empire.id,
          underConstruction: false,
          startedTurn: 1,
          hull: STRUCTURE_TYPES.stronghold.hull
        };
      }
    }

    empires.push(empire);
  });

  return empires;
}

/* ---------- lookups ---------- */

function getEmpire(id) {
  if (!id || !state || !state.empires) return null;
  return state.empires.find(function (empire) { return empire.id === id; }) || null;
}

function getEmpireForSystem(system) {
  return system && system.owner ? getEmpire(system.owner) : null;
}

function getEmpireArchetype(empire) {
  if (!empire) return RIVAL_ARCHETYPES.opportunist;
  return RIVAL_ARCHETYPES[empire.archetype] || RIVAL_ARCHETYPES.opportunist;
}

function getEmpireStateDef(empire) {
  if (!empire) return RIVAL_AI_STATES.patrol;
  return RIVAL_AI_STATES[empire.stateId] || RIVAL_AI_STATES.patrol;
}

function getRivalTierLabel(empireOrRing) {
  const ring = typeof empireOrRing === "number"
    ? empireOrRing
    : (empireOrRing && empireOrRing.ring ? empireOrRing.ring : 0);
  if (ring <= 1) return "NEAR-CORE";
  if (ring === 2) return "INNER RING";
  if (ring === 3) return "OUTER RING";
  return "RIM";
}

function getRivalThreatLabel(empire) {
  if (!empire) return "UNKNOWN";
  if (empire.ring >= 4) return "SEVERE";
  if (empire.ring === 3) return "HIGH";
  if (empire.ring === 2) return "MODERATE";
  return "LOW";
}

function getEmpireHomeSector(empire) {
  return empire ? getSector(empire.sectorId) : null;
}

function getEmpireColonyCount(empire) {
  if (!empire) return 0;
  return (empire.systems || []).filter(function (id) {
    const system = getSystem(id);
    return !!system && system.owner === empire.id;
  }).length;
}

function getEmpireShipsWithPositions(empire) {
  const out = [];
  if (!empire || !state.galaxy) return out;
  state.galaxy.sectors.forEach(function (sector) {
    Object.keys(sector.rivalFleets || {}).forEach(function (key) {
      (sector.rivalFleets[key] || []).forEach(function (ship) {
        if (ship.owner !== empire.id) return;
        out.push({ sectorId: sector.id, key: key, pos: parseHexKey(key), ship: ship });
      });
    });
  });
  return out;
}

function getEmpireShips(empire) {
  return getEmpireShipsWithPositions(empire).map(function (entry) { return entry.ship; });
}

function getEmpireShipCount(empire) {
  return getEmpireShips(empire).length;
}

function getEmpireStrongholds(empire) {
  const out = [];
  if (!empire || !state.galaxy) return out;
  state.galaxy.sectors.forEach(function (sector) {
    Object.keys(sector.structures || {}).forEach(function (key) {
      const structure = sector.structures[key];
      if (!structure || structure.type !== "stronghold") return;
      if (structure.owner !== empire.id) return;
      out.push({ sectorId: sector.id, key: key, structure: structure });
    });
  });
  return out;
}

function getEmpireFleetPower(empire) {
  return getEmpireShips(empire).reduce(function (total, ship) {
    return total + getShipPower(ship.type);
  }, 0);
}

function getEmpirePower(empire) {
  const fleet = getEmpireFleetPower(empire);
  return getEmpireStrongholds(empire).reduce(function (total, entry) {
    if (entry.structure.underConstruction) return total;
    const def = STRUCTURE_TYPES[entry.structure.type];
    return total + (def && def.power ? def.power : 0);
  }, fleet);
}

function getRivalFleetAt(row, col, sectorId) {
  const sector = getSector(sectorId || state.ui.activeSector);
  if (!sector || !sector.rivalFleets) return [];
  return sector.rivalFleets[hexKey(row, col)] || [];
}

function getSectorRivalPower(sectorId) {
  const sector = getSector(sectorId);
  if (!sector) return 0;
  let total = 0;
  Object.keys(sector.rivalFleets || {}).forEach(function (key) {
    (sector.rivalFleets[key] || []).forEach(function (ship) {
      total += getShipPower(ship.type);
    });
  });
  Object.keys(sector.structures || {}).forEach(function (key) {
    const structure = sector.structures[key];
    if (!structure || structure.underConstruction || structure.type !== "stronghold") return;
    if (isPlayerStructure(structure)) return;
    const def = STRUCTURE_TYPES[structure.type];
    total += def && def.power ? def.power : 0;
  });
  return total;
}

function getSectorRivalColonyCount(sectorId) {
  return state.systems.filter(function (system) {
    return system.sectorId === sectorId && !!system.owner;
  }).length;
}

function getSectorRivalEmpires(sectorId) {
  const found = {};
  state.systems.forEach(function (system) {
    if (system.sectorId !== sectorId || !system.owner) return;
    const empire = getEmpire(system.owner);
    if (empire) found[empire.id] = empire;
  });
  const sector = getSector(sectorId);
  if (sector) {
    Object.keys(sector.rivalFleets || {}).forEach(function (key) {
      (sector.rivalFleets[key] || []).forEach(function (ship) {
        const empire = getEmpire(ship.owner);
        if (empire) found[empire.id] = empire;
      });
    });
    Object.keys(sector.structures || {}).forEach(function (key) {
      const structure = sector.structures[key];
      if (!structure || isPlayerStructure(structure)) return;
      const empire = getEmpire(structure.owner);
      if (empire) found[empire.id] = empire;
    });
  }
  return Object.keys(found).map(function (id) { return found[id]; }).sort(function (a, b) {
    if (a.ring !== b.ring) return a.ring - b.ring;
    return a.id.localeCompare(b.id);
  });
}

function getDominantRivalEmpire(sectorId) {
  const empires = getSectorRivalEmpires(sectorId);
  return empires.length ? empires[0] : null;
}

/* ---------- contact and logs ---------- */

function pushMilitaryLog(entry) {
  if (!state || !state.military || !entry) return null;
  const row = Object.assign({ turn: state.turn }, entry);
  state.military.log.push(row);
  const limit = (CONFIG.military && CONFIG.military.logLimit) || 16;
  if (state.military.log.length > limit) state.military.log.shift();
  return row;
}

function markEmpireMet(empire, reason) {
  if (!empire || empire.met) return false;
  empire.met = true;
  empire.discoveredTurn = state.turn;
  empire.contactTurn = state.turn;
  pushMilitaryLog({
    tone: "contact",
    empireId: empire.id,
    text: "Contact with " + empire.name + " · " + getRivalTierLabel(empire) + " · " +
      getRivalThreatLabel(empire) + " threat"
  });
  if (typeof toast === "function") {
    toast("📡 Rival power detected · " + empire.name + " · " + getRivalThreatLabel(empire) + " threat");
  }
  return true;
}

function discoverEmpiresInSector(sectorId) {
  if (!state || !state.empires) return [];
  const empires = getSectorRivalEmpires(sectorId);
  empires.forEach(function (empire) { markEmpireMet(empire, "chart"); });
  return empires;
}

function getMetEmpires() {
  return (state.empires || []).filter(function (empire) { return empire.met; });
}

function getPlayerPresenceSectors() {
  const found = {};
  state.systems.forEach(function (system) {
    if (system.colonized) found[system.sectorId] = true;
  });
  state.galaxy.sectors.forEach(function (sector) {
    const fleetKeys = Object.keys(sector.fleets || {});
    for (let i = 0; i < fleetKeys.length; i += 1) {
      if (sector.fleets[fleetKeys[i]] && sector.fleets[fleetKeys[i]].length) {
        found[sector.id] = true;
        break;
      }
    }
    const structureKeys = Object.keys(sector.structures || {});
    for (let i = 0; i < structureKeys.length; i += 1) {
      const structure = sector.structures[structureKeys[i]];
      if (isPlayerStructure(structure)) {
        found[sector.id] = true;
        break;
      }
    }
  });
  return Object.keys(found);
}

function getActiveRaids() {
  const groups = {};
  (state.empires || []).forEach(function (empire) {
    getEmpireShipsWithPositions(empire).forEach(function (entry) {
      if (!entry.ship.raidTargetSectorId) return;
      if (!groups[empire.id]) groups[empire.id] = { empire: empire, ships: [] };
      groups[empire.id].ships.push(entry);
    });
  });
  return Object.keys(groups).map(function (id) { return groups[id]; });
}

function countActiveRaids() {
  return getActiveRaids().length;
}


