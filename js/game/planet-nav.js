/* ============================================================
   PLANET NAV — galaxy/sector navigation and fleet movement
   Opening sectors and hexes, sector tabs, ship selection, intra-sector
   movement and cross-sector gate jumps.
   ============================================================ */

/* A sector page only exists once its name is known. Clicking a node the
   player has never charted (and that is not next to anything charted or
   held) reveals nothing, not even the name. */
function canOpenSector(sectorOrId) {
  const sector = typeof sectorOrId === "string" ? getSector(sectorOrId) : sectorOrId;
  return !!sector && isSectorNameKnown(sector);
}

function openSectorView(sectorId) {
  if (state.phase !== "actions") return;
  const sector = getSector(sectorId);
  if (!sector) return;
  if (!canOpenSector(sector)) {
    toast("No charts for that sector yet. Send a ship to chart it.");
    return;
  }
  if (typeof closeSectorLayerMenu === "function") closeSectorLayerMenu();
  if (typeof closeGalaxyLayerMenu === "function") closeGalaxyLayerMenu();
  state.ui.activeSector = sector.id;
  state.ui.mapMode = "sector";
  state.ui.activeTab = "map";
  state.ui.move = null;
  state.ui.selectedHex = null;
  state.ui.selectedSystem = null;
  state.ui.selectedTab = "world";
  state.ui.shipSelection = [];
  els.planetScreen.classList.add("hidden");
  renderAll();
  els.main.scrollTop = 0;
}

function openGalaxyView() {
  if (typeof closeSectorLayerMenu === "function") closeSectorLayerMenu();
  if (typeof closeGalaxyLayerMenu === "function") closeGalaxyLayerMenu();
  state.ui.mapMode = "galaxy";
  state.ui.activeTab = "map";
  state.ui.move = null;
  state.ui.selectedHex = null;
  state.ui.selectedSystem = null;
  state.ui.selectedTab = "world";
  state.ui.shipSelection = [];
  els.planetScreen.classList.add("hidden");
  renderAll();
  scrollGalaxyToCurrentSector();
}

function openHex(row, col, tab) {
  if (state.phase !== "actions") return;
  if (!isInsideSector(row, col)) return;
  hideToast();
  const sector = getCurrentSector();
  const charted = isHexExplored(row, col, sector.id);
  const system = charted ? getSystemAtHex(row, col, sector.id) : null;
  state.ui.mapMode = "sector";
  state.ui.move = null;
  state.ui.selectedHex = hexKey(row, col);
  state.ui.selectedTab = tab === "fleet" ? "fleet" : "world";
  state.ui.selectedSystem = system ? system.id : null;
  state.ui.spaceportOpen = false;
  state.ui.shipSelection = [];
  if (system && system.colonized) system.completedNow = false;
  closeSheet();
  renderAll();
  els.planetScroll.scrollTop = 0;
  els.planetScreen.classList.remove("hidden");
}

function openPlanet(systemId) {
  const system = getSystem(systemId);
  if (!system) return;
  const sector = getSector(system.sectorId);
  if (sector) {
    sector.visited = true;
    state.ui.activeSector = sector.id;
  }
  state.ui.mapMode = "sector";
  openHex(system.row, system.col, "world");
}

function closePlanet() {
  state.ui.selectedHex = null;
  state.ui.selectedSystem = null;
  state.ui.selectedTab = "world";
  state.ui.spaceportOpen = false;
  state.ui.shipSelection = [];
  els.planetScreen.classList.add("hidden");
  renderMap();
  renderEmpireView();
}

function setSectorTab(tab) {
  if (state.phase !== "actions" || !state.ui.selectedHex) return;
  if (tab !== "world" && tab !== "fleet") return;
  state.ui.selectedTab = tab;
  renderPlanet();
  els.planetScroll.scrollTop = 0;
}

function toggleSpaceportMenu() {
  if (state.phase !== "actions" || !state.ui.selectedHex) return;
  state.ui.spaceportOpen = !state.ui.spaceportOpen;
  renderPlanet();
  const toggle = els.planetContent.querySelector("[data-spaceport-toggle]");
  if (toggle) {
    try {
      toggle.focus({ preventScroll: true });
    } catch (error) {
      toggle.focus();
    }
  }
}

function toggleShipSelection(shipId) {
  if (state.phase !== "actions" || !state.ui.selectedHex) return;
  const pos = parseHexKey(state.ui.selectedHex);
  const fleet = getFleetAt(pos.row, pos.col);
  if (!fleet.some(function (ship) { return ship.id === shipId; })) return;
  const index = state.ui.shipSelection.indexOf(shipId);
  if (index === -1) {
    state.ui.shipSelection.push(shipId);
  } else {
    state.ui.shipSelection.splice(index, 1);
  }
  renderPlanet();
}

function toggleAllShips() {
  if (state.phase !== "actions" || !state.ui.selectedHex) return;
  const pos = parseHexKey(state.ui.selectedHex);
  const fleet = getFleetAt(pos.row, pos.col);
  if (!fleet.length) return;
  const allSelected = fleet.every(function (ship) {
    return state.ui.shipSelection.indexOf(ship.id) !== -1;
  });
  state.ui.shipSelection = allSelected ? [] : fleet.map(function (ship) { return ship.id; });
  renderPlanet();
}

function beginFleetMove() {
  if (state.phase !== "actions" || !state.ui.selectedHex) return;
  const pos = parseHexKey(state.ui.selectedHex);
  const fleet = getFleetAt(pos.row, pos.col);
  const ids = state.ui.shipSelection.filter(function (id) {
    return fleet.some(function (ship) { return ship.id === id; });
  });
  if (!ids.length) {
    toast("Select at least one ship.");
    return;
  }
  state.ui.move = {
    sectorId: state.ui.activeSector,
    from: state.ui.selectedHex,
    ids: ids.slice(),
    previewPath: null,
    previewDestination: null
  };
  state.ui.shipSelection = [];
  state.ui.selectedHex = null;
  state.ui.selectedSystem = null;
  state.ui.selectedTab = "world";
  state.ui.activeTab = "map";
  els.planetScreen.classList.add("hidden");
  els.main.scrollTop = 0;
  renderAll();
}

function cancelFleetMove(returnToOrigin) {
  const move = state.ui.move;
  if (!move) return;
  state.ui.move = null;
  if (returnToOrigin && state.phase === "actions" && move.sectorId === state.ui.activeSector) {
    const pos = parseHexKey(move.from);
    openHex(pos.row, pos.col, "fleet");
  } else {
    renderAll();
  }
}

function getMoveShips(move) {
  if (!move) return [];
  const from = parseHexKey(move.from);
  return getFleetAt(from.row, from.col, move.sectorId).filter(function (ship) {
    return move.ids.indexOf(ship.id) !== -1;
  });
}

/* Confirming a route gives every selected ship the same path. They advance
   along it at their own speed when the turn ends; nothing moves instantly. */
function confirmFleetMove() {
  const move = state.ui.move;
  if (!move || state.phase !== "actions") return;
  if (move.sectorId !== state.ui.activeSector) {
    state.ui.move = null;
    renderAll();
    return;
  }
  const path = move.previewPath || [];
  if (!path.length) {
    toast("Tap a destination hex first.");
    return;
  }
  const moving = getMoveShips(move);
  if (!moving.length) {
    state.ui.move = null;
    renderAll();
    toast("No ships were available to move.");
    return;
  }

  moving.forEach(function (ship) {
    ship.path = path.slice();
    ship.pathSectorId = move.sectorId;
    /* A ship leaving its station abandons patrol coverage. */
    ship.patrol = false;
  });

  const slowest = moving.reduce(function (max, ship) {
    return Math.max(max, getPathEta(path.length, ship));
  }, 0);
  const count = moving.length;
  state.ui.move = null;
  state.ui.shipSelection = [];
  state.ui.activeTab = "map";
  renderAll();
  toast("Route ordered for " + count + (count === 1 ? " ship" : " ships") +
    " · " + path.length + " hexes · slowest ETA " + slowest + (slowest === 1 ? " turn." : " turns."));
}

function jumpFleetToSector(targetId) {
  if (state.phase !== "actions" || !state.ui.selectedHex) return;
  const fromSector = getCurrentSector();
  const target = getSector(targetId);
  if (!target || !fromSector || fromSector.neighbors.indexOf(target.id) === -1) {
    toast("No jump lane to that sector.");
    return;
  }

  const fromKey = state.ui.selectedHex;
  const pos = parseHexKey(fromKey);
  if (!hasOperationalGate(pos.row, pos.col, fromSector.id)) {
    toast("Intersector travel requires an operational gate in this hex.");
    return;
  }
  const fleet = getFleetAt(pos.row, pos.col);
  const ids = state.ui.shipSelection.filter(function (id) {
    return fleet.some(function (ship) { return ship.id === id; });
  });
  if (!ids.length) {
    toast("Select at least one ship to jump.");
    return;
  }

  const jumpCost = CONFIG.galaxy.jumpEnergyCost || 0;
  if (getSectorStock(fromSector.id, "energy") < jumpCost) {
    toast("Not enough energy in " + fromSector.name + " for the jump (" + jumpCost + " ⚡).");
    return;
  }

  /* Gates spend jump operations. Every operational gate in the sector allows
     getGateOpsPerGate() fleets per turn; Gate Throughput techs raise it. */
  const gateOps = getSectorGateOps(fromSector.id);
  if (gateOps.left <= 0) {
    toast("Every gate in " + fromSector.name + " has used its " + gateOps.cap +
      (gateOps.cap === 1 ? " jump op" : " jump ops") + " this turn. End the turn to reset.");
    return;
  }

  const moving = fleet.filter(function (ship) { return ids.indexOf(ship.id) !== -1; });
  const remaining = fleet.filter(function (ship) { return ids.indexOf(ship.id) === -1; });
  if (remaining.length) {
    fromSector.fleets[fromKey] = remaining;
  } else {
    delete fromSector.fleets[fromKey];
  }

  addSectorStock(fromSector.id, "energy", -jumpCost);
  consumeGateOp(fromSector.id);
  moving.forEach(function (ship) {
    delete ship.path;
    delete ship.pathSectorId;
    ship.patrol = false;
  });

  /* The destination is the port facing the origin sector, not a generic
     centre hex. Use the shared charting path so a site on the landing hex
     is discovered and announced like any other newly charted hex. */
  const landingKey = getLandingHexFor(target, fromSector.id);
  const landingPos = parseHexKey(landingKey);
  markHexExplored(landingPos.row, landingPos.col, target.id);
  target.fleets[landingKey] = (target.fleets[landingKey] || []).concat(moving);

  state.ui.activeSector = target.id;
  state.ui.mapMode = "sector";
  state.ui.move = null;
  state.ui.shipSelection = [];
  state.ui.activeTab = "map";
  openHex(landingPos.row, landingPos.col, "fleet");
  toast("Jumped to " + target.name + " · −" + jumpCost + " ⚡ from " + fromSector.name + " · " +
    moving.length + (moving.length === 1 ? " ship landed" : " ships landed") +
    " at " + (landingPos.row + 1) + ":" + (landingPos.col + 1) + ".");
}

function handleHexTap(row, col) {
  if (state.phase !== "actions") return;
  if (!isInsideSector(row, col)) return;
  if (state.ui.move) {
    if (state.ui.move.sectorId !== state.ui.activeSector) {
      state.ui.move = null;
      renderAll();
      return;
    }
    const origin = parseHexKey(state.ui.move.from);
    if (origin.row === row && origin.col === col) {
      toast("Choose a destination other than the origin hex.");
      return;
    }
    const path = findHexPath(origin.row, origin.col, row, col);
    if (!path || !path.length) {
      toast("No route to that hex.");
      return;
    }
    state.ui.move.previewPath = path;
    state.ui.move.previewDestination = hexKey(row, col);
    renderAll();
    return;
  }
  openHex(row, col, "world");
}