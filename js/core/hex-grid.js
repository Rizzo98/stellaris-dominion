/* ============================================================
   HEX GRID — neighbours, fog of war and exploration
   Odd-row offset hex grid inside one sector, plus per-sector
   explored-cell bookkeeping.
   ============================================================ */

function isInsideSector(row, col) {
  return row >= 0 && row < CONFIG.sector.rows && col >= 0 && col < CONFIG.sector.cols;
}

/* ---------- sector map geometry ---------- */
/* The odd rows are shifted right by half a hex. Map rendering and the
   landing-lane geometry both read these two helpers, so a config change
   moves the graphics and the lane ports together. */
function getSectorHexCenter(row, col) {
  const size = CONFIG.sector.hexSize;
  const width = Math.sqrt(3) * size;
  const totalWidth = CONFIG.sector.cols * width + width / 2;
  const margin = (CONFIG.sector.mapWidth - totalWidth) / 2;
  return {
    x: margin + width / 2 + col * width + (row % 2 === 1 ? width / 2 : 0),
    y: CONFIG.sector.mapPaddingTop + size + row * CONFIG.sector.hexRowGap
  };
}

function getSectorMapCenter() {
  return {
    x: CONFIG.sector.mapWidth / 2,
    y: (CONFIG.sector.mapPaddingTop +
      CONFIG.sector.hexSize * 2 +
      (CONFIG.sector.rows - 1) * CONFIG.sector.hexRowGap +
      CONFIG.sector.mapPaddingBottom) / 2
  };
}

/* Every perimeter hex is a possible lane landing. Opposite hexes are paired
   through the map centre: if a ship leaves A toward B and lands on a port in
   B, the return lane uses the mirrored port in A. The array is built once
   because it only depends on CONFIG.sector. */
let sectorLandingSlotCache = null;

function getSectorLandingSlots() {
  if (sectorLandingSlotCache) return sectorLandingSlotCache;
  const center = getSectorMapCenter();
  const slots = [];
  for (let row = 0; row < CONFIG.sector.rows; row += 1) {
    for (let col = 0; col < CONFIG.sector.cols; col += 1) {
      const border = row === 0 || row === CONFIG.sector.rows - 1 ||
        col === 0 || col === CONFIG.sector.cols - 1;
      if (!border) continue;
      const point = getSectorHexCenter(row, col);
      slots.push({
        id: hexKey(row, col),
        key: hexKey(row, col),
        row: row,
        col: col,
        angle: Math.atan2(point.y - center.y, point.x - center.x),
        oppositeKey: null
      });
    }
  }
  slots.forEach(function (slot) {
    const point = getSectorHexCenter(slot.row, slot.col);
    const oppositeX = center.x * 2 - point.x;
    const oppositeY = center.y * 2 - point.y;
    const partner = slots.find(function (candidate) {
      const candidatePoint = getSectorHexCenter(candidate.row, candidate.col);
      return Math.abs(candidatePoint.x - oppositeX) < 0.01 &&
        Math.abs(candidatePoint.y - oppositeY) < 0.01;
    });
    slot.oppositeKey = partner ? partner.key : null;
  });
  sectorLandingSlotCache = slots.filter(function (slot) {
    return !!slot.oppositeKey;
  });
  return sectorLandingSlotCache;
}

function getSectorLandingSlot(key) {
  return getSectorLandingSlots().find(function (slot) {
    return slot.key === key;
  }) || null;
}

function getNeighbors(row, col) {
  const dirs = row % 2 === 1
    ? [[0, -1], [0, 1], [-1, 0], [-1, 1], [1, 0], [1, 1]]
    : [[0, -1], [0, 1], [-1, -1], [-1, 0], [1, -1], [1, 0]];
  const out = [];
  dirs.forEach(function (dir) {
    const nr = row + dir[0];
    const nc = col + dir[1];
    if (isInsideSector(nr, nc)) out.push([nr, nc]);
  });
  return out;
}

function hexKey(row, col) {
  return row + "," + col;
}

/* Odd-r offset hexes (odd rows shifted right). Cube coordinates make
   distance and radius queries exact, which is what patrols need. */
function hexToCube(row, col) {
  const x = col - (row - (row & 1)) / 2;
  const z = row;
  return { x: x, y: -x - z, z: z };
}

function hexDistance(aRow, aCol, bRow, bCol) {
  const a = hexToCube(aRow, aCol);
  const b = hexToCube(bRow, bCol);
  return Math.max(
    Math.abs(a.x - b.x),
    Math.abs(a.y - b.y),
    Math.abs(a.z - b.z)
  );
}

/* Every in-sector cell within 'radius' steps, including the origin.
   Returned as [row, col] pairs ordered by distance, then row, then col. */
function hexesWithinRadius(row, col, radius) {
  const center = hexToCube(row, col);
  const limit = Math.max(0, Math.floor(radius || 0));
  const cells = [];
  for (let dx = -limit; dx <= limit; dx += 1) {
    for (let dz = -limit; dz <= limit; dz += 1) {
      const dy = -dx - dz;
      if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) > limit) continue;
      const nextRow = center.z + dz;
      const nextCol = center.x + dx + (nextRow - (nextRow & 1)) / 2;
      if (!isInsideSector(nextRow, nextCol)) continue;
      cells.push({
        row: nextRow,
        col: nextCol,
        distance: hexDistance(row, col, nextRow, nextCol)
      });
    }
  }
  cells.sort(function (a, b) {
    if (a.distance !== b.distance) return a.distance - b.distance;
    if (a.row !== b.row) return a.row - b.row;
    return a.col - b.col;
  });
  return cells.map(function (cell) { return [cell.row, cell.col]; });
}

/* Shortest route through the 24-cell sector grid. Returns the hex keys to
   enter, in order, excluding the origin. Returns null when either end is
   outside the sector. The grid is small enough for a plain BFS. */
function findHexPath(fromRow, fromCol, toRow, toCol) {
  if (!isInsideSector(fromRow, fromCol) || !isInsideSector(toRow, toCol)) return null;
  const startKey = hexKey(fromRow, fromCol);
  const targetKey = hexKey(toRow, toCol);
  if (startKey === targetKey) return [];

  const queue = [[fromRow, fromCol]];
  const visited = new Set([startKey]);
  const cameFrom = {};
  let head = 0;
  while (head < queue.length) {
    const current = queue[head];
    head += 1;
    const neighbors = getNeighbors(current[0], current[1]);
    for (let i = 0; i < neighbors.length; i += 1) {
      const next = neighbors[i];
      const nextKey = hexKey(next[0], next[1]);
      if (visited.has(nextKey)) continue;
      visited.add(nextKey);
      cameFrom[nextKey] = hexKey(current[0], current[1]);
      if (nextKey === targetKey) {
        const path = [];
        let cursor = targetKey;
        while (cursor && cursor !== startKey) {
          path.unshift(cursor);
          cursor = cameFrom[cursor];
        }
        return path;
      }
      queue.push(next);
    }
  }
  return null;
}

/* A journey is an ordered list of hexes: the stops the player set and, last,
   the final destination. Each leg is routed independently, so the full path
   reaches every stop in the order it was added. Returns null when a leg
   cannot be routed. */
function buildJourneyPath(fromKey, targetKeys) {
  const origin = parseHexKey(fromKey);
  if (!isInsideSector(origin.row, origin.col)) return null;
  const targets = Array.isArray(targetKeys) ? targetKeys : [];
  if (!targets.length) return null;
  const path = [];
  let cursor = origin;
  for (let i = 0; i < targets.length; i += 1) {
    const target = parseHexKey(targets[i]);
    if (!isInsideSector(target.row, target.col)) return null;
    if (target.row === cursor.row && target.col === cursor.col) continue;
    const leg = findHexPath(cursor.row, cursor.col, target.row, target.col);
    if (!leg) return null;
    leg.forEach(function (key) { path.push(key); });
    cursor = target;
  }
  return path;
}

function markHexExplored(row, col, sectorId) {
  const sector = getSector(sectorId || state.ui.activeSector);
  if (!sector || !isInsideSector(row, col)) return;
  sector.explored[hexKey(row, col)] = true;
  sector.visited = true;
  /* Charting a hex can reveal a survey site. The survey rules own the
     one-time notification; without a site this is a no-op. */
  revealAnomalyAt(row, col, sector.id);
  /* Charting a sector for the first time also establishes contact with any
     rival power present there. */
  if (typeof discoverEmpiresInSector === "function") discoverEmpiresInSector(sector.id);
}

/* Hex contents are charted by a ship visit and stay charted afterwards.
   Owned colonies are always charted. Fleets in a hex imply it was visited. */
function getExploredHexes(sectorId) {
  const sector = getSector(sectorId || state.ui.activeSector);
  const explored = new Set();
  if (!sector) return explored;

  /* Owned colonies are always charted. Rival colonies carry an owner and are
     never auto-charted: their hex waits for a player ship like any other. */
  state.systems.forEach(function (system) {
    if (system.sectorId === sector.id && system.colonized && !system.owner) {
      explored.add(hexKey(system.row, system.col));
    }
  });
  Object.keys(sector.explored || {}).forEach(function (key) {
    if (sector.explored[key]) explored.add(key);
  });
  Object.keys(sector.fleets || {}).forEach(function (key) {
    if (sector.fleets[key] && sector.fleets[key].length) explored.add(key);
  });
  /* Rival strongholds do not chart themselves for the player. Only the
     player's own orbital works reveal their hexes. */
  Object.keys(sector.structures || {}).forEach(function (key) {
    const structure = sector.structures[key];
    if (structure && (!structure.owner || structure.owner === "player")) explored.add(key);
  });
  return explored;
}

function isHexExplored(row, col, sectorId) {
  if (!isInsideSector(row, col)) return false;
  return getExploredHexes(sectorId).has(hexKey(row, col));
}

function isSystemVisible(system) {
  if (!system) return false;
  return isHexExplored(system.row, system.col, system.sectorId);
}