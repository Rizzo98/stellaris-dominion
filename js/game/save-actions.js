/* ============================================================
   SAVE ACTIONS — browser storage, save files and loading a run
   The core snapshot rules live in js/core/save.js. This file owns the two
   transport layers: localStorage for a one-tap quick save, and a plain JSON
   file download/upload for a portable copy. Loading rebuilds state and
   repaints every screen.
   ============================================================ */

function browserStorageAvailable() {
  try {
    if (typeof localStorage === "undefined") return false;
    const key = SAVE_STORAGE_KEY + "-probe";
    localStorage.setItem(key, "1");
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    return false;
  }
}

/* Returns a validated snapshot or null. A corrupted slot reads as empty so
   the SAVE menu can simply overwrite it. */
function getBrowserSave() {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(SAVE_STORAGE_KEY);
    if (!raw) return null;
    return readSaveSnapshot(JSON.parse(raw));
  } catch (error) {
    return null;
  }
}

function saveGameToBrowser() {
  if (!canSaveState(state)) {
    toast("Saving is only available during a playable turn.");
    return false;
  }
  let save;
  try {
    save = createSaveSnapshot(state);
  } catch (error) {
    toast("Could not save: " + error.message);
    return false;
  }
  try {
    if (typeof localStorage === "undefined") throw new Error("storage unavailable");
    localStorage.setItem(SAVE_STORAGE_KEY, stringifySave(save));
  } catch (error) {
    toast("Could not save to this browser. Use DOWNLOAD SAVE FILE instead.");
    return false;
  }
  closeSheet();
  toast("Saved to browser · turn " + save.state.turn);
  renderContinueSave();
  return true;
}

function deleteBrowserSave() {
  let removed = false;
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(SAVE_STORAGE_KEY);
      removed = true;
    }
  } catch (error) {
    removed = false;
  }
  if (!removed) {
    toast("Browser storage is unavailable.");
    return false;
  }
  renderContinueSave();
  if (state.ui.sheet && state.ui.sheet.kind === "save") {
    /* Repaint the open archive in place instead of reopening it: showSheet()
       clears the toast, which would swallow the confirmation. */
    els.sheetBody.innerHTML = saveSheetHTML();
    els.sheetBody.scrollTop = 0;
  }
  toast("Saved run deleted.");
  return true;
}

function downloadSaveFile() {
  if (!canSaveState(state)) {
    toast("Saving is only available during a playable turn.");
    return false;
  }
  let save;
  try {
    save = createSaveSnapshot(state);
  } catch (error) {
    toast("Could not save: " + error.message);
    return false;
  }
  if (typeof Blob === "undefined" || typeof URL === "undefined" ||
      typeof URL.createObjectURL !== "function" || !document.body) {
    toast("This browser cannot download save files.");
    return false;
  }
  const blob = new Blob([stringifySave(save)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = getSaveFileName(save);
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  closeSheet();
  toast("Save file downloaded · turn " + save.state.turn);
  return true;
}

function requestSaveFileLoad() {
  if (!els.saveFileInput) {
    toast("File loading is unavailable in this browser.");
    return;
  }
  /* Clearing the value lets the same file be picked twice in a row. */
  els.saveFileInput.value = "";
  els.saveFileInput.click();
}

function handleSaveFileSelection(event) {
  const input = event.target;
  const file = input && input.files ? input.files[0] : null;
  if (!file) return;
  if (typeof FileReader === "undefined") {
    toast("This browser cannot read save files.");
    return;
  }
  const reader = new FileReader();
  reader.onerror = function () {
    toast("Could not read that file.");
    input.value = "";
  };
  reader.onload = function () {
    try {
      applySaveState(parseSaveText(String(reader.result || "")), "save file");
    } catch (error) {
      toast(error && error.message ? error.message : "That file is not a valid save.");
    }
    input.value = "";
  };
  reader.readAsText(file);
}

/* Rebuild the run, close whatever was open and repaint. The event layer is
   shown again when the save was taken between the draw and the choice, so a
   card can never be dodged by reloading. */
function applySaveState(save, sourceLabel) {
  let restored;
  try {
    restored = restoreSaveSnapshot(save);
  } catch (error) {
    toast(error && error.message ? error.message : "That save could not be loaded.");
    return false;
  }
  hideToast();
  closeSheet();
  hideEventLayer();
  if (typeof closeGalaxyLayerMenu === "function") closeGalaxyLayerMenu();
  if (typeof closeSectorLayerMenu === "function") closeSectorLayerMenu();
  if (eventResolveTimer) {
    clearTimeout(eventResolveTimer);
    eventResolveTimer = null;
  }
  resourceAnimationToken += 1;
  swipeConfirming = false;
  eventDrag = null;
  state = restored;
  /* The start screen's seed field and PLAY AGAIN both follow the loaded run. */
  CONFIG.galaxy.seed = state.galaxy.seed;
  renderSeedInput();
  els.startScreen.classList.add("hidden");
  els.startScreen.scrollTop = 0;
  els.endScreen.classList.add("hidden");
  els.endScreen.classList.remove("lose");
  els.planetScreen.classList.add("hidden");
  els.main.scrollTop = 0;
  renderAll();
  scrollGalaxyToCurrentSector();
  if (state.phase === "event" && state.currentEvent) {
    showEventLayer();
  } else {
    hideEventLayer();
  }
  renderContinueSave();
  const from = sourceLabel ? " from " + sourceLabel : "";
  toast("Loaded" + from + " · turn " + state.turn);
  return true;
}

function loadGameFromBrowser() {
  const save = getBrowserSave();
  if (!save) {
    toast("No valid saved run in this browser.");
    return false;
  }
  return applySaveState(save, "browser save");
}

function continueSavedGame() {
  const save = getBrowserSave();
  if (!save) {
    toast("No saved run in this browser.");
    renderContinueSave();
    return false;
  }
  return applySaveState(save, "saved run");
}

function handleSaveAction(action) {
  if (action === "browser-save") return saveGameToBrowser();
  if (action === "browser-load") return loadGameFromBrowser();
  if (action === "browser-delete") return deleteBrowserSave();
  if (action === "file-save") return downloadSaveFile();
  if (action === "file-load") {
    requestSaveFileLoad();
    return true;
  }
  return false;
}

/* The start screen card only shows CONTINUE while the slot holds a readable
   snapshot; LOAD SAVE FILE stays available so a downloaded run can be opened
   on a device that has no browser save yet. */
function renderContinueSave() {
  if (!els.continueSave) return;
  const save = getBrowserSave();
  if (!save) {
    els.continueSave.classList.add("hidden");
    if (els.saveResumeMeta) els.saveResumeMeta.textContent = "NO SAVE IN THIS BROWSER";
    if (els.saveResumeSub) els.saveResumeSub.textContent = "";
    return;
  }
  const meta = getSaveMetadata(save);
  els.continueSave.classList.remove("hidden");
  if (els.saveResumeMeta) {
    els.saveResumeMeta.textContent = "TURN " + meta.turn + " · " +
      meta.ethicName.toUpperCase() + " · " + formatSavedAt(meta.savedAt).toUpperCase();
  }
  if (els.saveResumeSub) {
    els.saveResumeSub.textContent = meta.colonies +
      (meta.colonies === 1 ? " COLONY" : " COLONIES") + " · SEED " + meta.seed;
  }
}
