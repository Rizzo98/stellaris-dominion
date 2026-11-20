/* ============================================================
   SHEET CONTENT — HTML bodies for the bottom sheet
   Resource details, stability, building picker, the population menu (energy
   maintenance and housing investment steppers), planet details, the event
   deck and the rival dossier.
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
      '. Population maintenance is paid first and can never overdraw the ledger: the colony buys what the stock covers and loses fulfillment instead. Infrastructure upkeep (colony overhead, completed buildings, online orbitals, the research directorate) is paid from what remains; a sector that cannot cover that bill loses 2 stability that turn. Production happens at the start of each new turn.</p>');
  } else if (isMinerals) {
    parts.push('<p class="sheet-note">Minerals are local to ' + (sector ? sector.name : "this sector") +
      '. Population housing investment is paid first, proportional to the stock, and never overdraws the ledger. Building, ship, structure and colonisation costs are paid from the sector where the work happens. A colony that cannot fund its housing loses happiness and growth, not stability. A frontier world must be supplied by a trading center. Raids loot and battles salvage in the sector they happen in.</p>');
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
    ? "Short on infrastructure upkeep: " + deficitSectors.map(function (sector) { return sector.name; }).join(", ")
    : "Applies while a sector cannot cover its infrastructure upkeep";
  parts.push(
    signedBreakdownRow(
      "Unpaid sector infrastructure upkeep",
      -CONFIG.stability.energyDeficitPenalty,
      deficitSub
    )
  );
  parts.push("</div>");
  parts.push('<p class="sheet-note">Production is recalculated immediately after every event or action. When stability falls below 30, all resource production is reduced by 25%. Population maintenance never pushes a ledger negative; a colony that cannot fund it loses happiness and growth instead. The stability penalty is charged once per turn no matter how many sectors are short on infrastructure upkeep.</p>');
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
    '<div class="slot-lock-note"><span>👥</span><span>Population ' + workforce.population +
    ' · ' + workforce.jobsStaffed + ' / ' + workforce.jobsTotal + ' posts staffed · ' + workforce.availableWorkers +
    ' free ' + (workforce.availableWorkers === 1 ? "worker" : "workers") +
    '. Facilities need a minimum colony population before they can operate; automatic crews use the selected strategy (round robin by default) until you pin them with the − / + buttons.</span></div>'
  );
  parts.push(
    '<div class="slot-lock-note"><span>🏗</span><span>Construction completes when you end the turn. You can build without free workers: the building produces nothing until staffed.</span></div>'
  );
  parts.push('<div class="build-list">');
  BUILDING_ORDER.forEach(function (type) {
    const def = BUILDINGS[type];
    const cost = def.cost.minerals;
    /* A building is laid down at the highest level the tech tree has
       unlocked. A building that predates the tech keeps its old level until
       it is refitted from its slot. */
    const unlockedLevel = getBuildingUnlockedLevel(type);
    const workers = getBuildingWorkers(type, unlockedLevel);
    const minPopulation = getBuildingMinPopulation(type, unlockedLevel);
    const canAfford = currentMinerals >= cost;
    const short = Math.max(0, cost - currentMinerals);
    const crewNow = workforce.availableWorkers;
    const workforceLine = workers > 0
      ? ("needs " + workers + (workers === 1 ? " worker" : " workers") +
         (minPopulation ? " · colony " + minPopulation + "+" : "") +
         (crewNow >= workers ? " · crew ready" : " · " + crewNow + " free now"))
      : "needs no workers";
    const levelName = getBuildingLevelName(type, unlockedLevel);
    const levelLine = " · builds at LVL " + unlockedLevel +
      (levelName ? " (" + levelName + ")" : "");
    parts.push(
      '<button class="build-option ' + (canAfford ? "" : "short") + '" data-build="' + type + '"' + (canAfford ? "" : " disabled") + ">" +
        '<span class="b-emoji" aria-hidden="true">' + def.emoji + "</span>" +
        '<span class="b-main">' +
          '<span class="b-name">' + def.name + "</span>" +
          '<span class="b-yield">' + buildingYieldText(type, unlockedLevel) + "</span>" +
          '<span class="b-yield">' + def.desc + " · " + workforceLine + " · 1 turn" + levelLine + "</span>" +
        "</span>" +
        '<span class="b-cost">' + cost + " ⛏" +
          "<small>" + (canAfford ? "CONSTRUCT" : "NEED " + short + " MORE") + "</small>" +
        "</span>" +
      "</button>"
    );
  });
  parts.push("</div>");
  parts.push('<p class="sheet-note">You can construct in every open slot this turn, with or without free workers. Completed buildings always pay energy upkeep. Output scales with staffing: a half crew produces half the facility output. Workers follow the selected automatic strategy until you pin a crew on the colony screen; a pinned crew stays exactly where you put it. A new building is laid down at the level your Building category techs have unlocked; a building that was already standing keeps its old level until you refit it from its slot for half its build cost. Housing is not a building: open the population card to fund energy maintenance and housing investment as percentages of the full requirement.</p>');
  return parts.join("");
}

/* ---------- population / maintenance menu ---------- */

/* One policy stepper. The value is a percentage of the full requirement;
   the sub-line reports the actual energy or housing that share buys at this
   colony's population. */
function maintenanceRow(system, axis, report) {
  const cfg = getEconomyConfig();
  const isEnergy = axis === "energy";
  const percent = isEnergy ? report.request.energyPercent : report.request.mineralsPercent;
  const required = isEnergy ? report.energyRequired : report.mineralsRequired;
  const spent = isEnergy ? report.energySpent : report.mineralsSpent;
  const minusReason = getColonyMaintenanceChangeReason(system, axis, -1);
  const plusReason = getColonyMaintenanceChangeReason(system, axis, 1);
  const icon = isEnergy ? "⚡" : "⛏";
  const label = isEnergy ? "Energy maintenance" : "Housing investment";
  const sub = isEnergy
    ? percent + "% · " + formatEconomic(spent) + "/" + formatEconomic(required) + " ⚡ supplied"
    : percent + "% · " + formatEconomic(spent) + "/" + formatEconomic(required) +
      " ⛏ · H " + formatEconomic(report.housingCapacity);
  return (
    '<div class="upkeep-row">' +
      '<span class="upkeep-icon" aria-hidden="true">' + icon + "</span>" +
      '<span class="upkeep-label">' + label.toUpperCase() + "<small>" + sub + "</small></span>" +
      '<span class="upkeep-stepper">' +
        '<button type="button" class="upkeep-step" data-pop-upkeep="' + axis + ':-1"' +
          (minusReason ? ' disabled title="' + minusReason + '" aria-label="Decrease ' + label + '"' : ' aria-label="Decrease ' + label + '"') +
          ">−</button>" +
        '<b class="upkeep-step-value">' + percent + "%</b>" +
        '<button type="button" class="upkeep-step" data-pop-upkeep="' + axis + ':1"' +
          (plusReason ? ' disabled title="' + plusReason + '" aria-label="Increase ' + label + '"' : ' aria-label="Increase ' + label + '"') +
          ">+</button>" +
      "</span>" +
    "</div>"
  );
}

/* The automatic crew strategy selector: two config-driven buttons plus the
   active rule. The colony sheet owns the click; this helper only renders it. */
function workerStrategyHTML(workforce, cfg) {
  const strategies = cfg.workerStrategies || [];
  const active = workforce.strategy;
  const current = strategies.find(function (entry) { return entry.id === active; });
  const buttons = strategies.map(function (entry) {
    const selected = entry.id === active;
    return '<button type="button" class="strategy-btn' + (selected ? " active" : "") +
      '" data-worker-strategy="' + entry.id + '" aria-pressed="' + (selected ? "true" : "false") + '">' +
      entry.label + "</button>";
  }).join("");
  const note = workforce.hasOrders
    ? "Explicit orders are pinned. RESET CREWS TO AUTO applies this strategy."
    : (current && current.description ? current.description : "Choose how automatic workers are shared.");
  return '<div class="worker-strategy">' +
    '<div class="worker-strategy-head"><span class="worker-strategy-title">AUTO CREW ORDER</span>' +
      '<span class="worker-strategy-value">' + (current ? current.label : String(active || "")) + "</span></div>" +
    '<div class="worker-strategy-options">' + buttons + "</div>" +
    '<p class="strategy-note">' + note + "</p>" +
  "</div>";
}

/* The population menu. It explains the whole chain: energy supplied and
   minerals invested produce happiness, happiness produces growth, and the
   workforce decides what the colony produces before that bill is paid. */
function populationSheetHTML(system) {
  const planet = getPlanetBreakdown(system);
  const report = planet.populationMaintenance;
  const wf = planet.workforce;
  const sector = getSector(system.sectorId);
  const sectorEcon = sector ? getSectorEconomy(sector.id) : null;
  const cfg = getEconomyConfig();
  const happiness = Math.round(report.happiness);
  const energyPercent = Math.round(report.energyFulfillment * 100);
  const housingPercent = report.population > 0
    ? clamp((report.housingCapacity / report.population) * 100, 0, 100)
    : 100;
  const tier = report.tier || { id: "miserable", label: "MISERABLE" };
  const growthValue = report.canGrow ? "+" + formatGrowthAmount(report.growthAmount) : "0";
  const growthClass = report.canGrow ? "text-good" : report.population <= 0 ? "text-bad" : "text-gold";
  const parts = [];

  parts.push(
    '<div class="sheet-summary population-summary">' +
      '<span class="big-icon" aria-hidden="true">👥</span>' +
      '<span class="big-value">' + report.population + "</span>" +
      '<span class="big-delta ' + growthClass + '">' + growthValue + " / TURN</span>" +
    "</div>"
  );
  parts.push('<p class="sheet-scope">' + system.name.toUpperCase() +
    " · E_required = P^" + cfg.energyExponent + " · H = M_spent^" + cfg.housingExponent +
    " · HAPPINESS DRIVES GROWTH</p>");

  /* MAINTENANCE */
  parts.push(
    '<div class="sheet-section"><h3>MAINTENANCE · PAID FROM ' +
      (sector ? sector.name.toUpperCase() : "THIS SECTOR") + "</h3>"
  );
  parts.push(maintenanceRow(system, "energy", report));
  parts.push(maintenanceRow(system, "minerals", report));
  parts.push(
    '<p class="upkeep-status">Maintenance is a share of the full requirement, charged every turn. ' +
    "100% satisfies happiness; extra energy and housing up to " + cfg.maxPercent + "% adds a growth multiplier (up to ×" +
    cfg.maxGrowthMultiplier + " at " + cfg.maxPercent + "% on both lines). The sector ledger caps the actual spend: " +
    "a colony that cannot pay loses fulfillment and bonus, never falls into a negative balance. " + cfg.stepPercent + "% per press.</p>"
  );
  parts.push("</div>");

  /* ENERGY */
  parts.push('<div class="sheet-section"><h3>ENERGY <span class="colony-tier tier-' + tier.id + '">' +
    energyPercent + "% SUPPLIED</span></h3>");
  parts.push(
    '<div class="colony-meter" role="img" aria-label="Energy ' + energyPercent + ' percent">' +
      '<span class="colony-fill energy tier-' + tier.id + '" style="width:' + energyPercent + '%"></span>' +
    "</div>"
  );
  parts.push(breakdownRow("E_required = P^" + cfg.energyExponent,
    formatAmount(report.energyRequired) + " ⚡", {
      sub: "P = " + report.population,
      amountClass: "text-faint"
    }));
  parts.push(breakdownRow("E_spent", formatEconomic(report.energySpent) + " ⚡", {
    sub: "of " + formatEconomic(report.energyRequested) + " requested · " +
      formatEconomic(Math.max(0, report.energyRequired - report.energySpent)) + " short",
    amountClass: energyPercent >= 100 ? "text-good" : energyPercent > 0 ? "text-gold" : "text-bad"
  }));
  parts.push(breakdownRow("Fulfillment G = E_spent / E_required", energyPercent + "%", {
    sub: "Happiness caps at 100%; extra supply adds growth",
    amountClass: energyPercent >= 100 ? "text-good" : energyPercent > 0 ? "text-gold" : "text-bad"
  }));
  parts.push("</div>");

  /* HOUSING */
  parts.push('<div class="sheet-section"><h3>HOUSING <span class="colony-tier tier-' + tier.id + '">' +
    Math.round(housingPercent) + "% HOUSED</span></h3>");
  parts.push(
    '<div class="colony-meter" role="img" aria-label="Housing ' + Math.round(housingPercent) + ' percent">' +
      '<span class="colony-fill housing tier-' + tier.id + '" style="width:' + housingPercent.toFixed(1) + '%"></span>' +
    "</div>"
  );
  parts.push(breakdownRow("M_required for H = P", formatEconomic(report.mineralsRequired) + " ⛏", {
    sub: "P^(1/" + cfg.housingExponent + ") · 100% buys full housing; extra adds growth",
    amountClass: "text-faint"
  }));
  parts.push(breakdownRow("H = M_spent^" + cfg.housingExponent, formatEconomic(report.housingCapacity), {
    sub: formatEconomic(report.mineralsSpent) + " ⛏ invested",
    amountClass: report.housingDeficit > 0 ? "text-bad" : "text-good"
  }));
  parts.push(breakdownRow("Housing deficit", formatEconomic(report.housingDeficit), {
    sub: "h = deficit / P = " + (report.normalizedHousingDeficit * 100).toFixed(1) + "%",
    amountClass: report.housingDeficit > 0 ? "text-bad" : "text-good"
  }));
  parts.push("</div>");

  /* HAPPINESS */
  parts.push('<div class="sheet-section"><h3>HAPPINESS <span class="colony-tier tier-' + tier.id + '">' +
    tier.label + "</span></h3>");
  parts.push(breakdownRow("F = 100 × min(1, G) × max(0, 1 − h)", happiness + "%", {
    className: "total",
    amountClass: happiness >= 70 ? "text-good" : happiness >= 40 ? "text-gold" : "text-bad"
  }));
  parts.push(breakdownRow("Energy factor", Math.round(report.energyFulfillment * 100) + "%", {
    sub: "min(1, G) stops at 100%"
  }));
  parts.push(breakdownRow("Housing factor", Math.round((1 - report.normalizedHousingDeficit) * 100) + "%", {
    sub: "max(0, 1 − h)"
  }));
  parts.push("</div>");

  /* GROWTH */
  const nextPopText = report.canGrow
    ? report.turnsToNextPop + (report.turnsToNextPop === 1 ? " turn" : " turns")
    : report.growthBlockedBy === "unfunded"
      ? "Unfunded"
      : report.growthBlockedBy === "energy"
        ? "No energy"
        : report.growthBlockedBy === "housing"
          ? "No housing"
          : report.population <= 0
            ? "No population"
            : "No happiness";
  parts.push('<div class="sheet-section"><h3>GROWTH</h3>');
  parts.push(breakdownRow("Base growth at 100% happiness",
    "+" + formatAmount(report.population * cfg.growthRate) + " / turn", {
      sub: "P × " + (cfg.growthRate * 100).toFixed(0) + "%"
    }));
  parts.push(breakdownRow("Maintenance growth multiplier", "×" + report.growthMultiplier.toFixed(2), {
    sub: "Overfunding above 100% · max ×" + cfg.maxGrowthMultiplier,
    amountClass: report.growthMultiplier > 1.001 ? "text-good" : "text-faint"
  }));
  parts.push(breakdownRow("Growth at current happiness", growthValue + " / turn", {
    sub: "P × " + (cfg.growthRate * 100).toFixed(0) + "% × " + (report.happiness / cfg.happinessMax).toFixed(2) +
      " × " + report.growthMultiplier.toFixed(2),
    amountClass: growthClass
  }));
  parts.push(breakdownRow("Next population", nextPopText, {
    sub: report.growthProgress > 0 ? Math.round(report.growthProgress * 100) + "% banked" : "No growth banked"
  }));
  parts.push("</div>");

  /* WORKFORCE */
  const idleNames = wf.entries.filter(function (entry) {
    return !entry.underConstruction && entry.eligible && entry.workersRequired > 0 && entry.workersAssigned === 0;
  }).map(function (entry) { return BUILDINGS[entry.type] ? BUILDINGS[entry.type].name : entry.type; });
  const blockedNames = wf.entries.filter(function (entry) {
    return !entry.underConstruction && !entry.eligible;
  }).map(function (entry) { return BUILDINGS[entry.type] ? BUILDINGS[entry.type].name : entry.type; });
  parts.push('<div class="sheet-section"><h3>WORKFORCE</h3>');
  parts.push(workerStrategyHTML(wf, cfg));
  parts.push(breakdownRow("Posts staffed", wf.jobsStaffed + " / " + wf.jobsTotal, {
    sub: wf.availableWorkers + " free " + (wf.availableWorkers === 1 ? "worker" : "workers") +
      (wf.hasOrders ? " · explicit orders" : " · auto " + getWorkerStrategyLabel(wf.strategy)),
    amountClass: wf.idleJobs ? "text-gold" : "text-good"
  }));
  parts.push(breakdownRow("Idle facilities", String(wf.idleBuildings), {
    sub: idleNames.length ? idleNames.join(", ") + " — no workers, no output" : "Every eligible facility has a crew",
    amountClass: wf.idleBuildings ? "text-bad" : "text-good"
  }));
  parts.push(breakdownRow("Blocked by population", String(wf.blockedBuildings), {
    sub: blockedNames.length ? blockedNames.join(", ") + " — below the minimum colony population" : "Every facility meets its population gate",
    amountClass: wf.blockedBuildings ? "text-bad" : "text-good"
  }));
  parts.push(breakdownRow("Understaffed", String(wf.partialBuildings), {
    sub: wf.partialBuildings ? "Partial output until the crew is filled" : "Every crew is full",
    amountClass: wf.partialBuildings ? "text-gold" : "text-good"
  }));
  if (wf.hasOrders) {
    parts.push(
      '<button class="secondary-btn" type="button" data-worker-auto="' + system.id + '">RESET CREWS TO AUTO</button>'
    );
  }
  parts.push("</div>");

  /* SECTOR BILL */
  parts.push('<div class="sheet-section"><h3>SECTOR BILL</h3>');
  parts.push(signedBreakdownRow("⚡ Energy maintenance (actual)", -report.energySpent,
    formatEconomic(report.energySpent) + " of " + formatEconomic(report.energyRequested) + " requested"));
  parts.push(signedBreakdownRow("⛏ Housing investment (actual)", -report.mineralsSpent,
    formatEconomic(report.mineralsSpent) + " of " + formatEconomic(report.mineralsRequested) + " requested"));
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

  parts.push(
    '<p class="sheet-note">Energy maintenance and housing investment are standing orders: both are charged to this sector every turn when you end the turn. ' +
    "Happiness is the product of energy fulfillment and housing fulfillment, and growth is population × " +
    (cfg.growthRate * 100).toFixed(0) + "% × happiness × maintenance multiplier. Population growth is applied after the maintenance bill, so a colony that cannot pay this turn grows more slowly and loses its surplus bonus. " +
    "Facilities need a minimum colony population; automatic crews follow the selected strategy until you pin them with the − / + buttons on the colony screen.</p>"
  );
  return parts.join("");
}

/* ---------- population menu ---------- */

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
  const report = planet.populationMaintenance;
  const idleNames = workforce.entries.filter(function (entry) {
    return !entry.underConstruction && entry.eligible && entry.workersRequired > 0 && entry.workersAssigned === 0;
  }).map(function (entry) { return BUILDINGS[entry.type].name; });
  const partialNames = workforce.entries.filter(function (entry) {
    return !entry.underConstruction && entry.eligible && entry.workersRequired > 0 &&
      entry.workersAssigned > 0 && entry.workersAssigned < entry.workersRequired;
  }).map(function (entry) { return BUILDINGS[entry.type].name; });
  const blockedNames = workforce.entries.filter(function (entry) {
    return !entry.underConstruction && !entry.eligible;
  }).map(function (entry) { return BUILDINGS[entry.type].name + " (" + entry.minPopulation + "+)"; });
  const happiness = Math.round(report.happiness);
  const growthLabel = report.canGrow
    ? "+" + formatGrowthAmount(report.growthAmount) + " / turn"
    : report.growthBlockedBy === "unfunded"
      ? "Unfunded"
      : report.growthBlockedBy === "energy"
        ? "No energy"
        : report.growthBlockedBy === "housing"
          ? "No housing"
          : report.population <= 0
            ? "No population"
            : "No happiness";
  const growthSub = report.canGrow
    ? (report.turnsToNextPop === 1
        ? "Next population next turn"
        : "Next population in " + report.turnsToNextPop + " turns")
    : report.growthBlockedBy === "unfunded"
      ? "Fund energy and housing in the population menu"
      : report.growthBlockedBy === "energy"
        ? "Fund energy maintenance in the population menu"
        : report.growthBlockedBy === "housing"
          ? "Invest more minerals in housing"
          : "Happiness is zero";
  const parts = [];

  parts.push(
    '<div class="sheet-summary">' +
      '<span class="big-icon" aria-hidden="true">👥</span>' +
      '<span class="big-value">' + report.population + "</span>" +
      '<span class="big-delta ' + (happiness >= 70 ? "text-good" : happiness >= 40 ? "text-gold" : "text-bad") + '">' +
        happiness + "% HAPPY</span>" +
    "</div>"
  );

  parts.push('<div class="sheet-section"><h3>POPULATION &amp; WORKFORCE</h3>');
  parts.push(breakdownRow("Population", String(report.population), {}));
  parts.push(breakdownRow("Happiness", happiness + "% · " + report.tier.label, {
    amountClass: happiness >= 70 ? "text-good" : happiness >= 40 ? "text-gold" : "text-bad"
  }));
  parts.push(breakdownRow("Energy supplied", Math.round(report.energyFulfillment * 100) + "%", {
    sub: formatEconomic(report.energySpent) + " of " + formatEconomic(report.energyRequired) + " ⚡",
    amountClass: report.energyFulfillment >= 1 ? "text-good" : report.energyFulfillment > 0 ? "text-gold" : "text-bad"
  }));
  parts.push(breakdownRow("Housing", formatEconomic(report.housingCapacity) + " / " + report.population, {
    sub: report.housingDeficit > 0
      ? formatEconomic(report.housingDeficit) + " people without a roof"
      : "Everyone is housed",
    amountClass: report.housingDeficit > 0 ? "text-bad" : "text-good"
  }));
  parts.push(breakdownRow("Jobs staffed", workforce.jobsStaffed + " / " + workforce.jobsTotal, {
    sub: workforce.jobsTotal
      ? workforce.availableWorkers + " free workers · " + (workforce.hasOrders ? "explicit orders" : "auto " + getWorkerStrategyLabel(workforce.strategy))
      : "No worker posts yet",
    amountClass: workforce.idleJobs ? "text-bad" : "text-good"
  }));
  parts.push(breakdownRow("Blocked by population", String(workforce.blockedBuildings), {
    sub: blockedNames.length ? blockedNames.join(", ") : "Every facility meets its population gate",
    amountClass: workforce.blockedBuildings ? "text-bad" : "text-good"
  }));
  parts.push(breakdownRow("Idle buildings", String(workforce.idleBuildings), {
    sub: idleNames.length ? idleNames.join(", ") + " — no workers, no output" : "Every eligible building has a crew",
    amountClass: workforce.idleBuildings ? "text-bad" : "text-good"
  }));
  parts.push(breakdownRow("Understaffed", String(workforce.partialBuildings), {
    sub: partialNames.length ? partialNames.join(", ") + " — reduced output" : "Every crew is full",
    amountClass: workforce.partialBuildings ? "text-gold" : "text-good"
  }));
  parts.push(breakdownRow("Growth", growthLabel, {
    sub: growthSub,
    amountClass: report.canGrow ? "text-good" : "text-bad"
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
    breakdownRow("Net local energy", formatSigned(planet.localNetEnergy), {
      className: "total",
      amountClass: signedClass(planet.localNetEnergy)
    })
  );
  parts.push(
    breakdownRow("Net local minerals", formatSigned(planet.localNetMinerals), {
      className: "total",
      amountClass: signedClass(planet.localNetMinerals)
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

  parts.push('<p class="sheet-note">Local production above is before empire modifiers and only includes staffed work. Completed buildings pay their energy upkeep even without workers, and that upkeep is charged to this sector. Population maintenance is resolved first: the colony gets the energy and housing its percentage share can buy from this ledger, then infrastructure upkeep is paid from what is left. Energy and minerals stay local; research and influence go to the empire stockpile. Open the population card on the colony screen to change maintenance and to pin facility crews.</p>');
  return parts.join("");
}
