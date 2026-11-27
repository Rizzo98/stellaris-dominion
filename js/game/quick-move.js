/* ============================================================
   QUICK MOVE — long press a hex to send one of the ships stationed there
   The gesture layer (js/ui/long-press.js) resolves the hex and calls in
   here. A hex with one ship skips the picker and enters the normal route
   order straight away; a hex with several ships opens the picker first.
   Either way the map then owns the gesture: tap a hex to order the final
   destination, or hold hexes to add ordered stops before that final tap.
   ============================================================ */

/* Handle one long press on a sector-map hex. Returning false declines the
   gesture: the click that follows is left alone, so a tap still does what a
   tap always did. With a route order pending, the hold adds an ordered stop
   instead; the release click is swallowed, so the player still has to tap a
   final hex to close the journey. */
function handleHexLongPress(row, col) {
  if (state.phase !== "actions") return false;
  if (state.ui.mapMode !== "sector") return false;
  if (!isInsideSector(row, col)) return false;

  if (state.ui.move) return addFleetMoveStop(row, col);

  const sector = getCurrentSector();
  if (!sector) return false;
  const ships = getFleetAt(row, col, sector.id).slice();
  if (!ships.length) {
    toast("No ships stationed in this hex. Hold a fleet to move one.");
    return true;
  }

  const key = hexKey(row, col);
  if (ships.length === 1) {
    startQuickMove(ships[0].id, key);
    return true;
  }
  openQuickMoveSheet(ships, key, sector.id);
  return true;
}

/* One completed hold while a route is being planned appends that hex as the
   next stop. The route is re-routed from the previous stop, so the displayed
   line and the ordered path both visit the stops in the order they were set. */
function addFleetMoveStop(row, col) {
  const move = state.ui.move;
  if (!move) return false;
  if (move.sectorId !== state.ui.activeSector) return false;
  const key = hexKey(row, col);
  if (key === move.from) {
    toast("The origin hex is the start of the journey.");
    return true;
  }
  if (!Array.isArray(move.stops)) move.stops = [];
  const existing = move.stops.indexOf(key);
  if (existing !== -1) {
    toast("That hex is already stop " + (existing + 1) + ". Choose another hex.");
    return true;
  }
  const stops = move.stops.concat([key]);
  const path = buildJourneyPath(move.from, stops);
  if (!path || !path.length) {
    toast("No route through that hex.");
    return true;
  }
  move.stops = stops;
  move.previewPath = path;
  move.previewDestination = path[path.length - 1];
  renderAll();
  toast("Stop " + stops.length + " added · tap a final hex to order the journey.");
  return true;
}

/* Hand one ship to the existing movement flow. beginFleetMove() validates the
   selection against the hex, clears the dossier and paints the move banner,
   so the quick path and the fleet tab share one route-order pipeline. */
function startQuickMove(shipId, hexKeyValue) {
  if (state.phase !== "actions") return false;
  if (typeof hexKeyValue !== "string" || !hexKeyValue) return false;
  const sector = getCurrentSector();
  if (!sector) return false;
  const pos = parseHexKey(hexKeyValue);
  if (!isInsideSector(pos.row, pos.col)) return false;

  const ship = getFleetAt(pos.row, pos.col, sector.id).filter(function (candidate) {
    return candidate.id === shipId;
  })[0];
  if (!ship) {
    toast("That ship is no longer in this hex.");
    return false;
  }

  state.ui.activeSector = sector.id;
  state.ui.mapMode = "sector";
  state.ui.selectedHex = hexKeyValue;
  state.ui.shipSelection = [ship.id];
  beginFleetMove();
  if (state.ui.move) toast(ship.name + " — tap a final hex, or hold hexes to add stops.");
  return true;
}

/* One row in the quick-move sheet was tapped. The sheet remembers the hex it
   was opened for, so the picker never has to fight the current selection. */
function selectQuickMoveShip(shipId) {
  const sheet = state.ui.sheet;
  if (!sheet || sheet.kind !== "quick-move" || !sheet.hexKey) return false;
  const hexKeyValue = sheet.hexKey;
  closeSheet();
  return startQuickMove(shipId, hexKeyValue);
}
