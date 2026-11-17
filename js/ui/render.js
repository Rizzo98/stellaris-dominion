/* ============================================================
   RENDER — one entry point that repaints every view
   ============================================================ */

function renderAll() {
  renderTopbar();
  renderGalaxy();
  renderMap();
  renderTechView();
  renderEmpireView();
  renderNav();
  if (state.ui.selectedHex) renderPlanet();
}
