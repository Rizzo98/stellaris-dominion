/* ============================================================
   MILITARY ACTIONS — player patrol orders
   Patrol is a per-corvette stance. A patrolling corvette stays in its hex,
   attacks hostile ships within its radius when the turn resolves, and
   protects the hexes in that radius from raids. Moving or jumping with a
   patrolling ship cancels the stance in game/planet-nav.js.
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
  military.forEach(function (ship) {
    if (active) {
      if (!ship.patrol) changed += 1;
      ship.patrol = true;
      if (ship.path) {
        delete ship.path;
        delete ship.pathSectorId;
      }
    } else if (ship.patrol) {
      ship.patrol = false;
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
      " · radius " + radius + (radius === 1 ? " hex" : " hexes") + " · routes cancelled.");
  } else {
    toast("Patrol stood down · " + military.length + " corvette" + (military.length === 1 ? "" : "s") + ".");
  }
}
