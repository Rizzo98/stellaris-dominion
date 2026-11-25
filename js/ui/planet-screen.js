/* ============================================================
   PLANET SCREEN — hex details, space structures, world tab and fleet tab
   Contains the biggest set of HTML builders: the clickable population card,
   slots, structure construction, ship construction, world actions and the
   fleet manifest.
   ============================================================ */

function buildingYieldText(type, level) {
  const lv = level == null ? 1 : level;
  const output = getBuildingOutput(type, lv);
  const parts = [];
  ["energy", "minerals", "research", "influence"].forEach(function (key) {
    if (output[key]) parts.push("+" + formatAmount(output[key]) + " " + RESOURCE_META[key].icon);
  });
  const workers = getBuildingWorkers(type, lv);
  if (workers) parts.push(workers + (workers === 1 ? " worker" : " workers"));
  const minPopulation = getBuildingMinPopulation(type, lv);
  if (minPopulation) parts.push("needs " + minPopulation + " pop");
  const upkeep = getBuildingUpkeep(type);
  if (upkeep) parts.push("−" + upkeep + " " + RESOURCE_META.energy.icon + " upkeep");
  return parts.join(" · ");
}

/* A partial crew produces a fraction of the building's full yield. */
function buildingScaledYieldText(type, ratio, level) {
  const output = getBuildingOutput(type, level);
  const parts = [];
  ["energy", "minerals", "research", "influence"].forEach(function (key) {
    const value = (output[key] || 0) * ratio;
    if (value) parts.push("+" + formatAmount(value) + " " + RESOURCE_META[key].icon);
  });
  const upkeep = getBuildingUpkeep(type);
  if (upkeep) parts.push("−" + upkeep + " " + RESOURCE_META.energy.icon + " upkeep");
  return parts.length ? parts.join(" · ") : "No output";
}

function buildingLevelChip(level, type) {
  if (!level || level <= 1) return "";
  const levelName = getBuildingLevelName(type, level);
  return ' <span class="slot-level">LVL ' + level + (levelName ? " · " + levelName.toUpperCase() : "") + "</span>";
}

/* Crew controls on a completed facility. The buttons are disabled with a
   title when the move is illegal (full crew, no free workers, population
   below the facility's minimum). */
function facilityCrewHTML(system, index, entry) {
  if (!entry || entry.underConstruction) return "";
  const minusReason = getFacilityWorkerChangeReason(system, index, -1);
  const plusReason = getFacilityWorkerChangeReason(system, index, 1);
  return (
    '<span class="slot-crew" role="group" aria-label="Assign workers to slot ' + (index + 1) + '">' +
      '<button class="slot-crew-btn" type="button" data-facility-workers="' + index + ':-1"' +
        (minusReason ? ' disabled title="' + minusReason + '"' : "") +
        ' aria-label="Remove one worker from slot ' + (index + 1) + '">−</button>' +
      '<b class="slot-crew-value">' + entry.workersAssigned + "/" + entry.workersRequired + "</b>" +
      '<button class="slot-crew-btn" type="button" data-facility-workers="' + index + ':1"' +
        (plusReason ? ' disabled title="' + plusReason + '"' : "") +
        ' aria-label="Assign one worker to slot ' + (index + 1) + '">+</button>' +
    "</span>"
  );
}

/* A tech never upgrades a standing building by itself. When a completed
   Building tech has unlocked a higher level, the slot grows this refit
   button; it costs half the building's own build cost. The button stays
   visible but disabled while the move is illegal: a short ledger, or a
   colony below the population gate of the level the refit would reach. A
   facility under its gate produces nothing, so that refit would switch a
   working building off. */
function buildingRefitHTML(system, index, slot) {
  const level = getBuildingLevel(slot);
  const unlocked = getBuildingUnlockedLevel(slot.type);
  if (level >= unlocked) {
    return '<span class="slot-plus text-good" aria-hidden="true">✓</span>';
  }
  const def = BUILDINGS[slot.type];
  const nextLevel = level + 1;
  const cost = getBuildingUpgradeCost(slot.type);
  const sector = getSector(system.sectorId);
  const stock = getSectorStock(system.sectorId, "minerals");
  const affordable = stock >= cost.minerals;
  const populationReason = getBuildingRefitPopulationReason(system, slot.type, nextLevel);
  const ledgerReason = affordable ? "" :
    "Need " + cost.minerals + " minerals in " + (sector ? sector.name : "this sector") +
    " for the refit (" + formatAmount(Math.max(0, stock)) + " held).";
  const reason = populationReason || ledgerReason;
  const gated = !!populationReason;
  const costLabel = gated
    ? "L" + nextLevel + " · NEEDS " + getBuildingMinPopulation(slot.type, nextLevel) + " POP"
    : "L" + nextLevel + " · " + cost.minerals + " ⛏";
  return (
    '<button class="slot-refit' + (gated ? " gated" : affordable ? "" : " short") + '" type="button"' +
      ' data-upgrade-building="' + index + '"' + (reason ? " disabled" : "") +
      (reason ? ' title="' + reason + '"' : "") +
      ' aria-label="Refit ' + def.name + ' to level ' + nextLevel + " for " + cost.minerals + " minerals" +
      (reason ? " — " + reason : "") + '">' +
      '<span class="slot-refit-label">REFIT</span>' +
      '<span class="slot-refit-cost">' + costLabel + "</span>" +
    "</button>"
  );
}

function shipPatrolRadius(ship) {
  const type = SHIP_TYPES[ship.type];
  if (!type || !type.military) return 0;
  if (typeof type.patrolRadius === "number") return type.patrolRadius;
  return (CONFIG.military && CONFIG.military.patrolRadius) || 1;
}

function strongholdStatsText(structure) {
  const def = STRUCTURE_TYPES.stronghold;
  return "⚔ " + getStructureAttack(structure) + " · 🛡 " + getStructureHull(structure) + "/" + def.hull +
    " · ✦ " + def.power + " PWR · R" + def.patrolRadius +
    " · −" + def.energyUpkeep + " ⚡";
}

function contactRowHTML(source, inHex) {
  const empire = source.empire || getEmpire(source.owner);
  const color = empire ? empire.color : "#ff7a7a";
  const isStructure = source.kind === "structure";
  const name = isStructure
    ? (empire ? empire.name + " Stronghold" : "Stronghold")
    : (source.ship ? source.ship.name : "Hostile ship");
  const hull = isStructure
    ? "🛡 " + getStructureHull(source.structure) + "/" + getStructureHullMax(source.structure)
    : "🛡 " + getShipHull(source.ship) + "/" + getShipHullMax(source.ship);
  const tag = isStructure
    ? (source.structure.underConstruction ? "BUILDING" : "R" + getStructurePatrolRadius(source.structure))
    : (source.radius > 0 ? "R" + source.radius : (inHex ? "IN HEX" : "GARRISON"));
  const shipType = !isStructure && source.ship ? SHIP_TYPES[source.ship.type] : null;
  const glyph = isStructure ? "🏰" : (shipType ? shipType.emoji : "🚀");
  return '<div class="contact-row" style="--rival-color:' + color + '">' +
    '<span class="contact-emoji" aria-hidden="true">' + glyph + '</span>' +
    '<span class="contact-main">' +
      '<span class="contact-name">' + name + '</span>' +
      '<span class="contact-meta">' + (empire ? empire.name + ' · ' : '') + hull + '</span>' +
    '</span>' +
    '<span class="contact-tag">' + tag + '</span>' +
  '</div>';
}

/* The fleet tab's tactical readout: what protects this hex and what is
   currently hostile in or around it. */
function patrolStatusHTML(sector, row, col) {
  if (!sector) return "";
  const coverage = getPlayerDefenseCoverageAt(sector.id, row, col);
  const contacts = getRivalFleetAt(row, col, sector.id);
  const hostileSources = getRivalDefenseCoverageAt(sector.id, row, col).filter(function (source) {
    if (source.kind === "structure") return true;
    return source.radius > 0 || (source.row === row && source.col === col);
  });
  const contactsById = {};
  contacts.forEach(function (ship) { contactsById["ship:" + ship.id] = true; });
  const extraSources = hostileSources.filter(function (source) {
    if (source.kind === "structure") return true;
    return !contactsById["ship:" + source.ship.id];
  });
  const exposed = (contacts.length || hostileSources.length) && !coverage.length;
  const parts = [];

  parts.push(
    '<div class="fleet-section patrol-section">' +
      '<div class="fleet-section-head"><h3>PATROL COVERAGE</h3>' +
        '<span class="fleet-selected-count ' + (exposed ? "text-bad" : coverage.length ? "text-good" : "") + '">' +
          (exposed ? "EXPOSED" : coverage.length ? "COVERED" : "NO COVERAGE") + '</span></div>'
  );

  if (coverage.length) {
    parts.push('<div class="patrol-list">');
    coverage.forEach(function (source) {
      const isStructure = source.kind === "structure";
      const label = isStructure ? "Stronghold" : source.ship.name;
      const radius = isStructure ? getStructurePatrolRadius(source.structure) : source.radius;
      const relation = radius > 0 ? "R" + radius + " ZONE" : "GARRISON";
      parts.push(
        '<div class="patrol-row">' +
          '<span class="patrol-row-icon" aria-hidden="true">' + (isStructure ? "🏰" : "🛡") + '</span>' +
          '<span class="patrol-row-main">' +
            '<span class="patrol-row-name">' + label + '</span>' +
            '<span class="patrol-row-meta">' + (isStructure ? "Static defender" : "Patrol corvette") + ' · ' + relation + '</span>' +
          '</span>' +
          '<span class="patrol-row-radius">' + (radius > 0 ? radius + " HEX" : "GARRISON") + '</span>' +
        '</div>'
      );
    });
    parts.push('</div>');
  } else {
    parts.push('<div class="slot-lock-note"><span>🛡</span><span>No friendly patrol covers this hex. A corvette in the hex still fights in place; SET PATROL extends its reach to 1 hex. A stronghold covers 2.</span></div>');
  }

  if (hostileSources.length) {
    parts.push('<div class="fleet-section-head contacts-head"><h3>HOSTILE CONTACTS</h3><span class="fleet-selected-count text-bad">' +
      hostileSources.length + (hostileSources.length === 1 ? " CONTACT" : " CONTACTS") + '</span></div>');
    parts.push('<div class="contact-list">');
    hostileSources.forEach(function (source) {
      parts.push(contactRowHTML(source, source.row === row && source.col === col));
    });
    parts.push('</div>');
    parts.push('<p class="fleet-note">' + (exposed
      ? "This hex is exposed. Hostile ships will fire when the turn resolves. Set a corvette to patrol or anchor a stronghold nearby."
      : "Both sides fire in the same resolution. Patrol ships fire on one hostile in their radius each turn, so a wider zone is safer.") + '</p>');
  } else if (coverage.length) {
    parts.push('<p class="fleet-note">No hostile contact. The zone will fire on a hostile that enters it before the next resolution.</p>');
  }

  parts.push("</div>");
  return parts.join("");
}

function hostileStructureCardHTML(structure) {
  const def = STRUCTURE_TYPES[structure.type];
  if (!def) return "";
  const empire = getEmpire(structure.owner);
  const building = !!structure.underConstruction;
  return (
    '<div class="structure-card hostile' + (building ? " construction" : "") + '" style="--rival-color:' + (empire ? empire.color : "#ff7a7a") + '">' +
      '<span class="structure-card-icon" aria-hidden="true">' + (building ? "🚧" : def.emoji) + '</span>' +
      '<span class="structure-card-main">' +
        '<span class="structure-card-name">' + def.name + (empire ? " · " + empire.name : "") + '</span>' +
        '<span class="structure-card-desc">' + def.desc + '</span>' +
        '<span class="structure-card-state">' +
          (building ? "UNDER CONSTRUCTION · HOSTILE" : "HOSTILE INSTALLATION · " + strongholdStatsText(structure)) +
        '</span>' +
        (building ? '<span class="construction-stripes"><span></span></span>' : "") +
      '</span>' +
      '<span class="structure-card-tag hostile">HOSTILE</span>' +
    '</div>'
  );
}

function planetYieldChips(system, planet) {
  const localEnergy = planet.output.energy - planet.upkeep;
  const size = getPlanetSizeDef(system.planetSize);
  const totalSlots = getTotalSlots(system);
  const unlockedSlots = getMaxSlots(system);
  const lockedSlots = totalSlots - unlockedSlots;
  const happiness = Math.round(planet.happiness);
  return (
    '<span class="yield-chip">' + size.name.toUpperCase() + " · " + size.slots + " SLOTS</span>" +
    '<span class="yield-chip ' + (localEnergy >= 0 ? "good" : "bad") + '">⚡ ' + formatSigned(localEnergy) + "</span>" +
    '<span class="yield-chip">⛏ ' + formatSigned(planet.output.minerals) + "</span>" +
    '<span class="yield-chip">🔬 ' + formatSigned(planet.output.research) + "</span>" +
    '<span class="yield-chip' + (planet.idleJobs > 0 ? " warn" : "") + '">👥 ' + planet.population + "</span>" +
    '<span class="yield-chip ' + (happiness >= 70 ? "good" : happiness >= 40 ? "warn" : "bad") + '">😊 ' + happiness + "%</span>" +
    '<span class="yield-chip">▦ ' + getUsedSlots(system) + "/" + unlockedSlots +
      " USED" + (lockedSlots ? " · " + lockedSlots + " LOCKED" : "") + "</span>"
  );
}

/* The population card is the door to the maintenance menu. It reports the
   one relationship the system is built around: people need energy and
   housing, and the happiness they produce is the growth rate. */
function populationCardHTML(system, planet) {
  const wf = planet.workforce;
  const report = planet.populationMaintenance;
  const happiness = Math.round(report.happiness);
  const energyPercent = Math.round(report.energyFulfillment * 100);
  const housingPercent = report.population > 0
    ? clamp((report.housingCapacity / report.population) * 100, 0, 100)
    : 100;
  const idleClass = wf.idleJobs > 0 ? " warn" : "";
  const happyClass = happiness >= 70 ? " good" : happiness >= 40 ? " warn" : " bad";
  const growthClass = report.canGrow ? " good" : " warn";
  const tier = report.tier || { id: "miserable", label: "MISERABLE" };
  let growthText = "PAUSED";
  let note;

  if (report.population <= 0) {
    growthText = "EMPTY";
    note = "No population lives here. Maintained colonies start with " +
      getEconomyConfig().startingPopulation.colony + " people.";
  } else if (report.canGrow) {
    growthText = "+" + formatGrowthAmount(report.growthAmount) + " / TURN";
    note = "Next population in " + report.turnsToNextPop +
      (report.turnsToNextPop === 1 ? " turn." : " turns.") +
      " Happiness " + happiness + "% · energy " + energyPercent + "% · housing " + housingPercent + "%.";
    if (report.growthMultiplier > 1.001) {
      note += " Maintenance surplus ×" + report.growthMultiplier.toFixed(2) + ".";
    }
  } else if (report.growthBlockedBy === "unfunded") {
    growthText = "UNFUNDED";
    note = "The colony has no energy and is short on housing. Open the population menu and fund both maintenance lines.";
  } else if (report.growthBlockedBy === "energy") {
    growthText = "NO ENERGY";
    note = "The colony cannot supply the energy its people need. Open the population menu and fund the energy maintenance.";
  } else if (report.growthBlockedBy === "housing") {
    growthText = "NO HOUSING";
    note = "Minerals invested in housing are below what the population needs. Open the population menu and raise the housing investment.";
  } else {
    growthText = "NO GROWTH";
    note = "Happiness is zero, so the population is stable. Fund energy and housing to restart growth.";
  }

  if (wf.blockedBuildings > 0) {
    note += " " + wf.blockedBuildings +
      (wf.blockedBuildings === 1 ? " facility is" : " facilities are") +
      " below its minimum population.";
  } else if (wf.idleBuildings > 0) {
    note += " " + wf.idleBuildings + (wf.idleBuildings === 1 ? " building has" : " buildings have") +
      " no workers: no output until crewed.";
  } else if (wf.partialBuildings > 0) {
    note += " " + wf.partialBuildings + (wf.partialBuildings === 1 ? " building is" : " buildings are") +
      " understaffed, so output is reduced.";
  }

  return (
    '<button class="population-card" type="button" data-population-menu="' + system.id + '"' +
      ' aria-haspopup="dialog" aria-controls="sheet"' +
      ' aria-label="Manage population on ' + system.name + ': ' + report.population +
      ' people, happiness ' + happiness + ' percent, energy ' + energyPercent +
      ' percent, housing ' + housingPercent + ' percent">' +
      '<span class="population-head">' +
        '<span class="population-title"><span class="pop-glyph" aria-hidden="true">👥</span>POPULATION</span>' +
        '<span class="population-value">' + report.population + ' <small>PEOPLE</small></span>' +
      '</span>' +
      '<span class="population-track"><span class="population-fill" style="width:' + happiness.toFixed(1) + '%"></span></span>' +
      '<span class="population-meta">' +
        '<span class="population-chip' + idleClass + '">👷 ' + wf.jobsStaffed + ' / ' + wf.jobsTotal + ' JOBS</span>' +
        '<span class="population-chip">⚡ ' + energyPercent + '% ENERGY</span>' +
        '<span class="population-chip' + (report.housingDeficit > 0 ? " warn" : "") + '">🏠 ' +
          formatAmount(Math.min(report.housingCapacity, report.population)) + ' / ' + report.population + ' HOUSED</span>' +
        '<span class="population-chip' + happyClass + '">😊 ' + happiness + '% ' + tier.label + '</span>' +
        '<span class="population-chip' + growthClass + '">📈 ' + growthText + '</span>' +
        (report.growthMultiplier > 1.001
          ? '<span class="population-chip good">×' + report.growthMultiplier.toFixed(2) + ' GROWTH</span>'
          : "") +
        (wf.blockedBuildings > 0 ? '<span class="population-chip warn">⚠ ' + wf.blockedBuildings + ' BLOCKED</span>' : "") +
        (wf.idleBuildings > 0 ? '<span class="population-chip warn">⚠ ' + wf.idleBuildings + ' IDLE</span>' : "") +
        (wf.partialBuildings > 0 ? '<span class="population-chip warn">⚠ ' + wf.partialBuildings + ' PARTIAL</span>' : "") +
      '</span>' +
      '<span class="population-note">' + note + '</span>' +
      '<span class="population-open"><span>MANAGE MAINTENANCE &amp; WORKFORCE</span><b aria-hidden="true">›</b></span>' +
    '</button>'
  );
}

function slotTileHTML(system, index, workforce) {
  const maxSlots = getMaxSlots(system);
  if (index >= maxSlots) {
    const cost = getSlotUnlockCost(system);
    const reason = getSlotUnlockBlockReason(system, index);
    const canUnlock = !reason;
    return (
      '<button class="slot-tile locked' + (canUnlock ? " unlockable" : "") + '" type="button" data-unlock-slot="' + index + '"' +
        (canUnlock ? "" : " disabled") + ' aria-label="Unlock bonus building slot ' + (index + 1) + '">' +
        '<span class="slot-emoji" aria-hidden="true">🔒</span>' +
        '<span class="slot-main">' +
          '<span class="slot-name">Bonus building slot</span>' +
          '<span class="slot-yield">Locked · ' + cost.energy + " ⚡ + " + cost.minerals + " ⛏ to open</span>" +
          '<span class="slot-state">' + (canUnlock ? "TAP TO UNLOCK" : reason.toUpperCase()) + "</span>" +
        "</span>" +
        '<span class="slot-plus" aria-hidden="true">' + (canUnlock ? "›" : "·") + "</span>" +
      "</button>"
    );
  }

  const building = system.slots[index];
  if (!building) {
    return (
      '<button class="slot-tile empty" data-build-slot="' + index + '" aria-label="Build in slot ' + (index + 1) + '">' +
        '<span class="slot-emoji" aria-hidden="true">＋</span>' +
        '<span class="slot-main">' +
          '<span class="slot-name">Empty building slot</span>' +
          '<span class="slot-yield">Tap to construct · 1 turn to complete</span>' +
          '<span class="slot-state">AVAILABLE</span>' +
        "</span>" +
        '<span class="slot-plus" aria-hidden="true">›</span>' +
      "</button>"
    );
  }

  const def = BUILDINGS[building.type];
  const planEntry = workforce.entries.find(function (entry) { return entry.index === index; }) || {};
  const level = getBuildingLevel(building);
  const levelName = getBuildingLevelName(building.type, level);
  const levelChip = buildingLevelChip(level, building.type);
  const required = planEntry.workersRequired != null
    ? planEntry.workersRequired
    : getBuildingWorkers(building.type, level);
  const minPopulation = planEntry.minPopulation != null
    ? planEntry.minPopulation
    : getBuildingMinPopulation(building.type, level);
  const assigned = planEntry.workersAssigned || 0;
  const ratio = planEntry.staffedRatio || 0;
  const percent = Math.round(ratio * 100);
  const eligible = planEntry.eligible !== false;

  if (building.underConstruction) {
    return (
      '<div class="slot-tile construction">' +
        '<span class="slot-emoji" aria-hidden="true">' + def.emoji + "</span>" +
        '<span class="slot-main">' +
          '<span class="slot-name">' + def.name + levelChip + "</span>" +
          '<span class="slot-yield">Online next turn · needs ' + required +
            (required === 1 ? " worker" : " workers") +
            (minPopulation ? " + " + minPopulation + " population" : "") + "</span>" +
          '<span class="slot-state">UNDER CONSTRUCTION</span>' +
          '<span class="construction-stripes"><span></span></span>' +
        "</span>" +
        '<span class="slot-plus" aria-hidden="true">◌</span>' +
      "</div>"
    );
  }

  /* A completed tech only raises the refit cap. Every finished building
     therefore shows its own level and, while a refit is waiting, a button
     priced at half the building's build cost. */
  const refit = buildingRefitHTML(system, index, building);
  const crewStepper = facilityCrewHTML(system, index, planEntry);
  const side = '<span class="slot-side">' + crewStepper + refit + "</span>";
  const levelLine = levelName ? " · " + levelName.toUpperCase() : "";

  if (required > 0 && !eligible) {
    return (
      '<div class="slot-tile idle blocked">' +
        '<span class="slot-emoji" aria-hidden="true">' + def.emoji + "</span>" +
        '<span class="slot-main">' +
          '<span class="slot-name">' + def.name + levelChip + "</span>" +
          '<span class="slot-yield">Needs a colony of ' + minPopulation + " population · would produce " +
            buildingScaledYieldText(building.type, 1, level) + " with " + required + " workers</span>" +
          '<span class="slot-state">BLOCKED · NEEDS ' + minPopulation + " POPULATION</span>" +
        "</span>" +
        side +
      "</div>"
    );
  }

  if (required > 0 && assigned === 0) {
    return (
      '<div class="slot-tile idle">' +
        '<span class="slot-emoji" aria-hidden="true">' + def.emoji + "</span>" +
        '<span class="slot-main">' +
          '<span class="slot-name">' + def.name + levelChip + "</span>" +
          '<span class="slot-yield">No workers assigned · no output until crewed</span>' +
          '<span class="slot-state">IDLE' + levelLine + " · 0/" + required + " WORKERS</span>" +
        "</span>" +
        side +
      "</div>"
    );
  }

  if (required > 0 && assigned < required) {
    return (
      '<div class="slot-tile partial">' +
        '<span class="slot-emoji" aria-hidden="true">' + def.emoji + "</span>" +
        '<span class="slot-main">' +
          '<span class="slot-name">' + def.name + levelChip + "</span>" +
          '<span class="slot-yield">' + buildingScaledYieldText(building.type, ratio, level) + "</span>" +
          '<span class="slot-state">UNDERSTAFFED' + levelLine + " · " + assigned + "/" + required +
            " WORKERS · " + percent + "% OUTPUT</span>" +
        "</span>" +
        side +
      "</div>"
    );
  }

  const crew = required > 0 ? assigned + "/" + required + " WORKERS" : "NO CREW NEEDED";
  return (
    '<div class="slot-tile">' +
      '<span class="slot-emoji" aria-hidden="true">' + def.emoji + "</span>" +
      '<span class="slot-main">' +
        '<span class="slot-name">' + def.name + levelChip + "</span>" +
        '<span class="slot-yield">' + buildingYieldText(building.type, level) + "</span>" +
        '<span class="slot-state">ONLINE' + levelLine + " · " + crew + "</span>" +
      "</span>" +
      side +
    "</div>"
  );
}

function spaceportQueueText(structure) {
  const queue = structure && structure.queue ? structure.queue : [];
  if (!queue.length) return "";
  const nextReady = queue.reduce(function (earliest, order) {
    return Math.min(earliest, order.readyTurn);
  }, Infinity);
  const turns = Math.max(0, nextReady - state.turn);
  const ready = turns <= 0 ? "LAUNCHING" : turns === 1 ? "READY NEXT TURN" : "READY IN " + turns + " TURNS";
  return queue.length + (queue.length === 1 ? " KEEL · " : " KEELS · ") + ready;
}

/* The live route of one trading center, if it has one. */
function findTradeRouteFor(structure) {
  return getSectorTrades().find(function (route) { return route.structure === structure; }) || null;
}

function findTradeRoutesFor(structure) {
  return getSectorTrades().filter(function (route) { return route.structure === structure; });
}

/* The one-line status on the trading center card. A center can now run more
   than one route, so it reports how many slots are in use and the shipped
   totals instead of a single destination. */
function tradingStatusText(structure) {
  const summary = getTradingCenterRouteSummary(structure);
  const routes = findTradeRoutesFor(structure);
  const totals = routes.reduce(function (sum, route) {
    if (route.status === "active") {
      sum.energy += route.energy;
      sum.minerals += route.minerals;
      sum.active += 1;
    }
    return sum;
  }, { energy: 0, minerals: 0, active: 0 });

  if (totals.active) {
    return "ONLINE · " + totals.active + "/" + summary.cap +
      (summary.cap === 1 ? " ROUTE" : " ROUTES") + " SHIPPING · ⚡" + totals.energy +
      " ⛏" + totals.minerals + " / TURN";
  }
  if (!summary.used) {
    return "ONLINE · NO TRADE ROUTE · " + summary.cap +
      (summary.cap === 1 ? " SLOT" : " SLOTS") + " AVAILABLE";
  }
  const route = routes[0];
  if (!route) return "ONLINE · ROUTE SET";
  if (route.status === "empty") return "ONLINE · ROUTE SET · SET AN AMOUNT";
  if (route.status === "no-gate") return "ONLINE · NO GATE IN SECTOR";
  if (route.status === "out-of-reach") return "ONLINE · TARGET OUT OF REACH";
  return "ONLINE · " + (route.reason || "TRADE IDLE");
}

/* The online spaceport card itself is the ship-construction trigger.
   Other structures stay non-interactive cards. */
function structureCardHTML(structure) {
  const def = STRUCTURE_TYPES[structure.type];
  if (!def) return "";
  if (!isPlayerStructure(structure)) return hostileStructureCardHTML(structure);
  const building = !!structure.underConstruction;
  const isStronghold = structure.type === "stronghold";
  const isSpaceport = structure.type === "spaceport" && !building;
  const isRadar = structure.type === "radar";
  const isTrading = structure.type === "trading";
  const spaceportOpen = isSpaceport && !!state.ui.spaceportOpen;
  const queueText = isSpaceport ? spaceportQueueText(structure) : "";
  let stateText;
  if (building) {
    stateText = "UNDER CONSTRUCTION · ONLINE NEXT TURN";
  } else if (isStronghold) {
    stateText = "ONLINE · STATIC DEFENCE · " + strongholdStatsText(structure);
  } else if (isSpaceport) {
    stateText = "ONLINE · " + (queueText || (spaceportOpen ? "SHIP CONSTRUCTION OPEN" : "TAP TO BUILD SHIPS"));
  } else if (isTrading) {
    stateText = tradingStatusText(structure);
  } else {
    stateText = "ONLINE · " + def.effect;
  }
  const tag = building ? "BUILDING" : isStronghold ? "DEFENCE" : isSpaceport ? "SHIPYARD"
    : isRadar ? "SENSOR" : isTrading ? "TRADE" : "ACTIVE";
  const cardClass = "structure-card" + (building ? " construction" : "") +
    (isStronghold ? " stronghold" : "") + (isSpaceport ? " spaceport" : "") +
    (isTrading ? " trading" : "");
  const start = isSpaceport
    ? '<button class="' + cardClass + '" type="button" data-spaceport-toggle aria-expanded="' +
        (spaceportOpen ? "true" : "false") + '" aria-controls="spaceport-menu">'
    : '<div class="' + cardClass + '">';
  const end = isSpaceport ? "</button>" : "</div>";
  return (
    start +
      '<span class="structure-card-icon" aria-hidden="true">' + (building ? "🚧" : def.emoji) + "</span>" +
      '<span class="structure-card-main">' +
        '<span class="structure-card-name">' + def.name + "</span>" +
        '<span class="structure-card-desc">' + def.desc + "</span>" +
        '<span class="structure-card-state">' + stateText + "</span>" +
        (building ? '<span class="construction-stripes"><span></span></span>' : "") +
      "</span>" +
      '<span class="structure-card-side">' +
        '<span class="structure-card-tag">' + tag + "</span>" +
        (isSpaceport ? '<span class="structure-card-chevron" aria-hidden="true">⌄</span>' : "") +
      "</span>" +
    end
  );
}

function shipBuildOptionHTML(typeId) {
  const type = SHIP_TYPES[typeId];
  if (!type) return "";
  const sectorId = getEconomySectorId();
  const localMinerals = sectorId ? getSectorStock(sectorId, "minerals") : 0;
  const cost = type.cost ? type.cost.minerals : 0;
  const canAfford = localMinerals >= cost;
  const short = Math.max(0, cost - localMinerals);
  const buildTime = Math.max(1, type.buildTime || 1);
  const attack = type.military ? type.attack : 0;
  const details = type.role + " · ⚔ " + attack + " · 🛡 " + type.hull;
  const mobility = "➜ " + getShipSpeed(type.id) + " speed · ✦ " + getShipPower(type.id) + " power";
  const ability = type.ability || "Adds to the local fleet";
  const ready = buildTime === 1 ? "ready next turn" : "ready in " + buildTime + " turns";
  return (
    '<button class="build-option ship-build-option' + (canAfford ? "" : " short") + '" data-build-ship="' + typeId + '"' + (canAfford ? "" : " disabled") + ">" +
      '<span class="b-emoji" aria-hidden="true">' + type.emoji + "</span>" +
      '<span class="b-main">' +
        '<span class="b-name">' + type.name + "</span>" +
        '<span class="b-yield">' + details + "</span>" +
        '<span class="b-yield">' + mobility + "</span>" +
        '<span class="b-yield">' + ability + " · " + ready + "</span>" +
      "</span>" +
      '<span class="b-cost">' + cost + " ⛏" +
        "<small>" + (canAfford ? "BUILD" : "NEED " + short + " MORE") + "</small>" +
      "</span>" +
    "</button>"
  );
}

/* Ships under construction are visible in the spaceport dossier until their
   launch turn. A one-turn ship shows READY NEXT TURN. */
function shipQueueHTML(structure) {
  const queue = structure && structure.queue ? structure.queue : [];
  if (!queue.length) return "";
  const rows = queue.map(function (order) {
    if (!order || !order.ship) return "";
    const type = SHIP_TYPES[order.ship.type];
    if (!type) return "";
    const turns = Math.max(0, order.readyTurn - state.turn);
    const readyText = turns <= 0 ? "LAUNCHING" : turns === 1 ? "READY NEXT TURN" : "READY IN " + turns + " TURNS";
    return (
      '<div class="ship-queue-row">' +
        '<span class="queue-emoji" aria-hidden="true">' + type.emoji + "</span>" +
        '<span class="queue-main">' +
          '<span class="queue-name">' + order.ship.name + "</span>" +
          '<span class="queue-meta">' + type.name + " · laid down turn " + order.orderedTurn + "</span>" +
        "</span>" +
        '<span class="queue-ready">' + readyText + "</span>" +
      "</div>"
    );
  }).join("");
  return (
    '<div class="planet-section queue-section">' +
      '<div class="planet-section-head"><h3>SHIPWAY QUEUE</h3><span class="slot-count">' +
        queue.length + (queue.length === 1 ? " KEEL" : " KEELS") + " LAID DOWN</span></div>" +
      '<div class="ship-queue-list">' + rows + "</div>" +
      '<p class="planet-footnote">Queued ships launch into this hex when the next turn begins. They can receive a route on the turn they arrive.</p>' +
    "</div>"
  );
}

function spaceportShipBuildHTML(structure) {
  const sectorId = getEconomySectorId();
  const sector = getSector(sectorId);
  const localMinerals = getSectorStock(sectorId, "minerals");
  return (
    '<div class="planet-section spaceport-section">' +
      '<div class="planet-section-head"><h3>SHIP CONSTRUCTION</h3><span class="slot-count">' +
        formatAmount(localMinerals) + " ⛏ IN " + (sector ? sector.name.toUpperCase() : "SECTOR") + "</span></div>" +
      '<div class="build-list">' + SHIP_ORDER.map(shipBuildOptionHTML).join("") + "</div>" +
      '<p class="planet-footnote">Ships are laid down now and launch when the next turn begins. A one-turn hull is available on your next turn and joins the fleet in this hex. Only a spaceport can build ships. A new hull launches with every refit level your Military category techs have unlocked; a hull built before the tech keeps its old stats until the FLEET tab DRYDOCK installs the refit for minerals, which needs an operational spaceport in the sector the ship sits in. Corvettes can be set to patrol from the FLEET tab.</p>' +
    "</div>" + shipQueueHTML(structure)
  );
}

/* ---------- trading center configuration ---------- */

function tradeAmountRow(key, icon, label, value, routeIndex) {
  const max = getTradeMaxAmount();
  const index = routeIndex || 0;
  return (
    '<div class="trade-amount-row">' +
      '<span class="trade-amount-icon" aria-hidden="true">' + icon + "</span>" +
      '<span class="trade-amount-label">' + label.toUpperCase() + "<small>PER TURN</small></span>" +
      '<span class="trade-stepper">' +
        '<button type="button" class="trade-step" data-trade-amount="' + index + ":" + key + ':-1"' +
          (value <= 0 ? " disabled" : "") + ' aria-label="Decrease ' + label + ' on route ' + (index + 1) + '">−</button>' +
        '<b class="trade-step-value">' + value + "</b>" +
        '<button type="button" class="trade-step" data-trade-amount="' + index + ":" + key + ':1"' +
          (value >= max ? " disabled" : "") + ' aria-label="Increase ' + label + ' on route ' + (index + 1) + '">+</button>' +
      "</span>" +
    "</div>"
  );
}

function tradeReachLabel(target) {
  /* The destination's name is published (see isSectorNameKnown), but its
     colony count is contents and waits for a chart. */
  const colonies = sectorHasCharts(target.sectorId) ? getSectorColonyCount(target.sectorId) : 0;
  return getSectorLabel(target.sector) + " · " + formatRingLabel(target.sector.ring) +
    " · " + target.hops + (target.hops === 1 ? " hop" : " hops") +
    (colonies ? " · " + colonies + " col" : "");
}

/* One route slot of the editor. Every trading center offers as many slots as
   its Trade Network techs allow (1 by default, up to 4), and an unused slot
   still shows the destination picker so the player can open another route. */
function tradingRouteSlotHTML(structure, sector, reach, index) {
  const config = getTradeConfig(structure, index);
  const target = config.targetSectorId ? getSector(config.targetSectorId) : null;
  const reachable = reach.targets.find(function (candidate) {
    return candidate.sectorId === config.targetSectorId;
  });
  const configured = !!config.targetSectorId;
  let statusLabel = "IDLE";
  let statusClass = "idle";
  if (!reach.allowed) {
    statusLabel = configured ? "NO GATE" : "IDLE";
    statusClass = configured ? "bad" : "idle";
  } else if (!configured) {
    statusLabel = "OPEN SLOT";
    statusClass = "idle";
  } else if (!reachable) {
    statusLabel = "OUT OF REACH";
    statusClass = "bad";
  } else if (!config.energy && !config.minerals) {
    statusLabel = "SET AN AMOUNT";
    statusClass = "idle";
  } else {
    statusLabel = "SHIPPING";
    statusClass = "good";
  }

  const options = ['<option value="">— no destination —</option>'];
  if (configured && !reachable && target) {
    options.push('<option value="' + target.id + '" selected>' + target.name + " · OUT OF REACH</option>");
  }
  reach.targets.forEach(function (candidate) {
    options.push(
      '<option value="' + candidate.sectorId + '"' +
        (candidate.sectorId === config.targetSectorId ? " selected" : "") + ">" +
        tradeReachLabel(candidate) + "</option>"
    );
  });

  const parts = [];
  parts.push(
    '<div class="trade-route-card' + (configured ? " configured" : " open") + '">' +
      '<div class="trade-route-head">' +
        '<span class="trade-route-name">ROUTE ' + (index + 1) + "</span>" +
        '<span class="trade-route-status ' + statusClass + '">' + statusLabel + "</span>" +
      "</div>"
  );
  parts.push(
    '<label class="trade-field">' +
      '<span class="trade-field-label">DESTINATION</span>' +
      '<select class="trade-select" data-trade-target="' + index + '" aria-label="Route ' + (index + 1) + ' destination sector">' +
        options.join("") +
      "</select>" +
    "</label>"
  );
  parts.push(
    '<div class="trade-amounts">' +
      tradeAmountRow("energy", "⚡", "Energy", config.energy, index) +
      tradeAmountRow("minerals", "⛏", "Minerals", config.minerals, index) +
    "</div>"
  );

  if (!configured) {
    parts.push('<p class="trade-summary idle">No destination selected on this slot. Trade stays offline.</p>');
  } else if (!reach.allowed) {
    parts.push('<p class="trade-summary bad">Route saved for ' + (target ? target.name : "a sector") +
      ", but this sector has no operational gate.</p>");
  } else if (!reachable) {
    parts.push('<p class="trade-summary bad">' + (target ? target.name : "That sector") +
      " is outside this gate's reach. Build a relay gate in a sector along the lane to extend it.</p>");
  } else if (!config.energy && !config.minerals) {
    parts.push('<p class="trade-summary idle">Destination ready — set an energy or mineral amount to start shipping.</p>');
  } else {
    parts.push(
      '<p class="trade-summary good">Ships ⚡' + config.energy + " ⛏" + config.minerals +
        " per turn to " + target.name + " · " + reachable.hops +
        (reachable.hops === 1 ? " hop" : " hops") + " from this gate.</p>"
    );
  }

  const last = config.lastTrade || (index === 0 ? structure.lastTrade : null);
  if (last) {
    const lastTarget = last.targetSectorId ? getSector(last.targetSectorId) : null;
    let text;
    if (last.status === "shipped") {
      text = "Last turn T" + last.turn + ": ⚡" + last.energy + " ⛏" + last.minerals +
        " delivered to " + (lastTarget ? lastTarget.name : "the target") +
        (last.short ? " · limited by local stock" : "");
    } else if (last.status === "short") {
      text = "Last turn T" + last.turn + ": nothing shipped — this sector was empty.";
    } else {
      text = "Last turn T" + last.turn + ": no shipment.";
    }
    parts.push('<p class="trade-last">' + text + "</p>");
  }

  parts.push(
    '<div class="trade-actions">' +
      '<button class="secondary-btn trade-clear" type="button" data-trade-clear="' + index + '"' +
        (!config.targetSectorId && !config.energy && !config.minerals ? " disabled" : "") +
        ">CLEAR ROUTE</button>" +
    "</div>" +
    "</div>"
  );
  return parts.join("");
}

/* The route editor under an online trading center. It explains the gate
   requirement, lists only the sectors this gate can reach and lets the player
   set how much energy and minerals leave the sector on each route. */
function tradingCenterHTML(structure, sectorId, key) {
  const sector = getSector(sectorId) || getCurrentSector();
  if (!sector) return "";
  const reach = getTradeReach(sector.id);
  const summary = getTradingCenterRouteSummary(structure);
  const parts = [];

  parts.push(
    '<div class="planet-section trade-section">' +
      '<div class="planet-section-head"><h3>TRADE ROUTES</h3><span class="slot-count">' +
        summary.used + " / " + summary.cap + " IN USE</span></div>"
  );

  if (reach.allowed) {
    const gatePos = parseHexKey(reach.gateKey);
    parts.push(
      '<div class="trade-gate online"><span aria-hidden="true">🌀</span><span>Gate online at hex ' +
        (gatePos.row + 1) + ":" + (gatePos.col + 1) + " · " + reach.targets.length +
        (reach.targets.length === 1 ? " sector" : " sectors") + " in trade reach.</span></div>"
    );
  } else {
    parts.push(
      '<div class="trade-gate offline"><span aria-hidden="true">🌀</span><span>' + reach.reason +
        " Build an operational gate in this sector with a builder; the center stays offline until then.</span></div>"
    );
  }

  if (summary.cap === 1) {
    parts.push(
      '<p class="trade-cap-note">This center runs <b>1 route</b>. The Trade Network techs in the Trade &amp; Exploration category raise every center to 2, 3 and 4 routes.</p>'
    );
  } else {
    parts.push(
      '<p class="trade-cap-note">Trade Network techs let this center run <b>' + summary.cap +
      " routes</b> at once. Each route has its own destination and amounts; they ship in slot order after production.</p>"
    );
  }

  for (let index = 0; index < summary.cap; index += 1) {
    parts.push(tradingRouteSlotHTML(structure, sector, reach, index));
  }

  parts.push(
    '<p class="planet-footnote">The center draws ' + STRUCTURE_TYPES.trading.energyUpkeep +
      " ⚡ upkeep from this sector each turn. Shipments leave after production, take no more than this sector holds and arrive in the target sector's own ledger. Research and influence are never traded: they are empire-wide.</p>" +
    "</div>"
  );
  return parts.join("");
}

/* A compact ledger for the sector a colony belongs to. */
function sectorLedgerCell(icon, label, stock, net) {
  return (
    '<div class="sector-ledger-cell">' +
      '<span class="sector-ledger-label">' + icon + " " + label + "</span>" +
      '<span class="sector-ledger-value">' + formatAmount(stock) + "</span>" +
      '<span class="sector-ledger-net ' + signedClass(net) + '">' + formatSigned(net) + " / TURN</span>" +
    "</div>"
  );
}

function sectorLedgerHTML(sectorId) {
  const sector = getSector(sectorId);
  if (!sector) return "";
  const sectorEcon = getSectorEconomy(sector.id);
  const flow = sectorEcon.trade;
  const parts = [];
  parts.push(
    '<div class="planet-section sector-ledger-section">' +
      '<div class="planet-section-head"><h3>SECTOR LEDGER</h3><span class="slot-count">' +
        sector.name.toUpperCase() + "</span></div>" +
      '<div class="sector-ledger-grid">' +
        sectorLedgerCell("⚡", "ENERGY", getSectorStock(sector.id, "energy"), sectorEcon.net.energy) +
        sectorLedgerCell("⛏", "MINERALS", getSectorStock(sector.id, "minerals"), sectorEcon.net.minerals) +
      "</div>"
  );
  if (flow.in.energy || flow.in.minerals || flow.out.energy || flow.out.minerals) {
    const bits = [];
    if (flow.in.energy || flow.in.minerals) {
      bits.push("in ⚡" + flow.in.energy + " ⛏" + flow.in.minerals);
    }
    if (flow.out.energy || flow.out.minerals) {
      bits.push("out ⚡" + flow.out.energy + " ⛏" + flow.out.minerals);
    }
    parts.push('<p class="sector-ledger-trade">Gate trade this turn · ' + bits.join(" · ") + " / turn</p>");
  }
  parts.push(
    '<p class="planet-footnote">Energy and minerals are local to ' + sector.name +
      ". Buildings, ships, structures and upkeep are paid from this sector's own stockpile. " +
      "Net per turn is projected at the requested population maintenance. Research and influence are empire-wide.</p>" +
    "</div>"
  );
  return parts.join("");
}

function structureSectionHTML(structure, sectorId, key) {
  const parts = [];
  const rivalOwned = !isPlayerStructure(structure);
  parts.push(
    '<div class="planet-section structure-section' + (rivalOwned ? " hostile-section" : "") + '">' +
      '<div class="planet-section-head"><h3>' + (rivalOwned ? "HOSTILE INSTALLATION" : "ORBITAL STRUCTURE") + '</h3><span class="slot-count">' +
        (structure.underConstruction ? "CONSTRUCTION" : rivalOwned ? "HOSTILE" : "ONLINE") + "</span></div>" +
      structureCardHTML(structure) +
    "</div>"
  );
  if (rivalOwned) {
    parts.push('<div class="slot-lock-note"><span>⚔</span><span>This stronghold is hostile. It fires on one of your ships within 2 hexes each turn and can be destroyed by a strong patrol or a concentrated fleet.</span></div>');
    return parts.join("");
  }
  if (structure.underConstruction) {
    parts.push('<div class="slot-lock-note"><span>🏗️</span><span>Construction completes at the end of the turn. The structure cannot be used until it is online.</span></div>');
  } else if (structure.type === "spaceport") {
    const open = !!state.ui.spaceportOpen;
    parts.push('<div id="spaceport-menu"' + (open ? "" : ' class="hidden"') + ">" +
      (open ? spaceportShipBuildHTML(structure) : "") + "</div>");
  } else if (structure.type === "gate") {
    parts.push('<div class="slot-lock-note"><span>🌀</span><span>Gate online. Select ships in the Fleet tab to jump to an adjacent sector. A trading center in this sector also uses this gate for its trade reach.</span></div>');
  } else if (structure.type === "radar") {
    const intel = getSectorIntelligence(sectorId);
    parts.push('<div class="slot-lock-note"><span>📡</span><span>Radar online. This sector has INTEL ' + intel +
      ', so the map forecasts raider entry up to ' + intel +
      (intel === 1 ? ' turn' : ' turns') + ' ahead. It draws ' +
      STRUCTURE_TYPES.radar.energyUpkeep + ' ⚡ upkeep per turn.</span></div>');
  } else if (structure.type === "trading") {
    parts.push(tradingCenterHTML(structure, sectorId, key));
  } else if (structure.type === "stronghold") {
    parts.push('<div class="slot-lock-note"><span>🏰</span><span>Stronghold online. It fires on a hostile ship within 2 hexes each turn and prevents raids in its coverage. It draws ' + STRUCTURE_TYPES.stronghold.energyUpkeep + ' ⚡ upkeep per turn.</span></div>');
  }
  return parts.join("");
}

function builderOperationsHTML(row, col) {
  const ready = hasBuilderAt(row, col);
  const parts = [];
  parts.push(
    '<div class="planet-section builder-section">' +
      '<div class="planet-section-head"><h3>BUILDER OPERATIONS</h3><span class="slot-count">' +
        (ready ? "BUILDER PRESENT" : "NO BUILDER") + "</span></div>"
  );
  if (!ready) {
    parts.push('<div class="slot-lock-note"><span>🏗️</span><span>Builders are the only ships that can construct spaceports, gates, radars, trading centers and strongholds in empty space. Move a builder into this hex.</span></div>');
  } else {
    parts.push('<div class="slot-lock-note"><span>🏗️</span><span>A builder is here. Construct one orbital structure; it comes online at the end of the turn. A radar adds +1 intelligence to this sector and widens its raid forecast. A stronghold is a static defender with 6 power and a 2-hex patrol radius; a trading center ships energy and minerals to another sector but needs a gate in this sector.</span></div>');
    parts.push('<div class="build-list structure-build-list">');
    STRUCTURE_ORDER.forEach(function (type) {
      const def = STRUCTURE_TYPES[type];
      const cost = def.cost.minerals;
      const localMinerals = getSectorStock(getEconomySectorId(), "minerals");
      const canAfford = localMinerals >= cost;
      const short = Math.max(0, cost - localMinerals);
      parts.push(
        '<button class="build-option structure-build-option' + (canAfford ? "" : " short") + '" data-build-structure="' + type + '"' + (canAfford ? "" : " disabled") + ">" +
          '<span class="b-emoji" aria-hidden="true">' + def.emoji + "</span>" +
          '<span class="b-main">' +
            '<span class="b-name">' + def.name + "</span>" +
            '<span class="b-yield">' + def.effect + "</span>" +
            '<span class="b-yield">' + def.desc + " · 1 turn</span>" +
          "</span>" +
          '<span class="b-cost">' + cost + " ⛏" +
            "<small>" + (canAfford ? "CONSTRUCT" : "NEED " + short + " MORE") + "</small>" +
          "</span>" +
        "</button>"
      );
    });
    parts.push('</div>');
    parts.push('<p class="planet-footnote">Builders can only build in empty space hexes. A hex can hold one structure. Radars cost 5 ⛏, draw 1 ⚡ upkeep and add +1 sector intelligence each. Strongholds cost 10 ⛏ and draw 2 ⚡ upkeep, but they hold a 2-hex zone without a crew. Trading centers cost 8 ⛏, draw 1 ⚡ upkeep and need an operational gate in their sector. Planet building slots remain separate.</p>');
  }
  parts.push("</div>");
  return parts.join("");
}

function builderPlanetNoteHTML(row, col) {
  if (!hasBuilderAt(row, col)) return "";
  if (getStructureAt(row, col)) {
    return '<div class="slot-lock-note"><span>🏗️</span><span>This planet hex already has a fixed orbital structure; builders can only add structures in empty space.</span></div>';
  }
  return '<div class="slot-lock-note"><span>🏗️</span><span>This hex contains a planet, so the builder cannot start an orbital structure here. Builders can only build in empty space.</span></div>';
}

function anomalyRewardPills(anomaly) {
  const type = getAnomalyType(anomaly);
  const reward = anomaly.lastReward || (type ? type.reward : null);
  return renderEffectPills(reward || {});
}

function anomalyStatusText(anomaly) {
  const stateId = getAnomalyState(anomaly);
  const progress = getAnomalyProgress(anomaly);
  if (stateId === "resolved") {
    return "SURVEYED · TURN " + (anomaly.resolvedTurn || state.turn);
  }
  if (stateId === "studying" && progress) {
    return "SURVEY IN PROGRESS · " + progress.turnsLeft + (progress.turnsLeft === 1 ? " TURN" : " TURNS") + " REMAIN";
  }
  if (stateId === "paused" && progress) {
    return "PAUSED · SCIENCE SHIP LEFT THE HEX · " + progress.turnsLeft + (progress.turnsLeft === 1 ? " TURN" : " TURNS") + " REMAIN";
  }
  if (getScienceShipsAt(anomaly.row, anomaly.col, anomaly.sectorId).length) {
    return "READY · SCIENCE SHIP PRESENT · " + anomaly.studyTurns + (anomaly.studyTurns === 1 ? " TURN" : " TURNS") + " TO SURVEY";
  }
  return "NEEDS A SCIENCE SHIP IN THIS HEX · " + anomaly.studyTurns + (anomaly.studyTurns === 1 ? " TURN" : " TURNS") + " TO SURVEY";
}

/* The survey dossier. Shown in the WORLD tab of an empty hex and at the top
   of the FLEET tab, so a science ship can start a study without leaving the
   fleet view. */
function anomalySectionHTML(anomaly) {
  const type = getAnomalyType(anomaly);
  const kind = getAnomalyKind(anomaly);
  const stateId = getAnomalyState(anomaly);
  const progress = getAnomalyProgress(anomaly);
  const parts = [];

  parts.push(
    '<div class="planet-section anomaly-section">' +
      '<div class="planet-section-head"><h3>SURVEY SITE</h3><span class="slot-count">' +
        kind.label.toUpperCase() + " · " + anomaly.studyTurns + (anomaly.studyTurns === 1 ? " TURN" : " TURNS") +
      "</span></div>" +
      '<div class="anomaly-card ' + stateId + '">' +
        '<div class="anomaly-symbol" aria-hidden="true">' + (type ? type.emoji : "🔭") + "</div>" +
        '<div class="anomaly-main">' +
          '<span class="anomaly-kicker">' + (type ? type.kicker : "SURVEY SITE") + "</span>" +
          '<span class="anomaly-name">' + getAnomalyName(anomaly) + "</span>" +
          '<p class="anomaly-desc">' + (type ? type.text : "") + "</p>" +
          '<div class="anomaly-reward"><span class="anomaly-reward-label">REWARD</span>' +
            '<span class="anomaly-reward-pills">' + anomalyRewardPills(anomaly) + "</span>" +
          "</div>" +
          (progress
            ? '<div class="anomaly-progress">' +
                '<div class="anomaly-progress-head"><span>SURVEY PROGRESS</span><b>' +
                  progress.done + " / " + progress.total + "</b></div>" +
                '<div class="progress-track"><div class="progress-fill" style="width:' +
                  progress.percent.toFixed(1) + '%"></div></div>' +
              "</div>"
            : "") +
          '<span class="anomaly-status">' + anomalyStatusText(anomaly) + "</span>" +
        "</div>" +
      "</div>"
  );

  if (stateId === "resolved") {
    parts.push(
      '<p class="planet-footnote">Site surveyed on turn ' + (anomaly.resolvedTurn || state.turn) +
      ". The reward has already been added to the empire stockpile.</p>"
    );
  } else if (stateId === "studying" || stateId === "paused") {
    parts.push(
      '<div class="planet-actions">' +
        '<button class="secondary-btn" data-cancel-study>ABANDON SURVEY</button>' +
      "</div>"
    );
    parts.push(
      '<p class="planet-footnote">The study ticks down when you end the turn while a science ship is in this hex. ' +
      "If the ship leaves, the survey pauses; progress is kept.</p>"
    );
  } else {
    const reason = getSurveyBlockReason(anomaly);
    parts.push(
      '<div class="planet-actions">' +
        '<button class="primary-btn" data-study-site' + (reason ? " disabled" : "") + ">" +
          (reason ? "SCIENCE SHIP REQUIRED" : "BEGIN SURVEY") +
        "</button>" +
      "</div>"
    );
    if (reason) {
      parts.push('<div class="slot-lock-note"><span>🛰️</span><span>' + reason + "</span></div>");
    }
    parts.push(
      '<p class="planet-footnote">A science ship must be in this hex when the survey starts and on each turn it ' +
      "progresses. The reward is paid on completion.</p>"
    );
  }

  parts.push("</div>");
  return parts.join("");
}

function worldTabHTML(system, charted, row, col) {
  const parts = [];
  const sector = getCurrentSector();
  const structureKey = hexKey(row, col);

  if (!charted) {
    parts.push(
      '<div class="planet-hero unclaimed">' +
        '<div class="planet-orb unclaimed" aria-hidden="true">?</div>' +
        '<div class="planet-hero-main">' +
          '<span class="planet-status-tag unclaimed">NO SURVEY DATA</span>' +
          '<h2>Uncharted Hex</h2>' +
          '<p class="planet-desc">No ship has entered hex ' + (row + 1) + ":" + (col + 1) + '. Its planet, colony or fleet remains hidden.</p>' +
        '</div>' +
      '</div>'
    );
    parts.push(
      '<div class="planet-section">' +
        '<div class="planet-section-head"><h3>FOG OF WAR</h3><span class="slot-count">SHIP REQUIRED</span></div>' +
        '<div class="slot-lock-note"><span>🌫</span><span>Move any ship into this hex to chart it. Once charted, its contents remain known.</span></div>' +
      '</div>'
    );
    return parts.join("");
  }

  const structure = getStructureAt(row, col);

  if (system && system.owner) {
    const empire = getEmpire(system.owner);
    const color = empire ? empire.color : "#ff7a7a";
    const stateDef = getEmpireStateDef(empire);
    parts.push(
      '<div class="planet-hero rival-hero" style="--rival-color:' + color + '">' +
        '<div class="planet-orb rival" aria-hidden="true">' + (empire ? empire.emoji : "⚑") + '</div>' +
        '<div class="planet-hero-main">' +
          '<span class="planet-status-tag rival">RIVAL SYSTEM</span>' +
          '<h2>' + system.name + '</h2>' +
          '<p class="planet-desc">' + system.blurb + '</p>' +
          '<div class="planet-yield">' +
            '<span class="yield-chip rival-chip">⚑ ' + (empire ? empire.name : "Rival power") + '</span>' +
            '<span class="yield-chip rival-chip">RING ' + (empire ? empire.ring : "?") + ' · ' +
              getRivalTierLabel(empire ? empire.ring : 0) + '</span>' +
            (empire ? '<span class="yield-chip rival-chip">⚔ ' + getEmpirePower(empire) + ' PWR</span>' : "") +
          '</div>' +
        '</div>' +
      '</div>'
    );
    parts.push(
      '<div class="planet-section rival-hold-section">' +
        '<div class="planet-section-head"><h3>RIVAL CONTROL</h3><span class="slot-count text-bad">' +
          (empire ? getRivalThreatLabel(empire) + ' THREAT' : 'HOSTILE') + '</span></div>' +
        '<div class="rival-hold-card" style="--rival-color:' + color + '">' +
          '<span class="rival-hold-emoji" aria-hidden="true">' + (empire ? empire.emoji : "⚑") + '</span>' +
          '<span class="rival-hold-main">' +
            '<span class="rival-hold-name">' + (empire ? empire.name : "Rival power") + '</span>' +
            '<span class="rival-hold-meta">' + (stateDef ? stateDef.name + ' · ' + stateDef.label : "Holding") +
              ' · RING ' + (empire ? empire.ring : "?") + '</span>' +
            '<span class="rival-hold-last">' + getEmpireActionLabel(empire) + '</span>' +
          '</span>' +
          '<span class="rival-hold-stats">' +
            '<span>⚑ ' + (empire ? getEmpireColonyCount(empire) : 0) + ' COL</span>' +
            '<span>⚔ ' + (empire ? getEmpireShipCount(empire) : 0) + ' SHIPS</span>' +
            '<span>🏰 ' + (function(){ const n = empire ? getEmpireStrongholds(empire).filter(function (entry) { return !entry.structure.underConstruction; }).length : 0; return n + (n === 1 ? " STRONGHOLD" : " STRONGHOLDS"); })() + '</span>' +
          '</span>' +
        '</div>' +
        (empire
          ? '<div class="planet-actions"><button class="secondary-btn" data-rival-sheet="' + empire.id + '">OPEN RIVAL DOSSIER</button></div>'
          : "") +
        '<p class="planet-footnote">This system is claimed by a rival power and cannot be colonised. Their ships and strongholds can be destroyed by patrols, but the colony remains in their hands. A planet hex cannot be used to build by your builder.</p>' +
      '</div>'
    );
    if (structure) parts.push(structureSectionHTML(structure, sector ? sector.id : null, structureKey));
    parts.push(builderPlanetNoteHTML(row, col));
    return parts.join("");
  }

  if (!system) {
    const anomaly = getAnomalyAt(row, col);
    const siteVisible = anomaly && isAnomalyVisible(anomaly);
    parts.push(
      '<div class="planet-hero unclaimed">' +
        '<div class="planet-orb unclaimed" aria-hidden="true">' + (siteVisible ? getAnomalyEmoji(anomaly) : "✦") + '</div>' +
        '<div class="planet-hero-main">' +
          '<span class="planet-status-tag unclaimed">' +
            (siteVisible ? "SURVEY SITE · CHARTED DEEP SPACE" : "CHARTED DEEP SPACE") +
          '</span>' +
          '<h2>' + (siteVisible ? getAnomalyName(anomaly) : "Empty Hex") + '</h2>' +
          '<p class="planet-desc">' + (siteVisible
            ? "A discovered survey site in charted deep space. A science ship stationed in this hex can study it."
            : "No planet or colony here. Fleets can stage in this hex; builders can raise orbital structures.") + '</p>' +
        '</div>' +
      '</div>'
    );
    if (siteVisible) {
      parts.push(anomalySectionHTML(anomaly));
    }
    if (structure) {
      parts.push(structureSectionHTML(structure, sector ? sector.id : null, structureKey));
    } else {
      parts.push(builderOperationsHTML(row, col));
    }
    return parts.join("");
  }

  if (!system.colonized) {
    const reason = getColonizeBlockReason(system);
    const localMinerals = getSectorStock(system.sectorId, "minerals");
    const shortMineral = localMinerals < CONFIG.colonizeCost.minerals;
    const shortInfluence = state.resources.influence < CONFIG.colonizeCost.influence;
    const size = getPlanetSizeDef(system.planetSize);
    const bonus = getBonusSlots(system);
    parts.push(
      '<div class="planet-hero unclaimed">' +
        '<div class="planet-orb unclaimed" aria-hidden="true">' + system.emoji + "</div>" +
        '<div class="planet-hero-main">' +
          '<span class="planet-status-tag unclaimed">UNCLAIMED SYSTEM</span>' +
          "<h2>" + system.name + "</h2>" +
          '<p class="planet-desc">' + system.blurb + "</p>" +
          '<div class="planet-yield">' +
            '<span class="yield-chip">' + size.name.toUpperCase() + " · " + size.slots + " SLOTS</span>" +
            (bonus ? '<span class="yield-chip">🔒 ' + bonus + " BONUS " + (bonus === 1 ? "SLOT" : "SLOTS") + "</span>" : "") +
          "</div>" +
        "</div>" +
      "</div>"
    );
    parts.push(
      '<div class="planet-section">' +
        '<div class="planet-section-head"><h3>COLONIZATION</h3><span class="slot-count">' + size.name.toUpperCase() + " PLANET · " + size.slots + " SLOTS</span></div>" +
        '<div class="slot-lock-note"><span>🪐</span><span>This ' + size.name.toLowerCase() + " planet opens with " + size.slots + " building slots and " +
          getEconomyConfig().startingPopulation.colony + " population." +
          (bonus
            ? " It also has " + bonus + " locked bonus " + (bonus === 1 ? "slot" : "slots") + " that can be opened later with energy and minerals."
            : " It has no bonus slots.") + "</span></div>" +
        '<div class="planet-actions">' +
          '<button class="primary-btn" data-colonize="' + system.id + '"' + (reason ? " disabled" : "") + ">COLONIZE SYSTEM</button>" +
          '<div class="cost-line">' +
            '<span class="cost-item ' + (shortMineral ? "short" : "") + '">10 ⛏ minerals in ' +
              (sector ? sector.name : "this sector") + ' (' + formatAmount(localMinerals) + ' held)</span>' +
            '<span class="cost-item ' + (shortInfluence ? "short" : "") + '">3 🏛 influence</span>' +
          "</div>" +
          (reason ? '<div class="cost-line text-bad">' + reason + "</div>" : "") +
        "</div>" +
        '<p class="planet-footnote">Each colonized system adds +1 energy overhead per turn. A new colony starts with ' +
          getEconomyConfig().startingPopulation.colony +
          ' people. They need P^1.1 energy every turn and P^(1/0.9) minerals invested in housing; fund both from the population menu. A level-1 facility needs ' +
          getBuildingMinPopulation("power", 1) + ' population and ' + getBuildingWorkers("power", 1) +
          ' workers. A frontier world will likely need energy and minerals shipped in by a trading center.</p>' +
      "</div>"
    );
    parts.push(builderPlanetNoteHTML(row, col));
    return parts.join("");
  }

  const planet = getPlanetBreakdown(system);
  const size = getPlanetSizeDef(system.planetSize);
  const totalSlots = getTotalSlots(system);
  const unlockedSlots = getMaxSlots(system);
  const lockedSlots = totalSlots - unlockedSlots;
  const used = getUsedSlots(system);
  const workforce = planet.workforce;
  const slotHTML = (system.slots || []).map(function (slot, index) {
    return slotTileHTML(system, index, workforce);
  }).join("");

  parts.push(
    '<div class="planet-hero">' +
      '<div class="planet-orb" aria-hidden="true">' + system.emoji + "</div>" +
      '<div class="planet-hero-main">' +
        '<span class="planet-status-tag">' + (system.home ? "CAPITAL COLONY" : "COLONY") + "</span>" +
        "<h2>" + system.name + "</h2>" +
        '<p class="planet-desc">' + system.blurb + "</p>" +
        '<div class="planet-yield">' + planetYieldChips(system, planet) + "</div>" +
      "</div>" +
    "</div>"
  );

  if (structure) parts.push(structureSectionHTML(structure, sector ? sector.id : null, structureKey));

  const workforceSummary = workforce.jobsTotal === 0
    ? "NO JOBS YET"
    : workforce.jobsStaffed + " / " + workforce.jobsTotal + " POSTS · " +
      workforce.availableWorkers + " FREE" +
      (workforce.blockedBuildings ? " · " + workforce.blockedBuildings + " BLOCKED" : "");
  parts.push(
    '<div class="planet-section">' +
      '<div class="planet-section-head"><h3>POPULATION</h3><span class="slot-count">' + workforceSummary + "</span></div>" +
      populationCardHTML(system, planet) +
    "</div>"
  );

  parts.push(
    '<div class="planet-section">' +
      '<div class="planet-section-head"><h3>BUILDING SLOTS</h3><span class="slot-count">' + used + " / " + unlockedSlots + " USED" +
        (lockedSlots ? " · " + lockedSlots + " LOCKED" : "") + "</span></div>" +
      '<div class="slots-list">' + slotHTML + "</div>" +
    "</div>"
  );

  if (lockedSlots > 0) {
    const unlockCost = getSlotUnlockCost(system);
    parts.push(
      '<div class="slot-lock-note"><span>🔒</span><span>This ' + size.name.toLowerCase() + " planet rolled " + getBonusSlots(system) +
      " bonus " + (getBonusSlots(system) === 1 ? "slot" : "slots") + ". Open them in order for " + unlockCost.energy +
      " ⚡ + " + unlockCost.minerals + " ⛏ each.</span></div>"
    );
  }

  parts.push(sectorLedgerHTML(system.sectorId));
  parts.push(builderPlanetNoteHTML(row, col));
  parts.push(
    '<p class="planet-footnote">Local yields are shown before empire modifiers. Power Plants and Mines have four levels: ' +
      getBuildingMinPopulation("power", 1) + '/' + getBuildingMinPopulation("power", 2) + '/' +
      getBuildingMinPopulation("power", 3) + '/' + getBuildingMinPopulation("power", 4) +
      ' minimum population and ' + getBuildingWorkers("power", 1) + '/' + getBuildingWorkers("power", 2) + '/' +
      getBuildingWorkers("power", 3) + '/' + getBuildingWorkers("power", 4) +
      ' workers for ' + getBuildingOutput("power", 1).energy + '/' + getBuildingOutput("power", 2).energy + '/' +
      getBuildingOutput("power", 3).energy + '/' + getBuildingOutput("power", 4).energy + ' output. ' +
      'A refit is refused while the colony is below the minimum population of the level it would reach, so a working facility is never switched off by an upgrade. ' +
      'Use the − / + crew buttons on a facility to pin its workers; without orders the colony follows its automatic crew strategy (round robin by default). ' +
      'Tap the population card to fund energy maintenance and housing investment as percentages of the full requirement. ' +
      'Population maintenance is paid first, then colony overhead and building upkeep. Colony overhead: ' +
      CONFIG.colonyEnergyUpkeep + ' energy per turn.</p>'
  );
  return parts.join("");
}

function gateLockMessage(structure) {
  if (!structure) return "No gate in this hex. Builders can construct one in an empty space hex.";
  if (!isPlayerStructure(structure)) {
    return structure.type === "stronghold"
      ? "A hostile stronghold occupies this hex. No gate can operate here until it is destroyed."
      : "A hostile installation occupies this hex.";
  }
  if (structure.type === "gate" && structure.underConstruction) return "Gate under construction — online next turn.";
  if (structure.type === "spaceport") return "This spaceport can build ships, but intersector travel requires a gate.";
  if (structure.type === "stronghold") return "This stronghold holds the hex, but intersector travel requires a gate.";
  return "No operational gate in this hex.";
}

/* ---------- drydock: spaceport refits and repairs ---------- */

/* One hull in the drydock list. The two orders mirror the core rules in
   js/core/combat.js: a refit installs every researched level the hull is
   missing, a repair tops the hull up now, and both need an operational
   spaceport in this sector. */
function drydockShipRowHTML(ship, sectorId) {
  const type = SHIP_TYPES[ship.type];
  if (!type) return "";
  const hull = getShipHull(ship);
  const hullMax = getShipHullMax(ship);
  const installed = getShipInstalledTotalLevels(ship);
  const totalLevels = getShipUpgradeTotalLevels(ship.type);
  const pending = getShipPendingUpgrades(ship);
  const refitCost = getShipRefitCost(ship);
  const refitReason = getShipRefitBlockReason(ship, sectorId);
  const repairCost = getShipRepairCost(ship);
  const repairReason = getShipRepairBlockReason(ship, sectorId);

  let refitLabel;
  if (pending.length) {
    refitLabel = "REFIT +" + refitCost.steps + (refitCost.steps === 1 ? " LVL" : " LVLS") +
      " · " + refitCost.minerals + " ⛏";
  } else if (installed >= totalLevels) {
    refitLabel = "FULLY REFITTED";
  } else {
    refitLabel = "NO REFIT WAITING";
  }
  const repairLabel = repairCost.minerals
    ? "REPAIR +" + repairCost.hull + " · " + repairCost.minerals + " ⛏"
    : "FULL HULL";

  const pendingText = pending.length
    ? pending.map(function (entry) {
        const meta = SHIP_UPGRADE_STAT_META[entry.stat];
        return meta.short + " " + entry.from + "→" + entry.to;
      }).join(" · ")
    : "";

  return (
    '<div class="drydock-row' + (hull < hullMax ? " damaged" : "") + '">' +
      '<span class="drydock-icon ship-icon-' + ship.type + '" aria-hidden="true">' + type.emoji + '</span>' +
      '<span class="drydock-main">' +
        '<span class="drydock-name">' + ship.name +
          '<span class="drydock-levels">⬆ ' + installed + "/" + totalLevels + " REFITS</span></span>" +
        '<span class="drydock-meta">🛡 ' + hull + "/" + hullMax + " · ✦ " + getShipPower(ship) +
          " PWR · ➜ " + getShipSpeed(ship) + " SPD</span>" +
        (pendingText ? '<span class="drydock-pending">WAITING · ' + pendingText + "</span>" : "") +
      "</span>" +
      '<span class="drydock-actions">' +
        '<button type="button" class="drydock-btn refit" data-ship-upgrade="' + ship.id + '"' +
          (refitReason ? " disabled" : "") + ' title="' + (refitReason || refitLabel) + '">' +
          refitLabel + "</button>" +
        '<button type="button" class="drydock-btn repair" data-ship-repair="' + ship.id + '"' +
          (repairReason ? " disabled" : "") + ' title="' + (repairReason || repairLabel) + '">' +
          repairLabel + "</button>" +
      "</span>" +
    "</div>"
  );
}

function drydockSectionHTML(sector, row, col) {
  if (!sector) return "";
  const fleet = getFleetAt(row, col, sector.id);
  const ports = getSectorSpaceports(sector.id);
  const parts = [];
  parts.push(
    '<div class="planet-section drydock-section">' +
      '<div class="planet-section-head"><h3>DRYDOCK</h3><span class="slot-count">' +
        (ports.length
          ? ports.length + (ports.length === 1 ? " SPACEPORT" : " SPACEPORTS") + " IN SECTOR"
          : "NO SPACEPORT IN SECTOR") +
      "</span></div>"
  );

  if (!ports.length) {
    parts.push(
      '<div class="slot-lock-note"><span>🛰️</span><span>Refits and repairs need an operational spaceport anywhere in this sector. ' +
      "Interesting: a researched hull tech leaves every standing ship at its old stats until it is refitted here, " +
      "so a fleet without a nearby yard cannot take its upgrades.</span></div>"
    );
    parts.push("</div>");
    return parts.join("");
  }

  if (!fleet.length) {
    parts.push(
      '<div class="slot-lock-note"><span>🛠️</span><span>No ships in this hex. Move a hull here to refit or repair it; ' +
      "the spaceport serves the whole sector.</span></div>"
    );
    parts.push("</div>");
    return parts.join("");
  }

  const portKeys = ports.map(function (port) {
    const pos = parseHexKey(port.key);
    return (pos.row + 1) + ":" + (pos.col + 1);
  });
  parts.push(
    '<p class="fleet-note">Spaceport at hex ' + portKeys.join(", ") + " serves every hull in this sector. " +
      "A refit installs every level the tech tree unlocked but the hull is still missing; a repair restores the full hull. " +
      "Both are paid in this sector's minerals. The yard also repairs 2 hull per turn on its own.</p>"
  );
  parts.push('<div class="drydock-list">' +
    fleet.map(function (ship) { return drydockShipRowHTML(ship, sector.id); }).join("") +
    "</div>");
  parts.push("</div>");
  return parts.join("");
}

function fleetTabHTML(row, col) {
  const sector = getCurrentSector();
  const fleet = getFleetAt(row, col);
  const anomaly = getAnomalyAt(row, col);
  const anomalySection = anomaly && isAnomalyVisible(anomaly) ? anomalySectionHTML(anomaly) : "";
  const patrolSection = patrolStatusHTML(sector, row, col);
  /* The fleet tab of a defended hex has no local readout when its patrol is
     firing into a neighbouring hostile hex; use the engagement lookup so the
     forecast callout appears on both sides of a ranged fight. */
  const battle = sector ? getBattleInvolvingHex(sector.id, row, col) : null;
  const battleSection = battle ? battleCalloutHTML(battle, { row: row, col: col }) : "";
  const drydockSection = drydockSectionHTML(sector, row, col);

  if (!fleet.length) {
    return (
      anomalySection +
      battleSection +
      patrolSection +
      '<div class="fleet-empty">No ships are stationed in this hex.</div>' +
      '<p class="fleet-note">Open the Fleet tab of another hex, select ships, then preview a route on the sector map. Each ship advances up to its speed per turn. Any ship charts the hex it enters. Set a corvette to patrol to defend a hex without moving it.</p>'
    );
  }

  const stats = getFleetStats(fleet);
  const selectedIds = state.ui.shipSelection.filter(function (id) {
    return fleet.some(function (ship) { return ship.id === id; });
  });
  const selectedCount = selectedIds.length;
  const allSelected = selectedCount === fleet.length;
  const selectedShips = fleet.filter(function (ship) {
    return selectedIds.indexOf(ship.id) !== -1;
  });
  const selectedCorvettes = selectedShips.filter(function (ship) {
    const type = SHIP_TYPES[ship.type];
    return !!type && !!type.military;
  });
  const canSetPatrol = selectedCorvettes.some(function (ship) { return !ship.patrol; });
  const canStandDown = selectedCorvettes.some(function (ship) { return !!ship.patrol; });
  const patrolCount = fleet.filter(function (ship) {
    const type = SHIP_TYPES[ship.type];
    return !!type && !!type.military && ship.patrol;
  }).length;
  const composition = SHIP_ORDER.map(function (typeId) {
    const count = fleet.filter(function (ship) { return ship.type === typeId; }).length;
    if (!count) return "";
    const type = SHIP_TYPES[typeId];
    return count + " " + type.name + (count === 1 ? "" : "s");
  }).filter(Boolean).join(" · ") + (patrolCount ? " · " + patrolCount + " on patrol" : "");
  const fleetIconKey = getFleetIconKey(fleet);

  const structure = getStructureAt(row, col);
  const gateReady = !!structure && isPlayerStructure(structure) &&
    structure.type === "gate" && !structure.underConstruction;
  const jumpCost = CONFIG.galaxy.jumpEnergyCost || 0;
  const localJumpEnergy = sector ? getSectorStock(sector.id, "energy") : 0;
  const canAffordJump = localJumpEnergy >= jumpCost;
  /* Gate operations: every operational gate in the sector allows
     getGateOpsPerGate() fleet jumps per turn. */
  const gateOps = sector ? getSectorGateOps(sector.id) : { gates: 0, perGate: 1, cap: 0, used: 0, left: 0 };
  const canJumpOps = gateOps.left > 0;
  const neighbors = gateReady ? getAdjacentSectors(sector) : [];
  const jumpRows = neighbors.map(function (target) {
    /* A jump lane publishes the destination's name, but its charts and
       colony count wait for a chart, and its hostile power waits for the
       player to be active there. */
    const known = sectorHasCharts(target);
    const charted = known ? getSectorChartedCount(target.id) : 0;
    const targetColonies = known ? getSectorColonyCount(target.id) : 0;
    const rivalPower = isSectorPowerVisible(target) ? getSectorRivalPower(target.id) : 0;
    const landingKey = getLandingHexFor(target, sector.id);
    const landingPos = parseHexKey(landingKey);
    const landingCoord = (landingPos.row + 1) + ":" + (landingPos.col + 1);
    let direction = "↔";
    if (target.ring < sector.ring) direction = "↩";
    else if (target.ring > sector.ring) direction = "↗";
    const meta = getSectorRingLabel(target) + " · LANDS " + landingCoord + " · " +
      (known ? charted + "/" + getTotalHexes() + " CHARTED" : "UNCHARTED") +
      (targetColonies ? " · " + targetColonies + " COL" : "") +
      (rivalPower ? " · ⚔ " + rivalPower : "");
    return (
      '<button class="jump-row" data-jump-sector="' + target.id + '"' + (selectedCount && canJumpOps ? "" : " disabled") +
        ' title="Jump to ' + target.name + '; lands at hex ' + landingCoord + '"' +
        ' aria-label="Jump to ' + target.name + ', lands at hex ' + landingCoord + '">' +
        '<span class="jump-dir" aria-hidden="true">' + direction + '</span>' +
        '<span class="jump-main">' +
          '<span class="jump-name">' + target.name + '</span>' +
          '<span class="jump-meta">' + meta + '</span>' +
        '</span>' +
        '<span class="jump-cost' + (canAffordJump ? "" : " short") + '">' + jumpCost + ' ⚡</span>' +
      '</button>'
    );
  }).join("");

  const rows = fleet.map(function (ship) {
    const type = SHIP_TYPES[ship.type];
    if (!type) return "";
    const selected = selectedIds.indexOf(ship.id) !== -1;
    const hull = getShipHull(ship);
    const hullMax = getShipHullMax(ship);
    const damaged = hull < hullMax;
    const radius = shipPatrolRadius(ship);
    let roleChip = '<span class="ship-stat">⚔ <b>' + type.attack + '</b> ATK</span>';
    if (ship.type === "builder") {
      roleChip = '<span class="ship-stat builder-stat">🏗️ BUILD</span>';
    } else if (ship.type === "science") {
      roleChip = '<span class="ship-stat survey-stat">🔭 SURVEY</span>';
    }
    const hasOrder = !!(ship.path && ship.path.length && ship.pathSectorId === sector.id);
    let orderChip = "";
    if (hasOrder) {
      const destination = parseHexKey(ship.path[ship.path.length - 1]);
      orderChip = '<span class="ship-order-chip">→ ' + (destination.row + 1) + ":" + (destination.col + 1) +
        " · " + ship.path.length + (ship.path.length === 1 ? " HEX" : " HEXES") +
        " · ETA " + getPathEta(ship.path.length, ship.type) + "T</span>";
    }
    const patrolChip = ship.patrol
      ? '<span class="ship-order-chip patrol-chip">🛡 PATROL R' + radius + '</span>'
      : "";
    return (
      '<button class="ship-row' + (selected ? " selected" : "") + (ship.patrol ? " patrolling" : "") + '" data-ship-id="' + ship.id + '" aria-pressed="' + (selected ? "true" : "false") + '">' +
        '<span class="ship-row-icon ship-icon-' + ship.type + '" aria-hidden="true">' + type.emoji + "</span>" +
        '<span class="ship-row-main">' +
          '<span class="ship-row-name">' + ship.name + "</span>" +
          '<span class="ship-row-meta">' + type.name + " · " + type.role + "</span>" +
          '<span class="ship-row-stats">' +
            roleChip +
            '<span class="ship-stat' + (damaged ? " damaged" : "") + '">🛡 <b>' + hull + '</b>/' + hullMax + ' HULL</span>' +
            '<span class="ship-stat speed">➜ <b>' + getShipSpeed(ship) + '</b> SPD</span>' +
            '<span class="ship-stat power">✦ <b>' + getShipPower(ship) + '</b> PWR</span>' +
            (getShipInstalledTotalLevels(ship)
              ? '<span class="ship-stat refit">⬆ <b>' + getShipInstalledTotalLevels(ship) + '</b>/' +
                getShipUpgradeTotalLevels(ship.type) + ' REFITS</span>'
              : "") +
          "</span>" +
          orderChip +
          patrolChip +
        "</span>" +
        '<span class="ship-check" aria-hidden="true">✓</span>' +
      "</button>"
    );
  }).join("");

  return (
    anomalySection +
    battleSection +
    patrolSection +
    '<div class="fleet-summary-card">' +
      '<div class="fleet-emblem fleet-emblem-' + fleetIconKey + '" aria-hidden="true">' + getFleetIconEmoji(fleet) + '</div>' +
      '<div class="fleet-summary-main">' +
        '<span class="kicker">LOCAL FLEET</span>' +
        '<h2>' + fleet.length + (fleet.length === 1 ? " SHIP" : " SHIPS") + '</h2>' +
        '<span class="fleet-composition">' + composition + '</span>' +
      '</div>' +
      '<div class="fleet-stat-stack">' +
        '<span class="fleet-stat">⚔ <b>' + stats.attack + '</b> ATK</span>' +
        '<span class="fleet-stat hull">🛡 <b>' + stats.hull + '</b>/' + stats.hullMax + '</span>' +
        '<span class="fleet-stat power">✦ <b>' + stats.power + '</b> PWR</span>' +
      '</div>' +
    '</div>' +
    '<div class="fleet-section">' +
      '<div class="fleet-section-head"><h3>SHIP ROSTER</h3><span class="fleet-selected-count">' +
        (selectedCount ? selectedCount + " OF " + fleet.length + " SELECTED" : "TAP SHIPS TO SELECT") +
      '</span></div>' +
      '<div class="ship-list">' + rows + '</div>' +
    '</div>' +
    drydockSection +
    '<div class="fleet-actions">' +
      '<button class="secondary-btn" data-fleet-select-all>' + (allSelected ? "CLEAR" : "SELECT ALL") + '</button>' +
      '<button class="primary-btn" data-fleet-move' + (selectedCount ? "" : " disabled") + '>' +
        (selectedCount ? "MOVE " + selectedCount + (selectedCount === 1 ? " SHIP" : " SHIPS") : "SELECT SHIPS TO MOVE") +
      '</button>' +
    '</div>' +
    '<div class="fleet-patrol-actions">' +
      '<button class="secondary-btn patrol-order" data-fleet-patrol' + (canSetPatrol ? "" : " disabled") + '>' +
        (selectedCorvettes.length ? "SET PATROL" : "SELECT A CORVETTE") +
      '</button>' +
      '<button class="secondary-btn patrol-stand-down" data-fleet-stand-down' + (canStandDown ? "" : " disabled") + '>' +
        (selectedCorvettes.length ? "STAND DOWN" : "NO PATROL SELECTED") +
      '</button>' +
    '</div>' +
    (gateReady
      ? '<div class="fleet-section jump-section">' +
          '<div class="fleet-section-head"><h3>GATE JUMP</h3><span class="fleet-selected-count' +
            (canJumpOps ? "" : " text-bad") + '">' +
            (canJumpOps
              ? gateOps.left + " / " + gateOps.cap + " OPS LEFT"
              : "NO JUMP OPS LEFT") +
          '</span></div>' +
          '<div class="jump-list">' + jumpRows + '</div>' +
          '<p class="planet-footnote">Each gate jump burns ' + jumpCost + ' ⚡ from the ledger of this sector and lands on the target sector\'s labelled lane hex. Jumping clears any queued hex route and stands down patrol on the ships that leave. Every operational gate in this sector allows ' + gateOps.perGate +
            (gateOps.perGate === 1 ? " fleet jump" : " fleet jumps") + ' per turn (' + gateOps.gates +
            (gateOps.gates === 1 ? " gate" : " gates") + ' here, ' + gateOps.used + ' ops used); the counter resets when the turn ends.</p>' +
          (canAffordJump ? "" : '<div class="slot-lock-note"><span>⚡</span><span>Not enough energy in ' + (sector ? sector.name : "this sector") + ' for a jump. Need ' + jumpCost + ' ⚡, have ' + formatAmount(localJumpEnergy) + '.</span></div>') +
          (canJumpOps ? "" : '<div class="slot-lock-note"><span>🌀</span><span>This sector\'s gates have spent every jump op this turn. End the turn to reset, or research Gate Throughput to raise the limit.</span></div>') +
        '</div>'
      : '<div class="fleet-section jump-section">' +
          '<div class="fleet-section-head"><h3>GATE JUMP</h3><span class="fleet-selected-count">LOCKED</span></div>' +
          '<div class="slot-lock-note"><span>🌀</span><span>' + gateLockMessage(structure) + '</span></div>' +
        '</div>') +
    '<p class="fleet-note">Tap ships to build a movement group. In the sector map, tap any hex to preview the shortest route and confirm it, or long-press a hex to send one of its ships without opening its dossier. Each ship travels up to its speed in hexes per turn. A patrolling corvette holds its hex, fires on a hostile within 1 hex each turn and protects that zone from raids; moving or jumping cancels patrol. Gate jumps cost ' + jumpCost + ' ⚡, are only available at an operational gate, and land on the destination lane\'s labelled hex.</p>'
  );
}
function renderPlanet() {
  const selectedKey = state.ui.selectedHex;
  if (!selectedKey) return;
  const pos = parseHexKey(selectedKey);
  if (!isInsideSector(pos.row, pos.col)) return;
  const charted = isHexExplored(pos.row, pos.col);
  const system = charted ? getSystemAtHex(pos.row, pos.col) : null;
  const anomaly = charted ? getAnomalyAt(pos.row, pos.col) : null;
  const visibleAnomaly = anomaly && isAnomalyVisible(anomaly) ? anomaly : null;
  const fleet = getFleetAt(pos.row, pos.col);
  const tab = state.ui.selectedTab === "fleet" ? "fleet" : "world";
  state.ui.selectedTab = tab;
  state.ui.selectedSystem = system ? system.id : null;
  state.ui.shipSelection = state.ui.shipSelection.filter(function (id) {
    return fleet.some(function (ship) { return ship.id === id; });
  });

  const sector = getCurrentSector();
  const sectorTag = sector ? " · " + getSectorLabel(sector).toUpperCase() : "";
  const hexLabel = "HEX " + (pos.row + 1) + ":" + (pos.col + 1);
  let headerName = "Uncharted Hex";
  let kicker = "UNEXPLORED " + hexLabel + sectorTag;
  if (charted && system) {
    headerName = system.name;
    if (system.owner) {
      const empire = getEmpire(system.owner);
      kicker = "RIVAL SYSTEM" + (empire ? " · " + empire.name.toUpperCase() : "") + " · " + hexLabel + sectorTag;
    } else {
      kicker = system.colonized
        ? (system.home ? "CAPITAL COLONY DOSSIER" : "COLONY DOSSIER") + " · " + hexLabel + sectorTag
        : "CHARTED SYSTEM · " + hexLabel + sectorTag;
    }
  } else if (charted) {
    headerName = visibleAnomaly ? getAnomalyName(visibleAnomaly) : "Empty Hex";
    kicker = visibleAnomaly
      ? "SURVEY SITE · " + hexLabel + sectorTag
      : "CHARTED HEX · " + hexLabel + sectorTag;
  }
  if (tab === "fleet") kicker = "FLEET OPERATIONS · " + hexLabel + sectorTag;

  els.planetHeaderName.textContent = headerName;
  els.planetKicker.textContent = kicker;
  els.planetDetails.classList.toggle("hidden", !(tab === "world" && system && system.colonized));
  els.fleetTabCount.textContent = String(fleet.length);
  els.sectorTabs.querySelectorAll("[data-sector-tab]").forEach(function (button) {
    const active = button.getAttribute("data-sector-tab") === tab;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });

  els.planetContent.innerHTML = tab === "fleet"
    ? fleetTabHTML(pos.row, pos.col)
    : worldTabHTML(system, charted, pos.row, pos.col);
}