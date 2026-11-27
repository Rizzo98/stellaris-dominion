/* ============================================================
   HELPERS — formatting, lookups and derived values
   Small pure functions used across core, UI and game code.
   ============================================================ */

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/* Amounts can be fractional when a building is understaffed (1 of 2 mine
   crews produces 50%). Display one decimal only when it matters; stockpiles
   themselves remain whole numbers. */
function formatAmount(value) {
  const rounded = Math.round(value * 10) / 10;
  if (rounded === 0) return "0";
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/* Population growth is small at low population (3 × 5% = 0.15), so the
   normal one-decimal formatter would round 0.15 up to 0.2 and make the
   'next population' turn count look wrong. Growth keeps two decimals and
   rounds down, so the displayed rate never overstates the real one. */
function formatGrowthAmount(value) {
  const rounded = Math.floor((Number(value) || 0) * 100 + 1e-9) / 100;
  if (rounded === 0) return "0";
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0$/, "");
}

function formatSigned(value) {
  const rounded = Math.round(value * 10) / 10;
  if (rounded === 0) return "0";
  const magnitude = Math.abs(rounded);
  const text = Number.isInteger(magnitude) ? String(magnitude) : magnitude.toFixed(1);
  return (rounded > 0 ? "+" : "-") + text;
}

function formatMultiplier(mult) {
  return "×" + mult.toFixed(2);
}

/* Stability is a continuous moving average under the hood; the topbar, the
   end screen and the empire view read the whole number the bar shows. */
function formatStability(value) {
  return String(Math.round(clamp(Number(value) || 0, 0, 100)));
}

/* ---------- galaxy / sector lookups ---------- */

function getSector(sectorId) {
  if (!state.galaxy) return null;
  return state.galaxy.sectors.find(function (sector) { return sector.id === sectorId; }) || null;
}

function getCurrentSector() {
  if (!state.galaxy) return null;
  return getSector(state.ui.activeSector) || state.galaxy.sectors[0] || null;
}

function getSectorSystems(sectorId) {
  return state.systems.filter(function (system) { return system.sectorId === sectorId; });
}

function getSectorColonyCount(sectorId) {
  return state.systems.filter(function (system) {
    return system.sectorId === sectorId && system.colonized;
  }).length;
}

function getSectorFleetCount(sectorId) {
  const sector = getSector(sectorId);
  if (!sector) return 0;
  return Object.keys(sector.fleets).reduce(function (total, key) {
    return total + (sector.fleets[key] ? sector.fleets[key].length : 0);
  }, 0);
}

/* ---------- ship stats and tech refits ---------- */

/* Every stat helper accepts either a hull id ("corvette") or a live ship.
   A live ship adds the refit levels installed on it; a bare id reports the
   base hull, which is what shipyard builders and rival fleets want. */
function getShipType(shipOrType) {
  if (!shipOrType) return null;
  if (typeof shipOrType === "string") return SHIP_TYPES[shipOrType] || null;
  return SHIP_TYPES[shipOrType.type] || null;
}

function isLiveShip(shipOrType) {
  return !!shipOrType && typeof shipOrType === "object";
}

/* The per-level stat deltas a hull declares in js/data/ships.js. The array
   length is how many refit levels exist for that stat. */
function getShipUpgradeSteps(typeId, stat) {
  const type = SHIP_TYPES[typeId];
  if (!type || !type.upgrades || !Array.isArray(type.upgrades[stat])) return [];
  return type.upgrades[stat];
}

function getShipUpgradeMaxLevel(typeId, stat) {
  return getShipUpgradeSteps(typeId, stat).length;
}

/* How many of those levels this hull has actually installed. A refit is a
   manual order (see game/actions.js), so a freshly researched tech leaves
   every standing ship at its old level. */
function getShipInstalledLevel(ship, stat) {
  if (!isLiveShip(ship) || !ship.upgrades) return 0;
  const max = getShipUpgradeMaxLevel(ship.type, stat);
  const value = typeof ship.upgrades[stat] === "number" ? ship.upgrades[stat] : 0;
  return clamp(Math.floor(value), 0, max);
}

/* The stat points a hull has gained from installed refits. */
function getShipStatBonus(ship, stat) {
  if (!isLiveShip(ship)) return 0;
  const steps = getShipUpgradeSteps(ship.type, stat);
  const level = getShipInstalledLevel(ship, stat);
  let bonus = 0;
  for (let i = 0; i < level; i += 1) bonus += steps[i] || 0;
  return bonus;
}

/* How far a hull MAY be refitted for a stat: one level per completed tech of
   the matching line. */
function getShipUpgradeAvailableLevel(typeId, stat) {
  let level = 0;
  TECH_ORDER.forEach(function (id) {
    if (!hasTech(id)) return;
    const tech = TECHS[id];
    if (!tech || tech.shipType !== typeId || tech.stat !== stat) return;
    if (typeof tech.statLevel === "number") level = Math.max(level, tech.statLevel);
  });
  return Math.min(level, getShipUpgradeMaxLevel(typeId, stat));
}

/* The refit levels a BRAND-NEW hull launches with: everything the tech tree
   has already unlocked for that class. A hull built before the tech keeps its
   old stats and has to be refitted at a spaceport. */
function getShipResearchedLevels(typeId) {
  const levels = {};
  SHIP_UPGRADE_STATS.forEach(function (stat) {
    levels[stat] = getShipUpgradeAvailableLevel(typeId, stat);
  });
  return levels;
}

/* Total refit levels a hull can gain from the tech tree, used by the roster
   badge ("3/6 refits installed"). */
function getShipUpgradeTotalLevels(typeId) {
  return SHIP_UPGRADE_STATS.reduce(function (total, stat) {
    return total + getShipUpgradeMaxLevel(typeId, stat);
  }, 0);
}

function getShipInstalledTotalLevels(ship) {
  return SHIP_UPGRADE_STATS.reduce(function (total, stat) {
    return total + getShipInstalledLevel(ship, stat);
  }, 0);
}

/* Stats still waiting for a refit order, as [{stat, from, to, steps}]. */
function getShipPendingUpgrades(ship) {
  const pending = [];
  if (!isLiveShip(ship)) return pending;
  SHIP_UPGRADE_STATS.forEach(function (stat) {
    const installed = getShipInstalledLevel(ship, stat);
    const available = getShipUpgradeAvailableLevel(ship.type, stat);
    if (available > installed) {
      pending.push({ stat: stat, from: installed, to: available, steps: available - installed });
    }
  });
  return pending;
}

/* Each ship type moves a fixed number of hexes per turn, plus refits. */
function getShipSpeed(shipOrType) {
  const type = getShipType(shipOrType);
  const base = type && typeof type.speed === "number" && type.speed > 0 ? type.speed : 1;
  const bonus = isLiveShip(shipOrType) ? getShipStatBonus(shipOrType, "speed") : 0;
  return Math.max(1, base + bonus);
}

function getShipPower(shipOrType) {
  const type = getShipType(shipOrType);
  const base = type && typeof type.power === "number" ? type.power : 0;
  const bonus = isLiveShip(shipOrType) ? getShipStatBonus(shipOrType, "power") : 0;
  return base + bonus;
}

/* Current hull is stored on the ship so combat can leave lasting damage.
   Older/plain ships without the field are treated as undamaged. Hull techs
   raise the maximum, so a refit also restores the plating it adds. */
function getShipHullMax(ship) {
  const type = getShipType(ship);
  const base = type && typeof type.hull === "number" ? type.hull : 0;
  const bonus = isLiveShip(ship) ? getShipStatBonus(ship, "hull") : 0;
  return base + bonus;
}

function getShipHull(ship) {
  const max = getShipHullMax(ship);
  if (!ship || typeof ship.hull !== "number") return max;
  return clamp(ship.hull, 0, max);
}

function getFleetPower(ships) {
  return (ships || []).reduce(function (total, ship) {
    return total + getShipPower(ship);
  }, 0);
}

/* Sector power is the sum of every player ship and online player stronghold
   in the sector. Rival power is tracked separately (getSectorRivalPower). */
function getSectorPower(sectorId) {
  const sector = getSector(sectorId);
  if (!sector) return 0;
  let total = Object.keys(sector.fleets || {}).reduce(function (sum, key) {
    return sum + getFleetPower(sector.fleets[key]);
  }, 0);
  Object.keys(sector.structures || {}).forEach(function (key) {
    const structure = sector.structures[key];
    if (!structure || structure.underConstruction) return;
    if (!isPlayerStructure(structure)) return;
    const def = STRUCTURE_TYPES[structure.type];
    if (def && typeof def.power === "number") total += def.power;
  });
  return total;
}

/* Accepts a hull id or a live ship, so a refitted hull's own speed drives
   the ETA the player is promised. */
function getPathEta(pathLength, shipOrType) {
  if (!pathLength) return 0;
  return Math.ceil(pathLength / getShipSpeed(shipOrType));
}

/* A multi-stop route stores its waypoints in journey order. A stop the ship
   has already entered drops out of the remaining list, while the rest keep
   their original numbering on the map and in the roster's order chip. */
function getRemainingPathStops(ship) {
  if (!ship || !Array.isArray(ship.pathStops) || !ship.path || !ship.path.length) return [];
  return ship.pathStops.filter(function (key) {
    return ship.path.indexOf(key) !== -1;
  });
}

function getSectorChartedCount(sectorId) {
  return getExploredHexes(sectorId).size;
}

function getAdjacentSectors(sectorOrId) {
  const sector = typeof sectorOrId === "string" ? getSector(sectorOrId) : sectorOrId;
  if (!sector) return [];
  return sector.neighbors.map(getSector).filter(Boolean).sort(function (a, b) {
    const aDelta = a.ring - sector.ring;
    const bDelta = b.ring - sector.ring;
    if (aDelta !== bDelta) return bDelta - aDelta; // outward, then ring, then inward
    return a.ringIndex - b.ringIndex;
  });
}

/* The arrival hex for a ship entering 'sector' from 'fromSectorId'.
   Generated sectors have a dedicated port per lane; a missing port falls
   back to the central entry hex so old or incomplete state still works. */
function getLandingHexFor(sectorOrId, fromSectorId) {
  const sector = typeof sectorOrId === "string" ? getSector(sectorOrId) : sectorOrId;
  if (!sector) return null;
  const key = sector.landings ? sector.landings[fromSectorId] : null;
  if (key) return key;
  return hexKey(sector.entryRow, sector.entryCol);
}

/* The map-facing view of a sector's landing ports: one entry per adjacent
   sector, with the mirrored slot and the neighbour it serves. */
function getSectorLandingEntries(sectorOrId) {
  const sector = typeof sectorOrId === "string" ? getSector(sectorOrId) : sectorOrId;
  if (!sector || !sector.landings) return [];
  return Object.keys(sector.landings).map(function (neighborId) {
    const key = sector.landings[neighborId];
    const neighbor = getSector(neighborId);
    const slot = getSectorLandingSlot(key);
    if (!neighbor || !slot) return null;
    const pos = parseHexKey(key);
    return {
      neighborId: neighborId,
      neighbor: neighbor,
      key: key,
      row: pos.row,
      col: pos.col,
      slot: slot
    };
  }).filter(Boolean).sort(function (left, right) {
    return left.key.localeCompare(right.key);
  });
}

/* ---------- sector intelligence and raid forecasts ---------- */

/* Every sector starts with intelligence 1. Each online player radar adds one,
   plus the Signal Analysis tech bonus. Intelligence is a warning window
   measured in end-turns before a hostile hull crosses a lane into this
   sector. */
function getSectorIntelligence(sectorOrId) {
  const sector = typeof sectorOrId === "string" ? getSector(sectorOrId) : sectorOrId;
  let intelligence = 1;
  if (!sector) return intelligence;
  const radarValue = getRadarIntelValue();
  Object.keys(sector.structures || {}).forEach(function (key) {
    const structure = sector.structures[key];
    if (!structure || structure.type !== "radar" || structure.underConstruction) return;
    if (!isPlayerStructure(structure)) return;
    intelligence += radarValue;
  });
  return intelligence;
}

/* One lane leg: reach the departure port, then spend one turn jumping. A path
   already assigned by the AI is measured directly; future legs start at the
   arrival port and use hex distance to the next departure port. */
function getRaidLegTurns(sectorId, nextSectorId, row, col, pathLength, shipType) {
  const sector = getSector(sectorId);
  if (!sector) return null;
  const departureKey = getLandingHexFor(sector, nextSectorId);
  if (!departureKey) return null;
  const departure = parseHexKey(departureKey);
  if (!Number.isFinite(departure.row) || !Number.isFinite(departure.col)) return null;
  const speed = getShipSpeed(shipType);
  const distance = typeof pathLength === "number"
    ? pathLength
    : hexDistance(row, col, departure.row, departure.col);
  if (!Number.isFinite(distance)) return null;
  return Math.ceil(Math.max(0, distance) / speed) + 1;
}

/* Turns until this raider jumps into route[watchIndex]. route runs from the
   hull's current sector to its raid target, so the entry lane is the sector
   immediately before the watched one. */
function forecastRaidEntry(entry, route, watchIndex) {
  if (!entry || !route || watchIndex <= 0 || watchIndex >= route.length) return null;
  let turns = 0;
  for (let i = 0; i < watchIndex; i += 1) {
    const fromId = route[i];
    const toId = route[i + 1];
    let row;
    let col;
    let pathLength;
    if (i === 0) {
      row = entry.pos.row;
      col = entry.pos.col;
      if (entry.ship.path && entry.ship.pathSectorId === fromId && entry.ship.path.length) {
        pathLength = entry.ship.path.length;
      }
    } else {
      const arrivalKey = getLandingHexFor(getSector(fromId), route[i - 1]);
      if (!arrivalKey) return null;
      const arrival = parseHexKey(arrivalKey);
      if (!Number.isFinite(arrival.row) || !Number.isFinite(arrival.col)) return null;
      row = arrival.row;
      col = arrival.col;
    }
    const leg = getRaidLegTurns(fromId, toId, row, col, pathLength, entry.ship.type);
    if (leg == null) return null;
    turns += leg;
  }
  return {
    turns: turns,
    fromSectorId: route[watchIndex - 1],
    entryKey: getLandingHexFor(getSector(route[watchIndex]), route[watchIndex - 1])
  };
}

/* All forecast raid entries into this sector that its intelligence can see.
   One warning is returned per entry hex, carrying the earliest ETA and the
   number of hulls using that lane. */
function getRaidWarningsForSector(sectorOrId) {
  const sector = typeof sectorOrId === "string" ? getSector(sectorOrId) : sectorOrId;
  if (!sector) return [];
  const intelligence = getSectorIntelligence(sector);
  const byKey = {};
  (state.empires || []).forEach(function (empire) {
    getEmpireShipsWithPositions(empire).forEach(function (entry) {
      const targetId = entry.ship.raidTargetSectorId;
      if (!targetId || entry.sectorId === sector.id) return;
      const route = getSectorLanePath(entry.sectorId, targetId);
      if (!route) return;
      const watchIndex = route.indexOf(sector.id);
      if (watchIndex <= 0) return;
      const forecast = forecastRaidEntry(entry, route, watchIndex);
      if (!forecast || forecast.turns < 1 || forecast.turns > intelligence) return;
      const key = forecast.entryKey;
      if (!key) return;
      const warning = byKey[key];
      if (warning) {
        warning.shipCount += 1;
        warning.turns = Math.min(warning.turns, forecast.turns);
      } else {
        const pos = parseHexKey(key);
        byKey[key] = {
          key: key,
          row: pos.row,
          col: pos.col,
          turns: forecast.turns,
          shipCount: 1,
          fromSectorId: forecast.fromSectorId,
          fromSector: getSector(forecast.fromSectorId)
        };
      }
    });
  });
  return Object.keys(byKey).sort().map(function (key) { return byKey[key]; });
}

function getTotalHexes() {
  return CONFIG.sector.rows * CONFIG.sector.cols;
}

function formatSectorIndex(index) {
  return String(index).padStart(2, "0");
}

function formatRingLabel(ring) {
  return ring === 0 ? "CORE" : "RING " + ring;
}

function formatRingShort(ring) {
  return ring === 0 ? "CORE" : "R" + ring;
}

function getSectorRingLabel(sector) {
  return sector ? formatRingLabel(sector.ring) : "UNKNOWN";
}

/* ---------- systems / fleets / hexes ---------- */

function getSystem(id) {
  return state.systems.find(function (system) { return system.id === id; }) || null;
}

function getSystemAtHex(row, col, sectorId) {
  const activeSector = sectorId || state.ui.activeSector;
  return state.systems.find(function (system) {
    return system.sectorId === activeSector && system.row === row && system.col === col;
  }) || null;
}

function getStructureAt(row, col, sectorId) {
  const sector = getSector(sectorId || state.ui.activeSector);
  if (!sector || !sector.structures) return null;
  return sector.structures[hexKey(row, col)] || null;
}

/* Structures predate rival empires, so an owner-less structure belongs to
   the player. Rival strongholds carry their empire id. */
function isPlayerStructure(structure) {
  if (!structure) return false;
  return !structure.owner || structure.owner === "player";
}

/* A sector holds player presence when it has a player colony, a surface
   building, or any player orbital structure (including one still under
   construction). Rival colonies and structures do not count. This is the
   anchor for sector-name discovery: presence publishes the sector's own name
   and the names one lane out. */
function sectorHasPlayerPresence(sectorOrId) {
  const sector = typeof sectorOrId === "string" ? getSector(sectorOrId) : sectorOrId;
  if (!sector) return false;
  const structures = sector.structures || {};
  const keys = Object.keys(structures);
  for (let i = 0; i < keys.length; i += 1) {
    if (isPlayerStructure(structures[keys[i]])) return true;
  }
  return getSectorSystems(sector.id).some(function (system) {
    if (system.owner) return false;
    if (system.colonized) return true;
    return (system.slots || []).some(function (slot) { return !!slot; });
  });
}

/* A sector is charted once at least one of its hexes is in the player's
   atlas. Charting happens when a ship enters a hex, and the hex bookkeeping
   also counts a player fleet, colony or orbital structure, so holding ground
   always implies a chart. Rival assets never chart a hex for the player. */
function sectorHasCharts(sectorOrId) {
  const sector = typeof sectorOrId === "string" ? getSector(sectorOrId) : sectorOrId;
  if (!sector || !sector.id) return false;
  return getSectorChartedCount(sector.id) > 0;
}

/* Sector names are a lighter fog than hex charts. A name is known when one of
   your ships has charted the sector (or a player colony, building or orbital
   structure sits there), or when the sector is nearby: one lane from a
   charted sector or from player presence. Charting one sector therefore
   publishes its own name and the names one lane out, and the fog stops
   there: an uncharted, unnamed sector never names its own neighbours. */
function isSectorNameKnown(sectorOrId) {
  const sector = typeof sectorOrId === "string" ? getSector(sectorOrId) : sectorOrId;
  if (!sector) return false;
  if (sector.home || sectorHasCharts(sector) || sectorHasPlayerPresence(sector)) return true;
  return (sector.neighbors || []).some(function (neighborId) {
    const neighbor = getSector(neighborId);
    return sectorHasCharts(neighbor) || sectorHasPlayerPresence(neighbor);
  });
}

/* The label a screen may print for a sector. Every view asks this instead of
   reading sector.name directly, so the fog has a single source of truth. */
function getSectorLabel(sectorOrId) {
  const sector = typeof sectorOrId === "string" ? getSector(sectorOrId) : sectorOrId;
  if (!sector) return "Unknown sector";
  return isSectorNameKnown(sector) ? sector.name : "Unknown sector";
}

/* Rival dispatch text is stored with sector names baked in. A met empire can
   therefore carry the name of a sector the player has never reached; only
   names the fog allows may reach a screen, so the rest is neutralised. */
function getEmpireActionLabel(empire) {
  const fallback = "No recent movement";
  if (!empire || !empire.lastAction) return fallback;
  const text = empire.lastAction;
  const home = getSector(empire.sectorId);
  if (!home || isSectorNameKnown(home)) return text;
  return text.split(home.name).join("an uncharted sector");
}

/* Sector power readouts — the player's own POWER and any hostile power — are
   live telemetry, not a chart. They are published only while the player is
   active in the sector right now: a player ship sits there, or a colony,
   surface building or orbital structure holds it. A name, or a chart left
   behind after a visit, does not reveal who is there now. */
function isSectorPowerVisible(sectorOrId) {
  const sector = typeof sectorOrId === "string" ? getSector(sectorOrId) : sectorOrId;
  if (!sector) return false;
  if (!isSectorNameKnown(sector)) return false;
  if (getSectorFleetCount(sector.id) > 0) return true;
  return sectorHasPlayerPresence(sector);
}

function getStructureEmpire(structure) {
  if (!structure || isPlayerStructure(structure)) return null;
  return getEmpire(structure.owner);
}

function getPlayerStrongholds() {
  const out = [];
  if (!state || !state.galaxy) return out;
  state.galaxy.sectors.forEach(function (sector) {
    Object.keys(sector.structures || {}).forEach(function (key) {
      const structure = sector.structures[key];
      if (!structure || structure.type !== "stronghold" || structure.underConstruction) return;
      if (!isPlayerStructure(structure)) return;
      out.push({ sectorId: sector.id, key: key, structure: structure });
    });
  });
  return out;
}

function hasBuilderAt(row, col, sectorId) {
  return getFleetAt(row, col, sectorId).some(function (ship) {
    return ship.type === "builder";
  });
}

function hasOperationalGate(row, col, sectorId) {
  const structure = getStructureAt(row, col, sectorId);
  return !!structure && isPlayerStructure(structure) &&
    structure.type === "gate" && !structure.underConstruction;
}

function parseHexKey(key) {
  const parts = String(key || "").split(",");
  return {
    row: parseInt(parts[0], 10),
    col: parseInt(parts[1], 10)
  };
}

function getFleetAt(row, col, sectorId) {
  const sector = getSector(sectorId || state.ui.activeSector);
  if (!sector) return [];
  return sector.fleets[hexKey(row, col)] || [];
}

/* Where a hull is right now, by id. Used by the spaceport refit and repair
   orders, which act on a ship the player tapped in the fleet tab. */
function findShipLocation(shipId) {
  if (!state || !state.galaxy || !shipId) return null;
  const sectors = state.galaxy.sectors;
  for (let i = 0; i < sectors.length; i += 1) {
    const sector = sectors[i];
    const keys = Object.keys(sector.fleets || {});
    for (let k = 0; k < keys.length; k += 1) {
      const key = keys[k];
      const fleet = sector.fleets[key] || [];
      for (let s = 0; s < fleet.length; s += 1) {
        if (fleet[s] && fleet[s].id === shipId) {
          const pos = parseHexKey(key);
          return { sector: sector, sectorId: sector.id, key: key, row: pos.row, col: pos.col, ship: fleet[s] };
        }
      }
    }
  }
  return null;
}

function getFleetStats(ships) {
  return (ships || []).reduce(function (stats, ship) {
    const type = SHIP_TYPES[ship.type];
    if (!type) return stats;
    /* Only military hulls actually shoot, so the fleet ATK number must
       match combat rather than the display stats of science/builder hulls. */
    stats.attack += type.military ? type.attack : 0;
    stats.hull += getShipHull(ship);
    stats.hullMax += getShipHullMax(ship);
    stats.power += getShipPower(ship);
    stats.count += 1;
    return stats;
  }, { attack: 0, hull: 0, hullMax: 0, power: 0, count: 0 });
}

/* ---------- fleet icons ---------- */
/* A hex shows one badge for its whole fleet. When every hull is the same type
   the badge wears that ship's icon, so a corvette group, a survey ship and a
   builder read apart at a glance. A mixed hex falls back to the generic ship
   icon because no single hull represents it. */
function getFleetIconKey(ships) {
  const types = {};
  (ships || []).forEach(function (ship) {
    if (ship && SHIP_TYPES[ship.type]) types[ship.type] = true;
  });
  const keys = Object.keys(types);
  return keys.length === 1 ? keys[0] : SHIP_FLEET_ICON.id;
}

function getFleetIconEmoji(ships) {
  const key = getFleetIconKey(ships);
  if (key === SHIP_FLEET_ICON.id || !SHIP_TYPES[key]) return SHIP_FLEET_ICON.emoji;
  return SHIP_TYPES[key].emoji;
}

/* Screen readers get the same story the badge tells: both the total and the
   hull mix. Unknown hulls are ignored so a malformed ship cannot fake a type. */
function getFleetCompositionText(ships) {
  const counts = {};
  (ships || []).forEach(function (ship) {
    if (!ship || !SHIP_TYPES[ship.type]) return;
    counts[ship.type] = (counts[ship.type] || 0) + 1;
  });
  return SHIP_ORDER.filter(function (typeId) { return counts[typeId]; }).map(function (typeId) {
    const count = counts[typeId];
    const type = SHIP_TYPES[typeId];
    return count + " " + type.name.toLowerCase() + (count === 1 ? "" : "s");
  }).join(", ");
}

/* Research upkeep is paid every turn while a project is active. A tech can
   override the global default rate. */
function getTechEnergyUpkeep(id) {
  const tech = TECHS[id];
  if (!tech) return 0;
  if (typeof tech.energyUpkeep === "number") return tech.energyUpkeep;
  return CONFIG.research && typeof CONFIG.research.energyUpkeep === "number"
    ? CONFIG.research.energyUpkeep
    : 0;
}

function getEthic() {
  return state.ethic ? ETHICS[state.ethic] : null;
}

function hasTech(id) {
  if (!state || !state.tech || !Array.isArray(state.tech.done)) return false;
  return state.tech.done.indexOf(id) !== -1;
}

function completedTechCount() {
  return state && state.tech && Array.isArray(state.tech.done) ? state.tech.done.length : 0;
}

/* ---------- tech effect readers ---------- */

/* Effects a tech declares as a flat number are summed over every completed
   tech; effects that declare an absolute cap take the highest value. Both
   read through hasTech, so a bonus can never leak in before research. */
function sumTechBonus(key) {
  let total = 0;
  TECH_ORDER.forEach(function (id) {
    if (!hasTech(id)) return;
    const tech = TECHS[id];
    if (tech && typeof tech[key] === "number") total += tech[key];
  });
  return total;
}

function highestTechValue(key, fallback) {
  let best = typeof fallback === "number" ? fallback : 0;
  TECH_ORDER.forEach(function (id) {
    if (!hasTech(id)) return;
    const tech = TECHS[id];
    if (tech && typeof tech[key] === "number") best = Math.max(best, tech[key]);
  });
  return best;
}

/* One online Radar adds 1 + this bonus INTEL to its sector. */
function getRadarIntelBonus() {
  return sumTechBonus("radarBonus");
}

function getRadarIntelValue() {
  return 1 + getRadarIntelBonus();
}

/* Fleet jumps an operational gate accepts per turn. */
function getGateOpsPerGate() {
  const base = CONFIG.gates && typeof CONFIG.gates.baseOps === "number" ? CONFIG.gates.baseOps : 1;
  return Math.max(1, highestTechValue("gateOps", base));
}

/* Trade routes a single trading center may configure. */
function getTradeRouteCap() {
  const base = CONFIG.trade && typeof CONFIG.trade.baseRoutes === "number" ? CONFIG.trade.baseRoutes : 1;
  return Math.max(1, highestTechValue("tradeRoutes", base));
}

function getStrongholdAttackBonus() {
  return sumTechBonus("strongholdAttack");
}

function getStrongholdHullBonus() {
  return sumTechBonus("strongholdHull");
}

function getStrongholdRadiusBonus() {
  return sumTechBonus("strongholdRadius");
}

/* ---------- building levels ---------- */

/* Every building starts at level 1. A completed Building category tech
   raises the level it MAY be refitted to, up to the data file's maxLevel.
   Nothing upgrades by itself: the refit is a paid order on the colony
   screen (see getBuildingUpgradeCost and game/actions.js upgradeBuilding),
   and it must land on a level the colony's population already supports
   (getBuildingRefitPopulationReason in core/colony.js). */
function getBuildingMaxLevel(type) {
  const def = BUILDINGS[type];
  return def && typeof def.maxLevel === "number" ? def.maxLevel : 1;
}

function getBuildingUnlockedLevel(type) {
  let level = 1;
  TECH_ORDER.forEach(function (id) {
    if (!hasTech(id)) return;
    const tech = TECHS[id];
    if (!tech || tech.building !== type) return;
    if (typeof tech.buildingLevel === "number") level = Math.max(level, tech.buildingLevel);
  });
  return clamp(level, 1, getBuildingMaxLevel(type));
}

/* The level a built slot actually reports. Older slots without a level are
   level 1, and a slot can never sit above what the tech tree allows. */
function getBuildingLevel(slot) {
  if (!slot) return 1;
  const raw = typeof slot.level === "number" ? Math.floor(slot.level) : 1;
  return clamp(raw, 1, getBuildingMaxLevel(slot.type));
}

/* The shared facility table is the single source of truth for Power Plants
   and Mines. Support buildings (Lab, Embassy) keep the older output/perLevel
   pairing. */
function getFacilityLevelDef(level) {
  const levels = (CONFIG.economy && CONFIG.economy.facilities && CONFIG.economy.facilities.levels) || [];
  const lv = clamp(Math.floor(typeof level === "number" ? level : 1), 1, levels.length || 1);
  return levels[lv - 1] || { level: lv, name: "Level " + lv, minPopulation: 0, workers: 0, output: 0 };
}

function getBuildingFacilityLevelDef(type, level) {
  const def = BUILDINGS[type];
  if (!def || !def.facility) return null;
  return getFacilityLevelDef(level);
}

function getBuildingOutput(type, level) {
  const def = BUILDINGS[type];
  if (!def) return {};
  const lv = clamp(Math.floor(typeof level === "number" ? level : 1), 1, getBuildingMaxLevel(type));
  if (def.facility) {
    const levelDef = getBuildingFacilityLevelDef(type, lv);
    const output = {};
    if (levelDef && def.resource) output[def.resource] = levelDef.output;
    return output;
  }
  const output = Object.assign({}, def.output);
  const perLevel = def.perLevel || {};
  Object.keys(perLevel).forEach(function (key) {
    output[key] = (output[key] || 0) + perLevel[key] * (lv - 1);
  });
  return output;
}

/* Facility levels need different crews. Support buildings keep one worker. */
function getBuildingWorkers(type, level) {
  const def = BUILDINGS[type];
  if (!def) return 0;
  if (def.facility) {
    const levelDef = getBuildingFacilityLevelDef(type, level == null ? 1 : level);
    return levelDef ? levelDef.workers : 0;
  }
  return def.workers || 0;
}

/* A production facility is locked until the colony reaches this population.
   Support buildings have no minimum. */
function getBuildingMinPopulation(type, level) {
  const def = BUILDINGS[type];
  if (!def || !def.facility) return 0;
  const levelDef = getBuildingFacilityLevelDef(type, level == null ? 1 : level);
  return levelDef ? levelDef.minPopulation : 0;
}

function getBuildingLevelName(type, level) {
  const def = BUILDINGS[type];
  if (!def || !def.facility) return "";
  const levelDef = getBuildingFacilityLevelDef(type, level == null ? 1 : level);
  return levelDef ? levelDef.name : "";
}

/* "Half the value of the building itself": a share of its mineral build
   cost, rounded up so a 5 mineral Mine refits for 3. */
function getBuildingUpgradeCost(type) {
  const def = BUILDINGS[type];
  if (!def) return { minerals: 0 };
  const share = CONFIG.upgrades && typeof CONFIG.upgrades.buildingCostShare === "number"
    ? CONFIG.upgrades.buildingCostShare
    : 0.5;
  const base = (def.cost && def.cost.minerals) || 0;
  return { minerals: Math.max(1, Math.ceil(base * share)) };
}

function getBuildingUpkeep(type) {
  return BUILDINGS[type].energyUpkeep || 0;
}
