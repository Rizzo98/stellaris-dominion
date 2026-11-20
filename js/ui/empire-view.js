/* ============================================================
   EMPIRE VIEW — totals, metadata, military summary, rival powers and
   the dispatch log, followed by the colony ledger.
   ============================================================ */

function renderEmpireMilitary(econ, military) {
  if (!els.empireMilitary) return;
  const patrols = getPlayerPatrols().length;
  const strongholds = getPlayerStrongholds().length;
  const activeRaids = getActiveRaids().length;
  const cells = [
    { key: "patrols", label: "PATROLS", value: patrols, note: "R1 COVERAGE", tone: patrols ? "good" : "" },
    { key: "strongholds", label: "STRONGHOLDS", value: strongholds, note: "STATIC R2", tone: strongholds ? "good" : "" },
    { key: "kills", label: "HOSTILES", value: military.kills, note: "DESTROYED", tone: military.kills ? "good" : "" },
    { key: "losses", label: "LOSSES", value: military.losses, note: "SHIPS LOST", tone: military.losses ? "bad" : "" }
  ];
  els.empireMilitary.innerHTML =
    '<div class="military-cells">' +
      cells.map(function (cell) {
        return '<div class="military-cell ' + cell.tone + '">' +
          '<span class="military-label">' + cell.label + '</span>' +
          '<b class="military-value">' + cell.value + '</b>' +
          '<span class="military-note">' + cell.note + '</span>' +
        '</div>';
      }).join("") +
    '</div>' +
    '<div class="military-foot">' +
      '<span>⚔ ' + military.battles + (military.battles === 1 ? " ENGAGEMENT" : " ENGAGEMENTS") +
        ' · 🏴 ' + military.raids + (military.raids === 1 ? " RAID" : " RAIDS") + ' SUFFERED</span>' +
      (activeRaids
        ? '<span class="text-gold">⚔ ' + activeRaids + ' RAID' + (activeRaids === 1 ? "" : "S") + ' ACTIVE</span>'
        : '<span class="text-muted">LANES QUIET</span>') +
    '</div>';
}

function renderRivalList() {
  if (!els.empireRivalList) return;
  const empires = getMetEmpires();
  if (!empires.length) {
    els.empireRivalList.innerHTML =
      '<div class="empty-state">No rival power charted yet. Jump into a neighbouring sector, or wait for a raider to find you.</div>';
    return;
  }
  els.empireRivalList.innerHTML = empires.map(function (empire) {
    const def = getEmpireStateDef(empire);
    const power = getEmpirePower(empire);
    const colonies = getEmpireColonyCount(empire);
    return (
      '<button class="rival-card" data-rival-sheet="' + empire.id + '" style="--rival-color:' + empire.color + '">' +
        '<span class="rival-emoji" aria-hidden="true">' + empire.emoji + '</span>' +
        '<span class="rival-main">' +
          '<span class="rival-name">' + empire.name + '</span>' +
          '<span class="rival-meta">RING ' + empire.ring + ' · ' + getRivalTierLabel(empire) +
            ' · ' + (def ? def.label : "PATROL") + '</span>' +
          '<span class="rival-last">' + getEmpireActionLabel(empire) + '</span>' +
        '</span>' +
        '<span class="rival-side">' +
          '<span class="pill alert">⚔ ' + power + '</span>' +
          '<span class="rival-cols">⚑ ' + colonies + '</span>' +
        '</span>' +
      '</button>'
    );
  }).join("");
}

function renderMilitaryLog() {
  if (!els.empireMilitaryLog) return;
  const log = (state.military && state.military.log) ? state.military.log : [];
  if (!log.length) {
    els.empireMilitaryLog.innerHTML =
      '<div class="empty-state">No military dispatches. Patrols, battles and raids are reported here.</div>';
    return;
  }
  const rows = log.slice(-7).reverse().map(function (entry) {
    const tone = entry.tone || "info";
    return '<div class="military-log-row tone-' + tone + '">' +
      '<span class="log-turn">T' + entry.turn + '</span>' +
      '<span class="log-text">' + entry.text + '</span>' +
    '</div>';
  }).join("");
  els.empireMilitaryLog.innerHTML = rows;
}

/* Every sector's own ledger, so local shortages and trade routes are visible
   from one place. Clicking a row opens that sector's map. */
function renderSectorLedgerList(econ) {
  if (!els.empireSectorLedger) return;
  const rows = econ.sectors.filter(function (sectorEcon) {
    if (!sectorEcon.sector) return false;
    return sectorEcon.colonyCount > 0 ||
      getSectorStock(sectorEcon.sectorId, "energy") !== 0 ||
      getSectorStock(sectorEcon.sectorId, "minerals") !== 0 ||
      sectorEcon.trade.entries.length > 0 ||
      sectorEcon.tradeCenterCount > 0;
  });
  if (!rows.length) {
    els.empireSectorLedger.innerHTML =
      '<div class="empty-state">No sector ledger yet. Energy and minerals are stored where they are produced.</div>';
    return;
  }
  els.empireSectorLedger.innerHTML = rows.map(function (sectorEcon) {
    const sector = sectorEcon.sector;
    const flow = sectorEcon.trade;
    const tradeBits = [];
    if (flow.in.energy || flow.in.minerals) tradeBits.push("in ⚡" + flow.in.energy + " ⛏" + flow.in.minerals);
    if (flow.out.energy || flow.out.minerals) tradeBits.push("out ⚡" + flow.out.energy + " ⛏" + flow.out.minerals);
    const metaBits = [
      getSectorRingLabel(sector),
      sectorEcon.colonyCount + (sectorEcon.colonyCount === 1 ? " COL" : " COLS")
    ];
    if (sectorEcon.tradeCenterCount) metaBits.push("🏪 " + sectorEcon.tradeCenterCount);
    if (tradeBits.length) metaBits.push(tradeBits.join(" · "));
    const energy = getSectorStock(sectorEcon.sectorId, "energy");
    const minerals = getSectorStock(sectorEcon.sectorId, "minerals");
    return (
      '<button class="sector-ledger-row" data-open-sector="' + sector.id + '" aria-label="Open ' + sector.name + ' sector">' +
        '<span class="sl-main">' +
          '<span class="sl-name">' + sector.name + (sector.home ? " · CAPITAL" : "") + "</span>" +
          '<span class="sl-meta">' + metaBits.join(" · ") + "</span>" +
        "</span>" +
        '<span class="sl-side">' +
          '<span class="sl-value">⚡ ' + formatAmount(energy) +
            ' <small class="' + signedClass(sectorEcon.net.energy) + '">' + formatSigned(sectorEcon.net.energy) + "</small></span>" +
          '<span class="sl-value">⛏ ' + formatAmount(minerals) +
            ' <small class="' + signedClass(sectorEcon.net.minerals) + '">' + formatSigned(sectorEcon.net.minerals) + "</small></span>" +
        "</span>" +
      "</button>"
    );
  }).join("");
}

function renderEmpireView() {
  const econ = getEconomy();
  const totals = [
    {
      key: "energy",
      value: econ.sectors.reduce(function (sum, sectorEcon) {
        return sum + getSectorStock(sectorEcon.sectorId, "energy");
      }, 0),
      delta: econ.netEnergy
    },
    {
      key: "minerals",
      value: econ.sectors.reduce(function (sum, sectorEcon) {
        return sum + getSectorStock(sectorEcon.sectorId, "minerals");
      }, 0),
      delta: econ.netMinerals
    },
    { key: "research", value: state.resources.research, delta: econ.income.research },
    { key: "influence", value: state.resources.influence, delta: econ.income.influence }
  ];
  els.empireTotals.innerHTML = totals.map(function (item) {
    const meta = RESOURCE_META[item.key];
    return (
      '<div class="total-cell">' +
        '<span class="total-label">' + meta.name.toUpperCase() + "</span>" +
        '<span class="total-value"><span class="total-icon">' + meta.icon + "</span>" + formatAmount(item.value) + "</span>" +
        '<span class="total-label ' + signedClass(item.delta) + '">' + formatSigned(item.delta) + " / TURN</span>" +
      "</div>"
    );
  }).join("");

  const completedBuildings = econ.builtCount;
  const activeName = state.tech.active ? TECHS[state.tech.active].name : "None";
  const military = state.military || { kills: 0, losses: 0, battles: 0, raids: 0 };
  els.empireMeta.innerHTML =
    "<span>STABILITY " + state.stability + "/100 · " + completedBuildings + " BUILDINGS</span>" +
    "<span>TECHS " + completedTechCount() + " · " + activeName.toUpperCase() +
      " · ⚔ " + military.kills + "K / " + military.losses + "L</span>";

  renderEmpireMilitary(econ, military);
  renderSectorLedgerList(econ);
  renderRivalList();
  renderMilitaryLog();

  const colonyCount = state.systems.filter(function (system) { return system.colonized; }).length;
  els.empireColonyBadge.textContent = colonyCount + (colonyCount === 1 ? " COLONY" : " COLONIES");

  const cards = [];
  state.systems.forEach(function (system) {
    if (!system.colonized) return;
    const planet = getPlanetBreakdown(system);
    const localEnergy = planet.output.energy - planet.upkeep;
    const attention = getSystemAttention(system);
    const unlockedSlots = getMaxSlots(system);
    const usedSlots = getUsedSlots(system);
    const hasConstruction = system.slots.some(function (slot) {
      return slot && slot.underConstruction;
    });
    let pill;
    if (hasConstruction) {
      pill = '<span class="pill alert">BUILDING</span>';
    } else if (planet.workforce.blockedBuildings > 0) {
      pill = '<span class="pill alert">NEEDS POP</span>';
    } else if (planet.workforce.idleBuildings > 0) {
      pill = '<span class="pill alert">NO WORKERS</span>';
    } else if (planet.workforce.partialBuildings > 0) {
      pill = '<span class="pill alert">UNDERSTAFFED</span>';
    } else if (attention) {
      pill = '<span class="pill alert">' + (attention === "done" ? "COMPLETE" : "FREE SLOT") + "</span>";
    } else {
      pill = '<span class="pill quiet">' + usedSlots + "/" + unlockedSlots + " SLOTS</span>";
    }

    cards.push(
      '<button class="planet-card" data-open-system="' + system.id + '" aria-label="Open ' + system.name + '">' +
        '<span class="p-emoji" aria-hidden="true">' + system.emoji + "</span>" +
        '<span class="p-main">' +
          '<span class="p-name">' + system.name + (system.home ? " · CAPITAL" : "") + "</span>" +
          '<span class="p-yield">⚡ ' + formatSigned(localEnergy) + " · ⛏ " + formatSigned(planet.output.minerals) +
          " · 🔬 " + formatSigned(planet.output.research) + " · 👥 " + planet.population +
          " · 😊 " + Math.round(planet.happiness) + "%</span>" +
        "</span>" +
        '<span class="p-side">' + pill + "</span>" +
      "</button>"
    );
  });
  els.empireList.innerHTML = cards.length ? cards.join("") : '<div class="empty-state">No colonies. How did you get here?</div>';
}