/* ============================================================
   DEBUG SCREEN — the rule sandbox
   Every balance knob is rendered from the live globals: CONFIG, the event
   deck (EVENTS / EVENT_CATEGORIES / EVENT_BUCKETS / UNREST_EVENTS) and the
   content tables. There is no parallel options object to keep in sync, so a
   field added to CONFIG shows up in the console without a UI change.

   The screen opens either from the new-game setup page (rules for the match
   about to start) or from the in-game run archive (rules for the live run).
   Values are written straight into the live tables; the save snapshot picks
   them up with captureRunRules() and a load writes them back with
   applyRunRules().

   Tabs:
     GENERAL   starting values, upkeep, stability, refits, input timing
     ECONOMY   the colony equations with a live sample, maintenance, facilities
     EVENTS    cadence, unrest, category weights and every card
     GALAXY    generation, sector geometry and survey density
     MILITARY  combat rules, rivals, archetypes and hulls
     CONTENT   buildings, orbitals, survey sites, origins, planet types, techs
   ============================================================ */

let debugTabId = "general";
let debugSamplePopulation = null;
let debugResetArmed = false;
let debugResetTimer = null;
let debugContextTimer = null;

/* ---------- small helpers ---------- */

function escapeDebugHTML(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[character];
  });
}

function isDebugRunActive() {
  return !!state && state.phase !== "start";
}

function humanizeDebugKey(key) {
  const text = String(key || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  if (!text) return "Value";
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

/* Path keys normalise an array index to '*': one meta entry covers every row
   of a list (economy.startingFacilities.*.type). */
function debugPathKey(path) {
  return String(path || "")
    .replace(/\.\d+\./g, ".*.")
    .replace(/\.\d+$/, ".*");
}

function getDebugFieldMeta(source, path) {
  return DEBUG_FIELD_META[source + ":" + debugPathKey(path)] || {};
}

function debugFieldLabel(source, path) {
  const meta = getDebugFieldMeta(source, path);
  if (meta.label) return meta.label;
  const parts = String(path || "").split(".");
  return humanizeDebugKey(parts[parts.length - 1] === "*" ? "value" : parts[parts.length - 1]);
}

function debugSourceTarget(source, id) {
  if (source === "config") return CONFIG;
  if (source === "ships") return SHIP_TYPES[id] || null;
  if (source === "structures") return STRUCTURE_TYPES[id] || null;
  if (source === "buildings") return BUILDINGS[id] || null;
  if (source === "archetypes") return RIVAL_ARCHETYPES[id] || null;
  if (source === "ethics") return ETHICS[id] || null;
  if (source === "techs") return TECHS[id] || null;
  if (source === "anomalies") {
    return (ANOMALY_TYPES || []).find(function (entry) { return entry && entry.id === id; }) || null;
  }
  if (source === "planetTypes") {
    return (PLANET_TYPES || []).find(function (entry) { return entry && entry.id === id; }) || null;
  }
  return null;
}

function debugContentOrder(source) {
  if (source === "ships") return SHIP_ORDER.slice();
  if (source === "structures") return STRUCTURE_ORDER.slice();
  if (source === "buildings") return BUILDING_ORDER.slice();
  if (source === "ethics") return ETHIC_ORDER.slice();
  if (source === "anomalies") return (ANOMALY_TYPES || []).map(function (entry) { return entry.id; });
  if (source === "planetTypes") return (PLANET_TYPES || []).map(function (entry) { return entry.id; });
  if (source === "archetypes") return Object.keys(RIVAL_ARCHETYPES || {});
  if (source === "techs") return TECH_ORDER.slice();
  return [];
}

function debugScopeTag(nextOnly, live) {
  if (!nextOnly) return "";
  return live ? "NEXT MATCH ONLY" : "NEW MATCH";
}

function debugSectionHTML(id, title, help, body, tag, tagKind) {
  return '<section class="debug-card" id="debug-card-' + id + '">' +
    '<header class="debug-card-head">' +
      "<h2>" + title + "</h2>" +
      (tag ? '<span class="debug-tag ' + (tagKind || "") + '">' + tag + "</span>" : "") +
    "</header>" +
    (help ? '<p class="debug-help">' + help + "</p>" : "") +
    '<div class="debug-fields">' + body + "</div>" +
  "</section>";
}

/* ---------- field controls ---------- */

function debugNumberBounds(meta, value) {
  const integer = Number.isInteger(value);
  return {
    min: meta.min != null ? meta.min : (meta.allowNegative ? -1000000 : 0),
    max: meta.max != null ? meta.max : 1000000,
    step: meta.step != null ? meta.step : (integer ? 1 : 0.01)
  };
}

function debugNumberHTML(path, value, options) {
  const meta = getDebugFieldMeta(options.source, path);
  const bounds = debugNumberBounds(meta, value);
  const locked = !!options.locked || !!meta.locked;
  return '<input class="debug-input" type="number" inputmode="decimal"' +
    ' value="' + escapeDebugHTML(value) + '"' +
    ' min="' + bounds.min + '" max="' + bounds.max + '" step="' + bounds.step + '"' +
    ' aria-label="' + escapeDebugHTML(debugFieldLabel(options.source, path)) + '"' +
    ' data-debug-type="number"' +
    ' data-debug-source="' + escapeDebugHTML(options.source) + '"' +
    (options.id ? ' data-debug-id="' + escapeDebugHTML(options.id) + '"' : "") +
    ' data-debug-path="' + escapeDebugHTML(path) + '"' +
    (locked ? " disabled" : "") +
  ">";
}

function debugTextHTML(path, value, options) {
  const locked = !!options.locked || !!getDebugFieldMeta(options.source, path).locked;
  return '<input class="debug-input text" type="text"' +
    ' value="' + escapeDebugHTML(value) + '"' +
    ' aria-label="' + escapeDebugHTML(debugFieldLabel(options.source, path)) + '"' +
    ' data-debug-type="text"' +
    ' data-debug-source="' + escapeDebugHTML(options.source) + '"' +
    (options.id ? ' data-debug-id="' + escapeDebugHTML(options.id) + '"' : "") +
    ' data-debug-path="' + escapeDebugHTML(path) + '"' +
    (locked ? " disabled" : "") +
  ">";
}

function debugSelectHTML(path, value, options) {
  const meta = getDebugFieldMeta(options.source, path);
  const list = typeof meta.options === "function" ? meta.options() : (meta.options || []);
  if (!list.length) return debugTextHTML(path, value, options);
  const locked = !!options.locked || !!meta.locked;
  const choices = list.map(function (entry) {
    const choiceValue = typeof entry === "object" ? entry.value : entry;
    const choiceLabel = typeof entry === "object" ? (entry.label || entry.value) : entry;
    return '<option value="' + escapeDebugHTML(choiceValue) + '"' +
      (String(choiceValue) === String(value) ? " selected" : "") + ">" +
      escapeDebugHTML(choiceLabel) +
    "</option>";
  }).join("");
  return '<select class="debug-select"' +
    ' aria-label="' + escapeDebugHTML(debugFieldLabel(options.source, path)) + '"' +
    ' data-debug-type="select"' +
    ' data-debug-source="' + escapeDebugHTML(options.source) + '"' +
    (options.id ? ' data-debug-id="' + escapeDebugHTML(options.id) + '"' : "") +
    ' data-debug-path="' + escapeDebugHTML(path) + '"' +
    (locked ? " disabled" : "") +
  ">" + choices + "</select>";
}

function debugSwitchHTML(value, attributes, locked) {
  return '<button type="button" class="debug-switch' + (value ? " on" : "") + '"' +
    ' role="switch" aria-checked="' + (value ? "true" : "false") + '"' +
    " " + attributes + (locked ? " disabled" : "") + ">" +
    '<span class="debug-switch-track" aria-hidden="true"><span class="debug-switch-dot"></span></span>' +
    '<span class="debug-switch-text">' + (value ? "ON" : "OFF") + "</span>" +
  "</button>";
}

function renderDebugFieldHTML(path, value, options) {
  const meta = getDebugFieldMeta(options.source, path);
  const label = escapeDebugHTML(debugFieldLabel(options.source, path));
  const locked = !!options.locked || !!meta.locked;
  let control;
  if (typeof value === "boolean") {
    control = debugSwitchHTML(value,
      'data-debug-toggle data-debug-source="' + escapeDebugHTML(options.source) + '"' +
      (options.id ? ' data-debug-id="' + escapeDebugHTML(options.id) + '"' : "") +
      ' data-debug-path="' + escapeDebugHTML(path) + '"',
      locked);
  } else if (typeof value === "number") {
    control = debugNumberHTML(path, value, options);
  } else if (meta.options) {
    control = debugSelectHTML(path, value, options);
  } else {
    control = debugTextHTML(path, value, options);
  }
  return '<div class="debug-field' + (typeof value === "boolean" ? " toggle" : "") + '">' +
    '<span class="debug-field-label">' + label + "</span>" +
    control +
    (meta.help ? '<span class="debug-field-help">' + meta.help + "</span>" : "") +
  "</div>";
}

/* ---------- generic object / list renderer ---------- */

function renderDebugObjectHTML(object, path, options) {
  if (Array.isArray(object)) {
    return renderDebugListHTML(object, path, Object.assign({}, options, { keys: null }));
  }
  const keys = Array.isArray(options.keys) ? options.keys : Object.keys(object || {});
  return keys.map(function (key) {
    if (!Object.prototype.hasOwnProperty.call(object, key)) return "";
    if (options.skip && options.skip.indexOf(key) !== -1) return "";
    const value = object[key];
    if (value === undefined || value === null) return "";
    const childPath = path ? path + "." + key : key;
    if (Array.isArray(value)) return renderDebugListHTML(value, childPath, options);
    if (isRuleObject(value)) {
      const label = debugFieldLabel(options.source, childPath);
      return '<div class="debug-subgroup">' +
        '<span class="debug-subgroup-title">' + escapeDebugHTML(label) + "</span>" +
        '<div class="debug-grid">' +
          renderDebugObjectHTML(value, childPath, Object.assign({}, options, { keys: null })) +
        "</div>" +
      "</div>";
    }
    return renderDebugFieldHTML(childPath, value, options);
  }).join("");
}

function renderDebugListHTML(list, path, options) {
  const meta = getDebugFieldMeta(options.source, path);
  const locked = !!options.locked || !!meta.locked;
  const minItems = typeof meta.minItems === "number" ? meta.minItems : 0;
  const items = list.map(function (item, index) {
    const itemPath = path + "." + index;
    const remove = locked || list.length <= minItems
      ? ""
      : '<button type="button" class="debug-mini remove" data-debug-list-remove data-debug-source="' +
          escapeDebugHTML(options.source) + '"' +
          (options.id ? ' data-debug-id="' + escapeDebugHTML(options.id) + '"' : "") +
          ' data-debug-path="' + escapeDebugHTML(path) + '"' +
          ' data-debug-list-index="' + index + '"' +
        ">REMOVE</button>";
    if (isRuleObject(item)) {
      const itemLabel = item.name || item.label || item.id || ("Entry " + (index + 1));
      return '<div class="debug-list-item">' +
        '<div class="debug-list-head">' +
          '<span class="debug-list-title">' + escapeDebugHTML(itemLabel) + "</span>" +
          remove +
        "</div>" +
        '<div class="debug-grid">' +
          renderDebugObjectHTML(item, itemPath, Object.assign({}, options, { keys: null })) +
        "</div>" +
      "</div>";
    }
    return '<div class="debug-list-row">' +
      '<span class="debug-list-index">#' + (index + 1) + "</span>" +
      renderDebugFieldHTML(itemPath, item, Object.assign({}, options, { suppressLabel: true })) +
      remove +
    "</div>";
  }).join("");
  const add = locked
    ? ""
    : '<button type="button" class="debug-list-add" data-debug-list-add data-debug-source="' +
        escapeDebugHTML(options.source) + '"' +
        (options.id ? ' data-debug-id="' + escapeDebugHTML(options.id) + '"' : "") +
        ' data-debug-path="' + escapeDebugHTML(path) + '"' +
      ">+ " + escapeDebugHTML(meta.addLabel || "ADD ENTRY") + "</button>";
  return '<div class="debug-list">' +
    (items || '<p class="debug-empty">No entries.</p>') +
    add +
  "</div>";
}

/* ---------- page shell ---------- */

function renderDebugTabs() {
  if (!els.debugTabs) return;
  els.debugTabs.innerHTML = DEBUG_TABS.map(function (tab) {
    return '<button type="button" class="debug-tab' + (tab.id === debugTabId ? " active" : "") + '"' +
      ' role="tab" aria-selected="' + (tab.id === debugTabId ? "true" : "false") + '"' +
      ' data-debug-tab="' + tab.id + '">' +
      '<span class="debug-tab-emoji" aria-hidden="true">' + tab.emoji + "</span>" +
      "<span>" + tab.label + "</span>" +
    "</button>";
  }).join("");
  const active = DEBUG_TABS.find(function (tab) { return tab.id === debugTabId; }) || DEBUG_TABS[0];
  if (els.debugBlurb) els.debugBlurb.textContent = active ? active.blurb : "";
}

function renderDebugContext() {
  if (!els.debugContext) return;
  const live = isDebugRunActive();
  const overrides = countRuleOverrides();
  const main = live
    ? "LIVE RUN · TURN " + state.turn + " · changes apply immediately and travel with this run's save"
    : "NEW MATCH · changes apply when you choose a race and start";
  els.debugContext.innerHTML =
    '<span class="debug-context-main">' + escapeDebugHTML(main) + "</span>" +
    '<span class="debug-context-count' + (overrides ? " custom" : "") + '">' +
      (overrides ? overrides + (overrides === 1 ? " TWEAK" : " TWEAKS") : "DEFAULT RULES") +
    "</span>";
}

function renderDebugScreen() {
  if (!els.debugScreen) return;
  const live = isDebugRunActive();
  if (els.debugKicker) {
    els.debugKicker.textContent = live ? "LIVE RULES · TURN " + state.turn : "NEW MATCH SETUP";
  }
  renderDebugTabs();
  renderDebugContext();
  if (els.debugBody) els.debugBody.innerHTML = debugTabHTML(debugTabId, live);
}

/* Repaint only the active state of the tab strip. Replacing the buttons
   would drop keyboard focus every time a tab is chosen. */
function updateDebugTabState() {
  if (els.debugTabs && typeof els.debugTabs.querySelectorAll === "function") {
    els.debugTabs.querySelectorAll("[data-debug-tab]").forEach(function (button) {
      const active = button.getAttribute("data-debug-tab") === debugTabId;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
  }
  const active = DEBUG_TABS.find(function (tab) { return tab.id === debugTabId; }) || DEBUG_TABS[0];
  if (els.debugBlurb) els.debugBlurb.textContent = active ? active.blurb : "";
}

function setDebugTab(id) {
  if (DEBUG_TAB_ORDER.indexOf(id) === -1) return;
  debugTabId = id;
  updateDebugTabState();
  renderDebugContext();
  if (els.debugBody) els.debugBody.innerHTML = debugTabHTML(debugTabId, isDebugRunActive());
  if (els.debugScroll) els.debugScroll.scrollTop = 0;
}

function refreshDebugBody() {
  if (!els.debugBody) return;
  const top = els.debugScroll ? els.debugScroll.scrollTop : 0;
  els.debugBody.innerHTML = debugTabHTML(debugTabId, isDebugRunActive());
  if (els.debugScroll) els.debugScroll.scrollTop = top;
  renderDebugContext();
}

/* The override count walks the whole rulebook. Keep it off the keystroke path:
   the preview/odds refresh immediately, the header count lands just after. */
function scheduleDebugContext() {
  if (debugContextTimer) clearTimeout(debugContextTimer);
  debugContextTimer = setTimeout(function () {
    debugContextTimer = null;
    renderDebugContext();
  }, 180);
}

function refreshDebugReadouts() {
  scheduleDebugContext();
  if (debugTabId === "events") refreshEventReadouts();
  if (debugTabId === "economy") {
    const preview = byId("debug-econ-live");
    if (preview) preview.innerHTML = debugEconomyLiveHTML();
  }
}

function disarmDebugReset() {
  debugResetArmed = false;
  if (debugResetTimer) {
    clearTimeout(debugResetTimer);
    debugResetTimer = null;
  }
  if (els.debugReset) {
    els.debugReset.textContent = "RESET";
    els.debugReset.classList.remove("armed");
  }
}

function openDebugScreen() {
  if (!els.debugScreen) return;
  if (state && state.ui && state.ui.sheet) closeSheet();
  /* Coming from the setup page, commit the seed the player typed before the
     Galaxy tab draws its copy of CONFIG.galaxy.seed. */
  if (!isDebugRunActive() && typeof readSeedInput === "function") readSeedInput();
  debugSamplePopulation = null;
  if (debugContextTimer) {
    clearTimeout(debugContextTimer);
    debugContextTimer = null;
  }
  disarmDebugReset();
  if (DEBUG_TAB_ORDER.indexOf(debugTabId) === -1) debugTabId = "general";
  renderDebugScreen();
  els.debugScreen.classList.remove("hidden");
  els.debugScreen.setAttribute("aria-hidden", "false");
  if (els.debugScroll) els.debugScroll.scrollTop = 0;
  if (els.debugBack && typeof els.debugBack.focus === "function") {
    try {
      els.debugBack.focus({ preventScroll: true });
    } catch (error) {
      els.debugBack.focus();
    }
  }
}

function closeDebugScreen() {
  if (!els.debugScreen || els.debugScreen.classList.contains("hidden")) return;
  els.debugScreen.classList.add("hidden");
  els.debugScreen.setAttribute("aria-hidden", "true");
  if (debugContextTimer) {
    clearTimeout(debugContextTimer);
    debugContextTimer = null;
  }
  disarmDebugReset();
  if (isDebugRunActive()) {
    renderAll();
    if (els.saveChip && typeof els.saveChip.focus === "function") els.saveChip.focus();
  } else {
    /* Origins and the seed can change in the console: rebuild the setup page
       behind the overlay so its cards and field match the rulebook. */
    if (typeof renderEthics === "function") renderEthics();
    else renderSeedInput();
    if (els.openDebugSetup && typeof els.openDebugSetup.focus === "function") els.openDebugSetup.focus();
  }
}

function handleDebugReset() {
  if (!debugResetArmed) {
    debugResetArmed = true;
    if (els.debugReset) {
      els.debugReset.textContent = "CONFIRM RESET";
      els.debugReset.classList.add("armed");
    }
    if (debugResetTimer) clearTimeout(debugResetTimer);
    debugResetTimer = setTimeout(function () {
      debugResetTimer = null;
      disarmDebugReset();
    }, 4000);
    return;
  }
  if (debugResetTimer) {
    clearTimeout(debugResetTimer);
    debugResetTimer = null;
  }
  /* A live galaxy was built with the geometry and layout it has right now.
     Reset the balance, but never pull the map's shape out from under the
     sector renderer; the seed also belongs to the run that is already open. */
  const live = isDebugRunActive();
  const keptSector = live ? cloneRuleValue(CONFIG.sector) : null;
  const keptLayout = live ? cloneRuleValue(CONFIG.galaxy.layout) : null;
  const keptPlanetSizes = live ? cloneRuleValue(CONFIG.planetSlots.sizes) : null;
  const keptPlanetBonus = live ? cloneRuleValue(CONFIG.planetSlots.bonus) : null;
  const keptSeed = live && state && state.galaxy ? state.galaxy.seed >>> 0 : null;
  resetRunRules();
  if (live) {
    replaceRuleValue(CONFIG.sector, keptSector);
    replaceRuleValue(CONFIG.galaxy.layout, keptLayout);
    /* Existing planets store a size id; keep the table that names it. */
    replaceRuleValue(CONFIG.planetSlots.sizes, keptPlanetSizes);
    replaceRuleValue(CONFIG.planetSlots.bonus, keptPlanetBonus);
    if (keptSeed != null) CONFIG.galaxy.seed = keptSeed;
  }
  debugSamplePopulation = null;
  renderDebugScreen();
  disarmDebugReset();
  if (!live) renderSeedInput();
  toast(live ? "Rules reset. The open galaxy keeps its shape and seed." : "All rules reset to defaults.");
}

/* ---------- tab builders ---------- */

function debugTabHTML(id, live) {
  if (id === "economy") return debugEconomyHTML(live);
  if (id === "events") return debugEventsHTML(live);
  if (id === "galaxy") return debugGalaxyHTML(live);
  if (id === "military") return debugMilitaryHTML(live);
  if (id === "content") return debugContentHTML(live);
  return debugGeneralHTML(live);
}

function debugGeneralHTML(live) {
  return [
    debugSectionHTML("general-starting", "Starting stockpile",
      "Energy and minerals seed the home sector; research and influence seed the empire. These values are read when a new run is born.",
      renderDebugObjectHTML(CONFIG.startingResources, "startingResources", { source: "config", locked: live }),
      debugScopeTag(true, live), live ? "warn" : ""),
    debugSectionHTML("general-income", "Base income",
      "The capital keeps a baseline yield before any building is counted. It is added every turn, so a change lands on the next end-turn.",
      renderDebugObjectHTML(CONFIG.baseIncome, "baseIncome", { source: "config" })),
    debugSectionHTML("general-colonisation", "Colonisation & upkeep",
      "Cost of a new colony and the flat energy a colony, an active research project and a ship upkeep draw before buildings are counted.",
      renderDebugObjectHTML({ colonizeCost: CONFIG.colonizeCost, colonyEnergyUpkeep: CONFIG.colonyEnergyUpkeep, research: CONFIG.research },
        "", { source: "config" })),
    debugSectionHTML("general-stability-open", "Stability opening",
      "The bar every new run starts with.",
      renderDebugObjectHTML({ start: CONFIG.stability.start }, "stability", { source: "config", locked: live }),
      debugScopeTag(true, live), live ? "warn" : ""),
    debugSectionHTML("general-stability", "Stability behaviour",
      "S' = drag × S + (1 − drag) × population-weighted happiness, clamped to 0..100. A deficit charges once per turn.",
      renderDebugObjectHTML(CONFIG.stability, "stability", {
        source: "config",
        keys: ["drag", "lowThreshold", "energyDeficitPenalty"]
      })),
    debugSectionHTML("general-refits", "Refits & repairs",
      "Building refits cost a share of the build price. Ship refits and emergency repairs need an operational spaceport.",
      renderDebugObjectHTML(CONFIG.upgrades, "upgrades", { source: "config" })),
    debugSectionHTML("general-input", "Input & pacing",
      "Long-press timing, the swipe-to-decide threshold and the end-turn number animation.",
      renderDebugObjectHTML({ hold: CONFIG.hold, swipeThreshold: CONFIG.swipeThreshold, turnTickMs: CONFIG.turnTickMs },
        "", { source: "config" }))
  ].join("");
}

/* ---------- economy ---------- */

function debugSamplePopulationValue() {
  if (typeof debugSamplePopulation === "number" && isFinite(debugSamplePopulation)) {
    return Math.max(0, Math.floor(debugSamplePopulation));
  }
  if (!isDebugRunActive()) {
    const opening = Number(CONFIG.economy.startingPopulation.home);
    return isFinite(opening) && opening > 0 ? Math.floor(opening) : 10;
  }
  let largest = 0;
  if (state && Array.isArray(state.systems)) {
    state.systems.forEach(function (system) {
      if (system && system.colonized) largest = Math.max(largest, Math.floor(system.population || 0));
    });
  }
  return largest > 0 ? largest : 10;
}

/* Only the live half of the preview is repainted while a field changes; the
   sample-population input lives in the head so typing in it keeps focus. */
function debugEconomyLiveHTML() {
  const cfg = getEconomyConfig();
  const population = debugSamplePopulationValue();
  const energyRequired = getPopulationEnergyRequirement(population);
  const mineralsRequired = getRequiredHousingMinerals(population);
  const funded = getColonyHappiness(energyRequired, mineralsRequired, population);
  const growthAtFunded = getPopulationGrowthForHappiness(population, funded.happiness);
  const ceilingRatio = Math.max(1, cfg.maxPercent / 100);
  const ceilingMultiplier = getMaintenanceGrowthMultiplier(
    energyRequired * ceilingRatio,
    mineralsRequired * ceilingRatio,
    population
  );
  const growthAtCeiling = growthAtFunded * ceilingMultiplier;
  const turns = function (growth) {
    return growth > 0 ? Math.ceil(1 / growth) + " TURNS / POP" : "NO GROWTH";
  };
  const rows = [
    ["Required energy", formatAmount(energyRequired) + " ⚡ / turn", "P ^ " + cfg.energyExponent],
    ["Required housing minerals", formatAmount(mineralsRequired) + " ⛏ / turn", "P ^ (1 / " + cfg.housingExponent + ")"],
    ["Happiness at full funding", formatAmount(funded.happiness) + " / " + cfg.happinessMax, "F = F_max × min(1, E_spent/E_req) × max(0, 1 − h)"],
    ["Growth at full funding", formatGrowthAmount(growthAtFunded) + " / turn", turns(growthAtFunded)],
    ["Growth at " + cfg.maxPercent + "% maintenance", formatGrowthAmount(growthAtCeiling) + " / turn", turns(growthAtCeiling)],
    ["Growth multiplier ceiling", "×" + formatAmount(cfg.maxGrowthMultiplier), "reached with " + cfg.maxPercent + "% on both lines"]
  ];
  return '<pre class="debug-equations">' +
      "E_required = P ^ a\n" +
      "H          = M_spent ^ b\n" +
      "h          = max(0, P − H) / P\n" +
      "F          = F_max × min(1, E_spent / E_required) × max(0, 1 − h)\n" +
      "M          = 1 + ((overE + overH) / " + formatAmount((cfg.maxPercent / 100 - 1) * 2) + ") × (M_max − 1)\n" +
      "growth     = P × rate × (F / F_max) × M" +
    "</pre>" +
    '<div class="debug-econ-table">' +
      rows.map(function (row) {
        return '<div class="debug-econ-row">' +
          "<span>" + row[0] + "</span>" +
          "<b>" + row[1] + "</b>" +
          "<small>" + escapeDebugHTML(row[2]) + "</small>" +
        "</div>";
      }).join("") +
    "</div>" +
    '<p class="debug-formula-foot">P = ' + population + " · a = " + cfg.energyExponent + " · b = " + cfg.housingExponent +
      " · rate = " + cfg.growthRate + " · F_max = " + cfg.happinessMax + "</p>";
}

function debugEconomyPreviewHTML() {
  const population = debugSamplePopulationValue();
  return '<div class="debug-formula-head">' +
      '<label class="debug-sample">SAMPLE COLONY' +
        '<input class="debug-input" type="number" inputmode="numeric" min="0" max="1000" step="1"' +
          ' value="' + population + '" data-debug-sample-population aria-label="Sample colony population">' +
        "<span>POPULATION</span>" +
      "</label>" +
      '<span class="debug-formula-note">live formulas</span>' +
    "</div>" +
    '<div id="debug-econ-live" class="debug-econ-live">' + debugEconomyLiveHTML() + "</div>";
}

function debugEconomyHTML(live) {
  const workforce = CONFIG.economy.workforce || {};
  return [
    debugSectionHTML("economy-formula", "Colony equations",
      "The exact formulas the turn pipeline uses. Edit a coefficient in the cards below and this preview recalculates on the same functions.",
      '<div id="debug-econ-preview" class="debug-preview">' + debugEconomyPreviewHTML() + "</div>"),
    debugSectionHTML("economy-population", "Population formula",
      "Energy requirement, housing capacity, happiness and growth. The exponents are the shape of the whole colony economy.",
      renderDebugObjectHTML(CONFIG.economy.population, "economy.population", { source: "config" })),
    debugSectionHTML("economy-maintenance", "Maintenance policy",
      "Maintenance is requested as a percentage of the full requirement. The sector ledger caps the actual spend, so an under-funded colony loses happiness and growth instead of going negative.",
      renderDebugObjectHTML(CONFIG.economy.maintenance, "economy.maintenance", { source: "config" })),
    debugSectionHTML("economy-tiers", "Happiness tiers",
      "UI labels only: the formula produces the number, the highest tier whose minimum it meets names it.",
      renderDebugObjectHTML(CONFIG.economy.happinessTiers, "economy.happinessTiers", { source: "config" })),
    debugSectionHTML("economy-facilities", "Facility levels",
      "Shared by Power Plants and Mines. A facility needs its minimum population to operate and scales output by its staffed crew.",
      renderDebugObjectHTML(CONFIG.economy.facilities, "economy.facilities", { source: "config" })),
    debugSectionHTML("economy-workforce", "Workforce",
      "The automatic distribution strategy a colony uses until explicit crew orders are pinned. Strategy behaviour lives in js/core/colony.js.",
      '<p class="debug-note">Strategies: ' + escapeDebugHTML((workforce.strategies || []).map(function (entry) {
        return entry.label + " — " + entry.description;
      }).join(" · ")) + "</p>" +
      renderDebugObjectHTML({ defaultStrategy: workforce.defaultStrategy }, "economy.workforce", { source: "config" })),
    debugSectionHTML("economy-starting-population", "Starting population",
      "Population a capital and a freshly colonised world begin with.",
      renderDebugObjectHTML(CONFIG.economy.startingPopulation, "economy.startingPopulation", { source: "config", locked: live }),
      debugScopeTag(true, live), live ? "warn" : ""),
    debugSectionHTML("economy-starting-facilities", "Starting facilities",
      "Built on the capital before the first turn, in slot order. Each is an ordinary level-1 building with the same crew rules.",
      renderDebugObjectHTML(CONFIG.economy.startingFacilities, "economy.startingFacilities", { source: "config", locked: live }),
      debugScopeTag(true, live), live ? "warn" : ""),
    debugSectionHTML("economy-planet-slots", "Planet size & bonus slots",
      "Planet size is rolled at galaxy generation, so sizes and bonus chances shape the next new match. Unlock costs are paid during play.",
      renderDebugObjectHTML(CONFIG.planetSlots, "planetSlots", {
        source: "config",
        keys: ["sizes", "bonus"],
        locked: live
      }),
      debugScopeTag(true, live), live ? "warn" : ""),
    debugSectionHTML("economy-unlock-cost", "Bonus slot unlock",
      "Paid on the colony screen to open one locked bonus slot.",
      renderDebugObjectHTML(CONFIG.planetSlots.unlockCost, "planetSlots.unlockCost", { source: "config" })),
    debugSectionHTML("economy-trade", "Trade & gates",
      "Trading centers move energy and minerals across gate-linked lanes; gates spend jump operations every turn.",
      renderDebugObjectHTML({ trade: CONFIG.trade, gates: CONFIG.gates }, "", { source: "config" }))
  ].join("");
}

/* ---------- events ---------- */

function getEventBucketFor(eventId) {
  for (let i = 0; i < EVENT_CATEGORY_ORDER.length; i += 1) {
    const bucket = EVENT_BUCKETS[EVENT_CATEGORY_ORDER[i]] || [];
    if (bucket.indexOf(eventId) !== -1) return EVENT_CATEGORY_ORDER[i];
  }
  return null;
}

function debugEventStatusHTML(event, entry) {
  if (!entry) return '<b>—</b><span>RETIRED</span>';
  if (entry.reason) return '<b>—</b><span>' + escapeDebugHTML(entry.reason) + "</span>";
  return "<b>" + (entry.chance * 100).toFixed(1) + '%</b><span>DRAW ODDS</span>';
}

function debugEventChoicesHTML(event) {
  if (!Array.isArray(event.choices) || !event.choices.length) return "";
  return '<div class="debug-choices">' + event.choices.map(function (choice) {
    const lock = choice.requiresEthic
      ? '<span class="debug-lock">ETHIC · ' + escapeDebugHTML(choice.requiresEthic) + "</span>"
      : choice.requiresTech
        ? '<span class="debug-lock">TECH · ' + escapeDebugHTML(choice.requiresTech) + "</span>"
        : "";
    return '<div class="debug-choice">' +
      '<span class="debug-choice-label">' + escapeDebugHTML(choice.label) + "</span>" +
      lock +
      '<span class="debug-choice-effects">' + renderEffectPills(choice.effects || {}) + "</span>" +
    "</div>";
  }).join("") + "</div>";
}

function debugEventCardHTML(event, entry) {
  const bucket = getEventBucketFor(event.id);
  const enabled = event.enabled !== false;
  const category = EVENT_CATEGORIES[event.category] || { name: event.category, emoji: "•" };
  const categoryOptions = EVENT_CATEGORY_ORDER.map(function (id) {
    const def = EVENT_CATEGORIES[id];
    return '<option value="' + id + '"' + (id === event.category ? " selected" : "") + ">" +
      escapeDebugHTML(def ? def.name : id) + "</option>";
  }).join("");
  return '<article class="debug-event' + (enabled ? "" : " off") + (bucket ? "" : " retired") + '">' +
    '<header class="debug-event-head">' +
      '<span class="debug-event-emoji" aria-hidden="true">' + (event.emoji || "🎲") + "</span>" +
      '<span class="debug-event-title"><b>' + escapeDebugHTML(event.title) + "</b>" +
        "<small>" + escapeDebugHTML(category.emoji + " " + category.name) + " · " + escapeDebugHTML(event.id) + "</small>" +
      "</span>" +
      debugSwitchHTML(enabled, 'data-debug-event-enabled="' + escapeDebugHTML(event.id) + '"', false) +
    "</header>" +
    '<div class="debug-event-fields">' +
      '<label class="debug-mini-field"><span>WEIGHT</span><input class="debug-input" type="number" min="0" max="10000" step="1"' +
        ' value="' + (typeof event.weight === "number" ? event.weight : 1) + '" data-debug-event-field="weight"' +
        ' data-debug-event-id="' + escapeDebugHTML(event.id) + '"></label>' +
      '<label class="debug-mini-field"><span>MIN TURN</span><input class="debug-input" type="number" min="0" max="10000" step="1"' +
        ' value="' + (typeof event.minTurn === "number" ? event.minTurn : "") + '" data-debug-event-field="minTurn"' +
        ' data-debug-event-id="' + escapeDebugHTML(event.id) + '"></label>' +
      '<label class="debug-mini-field"><span>MAX TURN</span><input class="debug-input" type="number" min="0" max="10000" step="1"' +
        ' value="' + (typeof event.maxTurn === "number" ? event.maxTurn : "") + '" placeholder="—" data-debug-event-field="maxTurn"' +
        ' data-debug-event-id="' + escapeDebugHTML(event.id) + '"></label>' +
      '<label class="debug-mini-field"><span>CATEGORY</span><select class="debug-select" data-debug-event-category="' +
        escapeDebugHTML(event.id) + '">' + categoryOptions + "</select></label>" +
    "</div>" +
    '<div class="debug-event-deck">' +
      '<button type="button" class="debug-mini ' + (bucket ? "danger" : "restore") + '" data-debug-event-bucket="' +
        escapeDebugHTML(event.id) + '">' + (bucket ? "REMOVE FROM DECK" : "RESTORE TO DECK") + "</button>" +
      '<span class="debug-event-status" data-debug-event-status="' + escapeDebugHTML(event.id) + '">' +
        debugEventStatusHTML(event, entry) +
      "</span>" +
    "</div>" +
    debugEventChoicesHTML(event) +
  "</article>";
}

function debugCategoryStatusHTML(categoryId, summary) {
  const category = summary.categories.find(function (entry) { return entry.id === categoryId; });
  if (!category) return "—";
  if (category.enabled === false) return "CATEGORY RETIRED · 0% OF DECK";
  const total = category.events.length;
  const eligible = category.events.filter(function (entry) { return entry.eligible; }).length;
  const share = category.events.reduce(function (sum, entry) {
    return sum + (entry.eligible ? entry.chance : 0);
  }, 0);
  return eligible + " / " + total + " DRAWABLE · " + (share * 100).toFixed(1) + "% OF DECK";
}

function debugCategoryHeaderHTML(categoryId, summary) {
  const category = EVENT_CATEGORIES[categoryId];
  if (!category) return "";
  const enabled = category.enabled !== false;
  return '<div class="debug-category-head">' +
    '<span class="debug-category-title"><b>' + category.emoji + " " + escapeDebugHTML(category.name) + "</b>" +
      '<span class="debug-category-status" data-debug-category-status="' + categoryId + '">' +
        debugCategoryStatusHTML(categoryId, summary) +
      "</span></span>" +
    '<span class="debug-category-controls">' +
      '<label class="debug-mini-field"><span>WEIGHT ×</span><input class="debug-input" type="number" min="0" max="1000" step="0.1"' +
        ' value="' + (typeof category.weightMult === "number" ? category.weightMult : 1) + '" data-debug-category-weight="' + categoryId + '"></label>' +
      debugSwitchHTML(enabled, 'data-debug-category-enabled="' + categoryId + '"', false) +
    "</span>" +
  "</div>";
}

function debugUnrestChanceHTML() {
  const stability = isDebugRunActive() && state && typeof state.stability === "number"
    ? state.stability
    : CONFIG.stability.start;
  const chance = getUnrestChance(stability);
  return "At stability " + formatStability(stability) + ": <b>" + (chance * 100).toFixed(1) + "%</b> per turn";
}

function debugUnrestCardHTML(event) {
  const pool = getUnrestEvents();
  const total = pool.reduce(function (sum, entry) {
    return sum + (typeof entry.weight === "number" && entry.weight > 0 ? entry.weight : 1);
  }, 0);
  const weight = typeof event.weight === "number" && event.weight > 0 ? event.weight : 1;
  const share = total > 0 && event.enabled !== false ? weight / total : 0;
  return '<article class="debug-event' + (event.enabled === false ? " off" : "") + '">' +
    '<header class="debug-event-head">' +
      '<span class="debug-event-emoji" aria-hidden="true">' + (event.emoji || "🔥") + "</span>" +
      '<span class="debug-event-title"><b>' + escapeDebugHTML(event.title) + "</b>" +
        "<small>UNREST · " + escapeDebugHTML(event.id) + "</small>" +
      "</span>" +
      debugSwitchHTML(event.enabled !== false, 'data-debug-unrest-enabled="' + escapeDebugHTML(event.id) + '"', false) +
    "</header>" +
    '<div class="debug-event-fields">' +
      '<label class="debug-mini-field"><span>WEIGHT</span><input class="debug-input" type="number" min="0" max="10000" step="1"' +
        ' value="' + (typeof event.weight === "number" ? event.weight : 1) + '" data-debug-unrest-weight="' + escapeDebugHTML(event.id) + '"></label>' +
      '<span class="debug-event-status"><b>' + (share * 100).toFixed(1) + '%</b><span>POOL SHARE</span></span>' +
    "</div>" +
    debugEventChoicesHTML(event) +
  "</article>";
}

function debugEventsNextHTML() {
  if (!isDebugRunActive() || !state || !state.events) {
    const opening = typeof CONFIG.events.openingTurn === "number" ? CONFIG.events.openingTurn : 1;
    return "The first card of a new run is due on turn " + opening + " · interval now " + getEventInterval() +
      " turn" + (getEventInterval() === 1 ? "" : "s") + ".";
  }
  return "Next draw: turn " + state.events.nextTurn + " · interval now " + getEventInterval() +
    " turn" + (getEventInterval() === 1 ? "" : "s") + ".";
}

function debugEventsHTML(live) {
  const summary = getEventDeckSummary();
  const cards = {};
  summary.categories.forEach(function (category) {
    category.events.forEach(function (entry) { cards[entry.id] = entry; });
  });
  const categoryCards = EVENT_CATEGORY_ORDER.map(function (categoryId) {
    const category = EVENT_CATEGORIES[categoryId];
    if (!category) return "";
    const events = EVENTS.filter(function (event) { return event.category === categoryId; });
    return debugSectionHTML("events-" + categoryId, category.emoji + " " + escapeDebugHTML(category.name),
      escapeDebugHTML(category.blurb) + ' <span class="debug-help-inline">A weight of 0 removes the card without retiring it.</span>',
      debugCategoryHeaderHTML(categoryId, summary) +
        (events.length ? events.map(function (event) { return debugEventCardHTML(event, cards[event.id]); }).join("") : '<p class="debug-empty">No cards in this category.</p>'),
      "WEIGHT × " + (typeof category.weightMult === "number" ? category.weightMult : 1),
      category.enabled === false ? "warn" : "");
  }).join("");

  const unrestCards = (typeof UNREST_EVENTS !== "undefined" ? UNREST_EVENTS : []).map(debugUnrestCardHTML).join("");

  return [
    debugSectionHTML("events-cadence", "Draw cadence",
      "Cards are paced, not drawn every turn. <span id=\"debug-events-next\">" + escapeDebugHTML(debugEventsNextHTML()) + "</span>",
      renderDebugObjectHTML(CONFIG.events, "events", { source: "config" })),
    debugSectionHTML("events-unrest", "Civil unrest",
      "Low stability raises the chance of an unrest card at the end of a turn. These cards are separate from the paced deck and never consume its slot.",
      '<p class="debug-note debug-unrest-line" id="debug-unrest-chance">' + debugUnrestChanceHTML() + "</p>" +
      renderDebugObjectHTML(CONFIG.stability.unrest, "stability.unrest", { source: "config" })),
    categoryCards,
    debugSectionHTML("events-unrest-cards", "🔥 Unrest cards",
      "One is picked from this pool when the unrest roll succeeds. The unhappiest colony with people in it is the target.",
      unrestCards || '<p class="debug-empty">No unrest cards.</p>')
  ].join("");
}

function refreshEventReadouts() {
  if (!els.debugBody || typeof els.debugBody.querySelector !== "function") return;
  const summary = getEventDeckSummary();
  const cards = {};
  summary.categories.forEach(function (category) {
    category.events.forEach(function (entry) { cards[entry.id] = entry; });
  });
  EVENTS.forEach(function (event) {
    const node = els.debugBody.querySelector('[data-debug-event-status="' + event.id + '"]');
    if (node) node.innerHTML = debugEventStatusHTML(event, cards[event.id]);
  });
  EVENT_CATEGORY_ORDER.forEach(function (categoryId) {
    const node = els.debugBody.querySelector('[data-debug-category-status="' + categoryId + '"]');
    if (node) node.innerHTML = debugCategoryStatusHTML(categoryId, summary);
  });
  const unrest = byId("debug-unrest-chance");
  if (unrest) unrest.innerHTML = debugUnrestChanceHTML();
  const next = byId("debug-events-next");
  if (next) next.innerHTML = escapeDebugHTML(debugEventsNextHTML());
}

/* ---------- galaxy ---------- */

function debugGalaxyHTML(live) {
  return [
    debugSectionHTML("galaxy-note", "Generation applies to a new match",
      "The galaxy in play is already built. Seed, ring count, systems per sector, layout, sector geometry and survey density are read when the next galaxy is generated; edit them before starting or from this screen's NEW MATCH mode.",
      '<p class="debug-note">The live run keeps its current galaxy and sector maps.</p>',
      live ? "LIVE RUN" : "NEW MATCH", live ? "warn" : ""),
    debugSectionHTML("galaxy-generation", "Galaxy generation",
      "Rings grow outward from the home core. The seed drives ring sizes, parents, shortcuts, names and every sector map.",
      '<div class="debug-seed-row"><button type="button" class="debug-mini" data-debug-random-seed' + (live ? " disabled" : "") + ">RANDOMIZE SEED</button>" +
        '<span class="debug-note">Seed ' + CONFIG.galaxy.seed + "</span></div>" +
      renderDebugObjectHTML(CONFIG.galaxy, "galaxy", {
        source: "config",
        keys: ["seed", "outerRings", "ringOneMin", "ringOneMax", "ringGrowth", "parentWindow",
          "ringShortcutsMin", "ringShortcutsMax", "minSystems", "maxSystems", "layout"],
        locked: live
      }),
      debugScopeTag(true, live), live ? "warn" : ""),
    debugSectionHTML("galaxy-jump", "Gate jump price",
      "Paid from the origin sector when a fleet crosses a gate. This one is read live.",
      renderDebugObjectHTML({ jumpEnergyCost: CONFIG.galaxy.jumpEnergyCost }, "galaxy", { source: "config" })),
    debugSectionHTML("galaxy-sector", "Sector geometry",
      "One sector is a rows × cols hex rectangle. Changing this changes the shape of every map the next galaxy builds.",
      renderDebugObjectHTML(CONFIG.sector, "sector", { source: "config", locked: live }),
      debugScopeTag(true, live), live ? "warn" : ""),
    debugSectionHTML("galaxy-anomalies", "Survey site density",
      "Sites are seeded onto empty hexes at generation time. Outer rings are a little richer: chance = chancePerSector + ring × ringChanceBonus.",
      renderDebugObjectHTML(CONFIG.anomalies, "anomalies", { source: "config", locked: live }),
      debugScopeTag(true, live), live ? "warn" : ""),
    debugContentEntriesSection("planetTypes", "Planet types",
      "Roll weights for the planet archetypes the galaxy generator places. Applied at the next generation.",
      true)
  ].join("");
}

/* ---------- military ---------- */

function debugMilitaryHTML(live) {
  return [
    debugSectionHTML("military-rules", "Combat rules",
      "Patrol radii, repairs, salvage and the size of the military log. Read live by combat and the economy.",
      renderDebugObjectHTML(CONFIG.military, "military", { source: "config" })),
    debugSectionHTML("military-spawn", "Rival spawn",
      "How many rival powers the galaxy seeds and whether every ring gets at least one. Read at generation.",
      renderDebugObjectHTML(CONFIG.rivals, "rivals", {
        source: "config",
        keys: ["enabled", "minCount", "maxCount", "onePerRing"],
        locked: live
      }),
      debugScopeTag(true, live), live ? "warn" : ""),
    debugSectionHTML("military-raids", "Raids & AI tempo",
      "Rival raiders cross lanes toward nearby player space. The state machine below chooses what each power does.",
      renderDebugObjectHTML(CONFIG.rivals, "rivals", {
        source: "config",
        keys: ["raidMinTurn", "raidLaneRange", "maxConcurrentRaids", "stateMinTurns", "stateMaxTurns"]
      })),
    debugContentEntriesSection("archetypes", "Rival archetypes",
      "Marauders raid harder and grow slower; builders fortify and expand. These multipliers feed the rival AI.",
      false),
    debugContentEntriesSection("ships", "Hull classes",
      "Base stats, build price and the refit gain per stat level. Ships already in flight read the new base stats immediately.",
      false)
  ].join("");
}

/* ---------- content ---------- */

function debugContentEntriesSection(source, title, help, nextOnly) {
  const live = isDebugRunActive();
  const order = debugContentOrder(source);
  const fields = DEBUG_CONTENT_FIELDS[source] || null;
  const entries = order.map(function (id) {
    const def = debugSourceTarget(source, id);
    if (!def) return "";
    const name = def.name || id;
    const sub = [id, def.kind, def.role].filter(Boolean).join(" · ");
    /* The Power Plant and Mine crews come from CONFIG.economy.facilities,
       so their 'workers' field here would be a dead knob. Support buildings
       (Lab, Embassy) do read their own table. */
    let entryFields = fields;
    if (source === "buildings" && def.facility) {
      entryFields = (fields || []).filter(function (key) {
        return key !== "workers" && key !== "output" && key !== "perLevel";
      });
    }
    return '<article class="debug-entry">' +
      '<header class="debug-entry-head">' +
        '<span class="debug-entry-emoji" aria-hidden="true">' + (def.emoji || "•") + "</span>" +
        '<span class="debug-entry-title"><b>' + escapeDebugHTML(name) + "</b><small>" + escapeDebugHTML(sub) + "</small></span>" +
      "</header>" +
      '<div class="debug-grid">' +
        renderDebugObjectHTML(def, "", { source: source, id: id, keys: entryFields, locked: nextOnly && live }) +
      "</div>" +
    "</article>";
  }).join("");
  return debugSectionHTML("content-" + source, title, help, entries || '<p class="debug-empty">No entries.</p>',
    nextOnly ? debugScopeTag(true, live) : "", nextOnly && live ? "warn" : "");
}

function debugTechDetailsHTML(tech) {
  const keys = DEBUG_TECH_NUMERIC_KEYS.filter(function (key) {
    return typeof tech[key] === "number";
  });
  /* Prerequisites and the exclusive pair are not numeric, but they decide
     which projects the tree offers. */
  if (Array.isArray(tech.requiresTech)) keys.push("requiresTech");
  if (typeof tech.exclusive === "string") keys.push("exclusive");
  if (typeof tech.final === "boolean") keys.push("final");
  return '<details class="debug-tech">' +
    "<summary>" +
      '<span class="debug-tech-emoji" aria-hidden="true">' + (tech.emoji || "•") + "</span>" +
      '<span class="debug-tech-name">' + escapeDebugHTML(tech.name) + "</span>" +
      '<span class="debug-tech-cost">' + (typeof tech.cost === "number" ? tech.cost + " 🔬" : "") + "</span>" +
    "</summary>" +
    (tech.effect ? '<p class="debug-tech-effect">' + escapeDebugHTML(tech.effect) + "</p>" : "") +
    (keys.length
      ? '<div class="debug-grid">' + renderDebugObjectHTML(tech, "", { source: "techs", id: tech.id, keys: keys }) + "</div>"
      : '<p class="debug-empty">No numeric payload.</p>') +
  "</details>";
}

function debugTechsSection() {
  const groups = TECH_CATEGORIES.map(function (category) {
    const ids = TECH_ORDER.filter(function (id) {
      return TECHS[id] && TECHS[id].category === category.id;
    });
    if (!ids.length) return "";
    return '<div class="debug-tech-group">' +
      '<h3>' + category.emoji + " " + escapeDebugHTML(category.name) + "</h3>" +
      ids.map(function (id) { return debugTechDetailsHTML(TECHS[id]); }).join("") +
    "</div>";
  }).join("");
  const finalIds = TECH_ORDER.filter(function (id) { return TECHS[id] && TECHS[id].category === "final"; });
  const finalGroup = finalIds.length
    ? '<div class="debug-tech-group"><h3>🌌 Final project</h3>' +
        finalIds.map(function (id) { return debugTechDetailsHTML(TECHS[id]); }).join("") + "</div>"
    : "";
  return debugSectionHTML("content-techs", "Research costs",
    "Every project's price and numeric payload. Unlocking text on the tech cards is generated at boot; the values here are what the rules read.",
    groups + finalGroup || '<p class="debug-empty">No technologies.</p>');
}

function debugContentHTML(live) {
  return [
    debugContentEntriesSection("buildings", "Colony buildings",
      "Slot buildings: build cost, energy upkeep, workers and output. Facility levels live in the economy tab.", false),
    debugContentEntriesSection("structures", "Orbital structures",
      "Spaceports, gates, radars, trading centers and strongholds. Strongholds also carry attack, hull and range.", false),
    debugContentEntriesSection("anomalies", "Survey sites",
      "Weights, study turns and reward bundles. Survey density lives in the galaxy tab.", false),
    debugContentEntriesSection("ethics", "Origins / ethics",
      "The three starting origins: output multipliers, flat influence and option locks. The start-screen card copy is generated at boot, so edit rules here rather than expecting the blurb text to change.", false),
    debugTechsSection()
  ].join("");
}

/* ---------- input / click handling ---------- */

function readDebugSpec(element) {
  return {
    source: element.getAttribute("data-debug-source") || "config",
    id: element.getAttribute("data-debug-id") || null,
    path: element.getAttribute("data-debug-path") || ""
  };
}

function writeDebugNumber(element, value, clampToMeta) {
  const spec = readDebugSpec(element);
  const target = debugSourceTarget(spec.source, spec.id);
  if (!target || !spec.path) return;
  const meta = getDebugFieldMeta(spec.source, spec.path);
  const bounds = debugNumberBounds(meta, getRulePathValue(target, spec.path));
  let next = Number(value);
  if (!isFinite(next)) return;
  if (clampToMeta) next = clamp(next, bounds.min, bounds.max);
  if (spec.source === "config" && spec.path === "galaxy.seed") {
    next = Math.floor(Math.abs(next)) >>> 0;
  }
  if (!setRulePathValue(target, spec.path, next)) return;
  if (clampToMeta) element.value = String(next);
  refreshDebugReadouts();
}

function writeDebugText(element, value) {
  const spec = readDebugSpec(element);
  const target = debugSourceTarget(spec.source, spec.id);
  if (!target || !spec.path) return;
  if (!setRulePathValue(target, spec.path, String(value))) return;
  refreshDebugReadouts();
}

function handleDebugScreenInput(event) {
  const input = event.target;
  if (!input || !input.getAttribute) return;

  if (input.getAttribute("data-debug-sample-population") !== null) {
    const raw = input.value;
    if (raw === "") return;
    const value = Number(raw);
    if (!isFinite(value)) return;
    debugSamplePopulation = Math.max(0, Math.floor(value));
    const preview = byId("debug-econ-live");
    if (preview) preview.innerHTML = debugEconomyLiveHTML();
    return;
  }

  const eventField = input.getAttribute("data-debug-event-field");
  if (eventField) {
    const id = input.getAttribute("data-debug-event-id");
    const def = getEventById(id);
    if (!def) return;
    const raw = input.value;
    if (raw === "") {
      if (eventField === "minTurn") delete def.minTurn;
      else if (eventField === "maxTurn") delete def.maxTurn;
      refreshEventReadouts();
      return;
    }
    const value = Number(raw);
    if (!isFinite(value)) return;
    def[eventField] = Math.max(0, Math.round(value));
    refreshEventReadouts();
    return;
  }

  const categoryWeight = input.getAttribute("data-debug-category-weight");
  if (categoryWeight) {
    const category = EVENT_CATEGORIES[categoryWeight];
    if (!category) return;
    const raw = input.value;
    if (raw === "") return;
    const value = Number(raw);
    if (!isFinite(value)) return;
    category.weightMult = Math.max(0, value);
    refreshEventReadouts();
    return;
  }

  const unrestWeight = input.getAttribute("data-debug-unrest-weight");
  if (unrestWeight) {
    const def = (typeof UNREST_EVENTS !== "undefined" ? UNREST_EVENTS : []).find(function (entry) { return entry.id === unrestWeight; });
    if (!def) return;
    const raw = input.value;
    if (raw === "") return;
    const value = Number(raw);
    if (!isFinite(value)) return;
    def.weight = Math.max(0, Math.round(value));
    refreshEventReadouts();
    return;
  }

  const type = input.getAttribute("data-debug-type");
  if (type === "number") {
    if (input.value === "") return;
    writeDebugNumber(input, input.value, false);
  } else if (type === "text") {
    writeDebugText(input, input.value);
  }
}

function handleDebugScreenChange(event) {
  const input = event.target;
  if (!input || !input.getAttribute) return;

  const eventCategory = input.getAttribute("data-debug-event-category");
  if (eventCategory) {
    addEventToBucket(input.value, eventCategory);
    refreshDebugBody();
    return;
  }

  const type = input.getAttribute("data-debug-type");
  if (type === "number") {
    writeDebugNumber(input, input.value, true);
    return;
  }
  if (type === "text") {
    writeDebugText(input, input.value);
    return;
  }
  if (type === "select") {
    const spec = readDebugSpec(input);
    const target = debugSourceTarget(spec.source, spec.id);
    if (!target) return;
    if (!setRulePathValue(target, spec.path, input.value)) return;
    refreshDebugBody();
    return;
  }

  /* Event min/max turn fields are clamped on blur. */
  const eventField = input.getAttribute("data-debug-event-field");
  if (eventField) {
    const def = getEventById(input.getAttribute("data-debug-event-id"));
    if (!def) return;
    if (input.value === "") {
      if (eventField === "minTurn") delete def.minTurn;
      else if (eventField === "maxTurn") delete def.maxTurn;
      refreshDebugBody();
      return;
    }
    const value = Math.max(0, Math.round(Number(input.value) || 0));
    def[eventField] = value;
    input.value = String(value);
    refreshDebugBody();
    return;
  }

  const categoryWeight = input.getAttribute("data-debug-category-weight");
  if (categoryWeight) {
    const category = EVENT_CATEGORIES[categoryWeight];
    if (!category) return;
    const value = Math.max(0, Number(input.value) || 0);
    category.weightMult = value;
    input.value = String(value);
    refreshDebugBody();
    return;
  }

  const unrestWeight = input.getAttribute("data-debug-unrest-weight");
  if (unrestWeight) {
    const def = (typeof UNREST_EVENTS !== "undefined" ? UNREST_EVENTS : []).find(function (entry) { return entry.id === unrestWeight; });
    if (!def) return;
    const value = Math.max(0, Math.round(Number(input.value) || 0));
    def.weight = value;
    input.value = String(value);
    refreshDebugBody();
  }
}

function addDebugListItem(button) {
  const spec = readDebugSpec(button);
  const target = debugSourceTarget(spec.source, spec.id);
  if (!target) return;
  const list = getRulePathValue(target, spec.path);
  if (!Array.isArray(list)) return;
  const meta = getDebugFieldMeta(spec.source, spec.path);
  let template;
  if (typeof meta.template === "function") {
    template = meta.template(list.slice());
  } else if (Object.prototype.hasOwnProperty.call(meta, "template")) {
    template = cloneRuleValue(meta.template);
  } else if (list.length) {
    template = cloneRuleValue(list[list.length - 1]);
    if (isRuleObject(template)) {
      if (typeof template.level === "number") template.level += 1;
      if (typeof template.id === "string") template.id = template.id + "-copy";
    }
  } else {
    template = 0;
  }
  list.push(template);
  refreshDebugBody();
}

function removeDebugListItem(button) {
  const spec = readDebugSpec(button);
  const target = debugSourceTarget(spec.source, spec.id);
  if (!target) return;
  const list = getRulePathValue(target, spec.path);
  if (!Array.isArray(list)) return;
  const index = Number(button.getAttribute("data-debug-list-index"));
  if (!isFinite(index) || index < 0 || index >= list.length) return;
  const meta = getDebugFieldMeta(spec.source, spec.path);
  const minItems = typeof meta.minItems === "number" ? meta.minItems : 0;
  if (list.length <= minItems) {
    toast("This list keeps at least " + minItems + (minItems === 1 ? " entry." : " entries."));
    return;
  }
  list.splice(index, 1);
  refreshDebugBody();
}

function toggleDebugRule(button) {
  const spec = readDebugSpec(button);
  const target = debugSourceTarget(spec.source, spec.id);
  if (!target) return;
  const current = getRulePathValue(target, spec.path);
  if (!setRulePathValue(target, spec.path, !current)) return;
  refreshDebugBody();
}

function handleDebugScreenClick(event) {
  const target = event.target;
  if (!target || !target.closest) return;

  const tabButton = target.closest("[data-debug-tab]");
  if (tabButton) {
    setDebugTab(tabButton.getAttribute("data-debug-tab"));
    return;
  }
  const addButton = target.closest("[data-debug-list-add]");
  if (addButton) {
    addDebugListItem(addButton);
    return;
  }
  const removeButton = target.closest("[data-debug-list-remove]");
  if (removeButton) {
    removeDebugListItem(removeButton);
    return;
  }
  const randomSeed = target.closest("[data-debug-random-seed]");
  if (randomSeed) {
    CONFIG.galaxy.seed = Math.floor(Math.random() * 0xffffffff) >>> 0;
    if (els.seedInput) els.seedInput.value = String(CONFIG.galaxy.seed);
    refreshDebugBody();
    return;
  }
  const eventEnabled = target.closest("[data-debug-event-enabled]");
  if (eventEnabled) {
    const def = getEventById(eventEnabled.getAttribute("data-debug-event-enabled"));
    if (def) def.enabled = def.enabled === false;
    refreshDebugBody();
    return;
  }
  const eventBucket = target.closest("[data-debug-event-bucket]");
  if (eventBucket) {
    const id = eventBucket.getAttribute("data-debug-event-bucket");
    const bucket = getEventBucketFor(id);
    const def = getEventById(id);
    if (!def) return;
    if (bucket) removeEventFromBucket(bucket, id);
    else addEventToBucket(EVENT_CATEGORIES[def.category] ? def.category : EVENT_CATEGORY_ORDER[0], id);
    refreshDebugBody();
    return;
  }
  const categoryEnabled = target.closest("[data-debug-category-enabled]");
  if (categoryEnabled) {
    const category = EVENT_CATEGORIES[categoryEnabled.getAttribute("data-debug-category-enabled")];
    if (category) category.enabled = category.enabled === false;
    refreshDebugBody();
    return;
  }
  const unrestEnabled = target.closest("[data-debug-unrest-enabled]");
  if (unrestEnabled) {
    const def = (typeof UNREST_EVENTS !== "undefined" ? UNREST_EVENTS : []).find(function (entry) {
      return entry.id === unrestEnabled.getAttribute("data-debug-unrest-enabled");
    });
    if (def) def.enabled = def.enabled === false;
    refreshDebugBody();
    return;
  }
  const toggle = target.closest("[data-debug-toggle]");
  if (toggle) {
    toggleDebugRule(toggle);
  }
}
