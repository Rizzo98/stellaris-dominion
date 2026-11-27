/* ============================================================
   RIVAL AI — a small state machine that simulates another empire
   Each rival owns one sector (its home) and runs one of five states:
   grow, patrol, fortify, raid or regroup. States are re-seeded with a
   weighted random roll every few turns. Actions spend a mineral reserve
   on corvettes, claims unowned systems in the home sector, raises one
   stronghold over the central approach, and sends raiders across lanes
   toward nearby player space. Rival fleets use the same per-hex path model
   as player ships but are allowed to use lane jumps without a gate; their
   logistics are abstracted. They cross at the same lane ports as the player.
   ============================================================ */

function getEmpireIncome(empire) {
  const archetype = getEmpireArchetype(empire);
  const base = 1 + Math.ceil(empire.ring / 2) + (archetype.incomeBonus || 0);
  return base + getEmpireColonyCount(empire);
}

function rivalEconomyTick(empire) {
  const upkeep = getEmpireStrongholds(empire).filter(function (entry) {
    return !entry.structure.underConstruction;
  }).length;
  empire.minerals = Math.max(0, empire.minerals + getEmpireIncome(empire) - upkeep);
}

/* ---------- lane routing ---------- */

function getSectorLaneDistances(fromId) {
  const distances = {};
  if (!getSector(fromId)) return distances;
  distances[fromId] = 0;
  const queue = [fromId];
  let head = 0;
  while (head < queue.length) {
    const id = queue[head];
    head += 1;
    const sector = getSector(id);
    if (!sector) continue;
    sector.neighbors.forEach(function (nextId) {
      if (Object.prototype.hasOwnProperty.call(distances, nextId)) return;
      distances[nextId] = distances[id] + 1;
      queue.push(nextId);
    });
  }
  return distances;
}

function getSectorLanePath(fromId, toId) {
  if (fromId === toId) return [fromId];
  if (!getSector(fromId) || !getSector(toId)) return null;
  const previous = {};
  previous[fromId] = null;
  const queue = [fromId];
  let head = 0;
  while (head < queue.length) {
    const id = queue[head];
    head += 1;
    const sector = getSector(id);
    if (!sector) continue;
    for (let i = 0; i < sector.neighbors.length; i += 1) {
      const nextId = sector.neighbors[i];
      if (Object.prototype.hasOwnProperty.call(previous, nextId)) continue;
      previous[nextId] = id;
      if (nextId === toId) {
        const path = [toId];
        let cursor = id;
        while (cursor != null) {
          path.unshift(cursor);
          cursor = previous[cursor];
        }
        return path;
      }
      queue.push(nextId);
    }
  }
  return null;
}

function getEmpireRaidTargets(empire) {
  if (!empire) return [];
  const cfg = CONFIG.rivals || {};
  /* "Nearby" is a flat lane reach: an empire does not project force across
     the whole galaxy. Outer powers become dangerous as the player expands
     toward them, or when the player enters their own sector. */
  const range = cfg.raidLaneRange == null ? 2 : cfg.raidLaneRange;
  const distances = getSectorLaneDistances(empire.sectorId);
  const playerSectors = getPlayerPresenceSectors();
  const targets = [];
  playerSectors.forEach(function (sectorId) {
    if (!Object.prototype.hasOwnProperty.call(distances, sectorId)) return;
    const distance = distances[sectorId];
    if (distance === 0) return; // own sector is handled by the local focus
    if (distance > range) return;
    const sector = getSector(sectorId);
    targets.push({
      sectorId: sectorId,
      distance: distance,
      name: sector ? sector.name : sectorId
    });
  });
  targets.sort(function (a, b) {
    if (a.distance !== b.distance) return a.distance - b.distance;
    return a.sectorId.localeCompare(b.sectorId);
  });
  return targets;
}

function getRivalShipPosition(empire, ship) {
  if (!empire || !ship) return null;
  const positions = getEmpireShipsWithPositions(empire);
  for (let i = 0; i < positions.length; i += 1) {
    if (positions[i].ship === ship) return positions[i];
  }
  return null;
}

function getRaidFocusKey(empire, sectorId, fromRow, fromCol) {
  const sector = getSector(sectorId);
  if (!sector) return hexKey(sector ? sector.entryRow : 0, sector ? sector.entryCol : 0);
  const originRow = typeof fromRow === "number" ? fromRow : sector.entryRow;
  const originCol = typeof fromCol === "number" ? fromCol : sector.entryCol;

  const candidates = [];
  state.systems.forEach(function (system) {
    if (system.sectorId !== sectorId || !system.colonized) return;
    candidates.push({ key: hexKey(system.row, system.col), row: system.row, col: system.col, priority: 0 });
  });
  Object.keys(sector.structures || {}).forEach(function (key) {
    const structure = sector.structures[key];
    if (!isPlayerStructure(structure)) return;
    const pos = parseHexKey(key);
    candidates.push({ key: key, row: pos.row, col: pos.col, priority: 1 });
  });
  Object.keys(sector.fleets || {}).forEach(function (key) {
    if (!(sector.fleets[key] || []).length) return;
    const pos = parseHexKey(key);
    candidates.push({ key: key, row: pos.row, col: pos.col, priority: 2 });
  });

  if (!candidates.length) return hexKey(sector.entryRow, sector.entryCol);
  candidates.sort(function (a, b) {
    if (a.priority !== b.priority) return a.priority - b.priority;
    const da = hexDistance(originRow, originCol, a.row, a.col);
    const db = hexDistance(originRow, originCol, b.row, b.col);
    if (da !== db) return da - db;
    return a.key.localeCompare(b.key);
  });
  return candidates[0].key;
}

function orderRivalToHex(empire, ship, targetSectorId, targetKey, position) {
  const here = position || getRivalShipPosition(empire, ship);
  if (!here) return false;
  const targetSector = getSector(targetSectorId);
  if (!targetSector) return false;

  if (here.sectorId === targetSectorId) {
    /* The target is local: a queued lane jump would take the ship away. */
    delete ship.jumpSector;
    if (here.key === targetKey) {
      delete ship.path;
      delete ship.pathSectorId;
      return true;
    }
    if (ship.path && ship.pathSectorId === here.sectorId && ship.path.length) return true;
    const path = findHexPath(here.pos.row, here.pos.col, parseHexKey(targetKey).row, parseHexKey(targetKey).col);
    if (!path || !path.length) return false;
    ship.path = path;
    ship.pathSectorId = here.sectorId;
    delete ship.jumpSector;
    return true;
  }

  const lanePath = getSectorLanePath(here.sectorId, targetSectorId);
  if (!lanePath || lanePath.length < 2) return false;
  const nextSectorId = lanePath[1];
  const currentSector = getSector(here.sectorId);
  if (!currentSector) return false;
  /* A rival crosses at the local port facing the next lane, just like a
     player fleet. The reverse port is used on arrival. */
  const departureKey = getLandingHexFor(currentSector, nextSectorId);
  const departure = parseHexKey(departureKey);

  if (here.key === departureKey) {
    if (!ship.path || !ship.path.length) {
      ship.jumpSector = nextSectorId;
      delete ship.path;
      delete ship.pathSectorId;
      return true;
    }
  }
  if (ship.path && ship.pathSectorId === here.sectorId && ship.path.length) return true;
  if (ship.jumpSector) return true;

  const path = findHexPath(here.pos.row, here.pos.col, departure.row, departure.col);
  if (!path) return false;
  if (!path.length) {
    ship.jumpSector = nextSectorId;
    delete ship.path;
    delete ship.pathSectorId;
    return true;
  }
  ship.path = path;
  ship.pathSectorId = here.sectorId;
  return true;
}

/* ---------- AI actions ---------- */

function getColonizableSystems(empire) {
  if (!empire) return [];
  return state.systems.filter(function (system) {
    return system.sectorId === empire.sectorId && !system.owner && !system.colonized;
  });
}

function maybeRecruit(empire) {
  const cfg = CONFIG.rivals || {};
  const rng = state.military.rng;
  const ships = getEmpireShips(empire);
  if (ships.length >= empire.fleetCap) return false;
  const cost = SHIP_TYPES.corvette.cost.minerals;
  if (empire.minerals < cost) return false;
  const archetype = getEmpireArchetype(empire);
  const chance = clamp(0.42 + empire.ring * 0.06 + (archetype.growthBias - 1) * 0.12, 0.2, 0.9);
  if (rng() > chance) return false;
  empire.minerals -= cost;
  const sector = getSector(empire.sectorId);
  if (!sector) return false;
  const ship = createRivalShip(empire, empire.stateId !== "raid");
  sector.rivalFleets[empire.capitalKey] = (sector.rivalFleets[empire.capitalKey] || []).concat(ship);
  empire.stats.shipsBuilt += 1;
  empire.lastAction = "Laid down a corvette";
  empire.lastActionTurn = state.turn;
  return true;
}

function maybeColonize(empire) {
  const rng = state.military.rng;
  if (getEmpireColonyCount(empire) >= empire.colonyCap) return false;
  const candidates = getColonizableSystems(empire);
  if (!candidates.length) return false;
  const cost = 10;
  if (empire.minerals < cost) return false;
  const archetype = getEmpireArchetype(empire);
  const chance = clamp(0.28 + empire.ring * 0.035 + (archetype.growthBias - 1) * 0.12, 0.12, 0.72);
  if (rng() > chance) return false;
  const system = rngPick(rng, candidates);
  empire.minerals -= cost;
  system.owner = empire.id;
  system.rivalSinceTurn = state.turn;
  empire.systems.push(system.id);
  empire.stats.coloniesFounded += 1;
  empire.lastAction = "Settled " + system.name;
  empire.lastActionTurn = state.turn;
  return true;
}

function maybeBuildStronghold(empire) {
  const rng = state.military.rng;
  if (getEmpireStrongholds(empire).length) return false;
  const def = STRUCTURE_TYPES.stronghold;
  if (empire.minerals < def.cost.minerals) return false;
  const sector = getSector(empire.sectorId);
  if (!sector) return false;
  const entryKey = hexKey(sector.entryRow, sector.entryCol);
  const targetKey = !sector.structures[entryKey] ? entryKey
    : (!sector.structures[empire.capitalKey] ? empire.capitalKey : null);
  if (!targetKey) return false;
  const chance = clamp(0.38 + empire.ring * 0.05, 0.3, 0.85);
  if (rng() > chance) return false;
  empire.minerals -= def.cost.minerals;
  sector.structures[targetKey] = {
    type: "stronghold",
    owner: empire.id,
    underConstruction: true,
    startedTurn: state.turn,
    hull: def.hull
  };
  empire.lastAction = "Raised a stronghold in " + sector.name;
  empire.lastActionTurn = state.turn;
  return true;
}

function setHomePatrols(empire) {
  const homeSectorId = empire.sectorId;
  getEmpireShipsWithPositions(empire).forEach(function (entry) {
    const ship = entry.ship;
    if (ship.raidTargetSectorId) return;
    if (entry.sectorId !== homeSectorId) {
      if (!ship.path && !ship.jumpSector) {
        ship.returnHome = true;
        orderRivalToHex(empire, ship, homeSectorId, empire.capitalKey, entry);
      }
      return;
    }
    ship.returnHome = false;
    if (!ship.path && !ship.jumpSector) {
      ship.patrol = true;
      /* Rival stations work like the player's: the zone stays where the
         patrol was set, and a hull recalled after a raid anchors anew. */
      if (!ship.patrolHomeKey || ship.patrolHomeSectorId !== homeSectorId) {
        setShipPatrolStation(ship, homeSectorId, entry.key);
      }
    }
  });
}

function getEmpireRaiders(empire) {
  return getEmpireShipsWithPositions(empire).filter(function (entry) {
    return !!entry.ship.raidTargetSectorId;
  });
}

function getEmpireRaidGroupSize(empire) {
  return clamp(1 + Math.floor(empire.ring / 2), 1, 3);
}

function orderRaidShips(empire, targetSectorId) {
  /* Retarget any raider already in the field, then pick a new group only
     when the empire has no raiders left. */
  const existing = getEmpireRaiders(empire);
  existing.forEach(function (entry) {
    if (entry.ship.raidTargetSectorId === targetSectorId) return;
    entry.ship.raidTargetSectorId = targetSectorId;
    entry.ship.returnHome = false;
    entry.ship.patrol = false;
    clearShipPatrolStation(entry.ship);
    delete entry.ship.path;
    delete entry.ship.pathSectorId;
    delete entry.ship.jumpSector;
  });
  const raiders = existing.filter(function (entry) {
    return entry.ship.raidTargetSectorId === targetSectorId;
  });
  const group = raiders.length ? raiders : (function () {
    const available = getEmpireShipsWithPositions(empire).filter(function (entry) {
      return !entry.ship.raidTargetSectorId && entry.sectorId === empire.sectorId;
    });
    available.sort(function (a, b) {
      const hullA = getShipHull(a.ship);
      const hullB = getShipHull(b.ship);
      if (hullA !== hullB) return hullB - hullA;
      return a.ship.id.localeCompare(b.ship.id);
    });
    const picked = available.slice(0, getEmpireRaidGroupSize(empire));
    picked.forEach(function (entry) {
      entry.ship.raidTargetSectorId = targetSectorId;
      entry.ship.returnHome = false;
      entry.ship.patrol = false;
      clearShipPatrolStation(entry.ship);
      delete entry.ship.path;
      delete entry.ship.pathSectorId;
      delete entry.ship.jumpSector;
    });
    if (picked.length) {
      const sector = getSector(targetSectorId);
      /* Stay anonymous until contact: a named dispatch would leak an empire
         the player has never charted. */
      const raidName = empire.met ? empire.name : "Unidentified raiders";
      pushMilitaryLog({
        tone: "raid-start",
        empireId: empire.met ? empire.id : null,
        text: raidName + (empire.met ? " launches" : " launch") +
          " a raid toward " + (sector ? sector.name : targetSectorId)
      });
    }
    return picked;
  })();

  if (!group.length) return false;

  group.forEach(function (entry) {
    const targetKey = getRaidFocusKey(empire, targetSectorId, entry.pos.row, entry.pos.col);
    orderRivalToHex(empire, entry.ship, targetSectorId, targetKey, entry);
  });
  empire.raidStartedTurn = state.turn;
  empire.lastAction = "Raiding " + (getSector(targetSectorId) ? getSector(targetSectorId).name : targetSectorId);
  empire.lastActionTurn = state.turn;
  return true;
}

function launchRaid(empire) {
  const targets = getEmpireRaidTargets(empire);
  if (!targets.length) {
    /* The player may be sitting in the empire's own sector; raid locally. */
    if (getPlayerPresenceSectors().indexOf(empire.sectorId) !== -1) {
      return orderRaidShips(empire, empire.sectorId);
    }
    return false;
  }
  return orderRaidShips(empire, targets[0].sectorId);
}

function recallRaiders(empire) {
  getEmpireShipsWithPositions(empire).forEach(function (entry) {
    const ship = entry.ship;
    if (ship.raidTargetSectorId) {
      ship.raidTargetSectorId = null;
      ship.returnHome = true;
      delete ship.path;
      delete ship.pathSectorId;
      delete ship.jumpSector;
    }
    if (entry.sectorId === empire.sectorId && entry.key === empire.capitalKey) {
      ship.returnHome = false;
      ship.patrol = true;
      setShipPatrolStation(ship, entry.sectorId, entry.key);
      return;
    }
    if (ship.returnHome) {
      orderRivalToHex(empire, ship, empire.sectorId, empire.capitalKey, entry);
    }
  });
}

/* ---------- state machine ---------- */

function chooseRivalState(empire) {
  const rng = state.military.rng;
  const cfg = CONFIG.rivals || {};
  const archetype = getEmpireArchetype(empire);
  const ships = getEmpireShips(empire);
  const fleetCount = ships.length;
  const strongholds = getEmpireStrongholds(empire);
  const targets = getEmpireRaidTargets(empire);
  const playerInHome = getPlayerPresenceSectors().indexOf(empire.sectorId) !== -1;
  const canColonize = getEmpireColonyCount(empire) < empire.colonyCap &&
    getColonizableSystems(empire).length > 0;
  const playerNear = playerInHome || (targets.length > 0 && targets[0].distance <= 1);
  const activeRaids = countActiveRaids();

  const weights = {
    grow: 2.2 + (fleetCount < empire.fleetCap ? 1.1 : 0) +
      (canColonize ? 1.4 : 0) + archetype.growthBias,
    patrol: 1.1 + (playerNear ? 1.8 : 0) + (fleetCount > 0 ? 0.5 : 0),
    fortify: 1.0 + (empire.ring >= 2 ? 0.7 : 0) + (strongholds.length < 1 ? 1.4 : 0),
    raid: 0,
    regroup: 0.4 + (getEmpireRaiders(empire).length ? 1.6 : 0)
  };
  if (state.turn >= (cfg.raidMinTurn == null ? 4 : cfg.raidMinTurn) &&
      fleetCount > 0 &&
      activeRaids < (cfg.maxConcurrentRaids == null ? 2 : cfg.maxConcurrentRaids)) {
    const localTarget = playerInHome;
    if (targets.length || localTarget) {
      weights.raid = empire.aggression * 9 * (archetype.raidBias || 1) * (playerNear ? 1.35 : 1);
    }
  }
  if (!fleetCount) {
    weights.raid = 0;
    weights.grow += 3;
    weights.patrol = 0.4;
    weights.regroup = 0.2;
  }

  const ids = RIVAL_AI_STATE_ORDER;
  let total = 0;
  ids.forEach(function (id) { total += Math.max(0, weights[id] || 0); });
  let nextId = "grow";
  if (total <= 0) {
    nextId = "grow";
  } else {
    let roll = rng() * total;
    for (let i = 0; i < ids.length; i += 1) {
      roll -= Math.max(0, weights[ids[i]] || 0);
      if (roll < 0) { nextId = ids[i]; break; }
    }
  }

  const previous = empire.stateId;
  empire.stateId = nextId;
  empire.stateSinceTurn = state.turn;
  const minTurns = cfg.stateMinTurns == null ? 2 : cfg.stateMinTurns;
  const maxTurns = cfg.stateMaxTurns == null ? 4 : cfg.stateMaxTurns;
  /* Raids must survive the trip: a rim power can spend several turns
     reaching a departure port and jumping a lane before it makes contact. */
  empire.stateTurns = nextId === "raid"
    ? 8 + rngInt(rng, 0, 4)
    : rngInt(rng, minTurns, maxTurns);

  if (previous !== nextId && empire.met) {
    const def = RIVAL_AI_STATES[nextId];
    pushMilitaryLog({
      tone: "rival",
      empireId: empire.id,
      text: empire.name + " shifts to " + (def ? def.label : nextId)
    });
  }
  return nextId;
}

function rivalTurnForEmpire(empire) {
  if (!empire || !empire.active) return;
  rivalEconomyTick(empire);
  if (empire.stateTurns != null) empire.stateTurns -= 1;

  const wasRaiding = empire.stateId === "raid";
  const raiders = getEmpireRaiders(empire);
  if (empire.stateId === "raid" && !raiders.length) empire.stateTurns = 0;
  if (empire.stateId === "raid" && !getEmpireRaidTargets(empire).length &&
      getPlayerPresenceSectors().indexOf(empire.sectorId) === -1) {
    empire.stateTurns = 0;
  }
  if (empire.stateTurns <= 0) chooseRivalState(empire);
  /* Leaving the raid state recalls any hulls still in the field, so the
     displayed state never lies about what the fleet is doing. */
  if (wasRaiding && empire.stateId !== "raid") recallRaiders(empire);

  switch (empire.stateId) {
    case "grow":
      maybeRecruit(empire);
      maybeColonize(empire);
      setHomePatrols(empire);
      break;
    case "fortify":
      maybeBuildStronghold(empire);
      maybeRecruit(empire);
      setHomePatrols(empire);
      break;
    case "raid":
      launchRaid(empire);
      break;
    case "regroup":
      recallRaiders(empire);
      maybeRecruit(empire);
      break;
    case "patrol":
    default:
      maybeRecruit(empire);
      setHomePatrols(empire);
      break;
  }
}

/* Rival ships advance one hex along their path, then finish any lane jump
   they had queued at a departure port. A jump always takes one turn. */
function advanceRivalFleets() {
  const moves = [];
  const jumps = [];

  state.galaxy.sectors.forEach(function (sector) {
    Object.keys(sector.rivalFleets || {}).forEach(function (key) {
      const fleet = sector.rivalFleets[key];
      if (!fleet || !fleet.length) return;
      const staying = [];
      let changed = false;
      const pos = parseHexKey(key);
      /* A hostile sharing a hex with a player patrol is engaged: it holds
         the hex instead of walking out of the fight. */
      const pinned = !!getEngagedPatrolAt(sector.id, pos.row, pos.col);

      fleet.forEach(function (ship) {
        if (pinned) {
          staying.push(ship);
          return;
        }
        if (ship.jumpSector) {
          const departureKey = getLandingHexFor(sector, ship.jumpSector);
          if (key === departureKey && (!ship.path || !ship.path.length)) {
            jumps.push({ fromSectorId: sector.id, toSectorId: ship.jumpSector, ship: ship });
            changed = true;
            return;
          }
        }
        if (ship.path && ship.pathSectorId === sector.id && ship.path.length) {
          const next = parseHexKey(ship.path[0]);
          ship.path = ship.path.slice(1);
          if (!ship.path.length) {
            delete ship.path;
            delete ship.pathSectorId;
          }
          moves.push({ sectorId: sector.id, key: hexKey(next.row, next.col), ship: ship });
          changed = true;
          return;
        }
        staying.push(ship);
      });

      if (changed) {
        if (staying.length) sector.rivalFleets[key] = staying;
        else delete sector.rivalFleets[key];
      }
    });
  });

  moves.forEach(function (move) {
    const sector = getSector(move.sectorId);
    if (!sector) return;
    sector.rivalFleets[move.key] = (sector.rivalFleets[move.key] || []).concat(move.ship);
  });

  jumps.forEach(function (jump) {
    const target = getSector(jump.toSectorId);
    const ship = jump.ship;
    delete ship.jumpSector;
    if (!target) return;
    const targetKey = getLandingHexFor(target, jump.fromSectorId);
    target.rivalFleets[targetKey] = (target.rivalFleets[targetKey] || []).concat(ship);
    ship.arrivedSectorTurn = state.turn;
  });
}

function runRivalTurn() {
  if (!state || !state.empires || !state.empires.length) return;
  state.empires.forEach(rivalTurnForEmpire);
  advanceRivalFleets();
}