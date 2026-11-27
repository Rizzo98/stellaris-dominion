/* ============================================================
   COMBAT — patrol interception, ship damage, raids and repair
   Combat resolves once per turn after both fleets have moved.
   Every warship fires at a hostile in its own hex. A patrolling corvette
   keeps a station and a patrol radius (1 by default); when a hostile ship
   is inside that radius the corvette flies onto it before the volley and
   fights in the hostile hex, then returns to its station once the fight is
   over. The cyan coverage stays anchored on the station and the temporary
   outbound route is drawn by the map. An online stronghold (radius 2) is
   the only unit that truly fires across hexes.
   Damage is simultaneous, so a hull that is destroyed still fires once.
   Civilians do not shoot, but they can be shot at. Rival ships near a
   player colony raid it unless a friendly patrol or stronghold covers
   the colony's hex. A hostile sharing a hex with a player patrol holds
   that hex: the engagement is not a chase.
   Battle readouts project an intercepting patrol as an in-hex combatant,
   so its forecast includes the hostile return fire; strongholds keep their
   true ranged volley.
   ============================================================ */

function createMilitaryState(seed) {
  return {
    rng: createRng(((seed >>> 0) ^ 0xa53c9e21) >>> 0),
    battles: 0,
    kills: 0,
    losses: 0,
    raids: 0,
    salvage: 0,
    strongholdsLost: 0,
    strongholdsDestroyed: 0,
    damageDealt: 0,
    damageTaken: 0,
    lastReport: null,
    log: []
  };
}

/* ---------- unit stats ---------- */

function getShipAttack(ship) {
  const type = ship ? SHIP_TYPES[ship.type] : null;
  if (!type || !type.military) return 0;
  return typeof type.attack === "number" ? type.attack : 0;
}

function getShipPatrolRadius(ship) {
  if (!ship || !ship.patrol) return 0;
  const type = SHIP_TYPES[ship.type];
  if (!type || !type.military) return 0;
  if (typeof type.patrolRadius === "number") return type.patrolRadius;
  return (CONFIG.military && CONFIG.military.patrolRadius) || 1;
}

function isStrongholdStructure(structure) {
  return !!structure && structure.type === "stronghold";
}

function getStrongholdDef(structure) {
  return isStrongholdStructure(structure) ? STRUCTURE_TYPES.stronghold : null;
}

/* Stronghold techs raise the maximum hull of every player stronghold. Rival
   strongholds keep the base values from js/data/structures.js. */
function getStructureHullMax(structure) {
  const def = getStrongholdDef(structure);
  const base = def && typeof def.hull === "number" ? def.hull : 0;
  if (!base || !isPlayerStructure(structure)) return base;
  return base + getStrongholdHullBonus();
}

function getStructureHull(structure) {
  const max = getStructureHullMax(structure);
  if (!structure || typeof structure.hull !== "number") return max;
  return clamp(structure.hull, 0, max);
}

function getStructureAttack(structure) {
  const def = getStrongholdDef(structure);
  if (!def || structure.underConstruction) return 0;
  /* The stronghold line sharpens every online player stronghold (Planetary
     Defense is its first tier); rival strongholds keep their base attack. */
  const techBonus = isPlayerStructure(structure) ? getStrongholdAttackBonus() : 0;
  return (def.attack || 0) + techBonus;
}

function getStructurePatrolRadius(structure) {
  const def = getStrongholdDef(structure);
  if (!def || structure.underConstruction) return 0;
  const base = def.patrolRadius || 0;
  if (!base || !isPlayerStructure(structure)) return base;
  return base + getStrongholdRadiusBonus();
}

/* A warship's guns reach its own hex. Patrol radius is a response zone, not
   a firing range: the hull flies to the hostile instead of shooting across
   the gap. Static strongholds keep their true firing radius. */
function getShipCombatRange(ship) {
  return 0;
}

/* ---------- patrol stations and interception ---------- */

/* Patrol is a stance tied to a station. The station is where the order was
   given, and the cyan coverage stays anchored there even while the corvette
   is away. patrolHomeKey/patrolHomeSectorId remember it; patrolTargetKey
   remembers the hostile hex the hull is flying to or fighting in. */
function setShipPatrolStation(ship, sectorId, key) {
  if (!ship) return null;
  const pos = parseHexKey(key);
  if (!isInsideSector(pos.row, pos.col)) return null;
  ship.patrolHomeKey = key;
  ship.patrolHomeSectorId = sectorId;
  delete ship.patrolTargetKey;
  return { sectorId: sectorId, key: key, row: pos.row, col: pos.col };
}

function clearShipPatrolStation(ship) {
  if (!ship) return;
  delete ship.patrolHomeKey;
  delete ship.patrolHomeSectorId;
  delete ship.patrolTargetKey;
}

function getShipPatrolStation(ship, sectorId) {
  if (!ship || !ship.patrol || !ship.patrolHomeKey) return null;
  if (ship.patrolHomeSectorId && ship.patrolHomeSectorId !== sectorId) return null;
  const pos = parseHexKey(ship.patrolHomeKey);
  if (!isInsideSector(pos.row, pos.col)) return null;
  return { sectorId: sectorId, key: ship.patrolHomeKey, row: pos.row, col: pos.col };
}

/* A patrol ordered before stations existed (or a rival hull launched already
   on station) anchors where it stands on its first resolution. */
function ensureShipPatrolStation(ship, sectorId, row, col) {
  if (!ship || !ship.patrol) return null;
  if (!ship.patrolHomeKey || ship.patrolHomeSectorId !== sectorId) {
    setShipPatrolStation(ship, sectorId, hexKey(row, col));
  }
  return getShipPatrolStation(ship, sectorId);
}

/* The temporary outbound line: station -> hull's current hex. It disappears
   as soon as the corvette is back on station. */
function getPatrolExcursion(ship, sectorId, currentKey) {
  const station = getShipPatrolStation(ship, sectorId);
  if (!station || !currentKey) return null;
  const current = parseHexKey(currentKey);
  if (!isInsideSector(current.row, current.col)) return null;
  if (station.row === current.row && station.col === current.col) return null;
  const route = findHexPath(station.row, station.col, current.row, current.col);
  if (!route || !route.length) return null;
  return {
    sectorId: sectorId,
    homeKey: station.key,
    currentKey: hexKey(current.row, current.col),
    route: route,
    targetKey: ship.patrolTargetKey || null
  };
}

/* Living hostile hulls in one hex, from the point of view of 'ship'. */
function getHostileShipsAtKey(sector, ship, key) {
  if (!sector || !ship) return [];
  const owner = ship.owner || "player";
  const out = [];
  if (owner !== "player") {
    ((sector.fleets || {})[key] || []).forEach(function (other) {
      if (other && getShipHull(other) > 0) out.push(other);
    });
  }
  ((sector.rivalFleets || {})[key] || []).forEach(function (other) {
    if (!other) return;
    if ((other.owner || "player") === owner) return;
    if (getShipHull(other) > 0) out.push(other);
  });
  return out;
}

/* The closest hostile hull inside the station's patrol radius. Warships win
   ties over civilian hulls, then the lower row/column keeps the pick
   deterministic. */
function findPatrolTarget(sector, ship, station, fromRow, fromCol) {
  const radius = getShipPatrolRadius(ship);
  if (!sector || radius <= 0) return null;
  const seen = new Set();
  let best = null;
  function consider(key) {
    if (seen.has(key)) return;
    seen.add(key);
    const pos = parseHexKey(key);
    if (!isInsideSector(pos.row, pos.col)) return;
    if (hexDistance(station.row, station.col, pos.row, pos.col) > radius) return;
    const hostiles = getHostileShipsAtKey(sector, ship, key);
    if (!hostiles.length) return;
    const military = hostiles.some(function (other) {
      const type = SHIP_TYPES[other.type];
      return !!type && !!type.military;
    });
    const distance = hexDistance(fromRow, fromCol, pos.row, pos.col);
    const candidate = { key: key, row: pos.row, col: pos.col, distance: distance, military: military };
    if (!best ||
        candidate.distance < best.distance ||
        (candidate.distance === best.distance && candidate.military && !best.military) ||
        (candidate.distance === best.distance && candidate.military === best.military &&
          (candidate.row < best.row ||
            (candidate.row === best.row && candidate.col < best.col)))) {
      best = candidate;
    }
  }
  Object.keys(sector.rivalFleets || {}).forEach(consider);
  if ((ship.owner || "player") !== "player") Object.keys(sector.fleets || {}).forEach(consider);
  return best;
}

/* Move one hull up to its speed along the shortest route. A player patrol
   charts every hex it enters, exactly like a player-ordered move; a rival
   patrol moves without revealing fog to the player. */
function moveShipToward(sector, ship, fromKey, toKey, chart) {
  const from = parseHexKey(fromKey);
  const to = parseHexKey(toKey);
  if (from.row === to.row && from.col === to.col) return fromKey;
  const path = findHexPath(from.row, from.col, to.row, to.col);
  if (!path || !path.length) return fromKey;
  const steps = Math.min(getShipSpeed(ship), path.length);
  let cursor = fromKey;
  for (let i = 0; i < steps; i += 1) {
    const next = parseHexKey(path[i]);
    if (chart) markHexExplored(next.row, next.col, sector.id);
    cursor = hexKey(next.row, next.col);
  }
  return cursor;
}

function applyPatrolMove(sector, ship, fromKey, toKey, player) {
  if (!sector || !ship || fromKey === toKey) return;
  const buckets = player ? sector.fleets : sector.rivalFleets;
  const fleet = buckets[fromKey];
  if (!fleet) return;
  const index = fleet.indexOf(ship);
  if (index === -1) return;
  fleet.splice(index, 1);
  if (!fleet.length) delete buckets[fromKey];
  buckets[toKey] = (buckets[toKey] || []).concat(ship);
}

function applyPatrolMoves(moves) {
  moves.forEach(function (move) {
    applyPatrolMove(move.sector, move.ship, move.fromKey, move.toKey, move.player);
  });
}

/* Every patrol hull acts before the volley: hold a fight that already shares
   its hex, otherwise fly at the closest hostile inside the station's zone,
   otherwise fly home. Only the patrolling hull moves; the enemy stays put. */
function resolvePatrolInterceptions() {
  if (!state || !state.galaxy) return;
  state.galaxy.sectors.forEach(function (sector) {
    const entries = [];
    Object.keys(sector.fleets || {}).forEach(function (key) {
      (sector.fleets[key] || []).forEach(function (ship) {
        if (ship && ship.patrol) entries.push({ ship: ship, key: key, player: true });
      });
    });
    Object.keys(sector.rivalFleets || {}).forEach(function (key) {
      (sector.rivalFleets[key] || []).forEach(function (ship) {
        if (ship && ship.patrol) entries.push({ ship: ship, key: key, player: false });
      });
    });
    entries.forEach(function (entry) {
      const ship = entry.ship;
      /* A hull following a normal route or a lane jump keeps that order;
         patrol interception only drives idle stations. */
      if ((ship.path && ship.path.length) || ship.jumpSector) return;
      const from = parseHexKey(entry.key);
      const station = ensureShipPatrolStation(ship, sector.id, from.row, from.col);
      if (!station) return;
      const hostileHere = getHostileShipsAtKey(sector, ship, entry.key).length > 0;
      let targetKey = null;
      if (hostileHere) {
        targetKey = entry.key;
      } else {
        const target = findPatrolTarget(sector, ship, station, from.row, from.col);
        targetKey = target ? target.key : (entry.key === station.key ? null : station.key);
      }
      if (targetKey) {
        ship.patrolTargetKey = targetKey;
      } else {
        delete ship.patrolTargetKey;
      }
      if (!targetKey) return;
      /* Moves apply as they are resolved. Player stations respond first, so
         an incoming corvette is already in the hex when the rival station
         decides: the rival holds and the two hulls meet. */
      const destinationKey = moveShipToward(sector, ship, entry.key, targetKey, entry.player);
      applyPatrolMove(sector, ship, entry.key, destinationKey, entry.player);
    });
  });
}

/* After the volley, a patrol with nothing left to fight flies home. A hull
   still closing on a live target (a radius wider than its speed) keeps
   approaching instead of ping-ponging back to station. */
function settlePatrolInterceptions() {
  if (!state || !state.galaxy) return;
  const moves = [];
  state.galaxy.sectors.forEach(function (sector) {
    const entries = [];
    Object.keys(sector.fleets || {}).forEach(function (key) {
      (sector.fleets[key] || []).forEach(function (ship) {
        if (ship && ship.patrol) entries.push({ ship: ship, key: key, player: true });
      });
    });
    Object.keys(sector.rivalFleets || {}).forEach(function (key) {
      (sector.rivalFleets[key] || []).forEach(function (ship) {
        if (ship && ship.patrol) entries.push({ ship: ship, key: key, player: false });
      });
    });
    entries.forEach(function (entry) {
      const ship = entry.ship;
      if ((ship.path && ship.path.length) || ship.jumpSector) return;
      const from = parseHexKey(entry.key);
      const station = ensureShipPatrolStation(ship, sector.id, from.row, from.col);
      if (!station) return;
      if (getHostileShipsAtKey(sector, ship, entry.key).length) {
        ship.patrolTargetKey = entry.key;
        return;
      }
      const targetKey = ship.patrolTargetKey;
      if (targetKey && targetKey !== station.key &&
          getHostileShipsAtKey(sector, ship, targetKey).length) {
        return;
      }
      delete ship.patrolTargetKey;
      if (entry.key === station.key) return;
      const destinationKey = moveShipToward(sector, ship, entry.key, station.key, entry.player);
      if (destinationKey !== entry.key) {
        moves.push({ sector: sector, ship: ship, fromKey: entry.key, toKey: destinationKey, player: entry.player });
      }
    });
  });
  applyPatrolMoves(moves);
}

/* "station" (at its post), "engaging" (fighting in its hex), "intercepting"
   (closing on a live target) or "returning" (flying home). */
function getShipPatrolStatus(ship, sectorId, row, col) {
  if (!ship || !ship.patrol) return "off";
  const station = getShipPatrolStation(ship, sectorId);
  if (!station) return "station";
  if (station.row === row && station.col === col) return "station";
  const sector = getSector(sectorId);
  if (!sector) return "returning";
  if (getHostileShipsAtKey(sector, ship, hexKey(row, col)).length) return "engaging";
  if (ship.patrolTargetKey && getHostileShipsAtKey(sector, ship, ship.patrolTargetKey).length) {
    return "intercepting";
  }
  return "returning";
}

/* A player corvette on patrol physically grapples whatever shares its hex.
   Rival movement checks this before following a path: an engaged hostile
   holds its hex until the fight is over instead of kiting the patrol. */
function getEngagedPatrolAt(sectorId, row, col) {
  const sector = getSector(sectorId);
  if (!sector) return null;
  const fleet = (sector.fleets || {})[hexKey(row, col)] || [];
  for (let i = 0; i < fleet.length; i += 1) {
    const ship = fleet[i];
    if (!ship || !ship.patrol) continue;
    const type = SHIP_TYPES[ship.type];
    if (type && type.military) return ship;
  }
  return null;
}

/* A patrol on station will fly into a hostile hex inside its radius when the
   turn resolves. The battle readout uses this to project the in-hex fight;
   the forecast itself is still the real volley. */
function canPatrolInterceptHex(sector, ship, entry, row, col) {
  if (!sector || !ship || !ship.patrol) return false;
  /* An order given before stations existed reads as anchored where the hull
     stands; the first resolution writes the station explicitly. */
  const station = getShipPatrolStation(ship, sector.id) ||
    { sectorId: sector.id, key: entry.key, row: entry.row, col: entry.col };
  if (entry.row !== station.row || entry.col !== station.col) return false;
  if (getHostileShipsAtKey(sector, ship, entry.key).length) return false;
  /* Only a hostile ship pulls a patrol out; a lone stronghold stays a ranged
     battery and does not drag the corvette off station. */
  if (!getHostileShipsAtKey(sector, ship, hexKey(row, col)).length) return false;
  if (hexDistance(station.row, station.col, row, col) > getShipPatrolRadius(ship)) return false;
  /* Show the intercept on the hex the corvette will actually choose, not on
     every hostile hex inside its zone. */
  const target = findPatrolTarget(sector, ship, station, station.row, station.col);
  if (!target || target.key !== hexKey(row, col)) return false;
  return hexDistance(entry.row, entry.col, row, col) <= getShipSpeed(ship);
}

/* ---------- patrol / defence coverage ---------- */

/* One list of every defensive source in a sector. Ships use their patrol
   radius when patrolling and 0 when anchored; strongholds use their fixed
   radius and stop defending while offline. */
function collectDefenseSources(sectorId) {
  const sector = getSector(sectorId);
  const sources = [];
  if (!sector) return sources;

  /* A patrol's coverage is anchored at its station, not at the hull. The
     source keeps the live hull position beside it so the map and the fleet
     tab can draw the temporary outbound trace. */
  function pushShipSource(ship, key, side) {
    const type = SHIP_TYPES[ship.type];
    if (!type || !type.military) return;
    const current = parseHexKey(key);
    const station = getShipPatrolStation(ship, sector.id);
    const stationRow = station ? station.row : current.row;
    const stationCol = station ? station.col : current.col;
    sources.push({
      side: side,
      owner: ship.owner || side,
      kind: "ship",
      sectorId: sector.id,
      key: station ? station.key : key,
      row: stationRow,
      col: stationCol,
      radius: ship.patrol ? getShipPatrolRadius(ship) : 0,
      ship: ship,
      empire: side === "player" ? null : getEmpire(ship.owner),
      homeKey: station ? station.key : null,
      currentKey: key,
      currentRow: current.row,
      currentCol: current.col,
      away: !!station && (station.row !== current.row || station.col !== current.col),
      status: getShipPatrolStatus(ship, sector.id, current.row, current.col)
    });
  }

  Object.keys(sector.fleets || {}).forEach(function (key) {
    (sector.fleets[key] || []).forEach(function (ship) {
      pushShipSource(ship, key, "player");
    });
  });

  Object.keys(sector.rivalFleets || {}).forEach(function (key) {
    (sector.rivalFleets[key] || []).forEach(function (ship) {
      pushShipSource(ship, key, ship.owner);
    });
  });

  Object.keys(sector.structures || {}).forEach(function (key) {
    const structure = sector.structures[key];
    if (!isStrongholdStructure(structure)) return;
    const pos = parseHexKey(key);
    const side = isPlayerStructure(structure) ? "player" : structure.owner;
    sources.push({
      side: side,
      owner: side,
      kind: "structure",
      sectorId: sector.id,
      key: key,
      row: pos.row,
      col: pos.col,
      radius: getStructurePatrolRadius(structure),
      structure: structure,
      empire: isPlayerStructure(structure) ? null : getEmpire(structure.owner)
    });
  });

  return sources;
}

function sideMatches(source, side) {
  if (!side) return true;
  if (side === "player") return source.side === "player";
  if (side === "rival") return source.side !== "player";
  return source.side === side;
}

function getDefenseCoverageAt(sectorId, row, col, side) {
  return collectDefenseSources(sectorId).filter(function (source) {
    if (!sideMatches(source, side)) return false;
    return hexDistance(source.row, source.col, row, col) <= source.radius;
  });
}

function getPlayerDefenseCoverageAt(sectorId, row, col) {
  return getDefenseCoverageAt(sectorId, row, col, "player");
}

function getRivalDefenseCoverageAt(sectorId, row, col) {
  return getDefenseCoverageAt(sectorId, row, col, "rival");
}

function getPlayerPatrols() {
  const out = [];
  if (!state || !state.galaxy) return out;
  state.galaxy.sectors.forEach(function (sector) {
    Object.keys(sector.fleets || {}).forEach(function (key) {
      const pos = parseHexKey(key);
      (sector.fleets[key] || []).forEach(function (ship) {
        if (!ship.patrol) return;
        const type = SHIP_TYPES[ship.type];
        if (!type || !type.military) return;
        const station = getShipPatrolStation(ship, sector.id);
        out.push({
          sectorId: sector.id,
          /* key/row/col name the station; the live hull position is beside it. */
          key: station ? station.key : key,
          row: station ? station.row : pos.row,
          col: station ? station.col : pos.col,
          currentKey: key,
          currentRow: pos.row,
          currentCol: pos.col,
          away: !!station && (station.row !== pos.row || station.col !== pos.col),
          status: getShipPatrolStatus(ship, sector.id, pos.row, pos.col),
          radius: getShipPatrolRadius(ship),
          ship: ship
        });
      });
    });
  });
  return out;
}

/* Union of every friendly defensive radius in one sector. The map layer
   draws the merged zones; the VIEW menu uses the counts. Overlapping
   sources keep the larger radius so the outline reads cleanly. */
function getSectorPatrolCoverage(sectorId) {
  const coverage = {
    sectorId: sectorId,
    zones: {},
    patrols: 0,
    strongholds: 0,
    sourceCount: 0,
    hexCount: 0
  };
  collectDefenseSources(sectorId).forEach(function (source) {
    if (source.side !== "player" || source.radius <= 0) return;
    if (source.kind === "ship") coverage.patrols += 1;
    else coverage.strongholds += 1;
    hexesWithinRadius(source.row, source.col, source.radius).forEach(function (cell) {
      const zoneKey = hexKey(cell[0], cell[1]);
      const current = coverage.zones[zoneKey];
      if (!current || source.radius > current.radius) {
        coverage.zones[zoneKey] = {
          kind: source.kind === "ship" ? "corvette" : "stronghold",
          radius: source.radius
        };
      }
    });
  });
  coverage.sourceCount = coverage.patrols + coverage.strongholds;
  coverage.hexCount = Object.keys(coverage.zones).length;
  return coverage;
}

/* ---------- battle readout ---------- */

/* A battle exists when friendly and hostile combat units share a hex. The
   readout is pure: it snapshots the ships for the sheet and projects one
   simultaneous exchange without consuming the military RNG. */
function createBattleShipUnit(ship, side, empire) {
  const type = SHIP_TYPES[ship.type];
  if (!type) return null;
  const hull = getShipHull(ship);
  if (hull <= 0) return null;
  return {
    kind: "ship",
    side: side,
    owner: ship.owner,
    empire: empire || null,
    name: ship.name,
    typeId: ship.type,
    typeName: type.name,
    emoji: type.emoji,
    role: type.role,
    attack: getShipAttack(ship),
    hull: hull,
    hullMax: getShipHullMax(ship),
    power: getShipPower(ship),
    speed: getShipSpeed(ship),
    patrol: !!ship.patrol,
    patrolRadius: getShipPatrolRadius(ship),
    range: getShipCombatRange(ship),
    row: null,
    col: null,
    distance: 0,
    inHex: false,
    intercepts: false,
    canFire: true,
    ship: ship
  };
}

function createBattleStructureUnit(structure, side, empire) {
  const def = getStrongholdDef(structure);
  if (!def || structure.underConstruction) return null;
  const hull = getStructureHull(structure);
  if (hull <= 0) return null;
  return {
    kind: "structure",
    side: side,
    owner: structure.owner,
    empire: empire || null,
    name: (empire ? empire.name + " " : "") + def.name,
    typeId: structure.type,
    typeName: def.name,
    emoji: def.emoji,
    role: "Static defence",
    attack: getStructureAttack(structure),
    hull: hull,
    hullMax: getStructureHullMax(structure),
    power: def.power || 0,
    speed: 0,
    patrol: false,
    patrolRadius: getStructurePatrolRadius(structure),
    range: getStructurePatrolRadius(structure),
    row: null,
    col: null,
    distance: 0,
    inHex: false,
    intercepts: false,
    canFire: true,
    structure: structure
  };
}

function getBattleTotals(units) {
  return (units || []).reduce(function (totals, unit) {
    totals.count += 1;
    if (unit.kind === "ship") totals.ships += 1;
    else totals.structures += 1;
    totals.attack += unit.attack;
    totals.hull += unit.hull;
    totals.hullMax += unit.hullMax;
    totals.power += unit.power;
    return totals;
  }, { count: 0, ships: 0, structures: 0, attack: 0, hull: 0, hullMax: 0, power: 0 });
}

/* Firepower multiplied by remaining hull makes a compact "who is winning"
   score. A small hull term keeps unarmed civilian ships on the board. A unit
   whose weapons cannot reach any hostile only contributes the hull term, so
   a one-sided ranged defence does not read as an even fight. */
function getBattleStrength(units) {
  return (units || []).reduce(function (total, unit) {
    const attack = unit.canFire === false ? 0 : unit.attack;
    return total + attack * unit.hull + unit.hull * 0.25;
  }, 0);
}

function getBattleBalanceLabel(playerPercent) {
  if (playerPercent >= 58) return "PLAYER ADVANTAGE";
  if (playerPercent <= 42) return "ENEMY ADVANTAGE";
  return "CONTESTED";
}

function getBattleBalance(playerUnits, rivalUnits) {
  const playerStrength = getBattleStrength(playerUnits);
  const rivalStrength = getBattleStrength(rivalUnits);
  const total = playerStrength + rivalStrength;
  const playerPercent = total > 0 ? Math.round((playerStrength / total) * 100) : 50;
  const enemyPercent = 100 - playerPercent;
  return {
    playerPercent: playerPercent,
    enemyPercent: enemyPercent,
    playerStrength: playerStrength,
    rivalStrength: rivalStrength,
    leader: playerPercent >= 58 ? "player" : playerPercent <= 42 ? "rival" : "even",
    label: getBattleBalanceLabel(playerPercent)
  };
}

/* A concentrated-fire estimate for one volley. Each attack point is spent
   on the weakest hostile first, so the loss count is an upper bound rather
   than a promise: real combat picks targets from the seeded military RNG. */
function projectBattleVolley(attack, units) {
  const pool = Math.max(0, attack);
  let remaining = pool;
  const states = (units || []).map(function (unit) {
    return { unit: unit, hull: unit.hull };
  }).sort(function (a, b) {
    return a.hull - b.hull || a.unit.attack - b.unit.attack || a.unit.hullMax - b.unit.hullMax;
  });

  let damage = 0;
  let losses = 0;
  let shipLosses = 0;
  let structureLosses = 0;
  states.forEach(function (state) {
    if (remaining <= 0) return;
    const applied = Math.min(remaining, state.hull);
    state.hull -= applied;
    remaining -= applied;
    damage += applied;
    if (state.hull <= 0) {
      losses += 1;
      if (state.unit.kind === "ship") shipLosses += 1;
      else structureLosses += 1;
    }
  });

  const survivors = states.filter(function (state) { return state.hull > 0; });
  return {
    attack: pool,
    damage: damage,
    losses: losses,
    shipLosses: shipLosses,
    structureLosses: structureLosses,
    overkill: remaining,
    hullAfter: survivors.reduce(function (sum, state) { return sum + state.hull; }, 0),
    /* A survivor without a firing solution keeps its hull, not its attack:
       the forecast winner must agree with the balance bar. */
    attackAfter: survivors.reduce(function (sum, state) {
      return sum + (state.unit.canFire === false ? 0 : state.unit.attack);
    }, 0),
    strengthAfter: survivors.reduce(function (sum, state) {
      const attack = state.unit.canFire === false ? 0 : state.unit.attack;
      return sum + attack * state.hull + state.hull * 0.25;
    }, 0)
  };
}

function getBattleForecast(playerUnits, rivalUnits, options) {
  const opts = options || {};
  /* Ranged units only join the volley when they have a firing solution. The
     caller supplies the filtered attack totals; without them the forecast
     keeps the classic every-unit-fires behaviour. */
  const playerAttack = typeof opts.playerAttack === "number"
    ? opts.playerAttack
    : getBattleTotals(playerUnits).attack;
  const rivalAttack = typeof opts.rivalAttack === "number"
    ? opts.rivalAttack
    : getBattleTotals(rivalUnits).attack;
  const playerStrike = projectBattleVolley(playerAttack, rivalUnits);
  const enemyStrike = projectBattleVolley(rivalAttack, playerUnits);
  const playerAfter = enemyStrike.strengthAfter;
  const rivalAfter = playerStrike.strengthAfter;
  const leader = playerAfter > rivalAfter ? "player" : rivalAfter > playerAfter ? "rival" : "even";
  let label = "EVEN EXCHANGE";
  if (leader === "player") label = "PLAYER WINS THE EXCHANGE";
  else if (leader === "rival") label = "ENEMY WINS THE EXCHANGE";
  return {
    playerStrike: playerStrike,
    enemyStrike: enemyStrike,
    playerLosses: enemyStrike.losses,
    rivalLosses: playerStrike.losses,
    playerShipLosses: enemyStrike.shipLosses,
    rivalShipLosses: playerStrike.shipLosses,
    playerStructureLosses: enemyStrike.structureLosses,
    rivalStructureLosses: playerStrike.structureLosses,
    playerHullAfter: enemyStrike.hullAfter,
    rivalHullAfter: playerStrike.hullAfter,
    playerAttackAfter: enemyStrike.attackAfter,
    rivalAttackAfter: playerStrike.attackAfter,
    playerStrengthAfter: playerAfter,
    rivalStrengthAfter: rivalAfter,
    leader: leader,
    label: label
  };
}

/* Every player ship and online stronghold in a sector, with its position.
   Ranged defence needs units outside the contested hex, so a readout cannot
   rely on a single fleet key. */
function collectPlayerBattleEntries(sector) {
  const entries = [];
  if (!sector) return entries;
  Object.keys(sector.fleets || {}).forEach(function (key) {
    const pos = parseHexKey(key);
    (sector.fleets[key] || []).forEach(function (ship) {
      if (!SHIP_TYPES[ship.type] || getShipHull(ship) <= 0) return;
      entries.push({ kind: "ship", ship: ship, structure: null, row: pos.row, col: pos.col, key: key });
    });
  });
  Object.keys(sector.structures || {}).forEach(function (key) {
    const structure = sector.structures[key];
    if (!isPlayerStructure(structure) || !isStrongholdStructure(structure) || structure.underConstruction) return;
    if (getStructureHull(structure) <= 0) return;
    const pos = parseHexKey(key);
    entries.push({ kind: "structure", ship: null, structure: structure, row: pos.row, col: pos.col, key: key });
  });
  return entries;
}

function getBattleEntryRange(entry) {
  return entry.kind === "ship" ? getShipCombatRange(entry.ship) : getStructurePatrolRadius(entry.structure);
}

function getBattleEntryAttack(entry) {
  return entry.kind === "ship" ? getShipAttack(entry.ship) : getStructureAttack(entry.structure);
}

function createBattleUnitFromEntry(entry, side, empire) {
  const unit = entry.kind === "ship"
    ? createBattleShipUnit(entry.ship, side, empire)
    : createBattleStructureUnit(entry.structure, side, empire);
  if (!unit) return null;
  unit.row = entry.row;
  unit.col = entry.col;
  unit.key = entry.key;
  unit.range = getBattleEntryRange(entry);
  return unit;
}

/* A battle readout is anchored on hostile ground: the hex must hold at least
   one hostile combatant. Player units join when they are in that hex, when a
   patrol on station will fly into it before the volley, when a stronghold
   can fire into it, or when a hostile unit in the hex can fire at them. A
   patrol is projected as an in-hex combatant because that is where it fights
   by the end of the turn; the forecast therefore includes the return fire.
   A player hex under ranged fire is covered by the hostile hex's own readout;
   getBattleInvolvingHex() lets the fleet tab find that engagement too. */
function getHexBattleReadout(sectorId, row, col) {
  const sector = getSector(sectorId);
  if (!sector) return null;
  const key = hexKey(row, col);

  const rivalEntries = [];
  (sector.rivalFleets && sector.rivalFleets[key] ? sector.rivalFleets[key] : []).forEach(function (ship) {
    if (!SHIP_TYPES[ship.type] || getShipHull(ship) <= 0) return;
    rivalEntries.push({ kind: "ship", ship: ship, structure: null, row: row, col: col, key: key });
  });
  const structure = sector.structures ? sector.structures[key] : null;
  if (isStrongholdStructure(structure) && !structure.underConstruction &&
      !isPlayerStructure(structure) && getStructureHull(structure) > 0) {
    rivalEntries.push({ kind: "structure", ship: null, structure: structure, row: row, col: col, key: key });
  }
  if (!rivalEntries.length) return null;

  const rivalUnits = rivalEntries.map(function (entry) {
    const side = entry.kind === "ship" ? entry.ship.owner : entry.structure.owner;
    return createBattleUnitFromEntry(entry, side, getEmpire(side));
  }).filter(Boolean);
  if (!rivalUnits.length) return null;
  rivalUnits.forEach(function (unit) {
    unit.inHex = true;
    unit.distance = 0;
  });

  const playerUnits = [];
  collectPlayerBattleEntries(sector).forEach(function (entry) {
    const distance = hexDistance(entry.row, entry.col, row, col);
    const inHex = distance === 0;
    const attack = getBattleEntryAttack(entry);

    if (entry.kind === "ship") {
      /* A patrol hull on station flies into the hostile hex before the
         volley. It then fights like any in-hex unit: its guns count and the
         hostile ships' return fire reaches it. */
      const intercepts = !inHex && attack > 0 &&
        canPatrolInterceptHex(sector, entry.ship, entry, row, col);
      const canBeHit = rivalUnits.some(function (unit) {
        return unit.attack > 0 &&
          hexDistance(unit.row, unit.col, entry.row, entry.col) <= unit.range;
      });
      if (!inHex && !intercepts && !canBeHit) return;
      const unit = createBattleUnitFromEntry(entry, "player", null);
      if (!unit) return;
      unit.inHex = inHex;
      unit.distance = distance;
      unit.range = getShipCombatRange(entry.ship);
      unit.canFire = attack > 0 && (inHex || intercepts);
      unit.intercepts = intercepts;
      playerUnits.push(unit);
      return;
    }

    /* Static defences genuinely fire across hexes. */
    const range = getBattleEntryRange(entry);
    const canShoot = attack > 0 && distance <= range;
    const canBeHit = rivalUnits.some(function (unit) {
      return unit.attack > 0 &&
        hexDistance(unit.row, unit.col, entry.row, entry.col) <= unit.range;
    });
    if (!inHex && !canShoot && !canBeHit) return;
    const unit = createBattleUnitFromEntry(entry, "player", null);
    if (!unit) return;
    unit.inHex = inHex;
    unit.distance = distance;
    unit.range = range;
    unit.canFire = canShoot;
    unit.intercepts = false;
    playerUnits.push(unit);
  });

  rivalUnits.forEach(function (unit) {
    unit.intercepts = false;
    /* An interceptor is in the hex by the time the volley lands, so the
       hostile corvette's own-hex guns can answer it. */
    unit.canFire = unit.attack > 0 && playerUnits.some(function (playerUnit) {
      const engagementDistance = playerUnit.intercepts ? 0 : playerUnit.distance;
      return engagementDistance <= unit.range;
    });
  });

  const playerVolley = playerUnits.reduce(function (total, unit) {
    return total + (unit.canFire ? unit.attack : 0);
  }, 0);
  const rivalVolley = rivalUnits.reduce(function (total, unit) {
    return total + (unit.canFire ? unit.attack : 0);
  }, 0);
  /* A battle needs a firing solution. Two civilian hulls sharing a hex, or a
     hostile parked outside every weapon's reach, are not an engagement. */
  if (!playerVolley && !rivalVolley) return null;

  const playerTotals = getBattleTotals(playerUnits);
  const rivalTotals = getBattleTotals(rivalUnits);
  const empires = [];
  const seenEmpires = new Set();
  rivalUnits.forEach(function (unit) {
    if (!unit.empire || seenEmpires.has(unit.empire.id)) return;
    seenEmpires.add(unit.empire.id);
    empires.push(unit.empire);
  });
  const rivalLabel = empires.length === 1
    ? empires[0].name
    : empires.length > 1 ? "Rival coalition" : "Hostile force";
  const rivalColor = empires.length ? empires[0].color : "#ff7a7a";
  const playerInHex = playerUnits.filter(function (unit) { return unit.inHex; }).length;
  const playerIntercepts = playerUnits.filter(function (unit) { return unit.intercepts; }).length;
  const playerRanged = playerUnits.filter(function (unit) {
    return !unit.inHex && !unit.intercepts;
  }).length;
  const rivalInHex = rivalUnits.filter(function (unit) { return unit.inHex; }).length;
  const rivalRanged = rivalUnits.length - rivalInHex;

  return {
    sectorId: sector.id,
    sectorName: sector.name,
    row: row,
    col: col,
    key: key,
    inHex: playerInHex > 0 && rivalInHex > 0,
    ranged: playerRanged + rivalRanged > 0,
    intercept: playerIntercepts,
    player: {
      ships: playerUnits.filter(function (unit) { return unit.kind === "ship"; }).map(function (unit) { return unit.ship; }),
      units: playerUnits,
      totals: playerTotals,
      label: "Your fleet",
      inHex: playerInHex,
      intercepts: playerIntercepts,
      ranged: playerRanged,
      attackInRange: playerVolley
    },
    rival: {
      ships: rivalUnits.filter(function (unit) { return unit.kind === "ship"; }).map(function (unit) { return unit.ship; }),
      units: rivalUnits,
      totals: rivalTotals,
      label: rivalLabel,
      color: rivalColor,
      empires: empires,
      inHex: rivalInHex,
      intercepts: 0,
      ranged: rivalRanged,
      attackInRange: rivalVolley
    },
    balance: getBattleBalance(playerUnits, rivalUnits),
    forecast: getBattleForecast(playerUnits, rivalUnits, {
      playerAttack: playerVolley,
      rivalAttack: rivalVolley
    })
  };
}

/* The hostile hex is the battle anchor, but the player often opens the fleet
   tab of the hex being defended. Walk the charted sector for an engagement
   that includes one of this hex's player units so the callout can still lead
   to the same battle sheet. */
function getBattleInvolvingHex(sectorId, row, col) {
  if (!isInsideSector(row, col)) return null;
  const local = getHexBattleReadout(sectorId, row, col);
  if (local) return local;
  const sector = getSector(sectorId);
  if (!sector) return null;
  const key = hexKey(row, col);
  const localShips = sector.fleets[key] || [];
  const localStructure = sector.structures ? sector.structures[key] : null;
  /* A patrolling hull that already flew to a hostile hex is no longer in its
     station key, but the station's fleet tab should still lead to the fight
     it started. */
  const stationedPatrols = [];
  Object.keys(sector.fleets || {}).forEach(function (shipKey) {
    (sector.fleets[shipKey] || []).forEach(function (ship) {
      const station = getShipPatrolStation(ship, sector.id);
      if (station && station.key === key) stationedPatrols.push(ship);
    });
  });
  if (!localShips.length && !localStructure && !stationedPatrols.length) return null;
  for (let r = 0; r < CONFIG.sector.rows; r += 1) {
    for (let c = 0; c < CONFIG.sector.cols; c += 1) {
      if (r === row && c === col) continue;
      if (!isHexExplored(r, c, sectorId)) continue;
      const battle = getHexBattleReadout(sectorId, r, c);
      if (!battle) continue;
      const includesLocal = battle.player.units.some(function (unit) {
        if (unit.kind === "ship") {
          return localShips.indexOf(unit.ship) !== -1 ||
            stationedPatrols.indexOf(unit.ship) !== -1;
        }
        return unit.structure === localStructure;
      });
      if (includesLocal) return battle;
    }
  }
  return null;
}

/* ---------- combat resolution ---------- */

function collectCombatEntities() {
  const entities = [];
  state.galaxy.sectors.forEach(function (sector) {
    Object.keys(sector.fleets || {}).forEach(function (key) {
      const pos = parseHexKey(key);
      (sector.fleets[key] || []).forEach(function (ship) {
        const type = SHIP_TYPES[ship.type];
        if (!type) return;
        ship.hull = getShipHull(ship);
        entities.push({
          side: "player",
          kind: "ship",
          sectorId: sector.id,
          key: key,
          row: pos.row,
          col: pos.col,
          ship: ship,
          attack: getShipAttack(ship),
          /* Ships trade fire only in their own hex. A patrol's radius moves
             the hull onto the hostile; it is not a firing range. */
          range: getShipCombatRange(ship),
          hull: ship.hull,
          hullMax: getShipHullMax(ship),
          military: !!type.military,
          hitByPlayer: false,
          hitByRival: false
        });
      });
    });

    Object.keys(sector.rivalFleets || {}).forEach(function (key) {
      const pos = parseHexKey(key);
      (sector.rivalFleets[key] || []).forEach(function (ship) {
        const type = SHIP_TYPES[ship.type];
        if (!type) return;
        ship.hull = getShipHull(ship);
        entities.push({
          side: ship.owner,
          kind: "ship",
          sectorId: sector.id,
          key: key,
          row: pos.row,
          col: pos.col,
          ship: ship,
          attack: getShipAttack(ship),
          range: getShipCombatRange(ship),
          hull: ship.hull,
          hullMax: getShipHullMax(ship),
          military: !!type.military,
          hitByPlayer: false,
          hitByRival: false
        });
      });
    });

    Object.keys(sector.structures || {}).forEach(function (key) {
      const structure = sector.structures[key];
      if (!isStrongholdStructure(structure)) return;
      const pos = parseHexKey(key);
      const side = isPlayerStructure(structure) ? "player" : structure.owner;
      structure.hull = getStructureHull(structure);
      entities.push({
        side: side,
        kind: "structure",
        sectorId: sector.id,
        key: key,
        row: pos.row,
        col: pos.col,
        structure: structure,
        attack: getStructureAttack(structure),
        range: getStructurePatrolRadius(structure),
        hull: structure.hull,
        hullMax: getStructureHullMax(structure),
        military: true,
        hitByPlayer: false,
        hitByRival: false
      });
    });
  });
  return entities;
}

/* Warships are the preferred target, strongholds next, civilians last.
   Randomness comes from the seeded military stream. */
function pickCombatTarget(rng, attacker, entities) {
  const candidates = [];
  let total = 0;
  entities.forEach(function (target) {
    if (target === attacker || target.side === attacker.side) return;
    if (target.sectorId !== attacker.sectorId) return;
    if (target.hull <= 0) return;
    if (hexDistance(attacker.row, attacker.col, target.row, target.col) > attacker.range) return;
    let weight = 1;
    if (target.kind === "structure") weight = 2.5;
    else if (target.military) weight = 3;
    candidates.push({ target: target, weight: weight });
    total += weight;
  });
  if (!candidates.length || total <= 0) return null;
  let roll = rng() * total;
  for (let i = 0; i < candidates.length; i += 1) {
    roll -= candidates[i].weight;
    if (roll < 0) return candidates[i].target;
  }
  return candidates[candidates.length - 1].target;
}

function removePlayerShip(sector, key, ship) {
  const fleet = sector.fleets[key];
  if (!fleet) return false;
  const index = fleet.indexOf(ship);
  if (index === -1) return false;
  fleet.splice(index, 1);
  if (!fleet.length) delete sector.fleets[key];
  if (state.ui && state.ui.shipSelection) {
    const selected = state.ui.shipSelection.indexOf(ship.id);
    if (selected !== -1) state.ui.shipSelection.splice(selected, 1);
  }
  return true;
}

function removeRivalShip(sector, key, ship) {
  const fleet = sector.rivalFleets[key];
  if (!fleet) return false;
  const index = fleet.indexOf(ship);
  if (index === -1) return false;
  fleet.splice(index, 1);
  if (!fleet.length) delete sector.rivalFleets[key];
  return true;
}

function getSectorReport(reports, sectorId) {
  if (!reports[sectorId]) {
    const sector = getSector(sectorId);
    reports[sectorId] = {
      sectorId: sectorId,
      name: sector ? sector.name : sectorId,
      playerDamage: 0,
      rivalDamage: 0,
      playerKills: 0,
      playerLosses: 0,
      rivalStrongholdsLost: 0,
      playerStrongholdsLost: 0
    };
  }
  return reports[sectorId];
}

function resolveRaids() {
  const events = [];
  state.systems.forEach(function (system) {
    if (!system.colonized) return;
    const raiders = getRivalFleetAt(system.row, system.col, system.sectorId).filter(function (ship) {
      const type = SHIP_TYPES[ship.type];
      return !!type && type.military && getShipHull(ship) > 0;
    });
    if (!raiders.length) {
      system.raidIntercepted = false;
      return;
    }
    const raider = raiders[0];
    const empire = getEmpire(raider.owner);
    /* Hostile hulls in a colony hex are visible, so a raid identifies its
       empire even if the player has not charted its home sector yet. */
    if (empire) markEmpireMet(empire, "raid");
    const defenders = getPlayerDefenseCoverageAt(system.sectorId, system.row, system.col);
    if (defenders.length) {
      if (!system.raidIntercepted) {
        system.raidIntercepted = true;
        pushMilitaryLog({
          tone: "hold",
          text: "Patrol holds " + system.name + " · " + (empire ? empire.name : "raiders") + " repelled"
        });
      }
      return;
    }
    system.raidIntercepted = false;
    if (system.lastRaidTurn === state.turn) return;
    /* Raiders loot the sector the colony belongs to, not a global pool. */
    const stolen = Math.min(3, Math.max(0, Math.floor(getSectorStock(system.sectorId, "minerals"))));
    addSectorStock(system.sectorId, "minerals", -stolen);
    state.stability = clamp(state.stability - 1, 0, 100);
    state.military.raids += 1;
    system.lastRaidTurn = state.turn;
    if (empire) {
      empire.minerals += stolen;
      empire.stats.raids += 1;
      empire.lastAction = "Raided " + system.name + " for " + stolen + " minerals";
      empire.lastActionTurn = state.turn;
    }
    events.push({
      sectorId: system.sectorId,
      sectorName: getSector(system.sectorId) ? getSector(system.sectorId).name : "",
      systemName: system.name,
      empireId: empire ? empire.id : null,
      empireName: empire ? empire.name : "Raiders",
      stolen: stolen,
      stability: 1
    });
    pushMilitaryLog({
      tone: "raid",
      empireId: empire ? empire.id : null,
      text: (empire ? empire.name : "Raiders") + " raided " + system.name +
        " · −" + stolen + " ⛏ · −1 stability"
    });
  });
  return events;
}

function repairMilitaryUnits() {
  const repair = (CONFIG.military && CONFIG.military.repairPerTurn) || 2;
  const strongholdRepair = (CONFIG.military && CONFIG.military.strongholdRepairPerTurn) || 1;

  state.galaxy.sectors.forEach(function (sector) {
    Object.keys(sector.fleets || {}).forEach(function (key) {
      const pos = parseHexKey(key);
      const structure = getStructureAt(pos.row, pos.col, sector.id);
      const dock = !!structure && isPlayerStructure(structure) &&
        structure.type === "spaceport" && !structure.underConstruction;
      (sector.fleets[key] || []).forEach(function (ship) {
        if (!dock) return;
        if (ship.damagedTurn === state.turn) return;
        const max = getShipHullMax(ship);
        if (getShipHull(ship) >= max) return;
        ship.hull = clamp(getShipHull(ship) + repair, 0, max);
      });
    });

    (state.empires || []).forEach(function (empire) {
      if (sector.id !== empire.sectorId) return;
      (sector.rivalFleets[empire.capitalKey] || []).forEach(function (ship) {
        if (ship.owner !== empire.id) return;
        if (ship.damagedTurn === state.turn) return;
        const max = getShipHullMax(ship);
        if (getShipHull(ship) >= max) return;
        ship.hull = clamp(getShipHull(ship) + repair, 0, max);
      });
    });

    Object.keys(sector.structures || {}).forEach(function (key) {
      const structure = sector.structures[key];
      if (!isStrongholdStructure(structure) || structure.underConstruction) return;
      if (structure.damagedTurn === state.turn) return;
      const max = getStructureHullMax(structure);
      if (getStructureHull(structure) >= max) return;
      structure.hull = clamp(getStructureHull(structure) + strongholdRepair, 0, max);
    });
  });
}

/* ---------- spaceport services: refits and emergency repairs ---------- */

/* Operational player spaceports in a sector. A refit and an emergency repair
   both need one of these anywhere in the ship's own sector: builders can only
   raise a spaceport in an empty hex, so a "system with a spaceport" is always
   a sector that holds one. */
function getSectorSpaceports(sectorId) {
  const sector = getSector(sectorId);
  const ports = [];
  if (!sector) return ports;
  Object.keys(sector.structures || {}).forEach(function (key) {
    const structure = sector.structures[key];
    if (!structure || structure.type !== "spaceport" || structure.underConstruction) return;
    if (!isPlayerStructure(structure)) return;
    const pos = parseHexKey(key);
    ports.push({ sectorId: sector.id, key: key, row: pos.row, col: pos.col, structure: structure });
  });
  return ports;
}

function getShipUpgradeMineralRate() {
  const rate = CONFIG.upgrades && CONFIG.upgrades.shipMineralsPerLevel;
  return typeof rate === "number" ? rate : 1;
}

function getShipRepairMineralRate() {
  const rate = CONFIG.upgrades && CONFIG.upgrades.repairMineralsPerHull;
  return typeof rate === "number" ? rate : 0.5;
}

/* The mineral price of installing every refit level the tech tree has
   unlocked but the hull has not taken yet. */
function getShipRefitCost(ship) {
  const steps = getShipPendingUpgrades(ship).reduce(function (total, entry) {
    return total + entry.steps;
  }, 0);
  return { minerals: steps * getShipUpgradeMineralRate(), steps: steps };
}

/* Emergency repair: back to the maximum hull for a mineral price. The
   spaceport's free slow repair (repairMilitaryUnits) still runs every turn. */
function getShipRepairCost(ship) {
  const missing = Math.max(0, getShipHullMax(ship) - getShipHull(ship));
  if (missing <= 0) return { minerals: 0, hull: 0 };
  return {
    minerals: Math.max(1, Math.ceil(missing * getShipRepairMineralRate())),
    hull: missing
  };
}

/* Null means the order is allowed. The UI prints the same text on a
   disabled button, so the rule lives in one place. */
function getShipRefitBlockReason(ship, sectorId) {
  if (!ship || !SHIP_TYPES[ship.type]) return "Unknown hull.";
  if (!getSectorSpaceports(sectorId).length) {
    return "A refit needs an operational spaceport in this sector.";
  }
  if (!getShipPendingUpgrades(ship).length) {
    return "No researched refit is waiting for this hull.";
  }
  const cost = getShipRefitCost(ship);
  if (getSectorStock(sectorId, "minerals") < cost.minerals) {
    return "Need " + cost.minerals + " minerals in this sector for the refit.";
  }
  return null;
}

function getShipRepairBlockReason(ship, sectorId) {
  if (!ship || !SHIP_TYPES[ship.type]) return "Unknown hull.";
  if (!getSectorSpaceports(sectorId).length) {
    return "Repairs need an operational spaceport in this sector.";
  }
  if (getShipHull(ship) >= getShipHullMax(ship)) {
    return "This hull is already at full strength.";
  }
  const cost = getShipRepairCost(ship);
  if (getSectorStock(sectorId, "minerals") < cost.minerals) {
    return "Need " + cost.minerals + " minerals in this sector to repair.";
  }
  return null;
}

/* The single military step of a turn. Returns the report used by the map
   note, the empire dossier and the tests. */
function resolveMilitaryTurn() {
  if (!state || !state.military || !state.galaxy) return null;
  const rng = state.military.rng;
  /* Patrols respond first: a corvette whose station covers a hostile hex
     flies onto it, then fights in the same hex as everything else. */
  resolvePatrolInterceptions();
  const entities = collectCombatEntities();
  const attacks = [];

  entities.forEach(function (attacker) {
    if (attacker.attack <= 0) return;
    const target = pickCombatTarget(rng, attacker, entities);
    if (target) attacks.push({ attacker: attacker, target: target });
  });

  const reports = {};
  attacks.forEach(function (pair) {
    const attacker = pair.attacker;
    const target = pair.target;
    target.hull -= attacker.attack;
    target.damagedTurn = state.turn;
    if (target.kind === "ship") {
      target.ship.hull = target.hull;
      target.ship.damagedTurn = state.turn;
    } else {
      target.structure.hull = target.hull;
      target.structure.damagedTurn = state.turn;
    }

    const involvesPlayer = attacker.side === "player" || target.side === "player";
    if (involvesPlayer) {
      const report = getSectorReport(reports, target.sectorId);
      if (attacker.side === "player") {
        report.rivalDamage += attacker.attack;
        state.military.damageDealt += attacker.attack;
      }
      if (target.side === "player") {
        report.playerDamage += attacker.attack;
        state.military.damageTaken += attacker.attack;
      }
    }
    if (attacker.side === "player") target.hitByPlayer = true;
    if (target.side === "player") target.hitByRival = true;
  });

  const destroyedShips = entities.filter(function (entity) {
    return entity.kind === "ship" && entity.hull <= 0;
  });
  const destroyedStructures = entities.filter(function (entity) {
    return entity.kind === "structure" && entity.hull <= 0;
  });

  /* Battles reveal the hexes they happened in, so the fleet tab can show
     who is shooting at whom even if the player only just arrived. */
  Object.keys(reports).forEach(function (sectorId) {
    reports[sectorId].shipNames = [];
    const sector = getSector(sectorId);
    if (!sector) return;
    const seen = new Set();
    attacks.forEach(function (pair) {
      if (pair.target.sectorId !== sectorId) return;
      const key = hexKey(pair.target.row, pair.target.col);
      if (seen.has(key)) return;
      seen.add(key);
      markHexExplored(pair.target.row, pair.target.col, sectorId);
    });
  });

  let salvageGained = 0;
  destroyedShips.forEach(function (entity) {
    const sector = getSector(entity.sectorId);
    if (!sector) return;
    if (entity.side === "player") {
      removePlayerShip(sector, entity.key, entity.ship);
      state.military.losses += 1;
      const report = getSectorReport(reports, entity.sectorId);
      report.playerLosses += 1;
      report.shipNames.push(entity.ship.name);
      pushMilitaryLog({
        tone: "loss",
        text: entity.ship.name + " destroyed in " + sector.name
      });
      return;
    }

    removeRivalShip(sector, entity.key, entity.ship);
    const empire = getEmpire(entity.side);
    if (empire) {
      empire.stats.losses += 1;
      if (empire.met) {
        empire.lastAction = "Lost a corvette in " + sector.name;
        empire.lastActionTurn = state.turn;
      }
    }
    const report = getSectorReport(reports, entity.sectorId);
    if (entity.hitByPlayer) {
      report.playerKills += 1;
      state.military.kills += 1;
      const salvage = (CONFIG.military && CONFIG.military.salvagePerShip) || 2;
      addSectorStock(entity.sectorId, "minerals", salvage);
      state.military.salvage += salvage;
      salvageGained += salvage;
      report.shipNames.push(entity.ship.name);
    }
  });

  destroyedStructures.forEach(function (entity) {
    const sector = getSector(entity.sectorId);
    if (!sector) return;
    delete sector.structures[entity.key];
    const report = getSectorReport(reports, entity.sectorId);
    if (entity.side === "player") {
      state.military.strongholdsLost += 1;
      report.playerStrongholdsLost += 1;
      pushMilitaryLog({ tone: "loss", text: "Stronghold lost in " + sector.name });
      return;
    }
    if (entity.hitByPlayer) {
      state.military.strongholdsDestroyed += 1;
      report.rivalStrongholdsLost += 1;
      const salvage = (CONFIG.military && CONFIG.military.salvagePerStronghold) || 6;
      addSectorStock(entity.sectorId, "minerals", salvage);
      state.military.salvage += salvage;
      salvageGained += salvage;
      pushMilitaryLog({ tone: "victory", text: "Rival stronghold destroyed in " + sector.name });
    }
  });

  /* The fight is over for any patrol whose target hex is now empty: the
     surviving corvette flies back to its station and the red trace clears. */
  settlePatrolInterceptions();
  const raids = resolveRaids();
  repairMilitaryUnits();

  const sectorReports = Object.keys(reports).map(function (sectorId) {
    return reports[sectorId];
  }).filter(function (report) {
    return report.playerDamage > 0 || report.rivalDamage > 0 ||
      report.playerKills > 0 || report.playerLosses > 0 ||
      report.playerStrongholdsLost > 0 || report.rivalStrongholdsLost > 0;
  });

  if (sectorReports.length) state.military.battles += sectorReports.length;

  const playerKills = sectorReports.reduce(function (sum, report) { return sum + report.playerKills; }, 0);
  const playerLosses = sectorReports.reduce(function (sum, report) { return sum + report.playerLosses; }, 0);
  const strongholdsLost = sectorReports.reduce(function (sum, report) { return sum + report.playerStrongholdsLost; }, 0);
  const strongholdsDestroyed = sectorReports.reduce(function (sum, report) { return sum + report.rivalStrongholdsLost; }, 0);

  const report = {
    turn: state.turn,
    sectors: sectorReports,
    playerKills: playerKills,
    playerLosses: playerLosses,
    playerStrongholdsLost: strongholdsLost,
    rivalStrongholdsDestroyed: strongholdsDestroyed,
    raids: raids,
    salvage: salvageGained,
    playerInvolved: sectorReports.length > 0 || raids.length > 0
  };
  state.military.lastReport = report;

  if (report.playerInvolved && typeof toast === "function") {
    const parts = [];
    if (playerKills) parts.push(playerKills + (playerKills === 1 ? " hostile destroyed" : " hostiles destroyed"));
    if (strongholdsDestroyed) parts.push(strongholdsDestroyed + " stronghold razed");
    if (playerLosses) parts.push(playerLosses + (playerLosses === 1 ? " ship lost" : " ships lost"));
    if (strongholdsLost) parts.push(strongholdsLost + " stronghold lost");
    if (raids.length) {
      const stolen = raids.reduce(function (sum, raid) { return sum + raid.stolen; }, 0);
      parts.push(raids.length + (raids.length === 1 ? " raid" : " raids") + " · −" + stolen + " ⛏");
    }
    if (parts.length) toast("⚔ " + parts.join(" · "));
  }

  return report;
}

