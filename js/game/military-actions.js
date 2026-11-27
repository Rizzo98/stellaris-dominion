/* ============================================================
   MILITARY ACTIONS — player patrol orders
   Patrol is a per-corvette stance anchored on a station. The corvette keeps
   its station and the coverage around it; when a hostile ship enters that
   radius the hull flies onto it when the turn resolves, fights in the
   hostile hex and returns once the fight is finished. Moving or jumping
   cancels the stance (and the station) in game/planet-nav.js.
   ============================================================ */

function setSelectedShipsPatrol(active) {
  if (state.phase !== "actions" || !state.ui.selectedHex) return;
  const sector = getCurrentSector();
  if (!sector) return;
  const pos = parseHexKey(state.ui.selectedHex);
  const fleet = getFleetAt(pos.row, pos.col, sector.id);
  const selected = fleet.filter(function (ship) {
    return state.ui.shipSelection.indexOf(ship.id) !== -1;
  });
  const military = selected.filter(function (ship) {
    const type = SHIP_TYPES[ship.type];
    return !!type && !!type.military;
  });
  if (!military.length) {
    toast("Select at least one corvette.");
    return;
  }

  let changed = 0;
  const stationKey = hexKey(pos.row, pos.col);
  military.forEach(function (ship) {
    if (active) {
      const wasPatrolling = !!ship.patrol;
      if (!wasPatrolling) changed += 1;
      ship.patrol = true;
      /* A fresh order anchors where the hull stands. A hull that is already
         patrolling keeps its station, even if it is away fighting. */
      if (!wasPatrolling || !ship.patrolHomeKey) {
        setShipPatrolStation(ship, sector.id, stationKey);
      }
      if (ship.path) {
        delete ship.path;
        delete ship.pathSectorId;
        delete ship.pathStops;
      }
    } else if (ship.patrol) {
      ship.patrol = false;
      clearShipPatrolStation(ship);
      changed += 1;
    }
  });

  if (!changed) {
    toast(active
      ? "The selected corvettes are already on patrol."
      : "The selected corvettes are not patrolling.");
    return;
  }

  renderAll();
  if (active) {
    const radius = (SHIP_TYPES[military[0].type].patrolRadius == null)
      ? ((CONFIG.military && CONFIG.military.patrolRadius) || 1)
      : SHIP_TYPES[military[0].type].patrolRadius;
    toast("Patrol ordered · " + military.length + " corvette" + (military.length === 1 ? "" : "s") +
      " · radius " + radius + (radius === 1 ? " hex" : " hexes") + " · intercepts hostiles in the zone.");
  } else {
    toast("Patrol stood down · " + military.length + " corvette" + (military.length === 1 ? "" : "s") + ".");
  }
}
