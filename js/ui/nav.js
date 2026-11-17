/* ============================================================
   NAV — tab switching and view visibility
   ============================================================ */

function renderNav() {
  document.querySelectorAll(".nav-tab[data-tab]").forEach(function (button) {
    button.classList.toggle("active", button.getAttribute("data-tab") === state.ui.activeTab);
    button.setAttribute("aria-current", button.getAttribute("data-tab") === state.ui.activeTab ? "page" : "false");
  });

  ["map", "tech", "empire"].forEach(function (tab) {
    const view = byId("view-" + tab);
    if (view) view.classList.toggle("hidden", state.ui.activeTab !== tab);
  });

  const canEnd = state.phase === "actions";
  els.endTurn.disabled = !canEnd;
  if (state.phase === "actions") {
    els.endTurnLabel.textContent = "END TURN";
  } else if (state.phase === "event") {
    els.endTurnLabel.textContent = "EVENT";
  } else if (state.phase === "transition") {
    els.endTurnLabel.textContent = "WAIT";
  } else {
    els.endTurnLabel.textContent = "ENDED";
  }
}

function changeTab(tab) {
  if (state.phase !== "actions") return;
  if (["map", "tech", "empire"].indexOf(tab) === -1) return;
  if (state.ui.move && tab !== "map") {
    state.ui.move = null;
    renderMap();
  }
  state.ui.activeTab = tab;
  els.main.scrollTop = 0;
  renderNav();
  if (tab === "map" && state.ui.mapMode === "galaxy") scrollGalaxyToCurrentSector();
}
