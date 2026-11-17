/* ============================================================
   TURN — construction, movement, rival AI, combat, growth, animation,
   win/lose and new run
   endTurn() is the whole turn pipeline; startGame()/resetGame() own the
   run lifecycle.
   ============================================================ */

let resourceAnimationToken = 0;

function completeConstruction() {
  state.systems.forEach(function (system) {
    if (!system.colonized) return;
    system.slots.forEach(function (slot) {
      if (slot && slot.underConstruction) {
        slot.underConstruction = false;
        system.completedNow = true;
      }
    });
  });
  state.galaxy.sectors.forEach(function (sector) {
    Object.keys(sector.structures || {}).forEach(function (key) {
      const structure = sector.structures[key];
      if (structure && structure.underConstruction) {
        structure.underConstruction = false;
        if (structure.type === "stronghold" && structure.hull == null) {
          structure.hull = STRUCTURE_TYPES.stronghold.hull;
        }
      }
    });
  });
}

/* Growth saturates as the houses fill, and the sustenance multiplier scales
   it. Fractional progress carries between turns, so a +0.5 / turn colony
   gains one population every two turns rather than being rounded down
   forever. Housing is a hard cap: a colony that somehow holds more people
   than houses settles the overflow first. */
function growPopulations() {
  state.systems.forEach(function (system) {
    if (!system.colonized) return;
    const plan = getWorkforcePlan(system);
    let population = plan.population;
    let progress = clamp(system.growthProgress || 0, 0, 1);
    if (population > plan.cap) {
      population = plan.cap;
      progress = 0;
    }
    if (plan.canGrow && plan.growthPerTurn > 0) {
      progress += plan.growthPerTurn;
      while (population < plan.cap && progress >= 1) {
        population += 1;
        progress -= 1;
      }
      if (population >= plan.cap) progress = 0;
    }
    system.population = population;
    system.growthProgress = progress;
  });
}

/* Per-turn upkeep is paid by the sector that owns the colony, building,
   orbital structure or research project. Each sector keeps its own energy and
   mineral stockpiles, so one sector cannot bail another out. Population
   housing draws minerals and population sustenance draws energy. */
function paySectorUpkeep() {
  const paid = {};
  let deficit = false;
  state.galaxy.sectors.forEach(function (sector) {
    const sectorEcon = getSectorEconomy(sector.id);
    paid[sector.id] = { energy: sectorEcon.upkeep, minerals: sectorEcon.mineralUpkeep };
    if (sectorEcon.upkeep) addSectorStock(sector.id, "energy", -sectorEcon.upkeep);
    if (sectorEcon.mineralUpkeep) addSectorStock(sector.id, "minerals", -sectorEcon.mineralUpkeep);
    if (getSectorStock(sector.id, "energy") < 0 || getSectorStock(sector.id, "minerals") < 0) {
      deficit = true;
    }
  });
  return { paid: paid, deficit: deficit };
}

/* Queued ships launch when the new turn starts. One turn means the next
   turn, so a ship ordered on turn 1 joins the fleet on turn 2. */
function completeShipConstruction() {
  state.galaxy.sectors.forEach(function (sector) {
    Object.keys(sector.structures || {}).forEach(function (key) {
      const structure = sector.structures[key];
      if (!structure || structure.type !== "spaceport" || !structure.queue || !structure.queue.length) return;
      const remaining = [];
      structure.queue.forEach(function (order) {
        if (!order || !order.ship) return;
        if (order.readyTurn > state.turn) {
          remaining.push(order);
          return;
        }
        sector.fleets[key] = (sector.fleets[key] || []).concat(order.ship);
      });
      if (remaining.length) {
        structure.queue = remaining;
      } else {
        delete structure.queue;
      }
    });
  });
}

/* Every ship follows its queued route at its own speed. Ships with different
   speeds separate naturally: a science ship can pull ahead of a corvette. */
function advanceShipOrders() {
  const arrivals = [];
  state.galaxy.sectors.forEach(function (sector) {
    Object.keys(sector.fleets || {}).forEach(function (fromKey) {
      const fleet = sector.fleets[fromKey];
      if (!fleet || !fleet.length) return;
      const staying = [];
      let movedFromHere = false;

      fleet.forEach(function (ship) {
        if (!ship.path || ship.pathSectorId !== sector.id || !ship.path.length) {
          staying.push(ship);
          return;
        }
        movedFromHere = true;
        const origin = parseHexKey(fromKey);
        let row = origin.row;
        let col = origin.col;
        /* A refitted hull uses its own speed, not the bare hull's. */
        const steps = Math.min(getShipSpeed(ship), ship.path.length);
        for (let i = 0; i < steps; i += 1) {
          const next = parseHexKey(ship.path[i]);
          row = next.row;
          col = next.col;
          markHexExplored(row, col, sector.id);
        }
        ship.path = ship.path.slice(steps);
        if (!ship.path.length) {
          delete ship.path;
          delete ship.pathSectorId;
        }
        arrivals.push({ sectorId: sector.id, key: hexKey(row, col), ship: ship });
      });

      if (movedFromHere) {
        if (staying.length) {
          sector.fleets[fromKey] = staying;
        } else {
          delete sector.fleets[fromKey];
        }
      }
    });
  });

  arrivals.forEach(function (arrival) {
    const sector = getSector(arrival.sectorId);
    if (!sector) return;
    sector.fleets[arrival.key] = (sector.fleets[arrival.key] || []).concat(arrival.ship);
  });
}

function animateResourceNumbers(from, to, runId, done) {
  resourceAnimationToken += 1;
  const token = resourceAnimationToken;
  const start = performance.now();
  const duration = CONFIG.turnTickMs;
  function frame(now) {
    if (token !== resourceAnimationToken || state.runId !== runId || state.phase === "ended") return;
    const t = clamp((now - start) / duration, 0, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    const values = {};
    RESOURCE_KEYS.forEach(function (key) {
      values[key] = Math.round(from[key] + (to[key] - from[key]) * eased);
    });
    setResourceTexts(values);
    if (t < 1) {
      requestAnimationFrame(frame);
    } else {
      setResourceTexts(to);
      if (done) done();
    }
  }
  requestAnimationFrame(frame);
}

function endTurn() {
  if (state.phase !== "actions" || state.currentEvent) return;
  hideToast();
  state.ui.move = null;
  state.ui.shipSelection = [];
  closeSheet();
  const runId = state.runId;
  const before = getDisplayResources();
  state.phase = "transition";
  renderNav();
  renderMap();

  // 1. Every sector pays the energy and mineral upkeep of what it hosts.
  const upkeepReport = paySectorUpkeep();

  // 2. Overexpansion pressure + stability check. One sector in the red in
  //    either resource is enough to shake the empire; the penalty is charged
  //    once per turn.
  if (upkeepReport.deficit) {
    state.stability = clamp(state.stability - CONFIG.stability.energyDeficitPenalty, 0, 100);
  }
  if (state.stability <= 0) {
    endGame("stability");
    return;
  }

  // 3. Construction completes, ready for next turn.
  completeConstruction();

  // 4. New turn begins. Shipyards launch queued ships and every fleet
  //    advances along its route. Rival powers then take their turn and both
  //    sides resolve patrols, battles, raids and repairs before survey work.
  state.turn += 1;
  completeShipConstruction();
  advanceShipOrders();
  runRivalTurn();
  resolveMilitaryTurn();
  if (state.phase === "ended") return;
  if (state.stability <= 0) {
    endGame("stability");
    return;
  }
  /* Survey studies tick after movement, so a science ship that arrives this
     turn is already in place. A study with no science ship in its hex pauses. */
  advanceAnomalyStudies();
  if (state.phase === "ended") return;

  // 5. Population grows into the houses and sustenance funded in the
  //    population menu. New workers staff buildings before production is
  //    calculated for the new turn.
  growPopulations();

  // 6. Produce resources. Energy and minerals are paid into each sector's
  //    own ledger; research and influence flow into the empire stockpile.
  state.galaxy.sectors.forEach(function (sector) {
    const sectorEcon = getSectorEconomy(sector.id);
    applySectorIncome(sector.id, "energy", sectorEcon.income.energy);
    applySectorIncome(sector.id, "minerals", sectorEcon.income.minerals);
  });
  const economy = getEconomy();
  applyResourceIncome("research", economy.income.research);
  applyResourceIncome("influence", economy.income.influence);

  // 7. Trading centers ship after production, so a sector can fund its own
  //    upkeep first. Transfers never take more than the source holds.
  resolveTradeTransfers();

  // Research is auto-invested in whichever project is active.
  investResearchStock();
  if (state.phase === "ended") return;

  // 8. Encounter cards are paced. Only a turn the deck is due draws a card;
  //    every other turn returns straight to free actions.
  const after = getDisplayResources();
  state.currentEvent = isEventDue(state.turn) ? drawEvent() : null;
  if (state.currentEvent) {
    state.phase = "event";
    renderAll();
    setResourceTexts(before);
    animateResourceNumbers(before, after, runId, function () {
      if (state.runId !== runId || state.phase !== "event" || !state.currentEvent) return;
      showEventLayer();
    });
  } else {
    state.phase = "transition";
    renderAll();
    setResourceTexts(before);
    animateResourceNumbers(before, after, runId, function () {
      if (state.runId !== runId || state.phase !== "transition") return;
      state.phase = "actions";
      renderAll();
    });
  }
}

function endGame(reason) {
  if (state.phase === "ended") return;
  hideToast();
  state.phase = "ended";
  state.endResult = reason;
  state.currentEvent = null;
  state.ui.eventResolving = false;
  swipeConfirming = false;
  eventDrag = null;
  if (eventResolveTimer) {
    clearTimeout(eventResolveTimer);
    eventResolveTimer = null;
  }
  resourceAnimationToken += 1;
  hideEventLayer();
  closeSheet();
  state.ui.selectedHex = null;
  state.ui.selectedSystem = null;
  state.ui.selectedTab = "world";
  state.ui.spaceportOpen = false;
  state.ui.shipSelection = [];
  state.ui.move = null;
  els.planetScreen.classList.add("hidden");
  renderAll();

  let win = false;
  let glyph = "💀";
  let kicker = "EMPIRE LOST";
  let title = "COLLAPSE";
  let copy = "Your worlds fell into chaos.";

  if (reason === "ascension") {
    win = true;
    glyph = "🌌";
    kicker = "ASCENSION ACHIEVED";
    title = "ASCENDED";
    copy = "The Ascension project is complete. Your empire steps beyond the veil and leaves its cradle behind.";
  } else if (reason === "stability") {
    glyph = "🔥";
    kicker = "REBELLION";
    title = "REBELLION";
    copy = "Stability hit zero. Your colonies have turned against you and the empire is gone.";
  }

  const colonies = state.systems.filter(function (system) { return system.colonized; }).length;
  els.endScreen.classList.toggle("lose", !win);
  els.endGlyph.textContent = glyph;
  els.endKicker.textContent = kicker;
  els.endTitle.textContent = title;
  els.endCopy.textContent = copy;
  els.endTurns.textContent = state.turn;
  els.endColonies.textContent = colonies;
  els.endTechs.textContent = completedTechCount();
  els.endStability.textContent = state.stability;
  if (els.endBattles) els.endBattles.textContent = state.military ? state.military.battles : 0;
  if (els.endKills) els.endKills.textContent = state.military ? state.military.kills : 0;
  els.endScreen.classList.remove("hidden");
}

function startGame(ethicId) {
  if (state.phase !== "start") return;
  if (!ETHICS[ethicId]) return;
  hideToast();
  readSeedInput();
  if (typeof closeGalaxyLayerMenu === "function") closeGalaxyLayerMenu();
  if (typeof closeSectorLayerMenu === "function") closeSectorLayerMenu();
  state = createInitialState(ethicId);
  state.ui.activeTab = "map";
  /* Charted space is already surveyed ground: discover anything already
     visible before the opening card is drawn. */
  revealKnownAnomalies();
  state.currentEvent = isEventDue(state.turn) ? drawEvent() : null;
  state.phase = state.currentEvent ? "event" : "actions";
  els.startScreen.classList.add("hidden");
  els.endScreen.classList.add("hidden");
  els.planetScreen.classList.add("hidden");
  els.sheetLayer.classList.add("hidden");
  els.sheetLayer.setAttribute("aria-hidden", "true");
  delete els.sheet.dataset.kind;
  els.startScreen.scrollTop = 0;
  state.ui.sheet = null;
  state.ui.selectedHex = null;
  state.ui.selectedSystem = null;
  state.ui.selectedTab = "world";
  state.ui.shipSelection = [];
  state.ui.move = null;
  renderAll();
  scrollGalaxyToCurrentSector();
  if (state.currentEvent) showEventLayer();
}

function resetGame() {
  if (eventResolveTimer) {
    clearTimeout(eventResolveTimer);
    eventResolveTimer = null;
  }
  hideToast();
  resourceAnimationToken += 1;
  swipeConfirming = false;
  eventDrag = null;
  hideEventLayer();
  if (typeof closeGalaxyLayerMenu === "function") closeGalaxyLayerMenu();
  if (typeof closeSectorLayerMenu === "function") closeSectorLayerMenu();
  els.endScreen.classList.add("hidden");
  els.endScreen.classList.remove("lose");
  els.planetScreen.classList.add("hidden");
  els.sheetLayer.classList.add("hidden");
  els.sheetLayer.setAttribute("aria-hidden", "true");
  els.sheetBody.innerHTML = "";
  delete els.sheet.dataset.kind;
  els.startScreen.classList.remove("hidden");
  els.startScreen.scrollTop = 0;
  state = createInitialState(null);
  state.ui.activeTab = "map";
  els.main.scrollTop = 0;
  renderEthics();
  renderContinueSave();
  renderAll();
}