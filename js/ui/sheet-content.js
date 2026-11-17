/* ============================================================
   SHEET CONTENT — HTML bodies for the bottom sheet
   Resource details, stability, building picker, the population menu (housing
   and sustenance upkeep steppers), planet details, the event deck and the
   rival dossier.
   ============================================================ */

/* Encounter deck inspector. Read-only: it shows the live cadence, category
   multipliers and the weighted chance of every card in its bucket. */
function eventDeckSheetHTML() {
  const deck = getEventDeckSummary();
  const eligibleCards = deck.categories.reduce(function (total, category) {
    return total + category.events.filter(function (event) { return event.eligible; }).length;
  }, 0);
  const parts = [];

  parts.push(
    '<div class="sheet-summary">' +
      '<span class="big-icon" aria-hidden="true">📡</span>' +
      '<span class="big-value">' + eligibleCards + "</span>" +
      '<span class="big-delta">ELIGIBLE CARDS</span>' +
    "</div>"
  );

  parts.push('<div class="sheet-section"><h3>DECK PACE</h3>');
  parts.push(breakdownRow("Card cadence", "1 / " + deck.interval + (deck.interval === 1 ? " turn" : " turns"), {}));
  parts.push(breakdownRow("Eligible bucket weight", String(Math.round(deck.totalWeight)), {}));
  parts.push("</div>");

  deck.categories.forEach(function (category) {
    parts.push(
      '<div class="sheet-section deck-section">' +
        '<h3>' + category.emoji + " " + category.name.toUpperCase() +
          ' · <span class="deck-mult">×' + category.weightMult + "</span></h3>"
    );
    if (category.blurb) parts.push('<p class="deck-blurb">' + category.blurb + "</p>");
    category.events.forEach(function (event) {
      parts.push(
        '<div class="deck-row' + (event.eligible ? "" : " locked") + '">' +
          '<span class="deck-emoji" aria-hidden="true">' + event.emoji + "</span>" +
          '<span class="deck-main">' +
            '<span class="deck-name">' + event.title + "</span>" +
            '<span class="deck-meta">WEIGHT ' + Math.round(event.weight) +
              (event.reason ? " · " + event.reason.toUpperCase() : "") + "</span>" +
          "</span>" +
          '<span class="deck-chance">' + (event.eligible ? Math.round(event.chance * 100) + "%" : "—") + "</span>" +
        "</div>"
      );
    });
    parts.push("</div>");
  });

  parts.push(
    '<p class="sheet-note">The deck lives in js/data/events.js: each card has a weight, each category has a weight multiplier, and a bucket lists which cards the category can draw. ' +
    "Use setEventCategoryWeight, setEventWeight, addEventToBucket or removeEventFromBucket to retune it live.</p>"
  );
  return parts.join("");
}

/* Run archive. Browser storage is the one-tap slot; a save file is the
   portable JSON copy of the same snapshot. */
function saveSheetHTML() {
  const browserSave = getBrowserSave();
  const meta = browserSave ? getSaveMetadata(browserSave) : null;
  const storageReady = browserStorageAvailable();
  const parts = [];

  parts.push(
    '<div class="sheet-summary save-summary">' +
      '<span class="big-icon" aria-hidden="true">💾</span>' +
      '<span class="big-value">TURN ' + state.turn + "</span>" +
      '<span class="big-delta">SEED ' + state.galaxy.seed + "</span>" +
    "</div>"
  );

  parts.push('<div class="sheet-section save-actions"><h3>BROWSER STORAGE</h3>');
  parts.push(
    '<p class="save-status">' + (meta
      ? "Saved run: <b>turn " + meta.turn + "</b> · " + meta.ethicName + " · " + formatSavedAt(meta.savedAt)
      : (storageReady
        ? "No saved run in this browser yet. A browser save is one tap away and opens from the start screen."
        : "Browser storage is unavailable here. Use a save file instead.")) +
    "</p>"
  );
  parts.push('<button class="primary-btn" type="button" data-save-action="browser-save">SAVE TO BROWSER</button>');
  parts.push(
    '<button class="secondary-btn" type="button" data-save-action="browser-load"' +
      (meta ? "" : " disabled") + ">LOAD SAVED RUN</button>"
  );
  parts.push(
    '<button class="secondary-btn danger" type="button" data-save-action="browser-delete"' +
      (storageReady ? "" : " disabled") + ">DELETE SAVED RUN</button>"
  );
  parts.push("</div>");

  parts.push('<div class="sheet-section save-actions"><h3>SAVE FILE</h3>');
  parts.push(
    '<p class="save-status">A save file is the whole run as readable JSON: the portable backup. ' +
    "Download it here and load it on any device with this build.</p>"
  );
  parts.push('<button class="secondary-btn" type="button" data-save-action="file-save">DOWNLOAD SAVE FILE</button>');
  parts.push('<button class="secondary-btn" type="button" data-save-action="file-load">LOAD SAVE FILE…</button>');
  parts.push("</div>");

  parts.push(
    '<p class="sheet-note">Loading replaces the current run, so save first if you want to keep it. ' +
    "The snapshot stores the galaxy, every sector, fleet, colony, tech, event history and the " +
    "deck positions, so a loaded run continues on the same turn and draws the same next card. " +
    "Browser saves live in this browser only; the file is the copy you can move around.</p>"
  );
  return parts.join("");
}

/* Rival dossier. Opened from the empire tab or from a rival system. */
function rivalSheetHTML(empire) {
  if (!empire) return "";
  const def = getEmpireStateDef(empire);
  const archetype = getEmpireArchetype(empire);
  const colonies = getEmpireColonyCount(empire);
  const fleet = getEmpireShipCount(empire);
  const strongholdList = getEmpireStrongholds(empire);
  const strongholds = strongholdList.filter(function (entry) { return !entry.structure.underConstruction; }).length;
  const strongholdsBuilding = strongholdList.length - strongholds;
  const power = getEmpirePower(empire);
  const home = getSector(empire.sectorId);
  const battles = (state.military && state.military.log ? state.military.log : []).filter(function (entry) {
    return entry.empireId === empire.id;
  }).length;
  const parts = [];

  parts.push(
    '<div class="sheet-summary rival-summary" style="--rival-color:' + empire.color + '">' +
      '<span class="big-icon" aria-hidden="true">' + empire.emoji + '</span>' +
      '<span class="big-value">' + empire.name + '</span>' +
      '<span class="big-delta">RING ' + empire.ring + ' · ' + getRivalTierLabel(empire) + '</span>' +
    '</div>'
  );

  parts.push('<div class="sheet-section"><h3>THREAT PROFILE</h3>');
  parts.push(breakdownRow("Threat tier", getRivalThreatLabel(empire) + " · TIER " + empire.tier, {
    amountClass: empire.ring >= 3 ? "text-bad" : "text-gold"
  }));
  parts.push(breakdownRow("AI state", (def ? def.name : "Patrol") + " · " + (def ? def.label : "PATROL"), {
    sub: def ? def.desc : ""
  }));
  parts.push(breakdownRow("Current action", "Turn " + (empire.lastActionTurn || 1), {
    sub: getEmpireActionLabel(empire)
  }));
  /* Meeting an empire does not chart its home sector. The dossier keeps the
     home sector's name and colony count behind the same fog as the map. */
  const homeCharted = !!home && sectorHasCharts(home);
  parts.push(breakdownRow("Home sector", home && isSectorNameKnown(home) ? home.name : "Unknown", {
    sub: home
      ? getSectorRingLabel(home) + (homeCharted ? " · " + getSectorColonyCount(home.id) + " player colonies" : "")
      : ""
  }));
  parts.push("</div>");

  parts.push('<div class="sheet-section"><h3>FORCES</h3>');
  parts.push(breakdownRow("Fleet power", String(power), { amountClass: empire.ring >= 3 ? "text-bad" : "" }));
  parts.push(breakdownRow("Corvettes", fleet + " / " + empire.fleetCap, {}));
  parts.push(breakdownRow("Strongholds",
    strongholds + (strongholds === 1 ? " online" : " online") +
      (strongholdsBuilding ? " · " + strongholdsBuilding + " building" : ""), {
    sub: strongholds === 1 ? "Static R2 platform" : "Static R2 platforms"
  }));
  parts.push(breakdownRow("Colonies", colonies + " / " + empire.colonyCap, {}));
  parts.push(breakdownRow("Reserve", empire.minerals + " ⛏", { sub: "Abstracted AI stockpile" }));
  parts.push("</div>");

  parts.push('<div class="sheet-section"><h3>INTELLIGENCE</h3>');
  parts.push(breakdownRow("Contacted", "Turn " + (empire.discoveredTurn || state.turn), {}));
  parts.push(breakdownRow("Dispatches filed", String(battles), {}));
  parts.push(breakdownRow("Losses", String(empire.stats ? empire.stats.losses : 0), {}));
  parts.push(breakdownRow("Raids launched", String(empire.stats ? empire.stats.raids : 0), {}));
  parts.push(breakdownRow("Hulls laid down", String(empire.stats ? empire.stats.shipsBuilt : 0), {}));
  parts.push("</div>");

  parts.push('<div class="sheet-section"><h3>DOCTRINE</h3>');
  parts.push(breakdownRow(archetype.name, "×" + empire.aggression.toFixed(2) + " aggression", {
    sub: archetype.blurb
  }));
  parts.push(breakdownRow("Difficulty position", getRivalTierLabel(empire), {
    sub: "Rivals near the core field smaller fleets; rim powers are strongest."
  }));
  parts.push("</div>");

  parts.push(
    '<p class="sheet-note">Rival colonies are claimed systems and cannot be colonised. Their ships and strongholds can be destroyed by patrols, but the empire will rebuild. Raids steal minerals and cost 1 stability unless a patrol or stronghold covers the colony hex.</p>'
  );
  return parts.join("");
}

/* Energy and minerals are local ledgers; research and influence are the
   empire's shared stockpiles. The sheet always says which scope it shows. */
function resourceSheetHTML(type) {
  const globalEcon = getEconomy();
  const meta = RESOURCE_META[type];
  const isEnergy = type === "energy";
  const isMinerals = type === "minerals";
  const isLocal = isEnergy || isMinerals;
  const isResearch = type === "research";
  const sector = isLocal ? getCurrentSector() : null;
  const econ = isLocal ? (sector ? getSectorEconomy(sector.id) : null) : globalEcon;
  const value = isLocal ? (sector ? getSectorStock(sector.id, type) : 0) : state.resources[type];
  const delta = isLocal ? (econ ? econ.net[type] : 0) : globalEcon.income[type];
  const parts = [];

  parts.push(
    '<div class="sheet-summary">' +
      '<span class="big-icon" aria-hidden="true">' + meta.icon + "</span>" +
      '<span class="big-value">' + formatAmount(value) + "</span>" +
      '<span class="big-delta ' + signedClass(delta) + '">' + formatSigned(delta) + " / TURN</span>" +
    "</div>"
  );

  if (isLocal) {
    parts.push(
      '<p class="sheet-scope">SECTOR LEDGER · <b>' + (sector ? sector.name.toUpperCase() : "NO SECTOR") +
      "</b> · stored and spent locally</p>"
    );
  } else {
    parts.push('<p class="sheet-scope">EMPIRE-WIDE STOCKPILE · every sector contributes</p>');
  }

  parts.push('<div class="sheet-section"><h3>INCOME SOURCES</h3>');
  const sourceList = (econ && econ.sources[type]) || [];
  if (sourceList.length) {
    sourceList.forEach(function (source) {
      parts.push(signedBreakdownRow(source.label, source.amount, source.sub));
    });
  } else {
    parts.push(breakdownRow("No active production", "0", {}));
  }
  parts.push("</div>");

  const mods = (econ && econ.mods[type]) || [];
  if (mods.length) {
    parts.push('<div class="sheet-section"><h3>EMPIRE MODIFIERS</h3>');
    mods.forEach(function (mod) {
      parts.push(
        breakdownRow(
          mod.label,
          formatMultiplier(mod.mult),
          { className: "multiplier" }
        )
      );
    });
    parts.push("</div>");
  }

  if (isLocal && econ) {
    parts.push('<div class="sheet-section"><h3>SECTOR UPKEEP</h3>');
    const upkeepItems = (isEnergy ? econ.upkeepItems : econ.mineralUpkeepItems) || [];
    if (upkeepItems.length) {
      upkeepItems.forEach(function (item) {
        parts.push(signedBreakdownRow((isEnergy ? "⚡ " : "⛏ ") + item.label, -item.amount, item.sub));
      });
    } else {
      parts.push(breakdownRow("No upkeep", "0", {}));
    }
    parts.push("</div>");
  }

  if (isLocal && econ) {
    const flow = econ.trade || { in: { energy: 0, minerals: 0 }, out: { energy: 0, minerals: 0 }, entries: [] };
    const blocked = getSectorTrades().filter(function (route) {
      return route.sourceSectorId === (sector ? sector.id : null) &&
        (route.status === "no-gate" || route.status === "out-of-reach");
    });
    parts.push('<div class="sheet-section"><h3>GATE TRADE</h3>');
    if (flow.entries.length) {
      flow.entries.forEach(function (route) {
        const outbound = route.sourceSectorId === (sector ? sector.id : null);
        const other = outbound ? route.targetSector : route.sourceSector;
        parts.push(
          breakdownRow(
            (outbound ? "Outbound → " : "Inbound ← ") + (other ? other.name : "unknown"),
            "⚡" + route.energy + " ⛏" + route.minerals,
            { sub: route.hops + (route.hops === 1 ? " hop" : " hops") + " · per turn" }
          )
        );
      });
    } else {
      parts.push(breakdownRow("No gate trade", "0", { sub: "Trading centers move resources between sectors." }));
    }
    blocked.forEach(function (route) {
      const other = route.targetSector ? route.targetSector.name : "no destination";
      parts.push(
        breakdownRow(
          "Blocked → " + other,
          getTradeStatusLabel(route),
          { amountClass: "text-bad", sub: route.reason || "" }
        )
      );
    });
    parts.push("</div>");
  }

  if (isEnergy) {
    const net = econ ? econ.net.energy : 0;
    parts.push(
      breakdownRow(
        "NET ENERGY / TURN",
        formatSigned(net),
        { className: "total" + (net < 0 ? " negative" : ""), amountClass: signedClass(net) }
      )
    );
  } else if (isMinerals) {
    const net = econ ? econ.net.minerals : 0;
    parts.push(
      breakdownRow(
        "NET MINERALS / TURN",
        formatSigned(net),
        { className: "total" + (net < 0 ? " negative" : ""), amountClass: signedClass(net) }
      )
    );
  } else {
    parts.push(
      breakdownRow(
        "TOTAL / TURN",
        formatSigned(globalEcon.income[type]),
        { className: "total", amountClass: signedClass(globalEcon.income[type]) }
      )
    );
  }

  if (isEnergy) {
    parts.push('<p class="sheet-note">Energy is local to ' + (sector ? sector.name : "this sector") +
      '. Upkeep is paid from this ledger when you end the turn: colony overhead, population sustenance, every completed building (staffed or not), online strongholds and trading centers, and the research directorate if this is the capital sector. If this sector is in the red after upkeep, stability drops by 2 that turn. Production happens at the start of each new turn.</p>');
  } else if (isMinerals) {
    parts.push('<p class="sheet-note">Minerals are local to ' + (sector ? sector.name : "this sector") +
      '. Building, ship, structure and colonisation costs are paid from the sector where the work happens, and population housing is a standing mineral upkeep here. If this sector is in the red after upkeep, stability drops by 2 that turn. A frontier world must be supplied by a trading center. Raids loot and battles salvage in the sector they happen in.</p>');
  } else if (isResearch) {
    if (state.tech.active) {
      parts.push('<p class="sheet-note">Research is empire-wide: every Lab in every sector feeds this stockpile. It is automatically invested in ' + TECHS[state.tech.active].name + '. The project draws ' + getTechEnergyUpkeep(state.tech.active) + ' energy upkeep from the capital sector each turn. The stockpile above is overflow waiting for the next project.</p>');
    } else {
      parts.push('<p class="sheet-note">Research is empire-wide: every Lab in every sector feeds this one stockpile. It is banked until a project is active. Starting a technology has no action cost, but it adds an energy upkeep on the capital sector each turn while it is researched.</p>');
    }
  } else {
    parts.push('<p class="sheet-note">Influence is empire-wide: every sector contributes to the same stockpile. It is the scarce expansion currency: colonizing costs 3. Base income is only +1 per turn; ethics, events, Embassies and the Diplomacy Network add more.</p>');
  }

  return parts.join("");
}

function stabilitySheetHTML() {
  const low = state.stability < CONFIG.stability.lowThreshold;
  const parts = [];
  parts.push(
    '<div class="sheet-summary">' +
      '<span class="big-icon" aria-hidden="true">⚖</span>' +
      '<span class="big-value">' + state.stability + "</span>" +
      '<span class="big-delta ' + (low ? "text-bad" : "text-good") + '">' + (low ? "UNREST" : "STABLE") + "</span>" +
    "</div>"
  );
  parts.push('<div class="sheet-section"><h3>STABILITY EFFECTS</h3>');
  parts.push(breakdownRow("Below 30", "All production −25%", { className: low ? "multiplier" : "" }));
  parts.push(breakdownRow("At 0", "Rebellion — game over", {}));
  parts.push(breakdownRow("Restore stability", "Event choices only", { sub: "There is no passive recovery." }));
  parts.push("</div>");

  parts.push('<div class="sheet-section"><h3>PER-TURN PRESSURE</h3>');
  const deficitSectors = getSectorsInDeficit();
  const deficitSub = deficitSectors.length
    ? "In deficit: " + deficitSectors.map(function (sector) { return sector.name; }).join(", ")
    : "Applies while any sector's energy or minerals are below 0 after upkeep";
  parts.push(
    signedBreakdownRow(
      "Negative sector balance after upkeep",
      -CONFIG.stability.energyDeficitPenalty,
      deficitSub
    )
  );
  parts.push("</div>");
  parts.push('<p class="sheet-note">Production is recalculated immediately after every event or action. When stability falls below 30, all resource production is reduced by 25%. A sector that cannot pay its population housing or sustenance can fall into a mineral or energy deficit; the penalty is charged once per turn no matter how many sectors are short.</p>');
  return parts.join("");
}

function buildSheetHTML(system, slotIndex) {
  const currentMinerals = getSectorStock(system.sectorId, "minerals");
  const sector = getSector(system.sectorId);
  const workforce = getWorkforcePlan(system);
  const parts = [];
  parts.push(
    '<div class="slot-lock-note"><span>⚡</span><span>Construction is paid from <b>' +
      (sector ? sector.name : "this sector") + "'s</b> ledger: " + formatAmount(currentMinerals) +
      ' ⛏ held. Minerals are local to the sector; move them with a trading center.</span></div>'
  );
  parts.push(
    '<div class="slot-lock-note"><span>👥</span><span>Population ' + workforce.population + ' / ' + workforce.cap +
    ' · ' + workforce.jobsStaffed + ' / ' + workforce.jobsTotal + ' posts staffed · ' + workforce.availableWorkers +
    ' free ' + (workforce.availableWorkers === 1 ? "worker" : "workers") +
    '. Workers are assigned in slot order.</span></div>'
  );
  parts.push(
    '<div class="slot-lock-note"><span>🏗</span><span>Construction completes when you end the turn. You can build without free workers: the building still pays its energy upkeep, but produces nothing until staffed.</span></div>'
  );
  parts.push('<div class="build-list">');
  BUILDING_ORDER.forEach(function (type) {
    const def = BUILDINGS[type];
    const cost = def.cost.minerals;
    const workers = getBuildingWorkers(type);
    const canAfford = currentMinerals >= cost;
    const freeWorkers = workforce.availableWorkers;
    const canStaff = workers === 0 || freeWorkers >= workers;
    const short = Math.max(0, cost - currentMinerals);
    const workforceLine = workers > 0
      ? (canStaff
          ? "needs " + workers + (workers === 1 ? " worker" : " workers") + " · ready"
          : freeWorkers > 0
            ? '<span class="text-bad">only ' + freeWorkers + " free</span> · needs " + workers + (workers === 1 ? " worker" : " workers")
            : '<span class="text-bad">no free workers now</span> · needs ' + workers + (workers === 1 ? " worker" : " workers"))
      : "needs no workers";
    /* A building is laid down at the highest level the tech tree has
       unlocked. A building that predates the tech keeps its old level until
       it is refitted from its slot. */
    const unlockedLevel = getBuildingUnlockedLevel(type);
    const levelLine = unlockedLevel > 1
      ? " · builds at LVL " + unlockedLevel
      : " · builds at LVL 1";
    parts.push(
      '<button class="build-option ' + (canAfford ? "" : "short") + '" data-build="' + type + '"' + (canAfford ? "" : " disabled") + ">" +
        '<span class="b-emoji" aria-hidden="true">' + def.emoji + "</span>" +
        '<span class="b-main">' +
          '<span class="b-name">' + def.name + "</span>" +
          '<span class="b-yield">' + buildingYieldText(type) + "</span>" +
          '<span class="b-yield">' + def.desc + " · " + workforceLine + " · 1 turn" + levelLine + "</span>" +
        "</span>" +
        '<span class="b-cost">' + cost + " ⛏" +
          "<small>" + (canAfford ? "CONSTRUCT" : "NEED " + short + " MORE") + "</small>" +
        "</span>" +
      "</button>"
    );
  });
  parts.push("</div>");
  parts.push('<p class="sheet-note">You can construct in every open slot this turn, with or without free workers. Completed buildings always pay energy upkeep. Output scales with staffing: 1 of 2 mine workers is 50%. Workers are assigned in slot order, so earlier slots are staffed first. A new building is laid down at the level your Building category techs have unlocked; a building that was already standing keeps its old level until you refit it from its slot for half its build cost. Housing is not a building: open the population card to fund houses with minerals and sustenance with energy.</p>');
  return parts.join("");
}

/* ---------- population menu ---------- */

/* One stepper row. The − and + labels are disabled with an explanatory
   title when the move is illegal: at the bound, or a housing cut that would
   leave more people than houses. */
function populationUpkeepRow(system, axis, policy, bounds) {
  const isHousing = axis === "housing";
  const step = isHousing ? getPopulationHousingUpkeepStep() : 1;
  const sustCfg = getPopulationSustenanceConfig();
  const value = policy[axis];
  const max = bounds[axis];
  const minusReason = getPopulationUpkeepChangeReason(system, axis, -1);
  const plusReason = getPopulationUpkeepChangeReason(system, axis, 1);
  const icon = isHousing ? "⛏" : "⚡";
  const label = isHousing ? "Housing upkeep" : "Sustenance upkeep";
  const sub = isHousing
    ? step + " ⛏ / turn buys 1 house · max " + (max / step) + " extra"
    : "1 ⚡ / turn feeds " + sustCfg.populationPerEnergy + " pop · max " + max + " (full planet)";
  return (
    '<div class="upkeep-row">' +
      '<span class="upkeep-icon" aria-hidden="true">' + icon + "</span>" +
      '<span class="upkeep-label">' + label.toUpperCase() + "<small>" + sub + "</small></span>" +
      '<span class="upkeep-stepper">' +
        '<button type="button" class="upkeep-step" data-pop-upkeep="' + axis + ':-1"' +
          (minusReason ? ' disabled title="' + minusReason + '" aria-label="Decrease ' + label + '"' : ' aria-label="Decrease ' + label + '"') +
          ">−</button>" +
        '<b class="upkeep-step-value">' + value + "</b>" +
        '<button type="button" class="upkeep-step" data-pop-upkeep="' + axis + ':1"' +
          (plusReason ? ' disabled title="' + plusReason + '" aria-label="Increase ' + label + '"' : ' aria-label="Increase ' + label + '"') +
          ">+</button>" +
      "</span>" +
    "</div>"
  );
}

/* The population menu. Everything the colony needs to describe its growth:
   the current population, the houses that cap it and the sustenance that
   sets its growth rate, both driven by standing upkeep steppers. */
function populationSheetHTML(system) {
  const planet = getPlanetBreakdown(system);
  const wf = planet.workforce;
  const sust = wf.sustenance;
  const sustCfg = getPopulationSustenanceConfig();
  const policy = getPopulationPolicy(system);
  const bounds = { housing: getMaxHousingUpkeep(system), sustenance: getMaxSustenanceUpkeep(system) };
  const sector = getSector(system.sectorId);
  const sectorEcon = sector ? getSectorEconomy(sector.id) : null;
  const tier = sust.tier || { id: "starving", label: "STARVING" };
  const meterWidth = sustCfg.maxMult > 0 ? clamp((sust.mult / sustCfg.maxMult) * 100, 0, 100) : 0;
  const growthValue = wf.canGrow ? "+" + formatAmount(wf.growthPerTurn) : "0";
  const growthClass = wf.canGrow ? "text-good" : wf.overcrowded ? "text-bad" : "text-gold";
  const parts = [];

  parts.push(
    '<div class="sheet-summary population-summary">' +
      '<span class="big-icon" aria-hidden="true">👥</span>' +
      '<span class="big-value">' + wf.population + "<small>/ " + wf.cap + "</small></span>" +
      '<span class="big-delta ' + growthClass + '">' + growthValue + " / TURN</span>" +
    "</div>"
  );
  parts.push('<p class="sheet-scope">' + system.name.toUpperCase() +
    " · HOUSING IS THE HARD CAP · SUSTENANCE IS THE GROWTH RATE</p>");

  /* HOUSING */
  const atHousingMax = policy.housing >= bounds.housing;
  const housingState = wf.overcrowded
    ? '<span class="text-bad">Housing is below the population: the extra people leave when the turn ends.</span>'
    : wf.housingRoom > 0
      ? '<span class="text-good">Room for ' + wf.housingRoom + " more " + (wf.housingRoom === 1 ? "person" : "people") + ".</span>"
      : atHousingMax
        ? '<span class="text-gold">Every house this planet can hold is built. The population is at its size limit.</span>'
        : '<span class="text-gold">Every house is taken. Raise the mineral upkeep to make room.</span>';
  parts.push('<div class="sheet-section"><h3>HOUSING <span class="population-stat-tag">HARD CAP</span></h3>');
  parts.push(breakdownRow("Houses available", String(wf.cap), {
    sub: wf.baseHousing + " founding shelter + " + wf.paidHouses + " paid",
    amountClass: wf.cap > wf.population ? "text-good" : "text-gold"
  }));
  parts.push(breakdownRow("Population", wf.population + " / " + wf.cap, {
    sub: wf.housingRoom > 0 ? wf.housingRoom + " free" : "No free houses",
    amountClass: wf.overcrowded ? "text-bad" : ""
  }));
  parts.push(populationUpkeepRow(system, "housing", policy, bounds));
  parts.push('<p class="upkeep-status">' + housingState + '</p>');
  parts.push("</div>");

  /* SUSTENANCE */
  let sustState;
  if (sust.percent >= sust.maxPercent) {
    sustState = '<span class="text-good">Thriving. Surplus food and entertainment push growth to its maximum.</span>';
  } else if (sust.percent >= 100) {
    sustState = '<span class="text-good">Content. Everyone is fed and the colony grows at its full rate.</span>';
  } else if (sust.percent > 0) {
    sustState = '<span class="text-gold">Rationing. ' + sust.percent + "% of the growth rate is funded; raise the energy upkeep to feed everyone.</span>";
  } else {
    sustState = '<span class="text-bad">Starving. No sustenance upkeep is funded, so growth is halted.</span>';
  }
  parts.push('<div class="sheet-section"><h3>SUSTENANCE <span class="sustenance-tier tier-' + tier.id + '">' + tier.label + "</span></h3>");
  parts.push(
    '<div class="sustenance-meter" role="img" aria-label="Sustenance ' + sust.percent + " percent\">" +
      '<span class="sustenance-fill tier-' + tier.id + '" style="width:' + meterWidth.toFixed(1) + '%"></span>' +
    "</div>"
  );
  parts.push(breakdownRow("Supply / demand", formatAmount(sust.supply) + " / " + sust.demand, {
    sub: policy.sustenance + " ⚡ upkeep · " + sustCfg.populationPerEnergy + " fed per energy",
    amountClass: sust.percent >= 100 ? "text-good" : sust.percent > 0 ? "text-gold" : "text-bad"
  }));
  parts.push(breakdownRow("Growth multiplier", "×" + sust.mult.toFixed(2) + " · " + sust.percent + "%", {
    sub: "100% feeds everyone · " + sust.maxPercent + "% is the maximum",
    amountClass: sust.percent >= 100 ? "text-good" : sust.percent > 0 ? "text-gold" : "text-bad"
  }));
  parts.push(populationUpkeepRow(system, "sustenance", policy, bounds));
  parts.push('<p class="upkeep-status">' + sustState + '</p>');
  parts.push("</div>");

  /* UPKEEP — the sector bill these two standing orders create. */
  parts.push('<div class="sheet-section"><h3>UPKEEP · PAID BY ' +
    (sector ? sector.name.toUpperCase() : "THIS SECTOR") + "</h3>");
  parts.push(signedBreakdownRow("⛏ Population housing", -policy.housing,
    wf.paidHouses + (wf.paidHouses === 1 ? " house" : " houses") + " funded"));
  parts.push(signedBreakdownRow("⚡ Population sustenance", -policy.sustenance,
    sust.percent + "% growth funded"));
  if (sectorEcon) {
    parts.push(breakdownRow("Sector energy after upkeep", "⚡ " + formatSigned(sectorEcon.net.energy), {
      sub: "Net per turn in " + sector.name,
      amountClass: sectorEcon.net.energy < 0 ? "text-bad" : "text-good"
    }));
    parts.push(breakdownRow("Sector minerals after upkeep", "⛏ " + formatSigned(sectorEcon.net.minerals), {
      sub: "Net per turn in " + sector.name,
      amountClass: sectorEcon.net.minerals < 0 ? "text-bad" : "text-good"
    }));
  }
  parts.push("</div>");

  /* GROWTH */
  const fillPercent = wf.cap > 0 ? Math.round((1 - wf.housingRoom / wf.cap) * 100) : 0;
  const nextPopText = wf.overcrowded
    ? "Emigration"
    : wf.growthBlockedBy === "housing"
      ? (policy.housing >= bounds.housing ? "Size limit" : "Housing full")
      : wf.growthBlockedBy === "sustenance"
        ? "No sustenance"
        : wf.turnsToNextPop == null
          ? "Paused"
          : wf.turnsToNextPop + (wf.turnsToNextPop === 1 ? " turn" : " turns");
  parts.push('<div class="sheet-section"><h3>GROWTH</h3>');
  parts.push(breakdownRow("Base growth at full sustenance", formatAmount(wf.growthRate) + " / turn", {
    sub: "Slows as the houses fill"
  }));
  parts.push(breakdownRow("Housing fill", fillPercent + "%", {
    sub: wf.population + " of " + wf.cap + " houses used"
  }));
  parts.push(breakdownRow("Sustenance multiplier", "×" + sust.mult.toFixed(2), {
    sub: tier.label,
    amountClass: sust.percent >= 100 ? "text-good" : sust.percent > 0 ? "text-gold" : "text-bad"
  }));
  parts.push(breakdownRow("Projected growth", growthValue + " / turn", {
    className: "total",
    amountClass: growthClass
  }));
  parts.push(breakdownRow("Next population", nextPopText, {
    sub: wf.growthProgress > 0 ? Math.round(wf.growthProgress * 100) + "% banked" : "No growth banked"
  }));
  parts.push("</div>");

  /* WORKFORCE */
  const idleNames = wf.entries.filter(function (entry) {
    return !entry.underConstruction && entry.workersRequired > 0 && entry.workersAssigned === 0;
  }).map(function (entry) { return BUILDINGS[entry.type] ? BUILDINGS[entry.type].name : entry.type; });
  parts.push('<div class="sheet-section"><h3>WORKFORCE</h3>');
  parts.push(breakdownRow("Posts staffed", wf.jobsStaffed + " / " + wf.jobsTotal, {
    sub: wf.availableWorkers + " free " + (wf.availableWorkers === 1 ? "worker" : "workers"),
    amountClass: wf.idleJobs ? "text-gold" : "text-good"
  }));
  parts.push(breakdownRow("Idle buildings", String(wf.idleBuildings), {
    sub: idleNames.length ? idleNames.join(", ") + " — no workers, upkeep still paid" : "Every building has a crew",
    amountClass: wf.idleBuildings ? "text-bad" : "text-good"
  }));
  parts.push(breakdownRow("Understaffed", String(wf.partialBuildings), {
    sub: wf.partialBuildings ? "Partial output until the population grows" : "Every crew is full",
    amountClass: wf.partialBuildings ? "text-gold" : "text-good"
  }));
  parts.push("</div>");

  parts.push(
    '<p class="sheet-note">Housing and sustenance are standing orders: both are charged to this sector every turn when you end the turn. ' +
    "Housing is a hard cap, so it cannot be lowered below the current population. Sustenance is the growth rate: 1 ⚡ feeds " +
    sustCfg.populationPerEnergy + " population, everyone fed is 100% growth, and a surplus can push it to " + sust.maxPercent +
    "%. A sector that cannot pay falls into a deficit and loses 2 stability that turn.</p>"
  );
  return parts.join("");
}

function planetDetailsHTML(system) {
  const planet = getPlanetBreakdown(system);
  const econ = getEconomy();
  const size = getPlanetSizeDef(system.planetSize);
  const totalSlots = getTotalSlots(system);
  const unlockedSlots = getMaxSlots(system);
  const lockedSlots = totalSlots - unlockedSlots;
  const used = getUsedSlots(system);
  const age = system.home ? null : Math.max(0, state.turn - system.foundedTurn);
  const workforce = planet.workforce;
  const idleNames = workforce.entries.filter(function (entry) {
    return !entry.underConstruction && entry.workersRequired > 0 && entry.workersAssigned === 0;
  }).map(function (entry) { return BUILDINGS[entry.type].name; });
  const partialNames = workforce.entries.filter(function (entry) {
    return !entry.underConstruction && entry.workersRequired > 0 &&
      entry.workersAssigned > 0 && entry.workersAssigned < entry.workersRequired;
  }).map(function (entry) { return BUILDINGS[entry.type].name; });
  const sust = workforce.sustenance;
  const growthLabel = workforce.canGrow
    ? "+" + formatAmount(workforce.growthPerTurn) + " / turn"
    : workforce.overcrowded
      ? "Overcrowded"
      : workforce.growthBlockedBy === "sustenance"
        ? "No sustenance"
        : "Housing full";
  const growthSub = workforce.canGrow
    ? (workforce.turnsToNextPop === 1
        ? "Next population next turn"
        : "Next population in " + workforce.turnsToNextPop + " turns")
    : workforce.overcrowded
      ? "Housing is below the population"
      : workforce.growthBlockedBy === "sustenance"
        ? "Fund energy sustenance in the population menu"
        : "Raise the mineral housing upkeep in the population menu";
  const parts = [];

  parts.push(
    '<div class="sheet-summary">' +
      '<span class="big-icon" aria-hidden="true">👥</span>' +
      '<span class="big-value">' + workforce.population + "/" + workforce.cap + "</span>" +
      '<span class="big-delta">POPULATION</span>' +
    "</div>"
  );

  parts.push('<div class="sheet-section"><h3>POPULATION &amp; WORKFORCE</h3>');
  parts.push(breakdownRow("Population", workforce.population + " / " + workforce.cap, {}));
  parts.push(breakdownRow("Housing", String(workforce.cap), {
    sub: workforce.baseHousing + " founding shelter + " + workforce.paidHouses + " paid · " +
      workforce.housingUpkeep + " ⛏ upkeep"
  }));
  parts.push(breakdownRow("Sustenance", sust.percent + "% · " + sust.tier.label, {
    sub: sust.supply + " fed / " + sust.demand + " needed · " + workforce.sustenanceUpkeep + " ⚡ upkeep",
    amountClass: sust.percent >= 100 ? "text-good" : sust.percent > 0 ? "text-gold" : "text-bad"
  }));
  parts.push(breakdownRow("Jobs staffed", workforce.jobsStaffed + " / " + workforce.jobsTotal, {
    sub: workforce.jobsTotal ? workforce.availableWorkers + " free workers" : "No worker posts yet",
    amountClass: workforce.idleJobs ? "text-bad" : "text-good"
  }));
  parts.push(breakdownRow("Idle buildings", String(workforce.idleBuildings), {
    sub: idleNames.length ? idleNames.join(", ") + " — no workers, upkeep still paid" : "Every building has a crew",
    amountClass: workforce.idleBuildings ? "text-bad" : "text-good"
  }));
  parts.push(breakdownRow("Understaffed", String(workforce.partialBuildings), {
    sub: partialNames.length ? partialNames.join(", ") + " — reduced output" : "Every crew is full",
    amountClass: workforce.partialBuildings ? "text-gold" : "text-good"
  }));
  parts.push(breakdownRow("Growth", growthLabel, {
    sub: growthSub,
    amountClass: workforce.canGrow ? "text-good" : "text-bad"
  }));
  parts.push("</div>");

  parts.push('<div class="sheet-section"><h3>LOCAL PRODUCTION (BASE)</h3>');
  ["energy", "minerals", "research"].forEach(function (key) {
    const meta = RESOURCE_META[key];
    const list = planet.sources[key] || [];
    if (!list.length) {
      parts.push(breakdownRow(meta.icon + " " + meta.name, "0", {}));
      return;
    }
    list.forEach(function (source) {
      parts.push(signedBreakdownRow(meta.icon + " " + source.label, source.amount, source.sub));
    });
  });
  if (planet.sources.influence.length) {
    planet.sources.influence.forEach(function (source) {
      parts.push(signedBreakdownRow("🏛 " + source.label, source.amount, source.sub));
    });
  }
  parts.push("</div>");

  parts.push('<div class="sheet-section"><h3>LOCAL UPKEEP</h3>');
  if (planet.upkeepItems.length) {
    planet.upkeepItems.forEach(function (item) {
      parts.push(signedBreakdownRow("⚡ " + item.label, -item.amount, item.sub));
    });
  } else {
    parts.push(breakdownRow("⚡ Energy upkeep", "0", {}));
  }
  (planet.mineralUpkeepItems || []).forEach(function (item) {
    parts.push(signedBreakdownRow("⛏ " + item.label, -item.amount, item.sub));
  });
  parts.push(
    breakdownRow("Net local energy", formatSigned(planet.output.energy - planet.upkeep), {
      className: "total",
      amountClass: signedClass(planet.output.energy - planet.upkeep)
    })
  );
  parts.push("</div>");

  parts.push('<div class="sheet-section"><h3>EMPIRE MODIFIERS</h3>');
  parts.push(breakdownRow("Empire stability", state.stability + " / 100", {
    sub: state.stability < CONFIG.stability.lowThreshold ? "Unrest: ×0.75 production" : "No stability penalty"
  }));
  const ethic = getEthic();
  if (ethic) {
    if (ethic.mineralMult) parts.push(breakdownRow(ethic.name + " doctrine", "+10% minerals", {}));
    if (ethic.researchMult) parts.push(breakdownRow(ethic.name + " doctrine", "+10% research", {}));
  }
  if (econ.instability) {
    parts.push(breakdownRow("Unrest penalty", "×0.75 all production", { className: "multiplier" }));
  } else {
    parts.push(breakdownRow("Unrest penalty", "None", {}));
  }
  parts.push("</div>");

  parts.push('<div class="sheet-section"><h3>COLONY RECORD</h3>');
  parts.push(breakdownRow("Founded", system.home ? "Turn 1 · capital" : "Turn " + system.foundedTurn, {}));
  if (age !== null) parts.push(breakdownRow("Colony age", age + (age === 1 ? " turn" : " turns"), {}));
  parts.push(breakdownRow("Planet size", size.name + " · " + size.slots + " slots", {
    sub: getBonusSlots(system) ? getBonusSlots(system) + " bonus " + (getBonusSlots(system) === 1 ? "slot" : "slots") + " rolled" : "No bonus slots"
  }));
  parts.push(breakdownRow("Building slots", used + " / " + unlockedSlots + " open", {
    sub: lockedSlots ? lockedSlots + " locked · " + totalSlots + " total" : totalSlots + " total"
  }));
  if (lockedSlots > 0) {
    const cost = getSlotUnlockCost(system);
    parts.push(breakdownRow("Next bonus slot", cost.energy + " ⚡ + " + cost.minerals + " ⛏", {
      sub: "Unlocked in slot order"
    }));
  }
  parts.push("</div>");

  parts.push('<p class="sheet-note">Local production above is before empire modifiers and only includes staffed work. Completed buildings pay energy upkeep even without workers, and that upkeep is charged to this sector. Population housing draws minerals and population sustenance draws energy from the same sector ledger. Energy and minerals stay local; research and influence go to the empire stockpile. Open the population card on the colony screen to fund houses and sustenance.</p>');
  return parts.join("");
}
