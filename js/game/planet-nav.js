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
    stops: [],
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

/* Refresh the gold preview line. While the journey is still being defined it
   stops at the last stop; the final leg is routed by the tap that ends the
   order, so a long press never doubles as the destination. */
function refreshMovePreview(move) {
  if (!move) return null;
  const stops = Array.isArray(move.stops) ? move.stops : [];
  const path = stops.length ? buildJourneyPath(move.from, stops) : null;
  move.previewPath = path && path.length ? path : null;
  move.previewDestination = path && path.length ? path[path.length - 1] : null;
  return move.previewPath;
}

function undoFleetMoveStop() {
  const move = state.ui.move;
  if (!move || !Array.isArray(move.stops) || !move.stops.length) return;
  move.stops.pop();
  refreshMovePreview(move);
  renderAll();
  toast(move.stops.length
    ? "Stop removed · " + move.stops.length + (move.stops.length === 1 ? " stop" : " stops") +
      " left. Tap a final hex when the journey is complete."
    : "Stop removed. Tap a final hex to order a direct route.");
}

/* A finished order gives every selected ship the same path. The path already
   runs through the stops in order; pathStops keeps their numbered markers and
   the roster's order chip readable while the ships travel. Nothing moves
   instantly: each hull advances along the route at its own speed when the turn
   ends. */
function orderFleetMove(move, path) {
  const moving = getMoveShips(move);
  if (!moving.length) {
    state.ui.move = null;
    renderAll();
    toast("No ships were available to move.");
    return;
  }
  const stops = Array.isArray(move.stops) ? move.stops.slice() : [];
  moving.forEach(function (ship) {
    ship.path = path.slice();
    ship.pathSectorId = move.sectorId;
    if (stops.length) {
      ship.pathStops = stops.slice();
    } else {
      delete ship.pathStops;
    }
    /* A ship leaving its station abandons patrol coverage. */
    ship.patrol = false;
    clearShipPatrolStation(ship);
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
    " · " + path.length + " hexes" +
    (stops.length ? " · " + stops.length + (stops.length === 1 ? " stop" : " stops") : "") +
    " · slowest ETA " + slowest + (slowest === 1 ? " turn." : " turns."));
}

/* A tap names the final hex and closes the journey. A tap on the last stop
   promotes that stop to the final destination, so a stop added by mistake can
   be confirmed without routing an extra leg back to it. */
function completeFleetMove(targetKey) {
  const move = state.ui.move;
  if (!move || state.phase !== "actions") return;
  if (move.sectorId !== state.ui.activeSector) {
    state.ui.move = null;
    renderAll();
    return;
  }
  const origin = parseHexKey(move.from);
  const target = parseHexKey(targetKey);
  if (!isInsideSector(target.row, target.col)) return;
  if (origin.row === target.row && origin.col === target.col) {
    toast("Choose a final hex other than the origin.");
    return;
  }
  const stops = Array.isArray(move.stops) ? move.stops.slice() : [];
  const stopIndex = stops.indexOf(targetKey);
  if (stopIndex !== -1) {
    if (stopIndex !== stops.length - 1) {
      toast("That hex is already stop " + (stopIndex + 1) +
        ". Tap a final hex after the last stop.");
      return;
    }
    stops.pop();
  }
  const path = buildJourneyPath(move.from, stops.concat([targetKey]));
  if (!path || !path.length) {
    toast("No route to that hex.");
    return;
  }
  move.stops = stops;
  orderFleetMove(move, path);
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
    delete ship.pathStops;
    ship.patrol = false;
    clearShipPatrolStation(ship);
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
    completeFleetMove(hexKey(row, col));
    return;
  }
  openHex(row, col, "world");
}