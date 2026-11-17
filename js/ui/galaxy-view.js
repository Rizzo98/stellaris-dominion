/* ============================================================
   GALAXY VIEW — circular ring graph
   The home sector is the centre. Sector rings are perfect circles with
   a radial curve that opens up the inner rings and compresses the rim.
   The scene is larger than the stage; the stage scrolls on both axes.
   ============================================================ */

function galaxyGraphHeight() {
  return CONFIG.galaxy.layout.height;
}

function galaxyRingArcPath(fromSector, toSector) {
  const orbit = galaxyOrbit(fromSector.ring);
  const from = galaxyNodePosition(fromSector);
  const to = galaxyNodePosition(toSector);
  return "M " + from.x.toFixed(2) + " " + from.y.toFixed(2) +
    " A " + orbit.radius.toFixed(2) + " " + orbit.radius.toFixed(2) +
    " 0 0 1 " + to.x.toFixed(2) + " " + to.y.toFixed(2);
}

/* ---------- galaxy layers (trade view) ---------- */

function isGalaxyLayerEnabled(layerId) {
  if (!state || !state.ui) return false;
  if (!state.ui.galaxyLayers) state.ui.galaxyLayers = { trade: false };
  return state.ui.galaxyLayers[layerId] === true;
}

function setGalaxyLayerMenuOpen(open) {
  if (!els.galaxyLayerMenu || !els.galaxyViewBtn) return;
  els.galaxyLayerMenu.classList.toggle("hidden", !open);
  els.galaxyLayerMenu.setAttribute("aria-hidden", open ? "false" : "true");
  els.galaxyViewBtn.classList.toggle("is-open", open);
  els.galaxyViewBtn.setAttribute("aria-expanded", open ? "true" : "false");
  if (open && els.galaxyLayerTrade) {
    try {
      els.galaxyLayerTrade.focus({ preventScroll: true });
    } catch (error) {
      els.galaxyLayerTrade.focus();
    }
  }
}

function closeGalaxyLayerMenu() {
  setGalaxyLayerMenuOpen(false);
}

function toggleGalaxyLayerMenu() {
  if (!els.galaxyLayerMenu) return;
  setGalaxyLayerMenuOpen(els.galaxyLayerMenu.classList.contains("hidden"));
}

function toggleGalaxyLayer(layerId) {
  if (layerId !== "trade" || !state || !state.ui) return;
  if (!state.ui.galaxyLayers) state.ui.galaxyLayers = { trade: false };
  const next = !isGalaxyLayerEnabled("trade");
  state.ui.galaxyLayers.trade = next;
  renderGalaxy();
  toast("Trade view " + (next ? "shown" : "hidden") + ".");
}

/* A curved hop between two sector nodes. The bend pushes the trade line away
   from the straight jump lane so both stay readable. */
function tradeArc(fromSector, toSector, bend) {
  const from = galaxyNodePosition(fromSector);
  const to = galaxyNodePosition(toSector);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.sqrt(dx * dx + dy * dy) || 1;
  const offset = typeof bend === "number" ? bend : 24;
  const nx = -dy / length;
  const ny = dx / length;
  const cx = (from.x + to.x) / 2 + nx * offset;
  const cy = (from.y + to.y) / 2 + ny * offset;
  return {
    d: "M " + from.x.toFixed(2) + " " + from.y.toFixed(2) +
      " Q " + cx.toFixed(2) + " " + cy.toFixed(2) +
      " " + to.x.toFixed(2) + " " + to.y.toFixed(2),
    mid: {
      x: (from.x + 2 * cx + to.x) / 4,
      y: (from.y + 2 * cy + to.y) / 4
    }
  };
}

function tradeFlowLabel(x, y, route) {
  const text = (route.energy ? "⚡" + route.energy : "") +
    (route.minerals ? " ⛏" + route.minerals : "");
  if (!text.trim()) return "";
  const width = Math.max(20, text.length * 3.9 + 7);
  return (
    '<g class="trade-flow-label' + (route.status === "active" ? " active" : "") + '" aria-hidden="true">' +
      '<rect x="' + (x - width / 2).toFixed(1) + '" y="' + (y - 5.6).toFixed(1) + '" width="' + width.toFixed(1) + '" height="11.2" rx="3"></rect>' +
      '<text x="' + x.toFixed(1) + '" y="' + (y + 2.2).toFixed(1) + '">' + text + "</text>" +
    "</g>"
  );
}

function buildTradeOverlay() {
  const summary = getTradeSummary();
  const pieces = [];
  summary.routes.forEach(function (route) {
    if (!route.path || route.path.length < 2) return;
    const active = route.status === "active";
    const end = route.path[route.path.length - 1];
    let labelPos = null;
    for (let i = 0; i < route.path.length - 1; i += 1) {
      const fromSector = getSector(route.path[i]);
      const toSector = getSector(route.path[i + 1]);
      if (!fromSector || !toSector) continue;
      const arc = tradeArc(fromSector, toSector, active ? 24 : 17);
      pieces.push(
        '<path class="trade-route-line ' + (active ? "active" : "idle") + '" d="' + arc.d + '"></path>'
      );
      if (!labelPos) labelPos = arc.mid;
    }
    const target = getSector(end);
    if (target) {
      const pos = galaxyNodePosition(target);
      pieces.push(
        '<circle class="trade-route-end ' + (active ? "active" : "idle") + '" cx="' +
          pos.x.toFixed(1) + '" cy="' + pos.y.toFixed(1) + '" r="3.4"></circle>'
      );
    }
    if (labelPos) pieces.push(tradeFlowLabel(labelPos.x, labelPos.y, route));
  });
  return { summary: summary, html: pieces.length ? pieces.join("") : "" };
}

function renderGalaxyLayerMenu(summary) {
  if (!els.galaxyLayerMenu) return;
  const enabled = isGalaxyLayerEnabled("trade");
  if (els.galaxyLayerTrade) els.galaxyLayerTrade.setAttribute("aria-checked", enabled ? "true" : "false");
  if (els.galaxyLayerTradeSub) {
    if (!summary.centerCount) {
      els.galaxyLayerTradeSub.textContent = "No trading centers yet.";
    } else {
      els.galaxyLayerTradeSub.textContent = summary.centerCount +
        (summary.centerCount === 1 ? " center" : " centers") + " · " + summary.routeCount +
        (summary.routeCount === 1 ? " route" : " routes") + " · " + summary.active.length +
        " shipping · ⚡" + summary.energy + " ⛏" + summary.minerals + " / turn";
    }
  }
  if (els.galaxyLayerScope) els.galaxyLayerScope.textContent = state.galaxy.sectors.length + " SECTORS";
  if (els.galaxyTradeLegend) els.galaxyTradeLegend.classList.toggle("hidden", !enabled);
  if (els.galaxyViewBtn) {
    els.galaxyViewBtn.classList.toggle("has-layer", enabled);
    els.galaxyViewBtn.setAttribute("aria-label",
      "VIEW galaxy layers" + (enabled ? " · trade view on" : " · all layers off"));
  }
}

/* The list under the ring graph. It names every route, its status and the
   resources it moves, so the overlay doubles as a readable ledger. */
function renderGalaxyTradePanel(summary) {
  if (!els.galaxyTradePanel) return;
  const enabled = isGalaxyLayerEnabled("trade");
  els.galaxyTradePanel.classList.toggle("hidden", !enabled);
  if (!enabled) {
    els.galaxyTradePanel.innerHTML = "";
    return;
  }
  const parts = [];
  parts.push(
    '<div class="trade-panel-head">' +
      '<span class="kicker">GATE TRADE</span>' +
      '<span class="trade-panel-total">' + summary.active.length + " ACTIVE · ⚡" +
        summary.energy + " ⛏" + summary.minerals + " / TURN</span>" +
    "</div>"
  );
  if (!summary.centerCount) {
    parts.push(
      '<div class="trade-panel-empty">No trading centers. A builder can raise one in an empty hex; it needs an operational gate in its sector.</div>'
    );
  } else {
    parts.push('<div class="trade-route-list">');
    summary.routes.forEach(function (route) {
      const source = route.sourceSector ? route.sourceSector.name : "Unknown";
      const target = route.targetSector ? route.targetSector.name : "no destination";
      const tone = route.status === "active" ? "active"
        : route.status === "empty" ? "idle"
          : route.status === "building" ? "idle" : "blocked";
      const amount = (route.energy ? "⚡" + route.energy : "") +
        (route.minerals ? " ⛏" + route.minerals : "") || "—";
      parts.push(
        '<button class="trade-route-row ' + tone + '" data-open-sector="' + route.sourceSectorId + '" ' +
          'aria-label="Open ' + source + ' trade route to ' + target + '">' +
          '<span class="tr-main">' +
            '<span class="tr-name">' + source.toUpperCase() + " → " + target.toUpperCase() +
              (route.routeIndex ? ' <span class="tr-route">R' + (route.routeIndex + 1) + "</span>" : "") + "</span>" +
            '<span class="tr-meta">' + getTradeStatusLabel(route) +
              (route.status === "active" ? " · " + route.hops + (route.hops === 1 ? " HOP" : " HOPS") : "") +
              (route.reason ? " · " + route.reason : "") + "</span>" +
          "</span>" +
          '<span class="tr-side">' + amount + "<small>/ TURN</small></span>" +
        "</button>"
      );
    });
    parts.push("</div>");
  }
  parts.push(
    '<p class="trade-panel-foot">Trading centers ship after production and never more than their sector holds. A relay gate in a sector extends the reach of the next hop.</p>'
  );
  els.galaxyTradePanel.innerHTML = parts.join("");
}

function renderGalaxy() {
  if (!state.galaxy) return;
  const galaxy = state.galaxy;
  const current = getCurrentSector();
  const layout = CONFIG.galaxy.layout;
  const totalHexes = getTotalHexes();
  const currentId = current ? current.id : null;
  const currentRing = current ? current.ring : -1;

  els.galaxyGraph.setAttribute("viewBox", "0 0 " + layout.width + " " + galaxyGraphHeight());
  els.galaxySpace.style.width = layout.width + "px";
  els.galaxySpace.style.height = layout.height + "px";

  const pieces = [];

  /* A faint continuous orbit for each ring keeps the sequence readable
     between the dashed lane segments. */
  galaxy.rings.forEach(function (ringMeta) {
    if (ringMeta.ring === 0) return;
    const orbit = galaxyOrbit(ringMeta.ring);
    const activeRing = ringMeta.ring === currentRing;
    pieces.push(
      '<circle class="galaxy-orbit' + (activeRing ? " current" : "") + '" cx="' + layout.centerX +
      '" cy="' + layout.centerY + '" r="' + orbit.radius.toFixed(2) + '"></circle>'
    );
  });

  /* Ring lanes: one arc between each pair of ring neighbours. */
  galaxy.rings.forEach(function (ringMeta) {
    if (ringMeta.ring === 0) return;
    const ringSectors = ringMeta.sectorIds.map(getSector).filter(Boolean);
    for (let i = 0; i < ringSectors.length; i += 1) {
      const sector = ringSectors[i];
      const next = ringSectors[(i + 1) % ringSectors.length];
      const classes = ["galaxy-edge", "ring"];
      if (currentId && (sector.id === currentId || next.id === currentId)) classes.push("lane");
      if (sector.ring === currentRing) classes.push("current-ring");
      pieces.push(
        '<path class="' + classes.join(" ") + '" d="' + galaxyRingArcPath(sector, next) + '"></path>'
      );
    }
  });

  /* Radial lanes: each non-core sector is linked to its inward parent. */
  galaxy.sectors.forEach(function (sector) {
    if (sector.ring === 0 || !sector.parentId) return;
    const parent = getSector(sector.parentId);
    if (!parent) return;
    const from = galaxyNodePosition(parent);
    const to = galaxyNodePosition(sector);
    const active = currentId && (sector.id === currentId || parent.id === currentId);
    pieces.push(
      '<line class="galaxy-edge radial' + (active ? " lane" : "") +
      '" x1="' + from.x + '" y1="' + from.y + '" x2="' + to.x + '" y2="' + to.y + '"></line>'
    );
  });

  /* Seeded ring shortcuts. */
  (galaxy.extraLinks || []).forEach(function (extra) {
    const a = getSector(extra.a);
    const b = getSector(extra.b);
    if (!a || !b) return;
    const from = galaxyNodePosition(a);
    const to = galaxyNodePosition(b);
    const active = currentId && (a.id === currentId || b.id === currentId);
    pieces.push(
      '<line class="galaxy-edge shortcut' + (active ? " lane" : "") +
      '" x1="' + from.x + '" y1="' + from.y + '" x2="' + to.x + '" y2="' + to.y + '"></line>'
    );
  });

  /* Trade overlay: drawn above the lanes and below the nodes. */
  const tradeEnabled = isGalaxyLayerEnabled("trade");
  const tradeCenters = {};
  getTradingCenters().forEach(function (center) {
    tradeCenters[center.sectorId] = (tradeCenters[center.sectorId] || 0) + 1;
  });
  const tradeOverlay = tradeEnabled ? buildTradeOverlay() : { summary: getTradeSummary(), html: "" };
  if (tradeEnabled && tradeOverlay.html) {
    pieces.push('<g class="trade-layer" aria-hidden="true">' + tradeOverlay.html + "</g>");
  }

  galaxy.sectors.forEach(function (sector) {
    const pos = galaxyNodePosition(sector);
    const infoKnown = sectorHasCharts(sector);
    const charted = infoKnown ? getSectorChartedCount(sector.id) : 0;
    const fleets = infoKnown ? getSectorFleetCount(sector.id) : 0;
    const colonies = infoKnown ? getSectorColonyCount(sector.id) : 0;
    const sites = infoKnown ? countSectorAnomalies(sector.id, true) : 0;
    const rivalPresent = infoKnown && getSectorRivalPower(sector.id) > 0;
    const rivalColonies = infoKnown ? getSectorRivalColonyCount(sector.id) : 0;
    const rivalVisible = infoKnown && !!(rivalPresent || rivalColonies);
    const rivalEmpire = rivalVisible ? getDominantRivalEmpire(sector.id) : null;
    /* Power readouts — yours and any hostile power — are only published where
       a ship, colony or structure of yours is active right now. An explored
       but empty sector hides the numbers while keeping the rival flag. */
    const powerVisible = isSectorPowerVisible(sector);
    const power = powerVisible ? getSectorPower(sector.id) : 0;
    const rivalPower = powerVisible ? getSectorRivalPower(sector.id) : 0;
    const isCurrent = sector.id === currentId;
    const isNeighbor = !!current && current.neighbors.indexOf(sector.id) !== -1;
    const isTradeCenter = tradeEnabled && !!tradeCenters[sector.id];
    /* Names are a lighter fog than charts: a charted sector publishes its own
       name and the names one lane out. */
    const nameKnown = isSectorNameKnown(sector);

    const classes = ["galaxy-node"];
    if (sector.home) classes.push("home");
    if (infoKnown) classes.push("visited");
    else classes.push("uncharted");
    if (rivalVisible) classes.push("rival");
    if (isCurrent) classes.push("current");
    else if (isNeighbor) classes.push("neighbor");
    if (isTradeCenter) classes.push("trade-center");

    const icon = sector.home ? "★" : rivalVisible ? "⚑" : infoKnown ? "◈" : "?";
    /* A known name is not a chart. Only a charted sector publishes what is
       inside it; a name-only neighbour just shows its ring and uncharted
       status, and a charted sector with no player activity hides its power. */
    const meta = formatRingShort(sector.ring) + " · " +
      (infoKnown ? charted + "/" + totalHexes : "UNCHARTED") +
      (fleets ? "  ▲" + fleets : "") +
      (colonies ? "  ◆" + colonies : "") +
      (sites ? "  🔭" + sites : "") +
      (rivalColonies ? "  ⚑" + rivalColonies : "") +
      (rivalPower ? "  ⚔" + rivalPower : "");

    let aria = (nameKnown ? sector.name : "Unknown sector") + ", " +
      formatRingLabel(sector.ring) + " sector" +
      (sector.home ? ", home sector" : "") +
      (isCurrent ? ", current sector" : "") +
      (infoKnown ? ", visited" : ", uncharted") +
      ", " + charted + " of " + totalHexes + " hexes charted";
    if (colonies) aria += ", " + colonies + (colonies === 1 ? " colony" : " colonies");
    if (fleets) aria += ", " + fleets + (fleets === 1 ? " ship" : " ships");
    if (powerVisible && power) aria += ", sector power " + power;
    if (sites) aria += ", " + sites + (sites === 1 ? " survey site" : " survey sites") + " charted";
    if (rivalVisible) {
      aria += ", rival power present" +
        (rivalEmpire ? " (" + rivalEmpire.name + ")" : "") +
        (rivalPower ? ", hostile power " + rivalPower : "") +
        (rivalColonies ? ", " + rivalColonies + " rival " + (rivalColonies === 1 ? "colony" : "colonies") : "");
    }
    if (isTradeCenter) aria += ", " + tradeCenters[sector.id] + " trading center";

    const rivalStyle = rivalEmpire ? ' style="--rival-color:' + rivalEmpire.color + '"' : "";
    pieces.push(
      '<g class="' + classes.join(" ") + '" data-sector="' + sector.id + '" tabindex="0" role="button" aria-label="' + aria + '"' + rivalStyle + ">" +
        '<circle class="node-halo" cx="' + pos.x + '" cy="' + pos.y + '" r="21"></circle>' +
        '<circle class="node-core" cx="' + pos.x + '" cy="' + pos.y + '" r="16"></circle>' +
        '<text class="node-icon" x="' + pos.x + '" y="' + (pos.y + 0.5) + '">' + icon + "</text>" +
        (nameKnown
          ? '<rect class="node-label-bg" x="' + (pos.x - 30) + '" y="' + (pos.y + 25) + '" width="60" height="19" rx="3.5"></rect>' +
            '<text class="node-name" x="' + pos.x + '" y="' + (pos.y + 32) + '">' + sector.name.toUpperCase() + "</text>" +
            '<text class="node-meta" x="' + pos.x + '" y="' + (pos.y + 41) + '">' + meta + "</text>"
          : "") +
        (power
          ? '<g class="node-power" aria-hidden="true">' +
              '<rect class="node-power-bg" x="' + (pos.x - 18) + '" y="' + (pos.y - 33) + '" width="36" height="11" rx="3.5"></rect>' +
              '<text class="node-power-text" x="' + pos.x + '" y="' + (pos.y - 24.6) + '">PWR ' + power + "</text>" +
            "</g>"
          : "") +
        (isTradeCenter
          ? '<g class="node-trade" aria-hidden="true">' +
              '<circle cx="' + (pos.x + 17) + '" cy="' + (pos.y - 17) + '" r="7.2"></circle>' +
              '<text x="' + (pos.x + 17) + '" y="' + (pos.y - 17 + 0.4) + '">🏪</text>' +
            "</g>"
          : "") +
      "</g>"
    );
  });

  els.galaxyGraph.innerHTML = pieces.join("");
  els.galaxySectorCount.textContent = String(galaxy.sectors.length);
  els.galaxySeed.textContent = "SEED " + galaxy.seed + " · " + galaxy.sectors.length +
    " SECTORS · " + galaxy.outerRings + (galaxy.outerRings === 1 ? " RING" : " RINGS");

  /* The header shows the sector you are currently in; the VIEW menu and the
     trade panel only appear meaningful when the sector is known. */
  if (els.galaxyLedger) {
    els.galaxyLedger.textContent = current
      ? getSectorLabel(current).toUpperCase() + " · ⚡" + formatAmount(getSectorStock(current.id, "energy")) +
        " ⛏" + formatAmount(getSectorStock(current.id, "minerals"))
      : "NO SECTOR";
  }
  renderGalaxyLayerMenu(tradeOverlay.summary);
  renderGalaxyTradePanel(tradeOverlay.summary);
  const sectorMode = state.ui.mapMode === "sector";
  els.galaxyPanel.classList.toggle("hidden", sectorMode);
  els.sectorPanel.classList.toggle("hidden", !sectorMode);
}

function scrollGalaxyToCurrentSector() {
  const sector = getCurrentSector();
  if (!sector || state.ui.mapMode !== "galaxy" || state.ui.activeTab !== "map") return;
  window.requestAnimationFrame(function () {
    const stage = els.galaxyStage;
    const node = els.galaxyGraph.querySelector('[data-sector="' + sector.id + '"]');
    if (!stage || !node || !stage.clientWidth || !stage.clientHeight) return;
    const stageBox = stage.getBoundingClientRect();
    const nodeBox = node.getBoundingClientRect();
    const left = stage.scrollLeft + (nodeBox.left - stageBox.left) -
      (stage.clientWidth - nodeBox.width) / 2;
    const top = stage.scrollTop + (nodeBox.top - stageBox.top) -
      (stage.clientHeight - nodeBox.height) / 2;
    stage.scrollLeft = Math.max(0, left);
    stage.scrollTop = Math.max(0, top);
  });
}