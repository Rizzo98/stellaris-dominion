/* ============================================================
   PLAYER ACTIONS — colonise, build, population upkeep and research
   These functions validate a choice, mutate state and repaint.
   ============================================================ */

function colonizeSystem(systemId) {
  if (state.phase !== "actions") return;
  const system = getSystem(systemId);
  if (!system) return;
  const reason = getColonizeBlockReason(system);
  if (reason) {
    toast(reason);
    return;
  }
  /* Colonisation is paid by the sector that gains the world, so a new
     frontier must be supplied by trade before it can be settled. */
  if (!spendSectorCost(system.sectorId, { minerals: CONFIG.colonizeCost.minerals })) {
    toast("Not enough minerals.");
    return;
  }
  state.resources.influence -= CONFIG.colonizeCost.influence;
  system.colonized = true;
  system.foundedTurn = state.turn;
  system.population = CONFIG.population.colonyStart;
  system.slots = createPlanetSlots(system);
  system.unlockedBonusSlots = 0;
  system.populationUpkeep = { housing: 0, sustenance: 0 };
  system.growthProgress = 0;
  system.completedNow = false;
  markHexExplored(system.row, system.col, system.sectorId);
  state.ui.selectedHex = hexKey(system.row, system.col);
  state.ui.selectedSystem = system.id;
  state.ui.selectedTab = "world";
  state.ui.shipSelection = [];
  renderAll();
  els.planetScroll.scrollTop = 0;
  els.planetScreen.classList.remove("hidden");
  toast("Colony founded on " + system.name + ".");
}

function buildInSlot(systemId, slotIndex, type) {
  if (state.phase !== "actions") return;
  const system = getSystem(systemId);
  const def = BUILDINGS[type];
  if (!system || !def || !system.colonized) return;
  if (!isSlotBuildable(system, slotIndex)) return;
  if (getSectorStock(system.sectorId, "minerals") < def.cost.minerals) {
    toast("Not enough minerals in " + (getSector(system.sectorId) || { name: "this sector" }).name + ".");
    return;
  }
  spendSectorCost(system.sectorId, { minerals: def.cost.minerals });
  /* New construction already carries every researched level: the refit button
     exists for the buildings that were standing before the tech. */
  const builtLevel = getBuildingUnlockedLevel(type);
  system.slots[slotIndex] = {
    type: type,
    level: builtLevel,
    underConstruction: true
  };
  system.completedNow = false;
  closeSheet();
  renderAll();
  const workers = getBuildingWorkers(type);
  toast(def.name + " under construction" + (builtLevel > 1 ? " at LVL " + builtLevel : "") +
    ". Online next turn" +
    (workers ? " — it needs " + workers + (workers === 1 ? " worker." : " workers.") : "."));
}

/* Bonus slots are opened in order. The planet was generated with a fixed
   number of them; the player pays energy + minerals to make the next one
   buildable. */
function unlockPlanetSlot(systemId, slotIndex) {
  if (state.phase !== "actions") return;
  const system = getSystem(systemId);
  if (!system) return;
  const reason = getSlotUnlockBlockReason(system, slotIndex);
  if (reason) {
    toast(reason);
    return;
  }
  const cost = getSlotUnlockCost(system);
  if (!spendSectorCost(system.sectorId, cost)) {
    toast("Not enough resources in this sector.");
    return;
  }
  system.unlockedBonusSlots = getUnlockedBonusSlots(system) + 1;
  system.completedNow = false;
  renderAll();
  toast("Bonus building slot opened on " + system.name + ".");
}

/* A completed tech only raises the level a building MAY be refitted to.
   This order is the only thing that changes a standing building, and it is
   priced at half the building's own build cost, paid by its sector. */
function upgradeBuilding(systemId, slotIndex) {
  if (state.phase !== "actions") return false;
  const system = getSystem(systemId);
  if (!system || !system.colonized) return false;
  const slot = (system.slots || [])[slotIndex];
  if (!slot || slot.underConstruction) return false;
  const def = BUILDINGS[slot.type];
  if (!def) return false;
  const level = getBuildingLevel(slot);
  const unlocked = getBuildingUnlockedLevel(slot.type);
  if (level >= unlocked) {
    toast("No researched refit is waiting for this " + def.name + ".");
    renderAll();
    return false;
  }
  const cost = getBuildingUpgradeCost(slot.type);
  const sector = getSector(system.sectorId);
  const stock = getSectorStock(system.sectorId, "minerals");
  if (stock < cost.minerals) {
    toast("Need " + cost.minerals + " minerals in " + (sector ? sector.name : "this sector") +
      " for the refit (" + formatAmount(Math.max(0, stock)) + " held).");
    renderAll();
    return false;
  }
  spendSectorCost(system.sectorId, cost);
  slot.level = level + 1;
  system.completedNow = false;
  renderAll();
  toast(def.name + " refitted to level " + slot.level + " · −" + cost.minerals + " ⛏.");
  return true;
}

/* Spaceport refits. A researched ship tech does not touch a standing hull;
   the player orders the refit while the ship sits in a sector that holds an
   operational spaceport. Every waiting level is installed in one order. */
function upgradeShip(shipId) {
  if (state.phase !== "actions") return false;
  const location = findShipLocation(shipId);
  if (!location) return false;
  const sectorId = location.sectorId;
  const ship = location.ship;
  const reason = getShipRefitBlockReason(ship, sectorId);
  if (reason) {
    toast(reason);
    if (state.ui.selectedHex) renderPlanet();
    return false;
  }
  const pending = getShipPendingUpgrades(ship);
  const cost = getShipRefitCost(ship);
  if (!spendSectorCost(sectorId, { minerals: cost.minerals })) {
    toast("Not enough minerals for the refit.");
    return false;
  }
  const hullBefore = getShipHull(ship);
  const maxBefore = getShipHullMax(ship);
  const upgrades = ensureShipUpgrades(ship);
  pending.forEach(function (entry) {
    upgrades[entry.stat] = entry.to;
  });
  /* New plating arrives fitted: a hull refit raises the health pool by the
     same amount it raises the maximum. */
  const maxAfter = getShipHullMax(ship);
  ship.hull = clamp(hullBefore + (maxAfter - maxBefore), 1, maxAfter);
  if (state.ui.selectedHex) {
    renderPlanet();
    renderMap();
    renderTopbar();
  } else {
    renderAll();
  }
  const stats = pending.map(function (entry) {
    return SHIP_UPGRADE_STAT_META[entry.stat].short + " L" + entry.to;
  }).join(" · ");
  toast(ship.name + " refitted · " + stats + " · −" + cost.minerals + " ⛏.");
  return true;
}

/* Emergency repair. The spaceport's free slow repair still ticks every
   turn; this order tops a hull up now for minerals. */
function repairShip(shipId) {
  if (state.phase !== "actions") return false;
  const location = findShipLocation(shipId);
  if (!location) return false;
  const sectorId = location.sectorId;
  const ship = location.ship;
  const reason = getShipRepairBlockReason(ship, sectorId);
  if (reason) {
    toast(reason);
    if (state.ui.selectedHex) renderPlanet();
    return false;
  }
  const cost = getShipRepairCost(ship);
  if (!spendSectorCost(sectorId, { minerals: cost.minerals })) {
    toast("Not enough minerals for the repair.");
    return false;
  }
  ship.hull = getShipHullMax(ship);
  if (state.ui.selectedHex) {
    renderPlanet();
    renderMap();
    renderTopbar();
  } else {
    renderAll();
  }
  toast(ship.name + " repaired · +" + cost.hull + " 🛡 · −" + cost.minerals + " ⛏.");
  return true;
}

/* The population menu's two steppers. Housing is bought with minerals,
   sustenance with energy, and both are standing upkeep bills paid by the
   colony's sector every turn. A housing cut is refused while it would leave
   more people than houses: housing is the hard cap. */
function adjustPopulationUpkeep(systemId, axis, delta) {
  if (state.phase !== "actions") return false;
  const system = getSystem(systemId);
  if (!system || !system.colonized) return false;
  const reason = getPopulationUpkeepChangeReason(system, axis, delta);
  if (reason) {
    toast(reason);
    if (typeof refreshPopulationSheet === "function") refreshPopulationSheet();
    return false;
  }
  const policy = getPopulationPolicy(system);
  const step = axis === "housing" ? getPopulationHousingUpkeepStep() : 1;
  const max = axis === "housing" ? getMaxHousingUpkeep(system) : getMaxSustenanceUpkeep(system);
  policy[axis] = clamp(policy[axis] + (delta < 0 ? -step : step), 0, max);
  renderAll();
  if (typeof refreshPopulationSheet === "function") refreshPopulationSheet();
  return true;
}

/* Space structures are built by a builder in an empty hex. They take one
   turn like colony buildings; only one structure fits in a hex. */
function buildStructure(type) {
  if (state.phase !== "actions" || !state.ui.selectedHex) return;
  const def = STRUCTURE_TYPES[type];
  if (!def) return;
  const sector = getCurrentSector();
  if (!sector) return;
  const pos = parseHexKey(state.ui.selectedHex);
  if (!isInsideSector(pos.row, pos.col)) return;

  const system = getSystemAtHex(pos.row, pos.col, sector.id);
  if (system) {
    toast("Builders can only build in hexes without a planet.");
    return;
  }
  if (!hasBuilderAt(pos.row, pos.col, sector.id)) {
    toast("A builder must be in this hex.");
    return;
  }
  if (getStructureAt(pos.row, pos.col, sector.id)) {
    toast("This hex already has a structure.");
    return;
  }
  const cost = def.cost.minerals || 0;
  if (getSectorStock(sector.id, "minerals") < cost) {
    toast("Not enough minerals in " + sector.name + ".");
    return;
  }

  spendSectorCost(sector.id, { minerals: cost });
  const key = hexKey(pos.row, pos.col);
  sector.structures[key] = {
    type: type,
    owner: "player",
    underConstruction: true,
    startedTurn: state.turn,
    key: key,
    sectorId: sector.id,
    /* A new stronghold launches at the full player maximum, so stronghold
       hull techs never leave a fresh platform looking damaged. */
    hull: type === "stronghold"
      ? getStructureHullMax({ type: "stronghold", owner: "player" })
      : undefined
  };
  if (def.trade) {
    sector.structures[key].trade = { targetSectorId: null, energy: 0, minerals: 0 };
  }
  markHexExplored(pos.row, pos.col, sector.id);
  renderAll();
  toast(def.name + " under construction. Online next turn.");
}

/* Trading center controls. The route is saved immediately; it ships at the
   end of the turn only while the gate link is valid. */
function setTradingCenterTargetAt(sectorId, key, targetSectorId, routeIndex) {
  if (state.phase !== "actions") return false;
  const result = setTradingCenterTarget(sectorId, key, targetSectorId, routeIndex);
  if (!result.ok) {
    toast(result.reason);
    renderPlanet();
    return false;
  }
  renderAll();
  if (result.cleared) {
    toast("Trade route cleared.");
  } else {
    toast("Trade route set to " + result.target.name + ".");
  }
  return true;
}

function adjustTradingCenterAmountAt(sectorId, key, resource, delta, routeIndex) {
  if (state.phase !== "actions") return false;
  const result = adjustTradingCenterAmount(sectorId, key, resource, delta, routeIndex);
  if (!result.ok) {
    toast(result.reason);
    return false;
  }
  renderAll();
  return true;
}

function clearTradingCenterRouteAt(sectorId, key, routeIndex) {
  if (state.phase !== "actions") return false;
  const result = clearTradingCenterRoute(sectorId, key, routeIndex);
  if (!result.ok) {
    toast(result.reason);
    return false;
  }
  renderAll();
  toast("Trade route cleared.");
  return true;
}

/* Spaceports are the only shipyards. A ship is laid down now and launches
   into the spaceport hex after its build time (one turn for every ship). */
function buildShipAtSpaceport(typeId) {
  if (state.phase !== "actions" || !state.ui.selectedHex) return;
  const sector = getCurrentSector();
  if (!sector) return;
  const pos = parseHexKey(state.ui.selectedHex);
  if (!isInsideSector(pos.row, pos.col)) return;

  const structure = getStructureAt(pos.row, pos.col, sector.id);
  if (!structure || !isPlayerStructure(structure) ||
      structure.type !== "spaceport" || structure.underConstruction) {
    toast("An operational spaceport is required to build ships.");
    return;
  }
  const type = SHIP_TYPES[typeId];
  if (!type) return;
  const cost = type.cost ? type.cost.minerals : 0;
  if (getSectorStock(sector.id, "minerals") < cost) {
    toast("Not enough minerals in " + sector.name + ".");
    return;
  }

  const buildTime = Math.max(1, type.buildTime || 1);
  spendSectorCost(sector.id, { minerals: cost });
  state.shipSerial = (state.shipSerial || 0) + 1;
  /* A hull laid down now launches with every researched refit already
     installed; older hulls catch up in the fleet drydock. */
  const ship = createShip(typeId, {
    id: "ship-" + state.runId + "-built-" + state.shipSerial,
    name: type.name + " " + state.shipSerial,
    owner: "player",
    upgrades: getShipResearchedLevels(typeId)
  });
  structure.queue = structure.queue || [];
  structure.queue.push({
    ship: ship,
    orderedTurn: state.turn,
    readyTurn: state.turn + buildTime
  });
  markHexExplored(pos.row, pos.col, sector.id);
  renderAll();
  toast(type.name + " laid down. " + (buildTime === 1 ? "Ready next turn." : "Ready in " + buildTime + " turns."));
}

function investResearchStock() {
  if (!state.tech.active) return;
  const id = state.tech.active;
  const tech = TECHS[id];
  const current = state.tech.progress[id] || 0;
  const need = Math.max(0, tech.cost - current);
  const available = Math.max(0, state.resources.research);
  const spend = Math.min(need, available);
  state.resources.research -= spend;
  state.tech.progress[id] = current + spend;
  if (state.tech.progress[id] >= tech.cost) {
    completeTech(id);
  }
}

function completeTech(id) {
  if (hasTech(id)) return;
  const tech = TECHS[id];
  state.tech.progress[id] = tech.cost;
  state.tech.done.push(id);
  if (state.tech.active === id) state.tech.active = null;
  if (tech.exclusive && !state.tech.exclusiveChoice) state.tech.exclusiveChoice = id;
  /* Strongholds are static platforms, so a hull tech bolts its new plating on
     immediately instead of leaving every standing platform looking damaged.
     Ship and building refits stay manual orders. */
  if (typeof tech.strongholdHull === "number" && tech.strongholdHull > 0) {
    getPlayerStrongholds().forEach(function (entry) {
      const structure = entry.structure;
      if (!structure || structure.underConstruction) return;
      structure.hull = clamp(getStructureHull(structure) + tech.strongholdHull, 0, getStructureHullMax(structure));
    });
  }
  if (id === "ascension") {
    endGame("ascension");
    return;
  }
  toast("Researched: " + tech.name + ".");
}

function startResearch(id) {
  if (state.phase !== "actions") return;
  const tech = TECHS[id];
  if (!tech || hasTech(id)) return;
  const lockReason = techLockReason(id);
  if (lockReason) {
    toast(lockReason);
    return;
  }
  if (tech.exclusive && !state.tech.exclusiveChoice) {
    state.tech.exclusiveChoice = id;
  }
  state.tech.active = id;
  investResearchStock();
  if (state.phase === "ended") return;
  renderAll();
  if (!hasTech(id)) {
    toast("Research focus: " + tech.name + ".");
  }
}