/* ============================================================
   MAIN — event wiring and boot
   Classic scripts share one global scope. This file loads last, so every
   render and action function above is available when bindEvents() runs.
   ============================================================ */

function bindEvents() {
  // Start: one tap chooses an ethic.
  els.ethicsList.addEventListener("click", function (event) {
    const button = event.target.closest("[data-ethic]");
    if (!button) return;
    startGame(button.getAttribute("data-ethic"));
  });
  els.seedReroll.addEventListener("click", randomizeSeed);
  if (els.eventChip) els.eventChip.addEventListener("click", openEventDeckSheet);

  // Menu → new-game setup → optional debug sandbox.
  if (els.newGameStart) els.newGameStart.addEventListener("click", showStartSetup);
  if (els.setupBack) els.setupBack.addEventListener("click", showStartHome);
  if (els.openDebugSetup) els.openDebugSetup.addEventListener("click", openDebugScreen);
  if (els.debugBack) els.debugBack.addEventListener("click", closeDebugScreen);
  if (els.debugDone) els.debugDone.addEventListener("click", closeDebugScreen);
  if (els.debugReset) els.debugReset.addEventListener("click", handleDebugReset);
  if (els.debugScreen) {
    els.debugScreen.addEventListener("click", handleDebugScreenClick);
    els.debugScreen.addEventListener("input", handleDebugScreenInput);
    els.debugScreen.addEventListener("change", handleDebugScreenChange);
  }

  // Save / load: topbar chip, start-screen continue and the shared file picker.
  if (els.saveChip) els.saveChip.addEventListener("click", openSaveSheet);
  if (els.continueSave) els.continueSave.addEventListener("click", continueSavedGame);
  if (els.loadSaveStart) els.loadSaveStart.addEventListener("click", requestSaveFileLoad);
  if (els.saveFileInput) els.saveFileInput.addEventListener("change", handleSaveFileSelection);

  // Bottom tabs + end turn.
  document.querySelectorAll(".nav-tab[data-tab]").forEach(function (button) {
    button.addEventListener("click", function () {
      changeTab(button.getAttribute("data-tab"));
    });
  });
  els.endTurn.addEventListener("click", endTurn);

  // Resource / stability sheets.
  els.topbar.addEventListener("click", function (event) {
    const button = event.target.closest("[data-resource]");
    if (!button) return;
    openResourceSheet(button.getAttribute("data-resource"));
  });
  if (els.threatChip) {
    els.threatChip.addEventListener("click", function () {
      changeTab("empire");
    });
  }

  // Galaxy graph: every node is a sector.
  els.galaxyGraph.addEventListener("click", function (event) {
    const node = event.target.closest("[data-sector]");
    if (!node) return;
    openSectorView(node.getAttribute("data-sector"));
  });
  els.galaxyGraph.addEventListener("keydown", function (event) {
    if (event.key !== "Enter" && event.key !== " ") return;
    const node = event.target.closest("[data-sector]");
    if (!node) return;
    event.preventDefault();
    openSectorView(node.getAttribute("data-sector"));
  });
  els.sectorBack.addEventListener("click", openGalaxyView);

  // Sector map layers: VIEW opens an anchored layer menu.
  if (els.sectorViewBtn) {
    els.sectorViewBtn.addEventListener("click", toggleSectorLayerMenu);
  }
  if (els.sectorLayerMenu) {
    els.sectorLayerMenu.addEventListener("click", function (event) {
      const item = event.target.closest("[data-map-layer]");
      if (!item) return;
      toggleMapLayer(item.getAttribute("data-map-layer"));
    });
  }

  // Galaxy layers: the same VIEW control opens the trade view switch.
  if (els.galaxyViewBtn) {
    els.galaxyViewBtn.addEventListener("click", toggleGalaxyLayerMenu);
  }
  if (els.galaxyLayerMenu) {
    els.galaxyLayerMenu.addEventListener("click", function (event) {
      const item = event.target.closest("[data-galaxy-layer]");
      if (!item) return;
      toggleGalaxyLayer(item.getAttribute("data-galaxy-layer"));
    });
  }
  document.addEventListener("click", function (event) {
    if (els.sectorLayerMenu && !els.sectorLayerMenu.classList.contains("hidden")) {
      if (!event.target.closest("#sector-view-wrap")) closeSectorLayerMenu();
    }
    if (els.galaxyLayerMenu && !els.galaxyLayerMenu.classList.contains("hidden")) {
      if (!event.target.closest("#galaxy-view-wrap")) closeGalaxyLayerMenu();
    }
  });

  // Ledger rows on the galaxy trade panel and the empire tab open a sector.
  function handleSectorRowClick(event) {
    const button = event.target.closest("[data-open-sector]");
    if (!button) return;
    openSectorView(button.getAttribute("data-open-sector"));
  }
  if (els.galaxyTradePanel) els.galaxyTradePanel.addEventListener("click", handleSectorRowClick);
  if (els.empireSectorLedger) els.empireSectorLedger.addEventListener("click", handleSectorRowClick);

  // Sector hex map: delegated to the SVG.
  els.sectorMap.addEventListener("click", function (event) {
    const battle = event.target.closest("[data-battle]");
    if (battle) {
      const battlePos = parseHexKey(battle.getAttribute("data-battle"));
      openBattleSheet(battlePos.row, battlePos.col);
      return;
    }
    const group = event.target.closest("[data-hex]");
    if (!group) return;
    const pos = parseHexKey(group.getAttribute("data-hex"));
    handleHexTap(pos.row, pos.col);
  });
  els.sectorMap.addEventListener("keydown", function (event) {
    if (event.key !== "Enter" && event.key !== " ") return;
    const battle = event.target.closest("[data-battle]");
    if (battle) {
      event.preventDefault();
      const battlePos = parseHexKey(battle.getAttribute("data-battle"));
      openBattleSheet(battlePos.row, battlePos.col);
      return;
    }
    const group = event.target.closest("[data-hex]");
    if (!group) return;
    event.preventDefault();
    const pos = parseHexKey(group.getAttribute("data-hex"));
    handleHexTap(pos.row, pos.col);
  });
  /* Long press a hex to send one of its ships: a single ship starts the route
     order at once, several open the picker, and the map then takes the
     destination. Returning false leaves the release click to the tap handler,
     so a pending move still picks its destination from a long press. */
  bindLongPress(els.sectorMap, "[data-hex]", function (group) {
    const pos = parseHexKey(group.getAttribute("data-hex"));
    return handleHexLongPress(pos.row, pos.col);
  });

  els.moveCancel.addEventListener("click", function () { cancelFleetMove(true); });
  els.moveConfirm.addEventListener("click", confirmFleetMove);

  // Tech cards and the category switch above them.
  els.techList.addEventListener("click", function (event) {
    const categoryButton = event.target.closest("[data-tech-category]");
    if (categoryButton) {
      setActiveTechCategory(categoryButton.getAttribute("data-tech-category"));
      return;
    }
    const button = event.target.closest("[data-tech]");
    if (!button) return;
    startResearch(button.getAttribute("data-tech"));
  });

  // Empire tab: rival dossiers + planet list.
  function handleEmpireClick(event) {
    const rivalButton = event.target.closest("[data-rival-sheet]");
    if (rivalButton) {
      openRivalSheet(rivalButton.getAttribute("data-rival-sheet"));
      return;
    }
    const button = event.target.closest("[data-open-system]");
    if (!button) return;
    openPlanet(button.getAttribute("data-open-system"));
  }
  els.empireList.addEventListener("click", handleEmpireClick);
  if (els.empireRivalList) els.empireRivalList.addEventListener("click", handleEmpireClick);

  // Hex tabs and planet/fleet actions.
  byId("planet-back").addEventListener("click", closePlanet);
  els.sectorTabs.addEventListener("click", function (event) {
    const button = event.target.closest("[data-sector-tab]");
    if (!button) return;
    setSectorTab(button.getAttribute("data-sector-tab"));
  });
  els.planetDetails.addEventListener("click", function () {
    if (state.ui.selectedSystem) openPlanetDetails(state.ui.selectedSystem);
  });
  els.planetContent.addEventListener("click", function (event) {
    const rivalButton = event.target.closest("[data-rival-sheet]");
    if (rivalButton) {
      openRivalSheet(rivalButton.getAttribute("data-rival-sheet"));
      return;
    }
    const populationCard = event.target.closest("[data-population-menu]");
    if (populationCard) {
      openPopulationSheet(populationCard.getAttribute("data-population-menu"));
      return;
    }
    if (event.target.closest("[data-study-site]")) {
      startStudyAtSelectedHex();
      return;
    }
    if (event.target.closest("[data-cancel-study]")) {
      cancelStudyAtSelectedHex();
      return;
    }
    if (event.target.closest("[data-spaceport-toggle]")) {
      toggleSpaceportMenu();
      return;
    }
    const battleButton = event.target.closest("[data-open-battle]");
    if (battleButton) {
      const battlePos = parseHexKey(battleButton.getAttribute("data-open-battle"));
      openBattleSheet(battlePos.row, battlePos.col);
      return;
    }
    const shipButton = event.target.closest("[data-ship-id]");
    if (shipButton) {
      toggleShipSelection(shipButton.getAttribute("data-ship-id"));
      return;
    }
    if (event.target.closest("[data-fleet-select-all]")) {
      toggleAllShips();
      return;
    }
    if (event.target.closest("[data-fleet-move]")) {
      beginFleetMove();
      return;
    }
    if (event.target.closest("[data-fleet-patrol]")) {
      setSelectedShipsPatrol(true);
      return;
    }
    if (event.target.closest("[data-fleet-stand-down]")) {
      setSelectedShipsPatrol(false);
      return;
    }
    const jumpButton = event.target.closest("[data-jump-sector]");
    if (jumpButton) {
      if (!jumpButton.disabled) jumpFleetToSector(jumpButton.getAttribute("data-jump-sector"));
      return;
    }
    const structureButton = event.target.closest("[data-build-structure]");
    if (structureButton) {
      if (!structureButton.disabled) buildStructure(structureButton.getAttribute("data-build-structure"));
      return;
    }
    const buildShipButton = event.target.closest("[data-build-ship]");
    if (buildShipButton) {
      if (!buildShipButton.disabled) buildShipAtSpaceport(buildShipButton.getAttribute("data-build-ship"));
      return;
    }
    const tradeAmount = event.target.closest("[data-trade-amount]");
    if (tradeAmount) {
      if (tradeAmount.disabled) return;
      const spec = String(tradeAmount.getAttribute("data-trade-amount") || "").split(":");
      const sector = getCurrentSector();
      if (sector && state.ui.selectedHex && spec.length === 3) {
        adjustTradingCenterAmountAt(sector.id, state.ui.selectedHex, spec[1], Number(spec[2]), Number(spec[0]));
      }
      return;
    }
    const tradeClear = event.target.closest("[data-trade-clear]");
    if (tradeClear) {
      const sector = getCurrentSector();
      if (sector && state.ui.selectedHex) {
        clearTradingCenterRouteAt(sector.id, state.ui.selectedHex, Number(tradeClear.getAttribute("data-trade-clear") || 0));
      }
      return;
    }
    const crewButton = event.target.closest("[data-facility-workers]");
    if (crewButton) {
      if (crewButton.disabled || !state.ui.selectedSystem) return;
      const crewSpec = String(crewButton.getAttribute("data-facility-workers") || "").split(":");
      if (crewSpec.length === 2) {
        adjustFacilityWorkers(state.ui.selectedSystem, Number(crewSpec[0]), Number(crewSpec[1]));
      }
      return;
    }
    const refitButton = event.target.closest("[data-upgrade-building]");
    if (refitButton) {
      if (refitButton.disabled || !state.ui.selectedSystem) return;
      upgradeBuilding(state.ui.selectedSystem, Number(refitButton.getAttribute("data-upgrade-building")));
      return;
    }
    const shipRefit = event.target.closest("[data-ship-upgrade]");
    if (shipRefit) {
      if (shipRefit.disabled) return;
      upgradeShip(shipRefit.getAttribute("data-ship-upgrade"));
      return;
    }
    const shipRepair = event.target.closest("[data-ship-repair]");
    if (shipRepair) {
      if (shipRepair.disabled) return;
      repairShip(shipRepair.getAttribute("data-ship-repair"));
      return;
    }
    const unlockSlot = event.target.closest("[data-unlock-slot]");
    if (unlockSlot) {
      if (!unlockSlot.disabled && state.ui.selectedSystem) {
        unlockPlanetSlot(state.ui.selectedSystem, Number(unlockSlot.getAttribute("data-unlock-slot")));
      }
      return;
    }
    const buildSlot = event.target.closest("[data-build-slot]");
    if (buildSlot && state.ui.selectedSystem) {
      openBuildSheet(state.ui.selectedSystem, Number(buildSlot.getAttribute("data-build-slot")));
      return;
    }
    const colonizeButton = event.target.closest("[data-colonize]");
    if (colonizeButton) {
      colonizeSystem(colonizeButton.getAttribute("data-colonize"));
    }
  });

  // Trading center destination selector.
  els.planetContent.addEventListener("change", function (event) {
    const select = event.target.closest("[data-trade-target]");
    if (!select) return;
    const sector = getCurrentSector();
    if (!sector || !state.ui.selectedHex) return;
    const routeIndex = Number(select.getAttribute("data-trade-target") || 0);
    setTradingCenterTargetAt(sector.id, state.ui.selectedHex, select.value || null, routeIndex);
  });

  // Build sheet actions.
  els.sheetBody.addEventListener("click", function (event) {
    const quickMoveShip = event.target.closest("[data-quick-move-ship]");
    if (quickMoveShip && state.ui.sheet && state.ui.sheet.kind === "quick-move") {
      selectQuickMoveShip(quickMoveShip.getAttribute("data-quick-move-ship"));
      return;
    }
    const saveButton = event.target.closest("[data-save-action]");
    if (saveButton) {
      handleSaveAction(saveButton.getAttribute("data-save-action"));
      return;
    }
    const battleButton = event.target.closest("[data-battle-open]");
    if (battleButton) {
      const pos = parseHexKey(battleButton.getAttribute("data-battle-open"));
      closeSheet();
      openHex(pos.row, pos.col, "fleet");
      return;
    }
    const upkeepButton = event.target.closest("[data-pop-upkeep]");
    if (upkeepButton && state.ui.sheet && state.ui.sheet.kind === "population") {
      if (upkeepButton.disabled) return;
      const spec = String(upkeepButton.getAttribute("data-pop-upkeep") || "").split(":");
      if (spec.length === 2) {
        adjustPopulationUpkeep(state.ui.sheet.systemId, spec[0], Number(spec[1]));
      }
      return;
    }
    const strategyButton = event.target.closest("[data-worker-strategy]");
    if (strategyButton && state.ui.sheet && state.ui.sheet.kind === "population") {
      setWorkerStrategy(state.ui.sheet.systemId, strategyButton.getAttribute("data-worker-strategy"));
      return;
    }
    const workerAuto = event.target.closest("[data-worker-auto]");
    if (workerAuto && state.ui.sheet && state.ui.sheet.kind === "population") {
      resetFacilityWorkers(state.ui.sheet.systemId);
      return;
    }
    const button = event.target.closest("[data-build]");
    if (!button || !state.ui.sheet || state.ui.sheet.kind !== "build") return;
    buildInSlot(state.ui.sheet.systemId, state.ui.sheet.slotIndex, button.getAttribute("data-build"));
  });
  els.sheetClose.addEventListener("click", closeSheet);
  els.sheetBackdrop.addEventListener("click", closeSheet);
  els.sheetGrab.addEventListener("pointerdown", beginSheetDrag);
  const sheetHead = document.querySelector(".sheet-head");
  if (sheetHead) sheetHead.addEventListener("pointerdown", beginSheetDrag);
  document.addEventListener("pointermove", moveSheetDrag);
  document.addEventListener("pointerup", endSheetDrag);
  document.addEventListener("pointercancel", endSheetDrag);

  // Event buttons + swipe gestures.
  els.eventButtons.addEventListener("click", function (event) {
    const button = event.target.closest("[data-choice]");
    if (!button || button.disabled) return;
    resolveEvent(Number(button.getAttribute("data-choice")));
  });
  els.eventCard.addEventListener("pointerdown", beginCardDrag);
  els.eventCard.addEventListener("pointermove", moveCardDrag);
  els.eventCard.addEventListener("pointerup", finishCardDrag);
  els.eventCard.addEventListener("pointercancel", cancelCardDrag);

  // End screen.
  els.playAgain.addEventListener("click", resetGame);

  // Escape closes the layer menu first, then the debug sandbox, then sheets.
  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") return;
    if (els.debugScreen && !els.debugScreen.classList.contains("hidden")) {
      closeDebugScreen();
      return;
    }
    if (els.sectorLayerMenu && !els.sectorLayerMenu.classList.contains("hidden")) {
      closeSectorLayerMenu();
      if (els.sectorViewBtn) els.sectorViewBtn.focus();
      return;
    }
    if (els.galaxyLayerMenu && !els.galaxyLayerMenu.classList.contains("hidden")) {
      closeGalaxyLayerMenu();
      if (els.galaxyViewBtn) els.galaxyViewBtn.focus();
      return;
    }
    if (state.ui.sheet) closeSheet();
  });
}

/* ============================================================
   BOOT
   ============================================================ */

validateEventDeck();
state = createInitialState(null);
bindEvents();
renderEthics();
renderContinueSave();
showStartPage("home");
renderAll();
scrollGalaxyToCurrentSector();
