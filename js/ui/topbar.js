/* ============================================================
   TOP BAR — resources, deltas, stability and threat readout
   ============================================================ */

function renderEventChip() {
  if (!els.eventChip || !els.eventChipText) return;
  const playing = state.phase === "actions" || state.phase === "event" || state.phase === "transition";
  if (!playing || !state.events) {
    els.eventChip.classList.add("hidden");
    return;
  }
  els.eventChip.classList.remove("hidden");
  els.eventChipText.textContent = "EVENTS";
  els.eventChip.setAttribute("title", "Open the encounter deck");
}

/* A compact military readout: hostile power in the sector you are looking
   at. Incoming raids are forecast on the sector map instead of in a topbar
   raider count. The chip needs the player active in that sector, so neither
   an uncharted node nor a chart left behind can publish a rival's power. */
function renderThreatChip() {
  if (!els.threatChip) return;
  const playing = state.phase === "actions" || state.phase === "event" || state.phase === "transition";
  const sector = getCurrentSector();
  const sectorThreat = playing && sector && isSectorPowerVisible(sector) ? getSectorRivalPower(sector.id) : 0;
  if (!playing || !sectorThreat) {
    els.threatChip.classList.add("hidden");
    return;
  }
  els.threatChip.classList.remove("hidden");
  els.threatText.textContent = "PWR " + sectorThreat;
  els.threatChip.setAttribute("title", "Hostile power in " + (sector ? sector.name : "this sector") + ". Open the Empire tab for details.");
  els.threatChip.setAttribute("aria-label", "Hostile power " + sectorThreat + " in " +
    (sector ? sector.name : "this sector") + ". Open the Empire tab for details.");
}

/* The save slot opens from the top bar. The event overlay and the end-turn
   animation own the screen at other moments, so the chip is only offered on
   a playable turn. */
function renderSaveChip() {
  if (!els.saveChip) return;
  els.saveChip.classList.toggle("hidden", state.phase !== "actions");
}

function renderTopbar() {
  const econ = getEconomy();
  const sector = getCurrentSector();
  const sectorEcon = sector ? getSectorEconomy(sector.id) : null;
  els.turnLabel.textContent = "TURN " + state.turn;
  renderEventChip();
  renderThreatChip();
  renderSaveChip();
  const colonies = state.systems.filter(function (system) { return system.colonized; }).length;
  els.coloniesCount.textContent = String(colonies);
  if (els.coloniesLabel) els.coloniesLabel.textContent = colonies === 1 ? "COLONY" : "COLONIES";

  /* Energy and minerals are read from the sector you are looking at.
     Research and influence are the empire's shared stockpiles. */
  const values = getDisplayResources();
  const deltas = {
    energy: sectorEcon ? sectorEcon.net.energy : 0,
    minerals: sectorEcon ? sectorEcon.net.minerals : 0,
    research: econ.income.research,
    influence: econ.income.influence
  };
  if (els.ledgerSector) {
    els.ledgerSector.textContent = "⚡⛏ SECTOR LEDGER · " +
      (sector ? getSectorLabel(sector).toUpperCase() : "NO SECTOR");
  }
  if (els.ledgerGlobal) els.ledgerGlobal.textContent = "🔬🏛 EMPIRE-WIDE";

  els.valEnergy.textContent = values.energy;
  els.valMinerals.textContent = values.minerals;
  els.valResearch.textContent = values.research;
  els.valInfluence.textContent = values.influence;
  els.valEnergy.classList.toggle("text-bad", values.energy < 0);
  els.valMinerals.classList.toggle("text-bad", values.minerals < 0);
  els.valResearch.classList.toggle("text-bad", values.research < 0);
  els.valInfluence.classList.toggle("text-bad", values.influence < 0);

  const deltaEls = {
    energy: els.deltaEnergy,
    minerals: els.deltaMinerals,
    research: els.deltaResearch,
    influence: els.deltaInfluence
  };
  RESOURCE_KEYS.forEach(function (key) {
    const delta = deltas[key];
    const el = deltaEls[key];
    el.textContent = formatSigned(delta);
    el.classList.remove("good", "bad");
    if (delta > 0) el.classList.add("good");
    if (delta < 0) el.classList.add("bad");
  });

  els.stabilityValue.textContent = state.stability;
  els.stabilityFill.style.width = clamp(state.stability, 0, 100) + "%";
  els.stabilityBtn.classList.toggle("low", state.stability < CONFIG.stability.lowThreshold);
  els.stabilityBtn.classList.toggle("critical", state.stability < 15);
  els.stabilityMode.textContent = "UNREST −25%";
}

function setResourceTexts(values) {
  els.valEnergy.textContent = values.energy;
  els.valMinerals.textContent = values.minerals;
  els.valResearch.textContent = values.research;
  els.valInfluence.textContent = values.influence;
}