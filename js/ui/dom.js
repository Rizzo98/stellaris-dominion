/* ============================================================
   DOM CACHE — nodes resolved once at boot
   Shared render helpers used by every view builder.
   ============================================================ */

function $(selector) {
  return document.querySelector(selector);
}

function byId(id) {
  return document.getElementById(id);
}

const els = {
  topbar: byId("topbar"),
  main: byId("main"),
  turnLabel: byId("turn-label"),
  eventChip: byId("event-chip"),
  eventChipText: byId("event-chip-text"),
  valEnergy: byId("val-energy"),
  valMinerals: byId("val-minerals"),
  valResearch: byId("val-research"),
  valInfluence: byId("val-influence"),
  deltaEnergy: byId("delta-energy"),
  deltaMinerals: byId("delta-minerals"),
  deltaResearch: byId("delta-research"),
  deltaInfluence: byId("delta-influence"),
  stabilityBtn: byId("stability-btn"),
  stabilityValue: byId("stability-value"),
  stabilityFill: byId("stability-fill"),
  stabilityMode: byId("stability-mode"),
  ledgerSector: byId("ledger-sector"),
  ledgerGlobal: byId("ledger-global"),
  threatChip: byId("threat-chip"),
  threatText: byId("threat-text"),
  coloniesCount: byId("colonies-count"),
  coloniesLabel: byId("colonies-label"),
  galaxyPanel: byId("galaxy-panel"),
  galaxyStage: byId("galaxy-stage"),
  galaxySpace: byId("galaxy-space"),
  galaxyGraph: byId("galaxy-graph"),
  galaxySectorCount: byId("galaxy-sector-count"),
  galaxySeed: byId("galaxy-seed"),
  galaxyLedger: byId("galaxy-ledger"),
  galaxyViewBtn: byId("galaxy-view-btn"),
  galaxyLayerMenu: byId("galaxy-layer-menu"),
  galaxyLayerTrade: byId("galaxy-layer-trade"),
  galaxyLayerTradeSub: byId("galaxy-layer-trade-sub"),
  galaxyLayerScope: byId("galaxy-layer-scope"),
  galaxyTradePanel: byId("galaxy-trade-panel"),
  galaxyTradeLegend: byId("galaxy-trade-legend"),
  sectorPanel: byId("sector-panel"),
  sectorBack: byId("sector-back"),
  sectorViewBtn: byId("sector-view-btn"),
  sectorLayerMenu: byId("sector-layer-menu"),
  mapLayerCharted: byId("map-layer-charted"),
  mapLayerChartedSub: byId("map-layer-charted-sub"),
  mapLayerLanding: byId("map-layer-landing"),
  mapLayerLandingSub: byId("map-layer-landing-sub"),
  mapLayerPatrol: byId("map-layer-patrol"),
  mapLayerPatrolSub: byId("map-layer-patrol-sub"),
  mapLayerScope: byId("map-layer-scope"),
  chartedViewLegend: byId("charted-view-legend"),
  landingLegend: byId("landing-legend"),
  patrolLegend: byId("patrol-legend"),
  sectorBreadcrumb: byId("sector-breadcrumb"),
  sectorTitle: byId("sector-title"),
  sectorKicker: byId("sector-kicker"),
  sectorBadge: byId("sector-badge"),
  sectorIntel: byId("sector-intel"),
  sectorCharted: byId("sector-charted"),
  sectorMap: byId("sector-map"),
  sectorStatCharted: byId("sector-stat-charted"),
  sectorStatColonies: byId("sector-stat-colonies"),
  sectorStatSites: byId("sector-stat-sites"),
  sectorStatFleets: byId("sector-stat-fleets"),
  sectorStatPower: byId("sector-stat-power"),
  sectorStatThreat: byId("sector-stat-threat"),
  sectorStatEnergy: byId("sector-stat-energy"),
  sectorStatEnergyNet: byId("sector-stat-energy-net"),
  sectorStatMinerals: byId("sector-stat-minerals"),
  sectorStatMineralsNet: byId("sector-stat-minerals-net"),
  moveBanner: byId("move-banner"),
  moveBannerText: byId("move-banner-text"),
  moveBannerSub: byId("move-banner-sub"),
  moveConfirm: byId("move-confirm"),
  moveCancel: byId("move-cancel"),
  researchBanner: byId("research-banner"),
  techList: byId("tech-list"),
  empireTotals: byId("empire-totals"),
  empireMeta: byId("empire-meta"),
  empireMilitary: byId("empire-military"),
  empireRivalList: byId("empire-rival-list"),
  empireSectorLedger: byId("empire-sector-ledger"),
  empireMilitaryLog: byId("empire-military-log"),
  empireList: byId("empire-list"),
  empireColonyBadge: byId("empire-colony-badge"),
  endTurn: byId("end-turn"),
  endTurnLabel: byId("end-turn-label"),
  planetScreen: byId("planet-screen"),
  planetKicker: byId("planet-kicker"),
  planetHeaderName: byId("planet-header-name"),
  planetDetails: byId("planet-details"),
  planetScroll: byId("planet-scroll"),
  planetContent: byId("planet-content"),
  sectorTabs: byId("sector-tabs"),
  fleetTabCount: byId("fleet-tab-count"),
  sheetLayer: byId("sheet-layer"),
  sheet: byId("sheet"),
  sheetKicker: byId("sheet-kicker"),
  sheetTitle: byId("sheet-title"),
  sheetBody: byId("sheet-body"),
  sheetClose: byId("sheet-close"),
  sheetBackdrop: byId("sheet-backdrop"),
  sheetGrab: byId("sheet-grab"),
  eventLayer: byId("event-layer"),
  eventTurn: byId("event-turn"),
  eventCard: byId("event-card"),
  eventEmoji: byId("event-emoji"),
  eventCategory: byId("event-category"),
  eventKicker: byId("event-kicker"),
  eventTitle: byId("event-title"),
  eventCopy: byId("event-copy"),
  swipeChoices: byId("swipe-choices"),
  swipeInstruction: byId("swipe-instruction"),
  previewLeft: byId("preview-left"),
  previewRight: byId("preview-right"),
  eventButtons: byId("event-buttons"),
  eventInstruction: byId("event-instruction"),
  startScreen: byId("start-screen"),
  homePage: byId("home-page"),
  setupPage: byId("setup-page"),
  newGameStart: byId("new-game-start"),
  setupBack: byId("setup-back"),
  ethicsList: byId("ethics-list"),
  seedInput: byId("seed-input"),
  seedReroll: byId("seed-reroll"),
  openDebugSetup: byId("open-debug-from-setup"),
  debugScreen: byId("debug-screen"),
  debugBack: byId("debug-back"),
  debugDone: byId("debug-done"),
  debugReset: byId("debug-reset"),
  debugKicker: byId("debug-kicker"),
  debugContext: byId("debug-context"),
  debugTabs: byId("debug-tabs"),
  debugBlurb: byId("debug-blurb"),
  debugScroll: byId("debug-scroll"),
  debugBody: byId("debug-body"),
  endScreen: byId("end-screen"),
  endGlyph: byId("end-glyph"),
  endKicker: byId("end-kicker"),
  endTitle: byId("end-title"),
  endCopy: byId("end-copy"),
  endTurns: byId("end-turns"),
  endColonies: byId("end-colonies"),
  endTechs: byId("end-techs"),
  endStability: byId("end-stability"),
  endBattles: byId("end-battles"),
  endKills: byId("end-kills"),
  playAgain: byId("play-again"),
  saveChip: byId("save-chip"),
  saveResume: byId("save-resume"),
  saveResumeMeta: byId("save-resume-meta"),
  saveResumeSub: byId("save-resume-sub"),
  continueSave: byId("continue-save"),
  loadSaveStart: byId("load-save-file-start"),
  saveFileInput: byId("save-file-input"),
  toast: byId("toast")
};

function signedClass(value) {
  if (value > 0) return "text-good";
  if (value < 0) return "text-bad";
  return "";
}

function deltaClass(value) {
  if (value > 0) return "good";
  if (value < 0) return "bad";
  return "";
}

function renderEffectPills(effects) {
  const order = ["energy", "minerals", "research", "influence", "stability", "population"];
  const parts = [];
  order.forEach(function (key) {
    const value = effects[key];
    if (typeof value !== "number" || value === 0) return;
    const meta = RESOURCE_META[key];
    const cls = value > 0 ? "good" : "bad";
    parts.push(
      '<span class="effect-pill ' + cls + '" aria-label="' + meta.name + " " + formatSigned(value) + '">' +
        '<span aria-hidden="true">' + meta.icon + "</span>" + formatSigned(value) +
      "</span>"
    );
  });
  return parts.join("");
}

function breakdownRow(label, amount, options) {
  const opts = options || {};
  const sub = opts.sub ? '<span class="breakdown-sub">' + opts.sub + "</span>" : "";
  const extraClass = opts.className ? " " + opts.className : "";
  return (
    '<div class="breakdown-row' + extraClass + '">' +
      '<span class="breakdown-label">' + label + sub + "</span>" +
      '<span class="breakdown-amount ' + (opts.amountClass || "") + '">' + amount + "</span>" +
    "</div>"
  );
}

function signedBreakdownRow(label, amount, sub) {
  return breakdownRow(
    label,
    formatSigned(amount),
    { sub: sub || "", amountClass: amount > 0 ? "text-good" : amount < 0 ? "text-bad" : "" }
  );
}