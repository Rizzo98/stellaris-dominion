/* ============================================================
   QUICK MOVE — long press a hex to send one of the ships stationed there
   The gesture layer (js/ui/long-press.js) resolves the hex and calls in
   here. A hex with one ship skips the picker and enters the normal route
   order straight away; a hex with several ships opens the picker first.
   Either way the map then owns the gesture: tap a destination, preview the
   route and confirm it with the existing move banner.
   ============================================================ */

/* Handle one long press on a sector-map hex. Returning false declines the
   gesture: the click that follows is left alone, so a tap still does what a
   tap always did. A pending route order is the important case, because the
   next tap belongs to the destination picker. */
function handleHexLongPress(row, col) {
  if (state.phase !== "actions") return false;
  if (state.ui.mapMode !== "sector") return false;
  if (state.ui.move) return false;
  if (!isInsideSector(row, col)) return false;

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
  if (state.ui.move) toast(ship.name + " — tap a destination hex.");
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
