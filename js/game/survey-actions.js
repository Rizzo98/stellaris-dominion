/* ============================================================
   SURVEY ACTIONS — player commands for anomaly sites
   Thin UI layer over core/survey.js: validates the turn phase, starts or
   cancels the study in the selected hex and repaints.
   ============================================================ */

function startStudyAtSelectedHex() {
  if (state.phase !== "actions" || !state.ui.selectedHex) return;
  const sector = getCurrentSector();
  if (!sector) return;
  const pos = parseHexKey(state.ui.selectedHex);
  const anomaly = getAnomalyAt(pos.row, pos.col, sector.id);
  if (!anomaly) {
    toast("No survey site in this hex.");
    return;
  }
  const result = beginAnomalyStudy(anomaly);
  if (!result.ok) {
    toast(result.reason);
    return;
  }
  renderAll();
  toast("Survey begun · " + getAnomalyName(anomaly) + " · " +
    anomaly.studyTurns + (anomaly.studyTurns === 1 ? " turn." : " turns."));
}

function cancelStudyAtSelectedHex() {
  if (state.phase !== "actions" || !state.ui.selectedHex) return;
  const sector = getCurrentSector();
  if (!sector) return;
  const pos = parseHexKey(state.ui.selectedHex);
  const anomaly = getAnomalyAt(pos.row, pos.col, sector.id);
  if (!anomaly || !anomaly.study) return;
  cancelAnomalyStudy(anomaly);
  renderAll();
  toast("Survey abandoned. The site remains charted.");
}
