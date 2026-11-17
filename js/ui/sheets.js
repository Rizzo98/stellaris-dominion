/* ============================================================
   BOTTOM SHEET — open/close state, drag-to-dismiss and the population menu
   ============================================================ */

let sheetDrag = null;

function showSheet(options) {
  hideToast();
  state.ui.sheet = {
    kind: options.kind,
    systemId: options.systemId || null,
    slotIndex: typeof options.slotIndex === "number" ? options.slotIndex : null,
    resource: options.resource || null
  };
  els.sheet.dataset.kind = options.kind || "default";
  els.sheetKicker.textContent = options.kicker || "DETAILS";
  els.sheetTitle.textContent = options.title || "Details";
  els.sheetBody.innerHTML = options.body || "";
  els.sheetBody.scrollTop = 0;
  els.sheet.style.transform = "";
  els.sheet.style.opacity = "1";
  els.sheet.classList.remove("dragging");
  els.sheetLayer.classList.remove("hidden");
  els.sheetLayer.setAttribute("aria-hidden", "false");
}

function closeSheet() {
  if (!state.ui.sheet) {
    els.sheetLayer.classList.add("hidden");
    els.sheetLayer.setAttribute("aria-hidden", "true");
    return;
  }
  state.ui.sheet = null;
  dragSheetCleanup();
  els.sheetLayer.classList.add("hidden");
  els.sheetLayer.setAttribute("aria-hidden", "true");
  els.sheetBody.innerHTML = "";
  delete els.sheet.dataset.kind;
  els.sheet.style.transform = "";
  els.sheet.style.opacity = "1";
  els.sheet.classList.remove("dragging");
}

function openResourceSheet(type) {
  if (state.phase !== "actions") return;
  if (type === "stability") {
    showSheet({
      kind: "resource",
      resource: "stability",
      kicker: "STABILITY TELEMETRY",
      title: "Stability",
      body: stabilitySheetHTML()
    });
    return;
  }
  if (RESOURCE_KEYS.indexOf(type) === -1) return;
  const meta = RESOURCE_META[type];
  showSheet({
    kind: "resource",
    resource: type,
    kicker: "RESOURCE FLOW",
    title: meta.name,
    body: resourceSheetHTML(type)
  });
}

function openBuildSheet(systemId, slotIndex) {
  if (state.phase !== "actions") return;
  const system = getSystem(systemId);
  if (!system || !system.colonized) return;
  if (!isSlotBuildable(system, slotIndex)) return;
  showSheet({
    kind: "build",
    systemId: system.id,
    slotIndex: slotIndex,
    kicker: system.name.toUpperCase() + " · SLOT " + (slotIndex + 1),
    title: "Construct",
    body: buildSheetHTML(system, slotIndex)
  });
}

function openEventDeckSheet() {
  if (state.phase === "start" || state.phase === "ended") return;
  showSheet({
    kind: "deck",
    kicker: "EVENT DECK · PACED",
    title: "Encounter buckets",
    body: eventDeckSheetHTML()
  });
}

/* The run archive: browser quick-save plus portable JSON save files. The
   same sheet is the only load entry once a run is already open. */
function openSaveSheet() {
  if (state.phase !== "actions") {
    toast("Saving is available between actions.");
    return;
  }
  showSheet({
    kind: "save",
    kicker: "RUN ARCHIVE · TURN " + state.turn,
    title: "Save & load",
    body: saveSheetHTML()
  });
}

function openRivalSheet(empireId) {
  if (state.phase === "start" || state.phase === "ended") return;
  const empire = getEmpire(empireId);
  if (!empire) return;
  showSheet({
    kind: "rival",
    kicker: "RIVAL POWER · RING " + empire.ring,
    title: empire.name,
    body: rivalSheetHTML(empire)
  });
}

function openPlanetDetails(systemId) {
  if (state.phase !== "actions") return;
  const system = getSystem(systemId);
  if (!system || !system.colonized) return;
  showSheet({
    kind: "details",
    systemId: system.id,
    kicker: "COLONY TELEMETRY",
    title: system.name + " details",
    body: planetDetailsHTML(system)
  });
}

/* The population menu. Opened by the population card on a colony; its two
   upkeep steppers live inside the sheet body. */
function openPopulationSheet(systemId) {
  if (state.phase !== "actions") return;
  const system = getSystem(systemId);
  if (!system || !system.colonized) return;
  showSheet({
    kind: "population",
    systemId: system.id,
    kicker: "COLONY POPULATION · " + system.name.toUpperCase(),
    title: "Population",
    body: populationSheetHTML(system)
  });
}

/* A stepper press changes the colony policy, so the open sheet has to be
   repainted too. The scroll position and the pressed stepper's focus are
   preserved; a stepper that reaches its bound hands focus to its partner. */
function refreshPopulationSheet() {
  if (!state.ui.sheet || state.ui.sheet.kind !== "population") return;
  const system = getSystem(state.ui.sheet.systemId);
  if (!system || !system.colonized) {
    closeSheet();
    return;
  }
  const active = typeof document !== "undefined" ? document.activeElement : null;
  const focusKey = active && active.getAttribute ? active.getAttribute("data-pop-upkeep") : null;
  const scrollTop = els.sheetBody.scrollTop;
  els.sheetBody.innerHTML = populationSheetHTML(system);
  els.sheetBody.scrollTop = scrollTop;
  if (!focusKey || typeof els.sheetBody.querySelector !== "function") return;
  const axis = focusKey.split(":")[0];
  let next = els.sheetBody.querySelector('[data-pop-upkeep="' + focusKey + '"]');
  if (!next || next.disabled) {
    next = els.sheetBody.querySelector('[data-pop-upkeep="' + axis + ':-1"]');
  }
  if (next && !next.disabled && typeof next.focus === "function") {
    try {
      next.focus({ preventScroll: true });
    } catch (error) {
      next.focus();
    }
  }
}

function dragSheetCleanup() {
  sheetDrag = null;
  if (els.sheet) {
    els.sheet.classList.remove("dragging");
  }
}

function beginSheetDrag(event) {
  if (!state.ui.sheet) return;
  if (event.target.closest && event.target.closest("#sheet-close")) return;
  if (event.pointerType === "mouse" && event.button !== 0) return;
  sheetDrag = {
    pointerId: event.pointerId,
    startY: event.clientY,
    dy: 0
  };
  els.sheet.classList.add("dragging");
  try {
    event.currentTarget.setPointerCapture(event.pointerId);
  } catch (err) {
    // Pointer capture is a convenience, not a requirement.
  }
}

function moveSheetDrag(event) {
  if (!sheetDrag || event.pointerId !== sheetDrag.pointerId) return;
  const dy = Math.max(0, event.clientY - sheetDrag.startY);
  sheetDrag.dy = dy;
  els.sheet.style.transform = "translateY(" + dy + "px)";
  els.sheet.style.opacity = String(clamp(1 - dy / 520, 0.45, 1));
}

function endSheetDrag(event) {
  if (!sheetDrag || event.pointerId !== sheetDrag.pointerId) return;
  const dy = sheetDrag.dy;
  sheetDrag = null;
  els.sheet.classList.remove("dragging");
  if (dy > 78) {
    closeSheet();
  } else {
    els.sheet.style.transform = "";
    els.sheet.style.opacity = "1";
  }
}