/* ============================================================
   HEX MAP — SVG rendering of the current sector: orbital structures,
   rival systems and hulls, patrol zones, route previews and moving paths.
   ============================================================ */

function hexCenter(row, col) {
  return getSectorHexCenter(row, col);
}

function hexPointsString(x, y) {
  const size = CONFIG.sector.hexSize;
  const width = Math.sqrt(3) * size;
  const points = [
    [0, -size],
    [width / 2, -size / 2],
    [width / 2, size / 2],
    [0, size],
    [-width / 2, size / 2],
    [-width / 2, -size / 2]
  ];
  return points.map(function (point) {
    return (x + point[0]).toFixed(1) + "," + (y + point[1]).toFixed(1);
  }).join(" ");
}

function sectorMapHeight() {
  return CONFIG.sector.mapPaddingTop +
    CONFIG.sector.hexSize * 2 +
    (CONFIG.sector.rows - 1) * CONFIG.sector.hexRowGap +
    CONFIG.sector.mapPaddingBottom;
}

/* One line per distinct route. Ships sharing a route share its line, and the
   label shows the slowest ship's remaining turns. */
function collectFleetRoutes(sector) {
  const groups = {};
  Object.keys(sector.fleets || {}).forEach(function (startKey) {
    (sector.fleets[startKey] || []).forEach(function (ship) {
      if (!ship.path || ship.pathSectorId !== sector.id || !ship.path.length) return;
      const signature = startKey + ">" + ship.path.join(">");
      if (!groups[signature]) {
        groups[signature] = { startKey: startKey, path: ship.path.slice(), ships: [] };
      }
      groups[signature].ships.push(ship);
    });
  });
  return Object.keys(groups).map(function (key) { return groups[key]; });
}

function routePoints(startKey, path) {
  const start = parseHexKey(startKey);
  const first = hexCenter(start.row, start.col);
  const points = [first.x.toFixed(1) + "," + first.y.toFixed(1)];
  path.forEach(function (key) {
    const pos = parseHexKey(key);
    const center = hexCenter(pos.row, pos.col);
    points.push(center.x.toFixed(1) + "," + center.y.toFixed(1));
  });
  return points.join(" ");
}

function etaSummary(ships, pathLength) {
  const groups = {};
  ships.forEach(function (ship) {
    const type = SHIP_TYPES[ship.type];
    if (!type) return;
    const eta = getPathEta(pathLength, ship.type);
    if (!groups[ship.type]) groups[ship.type] = { name: type.name, count: 0, eta: 0 };
    groups[ship.type].count += 1;
    groups[ship.type].eta = Math.max(groups[ship.type].eta, eta);
  });
  return Object.keys(groups).map(function (key) {
    const group = groups[key];
    return group.count + " " + group.name + (group.count === 1 ? "" : "s") + " " + group.eta + "T";
  }).join(" · ");
}

/* A survey site marker. Compact mode is used when an orbital structure
   already occupies the centre of the hex. */
function anomalyMarker(x, y, anomaly, compact) {
  const stateId = getAnomalyState(anomaly);
  const progress = getAnomalyProgress(anomaly);
  let label = "SITE";
  if (stateId === "resolved") label = "DONE";
  else if (stateId === "paused") label = "PAUSE";
  else if (stateId === "studying" && progress) label = progress.turnsLeft + "T";

  let ring = "";
  if (!compact) {
    if (stateId === "studying" && progress) {
      const circumference = 2 * Math.PI * 12;
      const dash = (circumference * progress.percent) / 100;
      ring += '<circle class="anomaly-progress-ring" cx="' + x + '" cy="' + y + '" r="12" ' +
        'transform="rotate(-90 ' + x + " " + y + ')" ' +
        'stroke-dasharray="' + dash.toFixed(1) + " " + circumference.toFixed(1) + '"></circle>';
    }
    ring += '<circle class="anomaly-ring" cx="' + x + '" cy="' + y + '" r="12"></circle>';
  }

  return (
    '<g class="anomaly-marker ' + stateId + (compact ? " compact" : "") + '" aria-hidden="true">' +
      ring +
      '<text class="anomaly-glyph" x="' + x + '" y="' + (compact ? y : y - 2.5) + '">' + getAnomalyEmoji(anomaly) + "</text>" +
      (compact ? "" : '<text class="anomaly-tag" x="' + x + '" y="' + (y + 9.5) + '">' + label + "</text>") +
    "</g>"
  );
}

/* Hostile ships are drawn in their empire's colour. Only charted hexes
   reveal them; the badge sits opposite the friendly fleet badge. */
function enemyBadge(x, y, ships, empire) {
  if (!ships.length) return "";
  const color = empire ? empire.color : "#ff7a7a";
  return (
    '<g class="fleet-badge enemy" aria-hidden="true" style="--rival-color:' + color + '">' +
      '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="8.3"></circle>' +
      '<text x="' + x.toFixed(1) + '" y="' + (y + 0.3).toFixed(1) + '">⚔' + ships.length + "</text>" +
    "</g>"
  );
}

/* A contested hex replaces its centre marker with a pulsing war icon.
   The fleet badges still show both counts; tapping the icon opens the
   battle sheet instead of the hex dossier. A ranged defence is anchored on
   the hostile hex, so the same icon covers patrol and stronghold fire. */
function battleBadge(x, y, battle, interactive) {
  const playerCount = battle.player.totals.count;
  const rivalCount = battle.rival.totals.count;
  const playerKind = battle.player.totals.structures ? " player combatant" : " player ship";
  const rivalKind = battle.rival.totals.structures ? " hostile combatant" : " hostile ship";
  const kind = battle.inHex ? "Battle" : "Ranged defence";
  const label = kind + " in progress: " + playerCount +
    (playerCount === 1 ? playerKind : playerKind + "s") + " against " + rivalCount +
    (rivalCount === 1 ? rivalKind : rivalKind + "s") + ". Open the battle forecast.";
  const attrs = interactive
    ? ' data-battle="' + battle.key + '" role="button" tabindex="0" aria-label="' + label + '"'
    : ' aria-hidden="true"';
  const cx = x.toFixed(1);
  const cy = y.toFixed(1);
  return (
    '<g class="battle-badge"' + attrs + '>' +
      '<circle class="battle-badge-hit" cx="' + cx + '" cy="' + cy + '" r="14.5"></circle>' +
      '<circle class="battle-badge-pulse" cx="' + cx + '" cy="' + cy + '" r="12.2"></circle>' +
      '<circle class="battle-badge-core" cx="' + cx + '" cy="' + cy + '" r="9.4"></circle>' +
      '<text x="' + cx + '" y="' + (y + 0.4).toFixed(1) + '">⚔</text>' +
    '</g>'
  );
}

/* Rival routes are line art only and are visible once their start hex is
   charted. They show incoming raiders on the sector map. */
function collectRivalRoutes(sector) {
  const seen = new Set();
  const routes = [];
  Object.keys(sector.rivalFleets || {}).forEach(function (startKey) {
    (sector.rivalFleets[startKey] || []).forEach(function (ship) {
      if (!ship.path || ship.pathSectorId !== sector.id || !ship.path.length) return;
      const signature = startKey + ">" + ship.path.join(">");
      if (seen.has(signature)) return;
      seen.add(signature);
      routes.push({ startKey: startKey, path: ship.path.slice() });
    });
  });
  return routes;
}

/* Map layers are overlays that can be hidden. Patrol coverage stays on
   by default, so the tactical read is unchanged until the player hides it;
   the charted-space wash is opt-in. */
function ensureMapLayers() {
  if (!state || !state.ui) return null;
  const defaults = { charted: false, patrol: true, landing: true };
  if (!state.ui.mapLayers) state.ui.mapLayers = defaults;
  Object.keys(defaults).forEach(function (key) {
    if (state.ui.mapLayers[key] == null) state.ui.mapLayers[key] = defaults[key];
  });
  return state.ui.mapLayers;
}

function isMapLayerEnabled(layerId) {
  const layers = ensureMapLayers();
  return !!layers && layers[layerId] === true;
}

function patrolCoverageSummary(coverage) {
  const parts = [];
  if (coverage.patrols) {
    parts.push(coverage.patrols + (coverage.patrols === 1 ? " corvette" : " corvettes"));
  }
  if (coverage.strongholds) {
    parts.push(coverage.strongholds + (coverage.strongholds === 1 ? " stronghold" : " strongholds"));
  }
  if (!parts.length) return "No patrol cover in this sector.";
  return parts.join(" · ") + " · " + coverage.hexCount +
    (coverage.hexCount === 1 ? " hex covered" : " hexes covered");
}

/* A landing port is labelled with the sector on the other side of the lane.
   The arrow points back along the lane, toward the sector a ship would
   arrive from, so the map's bearing and the label agree. A lane may run to a
   sector whose name is still fogged; the port keeps its arrow and reads
   UNKNOWN instead of leaking the name. */
function landingNeighborName(neighbor) {
  if (!neighbor || !isSectorNameKnown(neighbor)) return "UNKNOWN";
  if (neighbor.home) return "CORE";
  return neighbor.name.toUpperCase();
}

function landingNeighborAria(neighbor) {
  if (!neighbor || !isSectorNameKnown(neighbor)) return "an unnamed sector";
  if (neighbor.home) return "the core";
  return neighbor.name;
}

function landingArrow(slot) {
  if (!slot) return "•";
  const turn = Math.PI * 2;
  const angle = ((slot.angle % turn) + turn) % turn;
  const arrows = ["→", "↘", "↓", "↙", "←", "↖", "↑", "↗"];
  return arrows[Math.round(angle / (Math.PI / 4)) % 8];
}

function landingCompass(slot) {
  if (!slot) return "unknown bearing";
  const turn = Math.PI * 2;
  const angle = ((slot.angle % turn) + turn) % turn;
  const names = ["east", "south-east", "south", "south-west",
    "west", "north-west", "north", "north-east"];
  return names[Math.round(angle / (Math.PI / 4)) % 8];
}

function landingMarker(x, y, entry) {
  const text = landingArrow(entry.slot) + " " + landingNeighborName(entry.neighbor);
  const width = Math.max(22, text.length * 3.05 + 7);
  const top = y + 14.5;
  return (
    '<g class="landing-marker" aria-hidden="true">' +
      '<rect class="landing-tag-bg" x="' + (x - width / 2).toFixed(1) + '" y="' + top.toFixed(1) +
        '" width="' + width.toFixed(1) + '" height="9.4" rx="3"></rect>' +
      '<text class="landing-tag" x="' + x.toFixed(1) + '" y="' + (top + 6.6).toFixed(1) + '">' +
        text + "</text>" +
    "</g>"
  );
}

/* A detected raid entry. The red threshold sits over the landing outline and
   the badge counts down the remaining end-turns until contact. */
function raidWarningMarker(x, y, warning) {
  const text = warning.turns + "T";
  const width = Math.max(15, text.length * 3.5 + 6);
  const top = y - 18.5;
  return (
    '<g class="raid-warning-marker" aria-hidden="true">' +
      '<rect class="raid-warning-tag-bg" x="' + (x - width / 2).toFixed(1) + '" y="' + top.toFixed(1) +
        '" width="' + width.toFixed(1) + '" height="9.4" rx="3"></rect>' +
      '<text class="raid-warning-tag" x="' + x.toFixed(1) + '" y="' + (top + 6.6).toFixed(1) + '">' +
        text + "</text>" +
    "</g>"
  );
}

function renderMapLayerMenu(sector, coverage, chartedCount, landingCount) {
  if (!els.sectorViewBtn || !els.sectorLayerMenu) return;
  const patrolOn = isMapLayerEnabled("patrol");
  const chartedOn = isMapLayerEnabled("charted");
  const landingOn = isMapLayerEnabled("landing");
  const landings = landingCount || 0;
  if (els.mapLayerPatrol) {
    els.mapLayerPatrol.setAttribute("aria-checked", patrolOn ? "true" : "false");
  }
  if (els.mapLayerPatrolSub) {
    els.mapLayerPatrolSub.textContent = patrolCoverageSummary(coverage);
  }
  if (els.mapLayerCharted) {
    els.mapLayerCharted.setAttribute("aria-checked", chartedOn ? "true" : "false");
  }
  if (els.mapLayerChartedSub) {
    els.mapLayerChartedSub.textContent = chartedCount + " / " + getTotalHexes() +
      (chartedCount === 1 ? " hex charted." : " hexes charted.");
  }
  if (els.mapLayerLanding) {
    els.mapLayerLanding.setAttribute("aria-checked", landingOn ? "true" : "false");
  }
  if (els.mapLayerLandingSub) {
    els.mapLayerLandingSub.textContent = landings
      ? landings + (landings === 1 ? " landing hex · one per lane." : " landing hexes · one per lane.")
      : "No landing lanes.";
  }
  if (els.mapLayerScope) els.mapLayerScope.textContent = getSectorLabel(sector).toUpperCase();
  if (els.patrolLegend) els.patrolLegend.classList.toggle("hidden", !patrolOn);
  if (els.chartedViewLegend) els.chartedViewLegend.classList.toggle("hidden", !chartedOn);
  if (els.landingLegend) els.landingLegend.classList.toggle("hidden", !landingOn);
  const anyOn = patrolOn || chartedOn || landingOn;
  els.sectorViewBtn.classList.toggle("has-layer", anyOn);
  els.sectorViewBtn.setAttribute("aria-label",
    "VIEW map layers · charted space " + (chartedOn ? "on" : "off") +
    " · landing hexes " + (landingOn ? "on" : "off") +
    " · patrol coverage " + (patrolOn ? "on" : "off"));
}

function setSectorLayerMenuOpen(open) {
  if (!els.sectorLayerMenu || !els.sectorViewBtn) return;
  els.sectorLayerMenu.classList.toggle("hidden", !open);
  els.sectorLayerMenu.setAttribute("aria-hidden", open ? "false" : "true");
  els.sectorViewBtn.classList.toggle("is-open", open);
  els.sectorViewBtn.setAttribute("aria-expanded", open ? "true" : "false");
  const firstLayer = els.mapLayerCharted || els.mapLayerLanding || els.mapLayerPatrol;
  if (open && firstLayer) {
    try {
      firstLayer.focus({ preventScroll: true });
    } catch (error) {
      firstLayer.focus();
    }
  }
}

function closeSectorLayerMenu() {
  setSectorLayerMenuOpen(false);
}

function toggleSectorLayerMenu() {
  if (!els.sectorLayerMenu) return;
  setSectorLayerMenuOpen(els.sectorLayerMenu.classList.contains("hidden"));
}

function toggleMapLayer(layerId) {
  if (!state || !state.ui) return;
  const names = {
    patrol: "Patrol coverage",
    charted: "Charted space",
    landing: "Landing hexes"
  };
  if (!Object.prototype.hasOwnProperty.call(names, layerId)) return;
  const layers = ensureMapLayers();
  if (!layers) return;
  const next = layers[layerId] !== true;
  layers[layerId] = next;
  renderMap();
  toast(names[layerId] + (next ? " shown." : " hidden."));
}

function renderMap() {
  const sector = getCurrentSector();
  if (!sector) return;

  /* A sector you have never charted has a page but no contents: fog tiles
     only, no landing lanes, no raid forecasts and no summary numbers. Power
     is stricter still and needs the player active in the sector right now. */
  const infoKnown = sectorHasCharts(sector);
  const nameKnown = isSectorNameKnown(sector);
  const powerVisible = isSectorPowerVisible(sector);

  const explored = getExploredHexes(sector.id);
  const systemsByCell = {};
  state.systems.forEach(function (system) {
    if (system.sectorId !== sector.id) return;
    systemsByCell[hexKey(system.row, system.col)] = system;
  });

  /* Only charted sites are drawn: an uncharted hex gives nothing away. */
  const anomaliesByCell = {};
  getSectorAnomalies(sector.id, true).forEach(function (anomaly) {
    anomaliesByCell[hexKey(anomaly.row, anomaly.col)] = anomaly;
  });

  const patrolLayerOn = isMapLayerEnabled("patrol");
  const chartedLayerOn = isMapLayerEnabled("charted");
  const landingLayerOn = isMapLayerEnabled("landing");
  if (els.sectorMap) els.sectorMap.classList.toggle("charted-view", chartedLayerOn);
  /* Lane ports and their neighbour tags are part of the chart, so an
     uncharted sector shows none of them. */
  const landingEntries = infoKnown ? getSectorLandingEntries(sector) : [];
  const landingByKey = {};
  landingEntries.forEach(function (entry) { landingByKey[entry.key] = entry; });
  const intel = getSectorIntelligence(sector.id);
  const raidWarnings = infoKnown ? getRaidWarningsForSector(sector.id) : [];
  const raidWarningByKey = {};
  raidWarnings.forEach(function (warning) { raidWarningByKey[warning.key] = warning; });
  const coverage = getSectorPatrolCoverage(sector.id);
  const patrolZones = patrolLayerOn ? coverage.zones : {};
  /* A trading center draws its route only while the sector gate is online. */
  const sectorHasGate = hasOperationalGateInSector(sector.id);

  const move = state.ui.move && state.ui.move.sectorId === sector.id ? state.ui.move : null;
  const previewPath = move && move.previewPath ? move.previewPath : [];
  const previewKeys = new Set(previewPath);
  const previewDestination = previewPath.length ? previewPath[previewPath.length - 1] : null;
  const origin = move ? parseHexKey(move.from) : null;

  /* One badge per fleet. A hex that holds a single ship type wears that
     hull's icon; a mixed hex uses the generic ship icon. The capsule keeps the
     icon and the ship count legible side by side, and the border is tinted by
     type so the map reads at a glance. */
  function fleetBadge(x, y, ships) {
    if (!ships.length) return "";
    const iconKey = getFleetIconKey(ships);
    const count = String(ships.length);
    /* The capsule is right-anchored: a two-digit fleet grows to the left,
       away from the structure badge that shares a system hex's top edge. */
    const width = 19.5 + 3.3 * count.length;
    const height = 16.6;
    const right = 10.8;
    const left = right - width;
    const iconX = left + 6;
    const countX = right - 3.6 - (count.length * 4.3) / 2;
    return (
      '<g class="fleet-badge player fleet-' + iconKey + '" transform="translate(' + x.toFixed(1) + " " + y.toFixed(1) + ')" aria-hidden="true">' +
        '<rect class="fleet-badge-chip" x="' + left.toFixed(1) + '" y="' + (-height / 2).toFixed(1) +
          '" width="' + width.toFixed(1) + '" height="' + height.toFixed(1) + '" rx="' + (height / 2).toFixed(1) + '"></rect>' +
        '<text class="fleet-badge-icon" x="' + iconX.toFixed(1) + '" y="0.3">' + getFleetIconEmoji(ships) + "</text>" +
        '<text class="fleet-badge-count" x="' + countX.toFixed(1) + '" y="0.3">' + count + "</text>" +
      "</g>"
    );
  }

  const pieces = [];
  pieces.push('<defs><filter id="softGlow"><feGaussianBlur stdDeviation="2.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>');

  for (let row = 0; row < CONFIG.sector.rows; row += 1) {
    for (let col = 0; col < CONFIG.sector.cols; col += 1) {
      const key = hexKey(row, col);
      const center = hexCenter(row, col);
      const points = hexPointsString(center.x, center.y);
      const charted = explored.has(key);
      const system = charted ? systemsByCell[key] : null;
      const anomaly = charted ? anomaliesByCell[key] || null : null;
      const fleet = getFleetAt(row, col, sector.id);
      const rivalFleet = charted ? (sector.rivalFleets ? sector.rivalFleets[key] || [] : []) : [];
      const battle = charted ? getHexBattleReadout(sector.id, row, col) : null;
      const rivalSystemEmpire = system && system.owner ? getEmpire(system.owner) : null;
      const rivalFleetEmpire = rivalFleet.length ? getEmpire(rivalFleet[0].owner) : null;
      const structure = charted && sector.structures ? sector.structures[key] : null;
      const structureDef = structure ? STRUCTURE_TYPES[structure.type] : null;
      const structureEmpire = structure && !isPlayerStructure(structure) ? getEmpire(structure.owner) : null;
      const patrolZone = patrolZones[key] || null;
      const landing = landingByKey[key] || null;
      const raidWarning = raidWarningByKey[key] || null;
      const isPreview = previewKeys.has(key);
      const isDestination = previewDestination === key;
      const isOrigin = !!move && move.from === key;
      const classList = ["hex-group"];
      if (system) classList.push("system-group", system.colonized ? "colony" : "unclaimed");
      if (rivalSystemEmpire) classList.push("rival-system");
      if (rivalFleet.length) classList.push("has-rival-fleet");
      if (rivalFleetEmpire) classList.push("rival-fleet-" + rivalFleetEmpire.id);
      if (battle) classList.push("has-battle");
      if (structure) classList.push("has-structure", "structure-" + structure.type);
      if (structure && structure.type === "trading" && !structure.underConstruction) {
        classList.push(sectorHasGate ? "trade-online" : "trade-offline");
      }
      if (structure && !isPlayerStructure(structure)) classList.push("structure-rival");
      if (structure && structure.underConstruction) classList.push("structure-building");
      if (anomaly) classList.push("has-anomaly", "anomaly-" + getAnomalyState(anomaly));
      if (patrolZone) classList.push("patrol-covered");
      if (landing && landingLayerOn) classList.push("has-landing");
      if (raidWarning) classList.push("has-raid-warning");
      if (isPreview) classList.push("path-preview");
      if (isDestination) classList.push("move-destination");
      if (isOrigin) classList.push("move-origin");
      const rivalColor = rivalSystemEmpire ? rivalSystemEmpire.color
        : (rivalFleetEmpire ? rivalFleetEmpire.color
          : (structureEmpire ? structureEmpire.color : null));

      let label;
      if (!charted) {
        label = "Unexplored hex " + (row + 1) + ", " + (col + 1);
      } else if (system) {
        label = system.name + (system.colonized
          ? ", colonized system"
          : rivalSystemEmpire
            ? ", rival system held by " + rivalSystemEmpire.name
            : ", charted system");
      } else {
        label = "Charted empty hex " + (row + 1) + ", " + (col + 1);
      }
      if (structureEmpire) label += ", hostile stronghold of " + structureEmpire.name;
      if (structureDef) {
        label += ", " + structureDef.name + (structure.underConstruction ? " under construction" : " online");
      }
      if (anomaly) {
        const anomalyState = getAnomalyState(anomaly);
        const statusText = anomalyState === "resolved"
          ? "already surveyed"
          : anomalyState === "studying"
            ? "survey in progress"
            : anomalyState === "paused"
              ? "survey paused"
              : "awaiting a science ship";
        label += ", survey site " + getAnomalyName(anomaly) + ", " + statusText;
      }
      if (fleet.length) {
        const composition = getFleetCompositionText(fleet);
        label += ", fleet of " + fleet.length + (fleet.length === 1 ? " ship" : " ships") +
          (composition ? " (" + composition + ")" : "");
      }
      if (rivalFleet.length) {
        label += ", " + rivalFleet.length + " hostile " + (rivalFleet.length === 1 ? "ship" : " ships") +
          (rivalFleetEmpire ? " from " + rivalFleetEmpire.name : "");
      }
      if (battle) {
        label += ", " + (battle.inHex ? "battle in progress" : "ranged defence in progress") +
          "; open the war icon for the battle forecast";
      }
      if (patrolZone) label += ", covered by a friendly patrol or stronghold";
      if (raidWarning) {
        const fromName = raidWarning.fromSector
          ? landingNeighborAria(raidWarning.fromSector)
          : "an adjacent sector";
        label += ", raid warning: " + raidWarning.shipCount +
          (raidWarning.shipCount === 1 ? " hostile ship" : " hostile ships") +
          " forecast to enter in " + raidWarning.turns +
          (raidWarning.turns === 1 ? " turn" : " turns") + " from " + fromName;
      }
      if (landing) {
        label += ", landing hex from " + landingNeighborAria(landing.neighbor) +
          ", approached from the " + landingCompass(landing.slot);
      }
      if (isPreview) label += ", on previewed route";
      if (isDestination) label += ", route destination";

      const rivalStyle = rivalColor ? ' style="--rival-color:' + rivalColor + '"' : "";
      pieces.push('<g class="' + classList.join(" ") + '" data-hex="' + key + '" tabindex="0" role="button" aria-label="' + label + '"' + rivalStyle + ">");

      if (system) {
        pieces.push('<polygon class="system-poly" points="' + points + '"></polygon>');
        pieces.push(system.colonized ? '<polygon class="system-glow" points="' + points + '" filter="url(#softGlow)"></polygon>' : "");
        if (chartedLayerOn) pieces.push('<polygon class="charted-overlay" points="' + points + '"></polygon>');
        if (landing && landingLayerOn) {
          pieces.push('<polygon class="landing-outline" points="' + points + '"></polygon>');
        }
        if (raidWarning) {
          pieces.push('<polygon class="raid-warning-outline" points="' + points + '"></polygon>');
        }
        if (battle) {
          pieces.push(battleBadge(center.x, center.y - 8, battle, !move));
        } else {
          pieces.push('<text class="sys-emoji" x="' + center.x.toFixed(1) + '" y="' + (center.y - 8).toFixed(1) + '">' + system.emoji + "</text>");
        }
        pieces.push('<text class="sys-name" x="' + center.x.toFixed(1) + '" y="' + (center.y + 13).toFixed(1) + '">' + system.name.toUpperCase() + "</text>");
        pieces.push('<text class="sys-type' + (rivalSystemEmpire ? " rival-type" : "") + '" x="' + center.x.toFixed(1) + '" y="' + (center.y + 23).toFixed(1) + '">' +
          (system.colonized ? (system.home ? "CAPITAL" : "COLONY") : rivalSystemEmpire ? "RIVAL" : "SIGNAL") + "</text>");
        if (rivalSystemEmpire) {
          pieces.push('<text class="sys-rival-flag" x="' + (center.x + 18).toFixed(1) + '" y="' + (center.y + 23).toFixed(1) + '">⚑</text>');
        }

        if (structureDef) {
          pieces.push('<text class="structure-badge" x="' + center.x.toFixed(1) + '" y="' + (center.y - 25).toFixed(1) + '">' +
            (structure.underConstruction ? "🚧" : structureDef.emoji) + "</text>");
        }

        const attention = getSystemAttention(system);
        if (attention && system.colonized) {
          const done = attention === "done";
          const badgeColor = done ? "#f4c96b" : "#67e8d5";
          const badgeChar = done ? "✓" : "+";
          pieces.push(
            '<g class="attention-badge" aria-hidden="true">' +
              '<circle cx="' + (center.x + 19).toFixed(1) + '" cy="' + (center.y - 23).toFixed(1) + '" r="7.3" fill="#09111b" stroke="' + badgeColor + '"></circle>' +
              '<text x="' + (center.x + 19).toFixed(1) + '" y="' + (center.y - 23).toFixed(1) + '" fill="' + badgeColor + '">' + badgeChar + "</text>" +
            "</g>"
          );
        }
        pieces.push(fleetBadge(center.x - 18, center.y - 22, fleet));
        if (rivalFleet.length) {
          pieces.push(enemyBadge(center.x + 18, center.y - 22, rivalFleet, rivalFleetEmpire));
        }
      } else {
        pieces.push('<polygon class="hex-tile ' + (charted ? "explored" : "fog") + '" points="' + points + '"></polygon>');
        if (charted && chartedLayerOn) {
          pieces.push('<polygon class="charted-overlay" points="' + points + '"></polygon>');
        }
        if (landing && landingLayerOn) {
          pieces.push('<polygon class="landing-outline" points="' + points + '"></polygon>');
        }
        if (raidWarning) {
          pieces.push('<polygon class="raid-warning-outline" points="' + points + '"></polygon>');
        }
        if (structureDef) {
          if (battle) {
            pieces.push(battleBadge(center.x, center.y - 4, battle, !move));
          } else {
            pieces.push('<text class="structure-icon" x="' + center.x.toFixed(1) + '" y="' + (center.y - 3).toFixed(1) + '">' +
              (structure.underConstruction ? "🚧" : structureDef.emoji) + "</text>");
          }
          pieces.push('<text class="structure-label" x="' + center.x.toFixed(1) + '" y="' + (center.y + 12).toFixed(1) + '">' +
            (structureDef.mapLabel || structureDef.name).toUpperCase() + "</text>");
          if (anomaly) {
            pieces.push(battle
              ? anomalyMarker(center.x + 21, center.y + 18, anomaly, true)
              : anomalyMarker(center.x - 19, center.y - 15, anomaly, true));
          }
          if (fleet.length) pieces.push(fleetBadge(center.x + 17, center.y - 17, fleet));
          if (rivalFleet.length) pieces.push(enemyBadge(center.x - 18, center.y - 17, rivalFleet, rivalFleetEmpire));
        } else {
          if (charted && !fleet.length && !rivalFleet.length && !anomaly && !landing && !raidWarning) {
            pieces.push('<circle class="hex-dot" cx="' + center.x.toFixed(1) + '" cy="' + center.y.toFixed(1) + '" r="1.3"></circle>');
          }
          if (battle) {
            pieces.push(battleBadge(center.x, center.y - 4, battle, !move));
            if (anomaly) pieces.push(anomalyMarker(center.x + 21, center.y + 18, anomaly, true));
          } else if (anomaly) {
            pieces.push(anomalyMarker(center.x, center.y, anomaly, false));
          }
          if (fleet.length) {
            pieces.push(anomaly || battle
              ? fleetBadge(center.x + 18, center.y - 16, fleet)
              : fleetBadge(center.x, center.y, fleet));
          }
          if (rivalFleet.length) {
            pieces.push(enemyBadge(center.x - 18, center.y - 16, rivalFleet, rivalFleetEmpire));
          }
        }
      }

      if (landing && landingLayerOn && !system) {
        pieces.push(landingMarker(center.x, center.y, landing));
      }
      if (raidWarning) {
        pieces.push(raidWarningMarker(center.x, center.y, raidWarning));
      }

      pieces.push("</g>");
    }
  }

  /* Friendly patrol coverage is a soft outline above the tiles. */
  const patrolPieces = [];
  Object.keys(patrolZones).forEach(function (zoneKey) {
    const zonePos = parseHexKey(zoneKey);
    if (!isInsideSector(zonePos.row, zonePos.col)) return;
    const zoneCenter = hexCenter(zonePos.row, zonePos.col);
    const zonePoints = hexPointsString(zoneCenter.x, zoneCenter.y);
    patrolPieces.push('<polygon class="patrol-zone" points="' + zonePoints + '"></polygon>');
  });
  if (patrolPieces.length) {
    pieces.push('<g class="patrol-layer" aria-hidden="true">' + patrolPieces.join("") + "</g>");
  }

  /* Routes above the tiles but below nothing else: they are line art only. */
  const routePieces = [];
  collectFleetRoutes(sector).forEach(function (route) {
    const pathEnd = route.path[route.path.length - 1];
    const destPos = parseHexKey(pathEnd);
    const dest = hexCenter(destPos.row, destPos.col);
    const slowest = route.ships.reduce(function (max, ship) {
      return Math.max(max, getPathEta(route.path.length, ship.type));
    }, 0);
    routePieces.push('<polyline class="route-line" points="' + routePoints(route.startKey, route.path) + '"></polyline>');
    routePieces.push('<circle class="route-end" cx="' + dest.x.toFixed(1) + '" cy="' + dest.y.toFixed(1) + '" r="4.2"></circle>');
    routePieces.push('<text class="route-eta" x="' + (dest.x + 6).toFixed(1) + '" y="' + (dest.y + 12).toFixed(1) + '">' + slowest + "T</text>");
  });
  collectRivalRoutes(sector).forEach(function (route) {
    if (!explored.has(route.startKey)) return;
    const pathEnd = route.path[route.path.length - 1];
    const destPos = parseHexKey(pathEnd);
    const dest = hexCenter(destPos.row, destPos.col);
    routePieces.push('<polyline class="enemy-route-line" points="' + routePoints(route.startKey, route.path) + '"></polyline>');
    routePieces.push('<circle class="enemy-route-end" cx="' + dest.x.toFixed(1) + '" cy="' + dest.y.toFixed(1) + '" r="3.6"></circle>');
  });
  if (previewPath.length && move) {
    const destPos = parseHexKey(previewDestination);
    const dest = hexCenter(destPos.row, destPos.col);
    routePieces.push('<polyline class="route-preview-line" points="' + routePoints(move.from, previewPath) + '"></polyline>');
    routePieces.push('<circle class="route-preview-end" cx="' + dest.x.toFixed(1) + '" cy="' + dest.y.toFixed(1) + '" r="5"></circle>');
  }
  if (routePieces.length) {
    pieces.push('<g class="route-layer" aria-hidden="true">' + routePieces.join("") + "</g>");
  }

  els.sectorMap.setAttribute("viewBox", "0 0 " + CONFIG.sector.mapWidth + " " + sectorMapHeight());
  els.sectorMap.innerHTML = pieces.join("");

  els.sectorTitle.textContent = nameKnown ? sector.name : "Unknown Sector";
  els.sectorKicker.textContent = sector.home
    ? "CORE · HOME SECTOR"
    : getSectorRingLabel(sector) + " · SECTOR " + formatSectorIndex(sector.index);
  els.sectorBreadcrumb.textContent = getSectorRingLabel(sector) + " · SECTOR " +
    formatSectorIndex(sector.index) + " / " + state.galaxy.sectors.length;
  els.sectorCharted.textContent = String(explored.size);
  if (els.sectorIntel) els.sectorIntel.textContent = infoKnown ? String(intel) : "—";
  if (els.sectorBadge) {
    let badgeCopy;
    if (infoKnown) {
      badgeCopy = "Sector intelligence " + intel + ": forecasts raider entry up to " +
        intel + (intel === 1 ? " turn" : " turns") + " away.";
      badgeCopy += raidWarnings.length
        ? " " + raidWarnings.length + (raidWarnings.length === 1 ? " raid warning" : " raid warnings") + "."
        : " No raid warnings.";
    } else {
      badgeCopy = "No charts in this sector yet. Move a ship into a hex to chart it.";
    }
    els.sectorBadge.classList.toggle("warning", infoKnown && raidWarnings.length > 0);
    els.sectorBadge.setAttribute("title", badgeCopy);
    els.sectorBadge.setAttribute("aria-label", badgeCopy + " " +
      explored.size + " of " + getTotalHexes() + " hexes charted.");
  }
  els.sectorStatCharted.textContent = String(explored.size);
  /* The summary reads the sector only when it has been charted. Power is a
     live readout and needs the player to be active there right now. */
  const colonies = infoKnown ? getSectorColonyCount(sector.id) : null;
  const sites = infoKnown ? getSectorAnomalies(sector.id, true).length : null;
  const fleets = infoKnown ? getSectorFleetCount(sector.id) : null;
  /* Hostile power is a live readout like your own, so it needs presence. */
  const sectorThreat = powerVisible ? getSectorRivalPower(sector.id) : null;
  els.sectorStatColonies.textContent = colonies == null ? "—" : String(colonies);
  els.sectorStatSites.textContent = sites == null ? "—" : String(sites);
  els.sectorStatFleets.textContent = fleets == null ? "—" : String(fleets);
  els.sectorStatPower.textContent = powerVisible ? String(getSectorPower(sector.id)) : "—";
  els.sectorStatThreat.textContent = sectorThreat == null ? "—" : String(sectorThreat);
  els.sectorStatThreat.classList.toggle("text-bad", !!sectorThreat && sectorThreat > 0);

  /* This sector's own energy and mineral ledger. */
  const sectorEconomy = infoKnown ? getSectorEconomy(sector.id) : null;
  const sectorEnergy = getSectorStock(sector.id, "energy");
  const sectorMinerals = getSectorStock(sector.id, "minerals");
  if (els.sectorStatEnergy) {
    els.sectorStatEnergy.textContent = infoKnown ? formatAmount(sectorEnergy) : "—";
    els.sectorStatEnergy.classList.toggle("text-bad", infoKnown && sectorEnergy < 0);
  }
  if (els.sectorStatMinerals) {
    els.sectorStatMinerals.textContent = infoKnown ? formatAmount(sectorMinerals) : "—";
    els.sectorStatMinerals.classList.toggle("text-bad", infoKnown && sectorMinerals < 0);
  }
  if (els.sectorStatEnergyNet) {
    els.sectorStatEnergyNet.textContent = sectorEconomy ? formatSigned(sectorEconomy.net.energy) : "";
    els.sectorStatEnergyNet.classList.toggle("text-good", !!sectorEconomy && sectorEconomy.net.energy > 0);
    els.sectorStatEnergyNet.classList.toggle("text-bad", !!sectorEconomy && sectorEconomy.net.energy < 0);
  }
  if (els.sectorStatMineralsNet) {
    els.sectorStatMineralsNet.textContent = sectorEconomy ? formatSigned(sectorEconomy.net.minerals) : "";
    els.sectorStatMineralsNet.classList.toggle("text-good", !!sectorEconomy && sectorEconomy.net.minerals > 0);
    els.sectorStatMineralsNet.classList.toggle("text-bad", !!sectorEconomy && sectorEconomy.net.minerals < 0);
  }

  renderMapLayerMenu(sector, coverage, explored.size, landingEntries.length);

  if (move) {
    const ships = getFleetAt(origin.row, origin.col, sector.id).filter(function (ship) {
      return move.ids.indexOf(ship.id) !== -1;
    });
    els.moveBanner.classList.remove("hidden");
    if (previewPath.length) {
      const slowest = ships.reduce(function (max, ship) {
        return Math.max(max, getPathEta(previewPath.length, ship.type));
      }, 0);
      els.moveBannerText.textContent = "Route ready: " + previewPath.length +
        (previewPath.length === 1 ? " hex" : " hexes") + " · slowest ETA " + slowest + (slowest === 1 ? " turn" : " turns");
      els.moveBannerSub.textContent = etaSummary(ships, previewPath.length) + " · confirm to assign";
      els.moveConfirm.classList.remove("hidden");
    } else {
      els.moveBannerText.textContent = move.ids.length + (move.ids.length === 1 ? " ship" : " ships") +
        " ready. Tap any destination hex.";
      els.moveBannerSub.textContent = "Each ship travels up to its speed per turn.";
      els.moveConfirm.classList.add("hidden");
    }
  } else {
    els.moveBanner.classList.add("hidden");
    els.moveConfirm.classList.add("hidden");
  }
}