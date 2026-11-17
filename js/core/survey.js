/* ============================================================
   SURVEY — anomaly sites, discovery and N-turn science studies
   Sites live on empty sector hexes and are seeded by core/galaxy.js. They
   stay hidden until a ship charts the hex. A science ship stationed in the
   hex can begin a study; each turn the study ticks down and the reward is
   paid when it reaches zero. If the science ship leaves, the study pauses
   (no progress is lost) until a science ship returns.
   ============================================================ */

function getAnomalyAt(row, col, sectorId) {
  const sector = getSector(sectorId || state.ui.activeSector);
  if (!sector || !sector.anomalies) return null;
  return sector.anomalies[hexKey(row, col)] || null;
}

function getAnomalyType(anomaly) {
  if (!anomaly) return null;
  return ANOMALY_TYPES.find(function (type) { return type.id === anomaly.typeId; }) || null;
}

function getAnomalyKind(anomaly) {
  const type = getAnomalyType(anomaly);
  return type && ANOMALY_KINDS[type.kind] ? ANOMALY_KINDS[type.kind] : ANOMALY_KINDS.anomaly;
}

function getAnomalyName(anomaly) {
  const type = getAnomalyType(anomaly);
  return type ? type.name : "Unknown Site";
}

function getAnomalyEmoji(anomaly) {
  const type = getAnomalyType(anomaly);
  return type ? type.emoji : "🔭";
}

/* A site is public once the hex is charted. The stored flag lets discovery
   notifications fire exactly once; it is also the persisted marker other
   screens use. */
function isAnomalyVisible(anomaly) {
  if (!anomaly) return false;
  if (anomaly.discovered) return true;
  return isHexExplored(anomaly.row, anomaly.col, anomaly.sectorId);
}

function getSectorAnomalies(sectorId, onlyVisible) {
  const sector = getSector(sectorId || state.ui.activeSector);
  if (!sector || !sector.anomalies) return [];
  return Object.keys(sector.anomalies)
    .map(function (key) { return sector.anomalies[key]; })
    .filter(function (anomaly) { return anomaly && (!onlyVisible || isAnomalyVisible(anomaly)); })
    .sort(function (a, b) { return a.id.localeCompare(b.id); });
}

function countSectorAnomalies(sectorId, onlyVisible) {
  return getSectorAnomalies(sectorId, onlyVisible !== false).length;
}

function countEmpireAnomalies(onlyVisible) {
  return state.galaxy.sectors.reduce(function (total, sector) {
    return total + countSectorAnomalies(sector.id, onlyVisible !== false);
  }, 0);
}

function countSurveyedAnomalies() {
  return state.galaxy.sectors.reduce(function (total, sector) {
    return total + getSectorAnomalies(sector.id, true).filter(function (anomaly) {
      return anomaly.resolved;
    }).length;
  }, 0);
}

function getScienceShipsAt(row, col, sectorId) {
  return getFleetAt(row, col, sectorId).filter(function (ship) {
    return ship.type === "science";
  });
}

function getAnomalyState(anomaly) {
  if (!anomaly || !isAnomalyVisible(anomaly)) return "hidden";
  if (anomaly.resolved) return "resolved";
  if (anomaly.study) return anomaly.study.paused ? "paused" : "studying";
  if (getScienceShipsAt(anomaly.row, anomaly.col, anomaly.sectorId).length) return "ready";
  return "waiting";
}

function getAnomalyProgress(anomaly) {
  if (!anomaly || !anomaly.study) return null;
  const total = Math.max(1, anomaly.study.total);
  const turnsLeft = Math.max(0, anomaly.study.turnsLeft);
  const done = Math.max(0, total - turnsLeft);
  return {
    total: total,
    done: done,
    turnsLeft: turnsLeft,
    paused: !!anomaly.study.paused,
    percent: clamp((done / total) * 100, 0, 100)
  };
}

/* Why a study cannot begin, or null when it can. */
function getSurveyBlockReason(anomaly) {
  if (!anomaly) return "No survey site in this hex.";
  if (!isAnomalyVisible(anomaly)) return "Chart this hex before surveying it.";
  if (anomaly.resolved) return "This site has already been surveyed.";
  if (anomaly.study) return "A survey is already under way.";
  if (!getScienceShipsAt(anomaly.row, anomaly.col, anomaly.sectorId).length) {
    return "A science ship must be stationed in this hex.";
  }
  return null;
}

/* Pure state mutation used by the UI layer. Returns { ok, reason }. */
function beginAnomalyStudy(anomaly) {
  const reason = getSurveyBlockReason(anomaly);
  if (reason) return { ok: false, reason: reason };
  const science = getScienceShipsAt(anomaly.row, anomaly.col, anomaly.sectorId);
  anomaly.discovered = true;
  anomaly.study = {
    turnsLeft: anomaly.studyTurns,
    total: anomaly.studyTurns,
    startedTurn: state.turn,
    paused: false,
    shipId: science[0] ? science[0].id : null
  };
  state.stats.surveysStarted = (state.stats.surveysStarted || 0) + 1;
  return { ok: true, reason: null };
}

function cancelAnomalyStudy(anomaly) {
  if (!anomaly || !anomaly.study) return false;
  anomaly.study = null;
  return true;
}

function completeAnomalyStudy(anomaly) {
  const type = getAnomalyType(anomaly);
  const rewards = type ? Object.assign({}, type.reward) : {};
  anomaly.resolved = true;
  anomaly.resolvedTurn = state.turn;
  anomaly.lastReward = rewards;
  anomaly.study = null;
  state.stats.anomaliesSurveyed += 1;
  /* Rewards land in the sector that hosts the site. */
  applyEffects(rewards, anomaly.sectorId);
  toast("Survey complete · " + getAnomalyName(anomaly) + " · " + formatEffectSummary(rewards));
  return anomaly;
}

/* Runs once per turn after fleets have moved, so a science ship that arrives
   this turn can keep a study going. Returns the completed and paused sites
   so the turn pipeline (and tests) can report them. */
function advanceAnomalyStudies() {
  const completed = [];
  const paused = [];
  state.galaxy.sectors.forEach(function (sector) {
    getSectorAnomalies(sector.id).forEach(function (anomaly) {
      if (!anomaly.study || anomaly.resolved) return;
      const science = getScienceShipsAt(anomaly.row, anomaly.col, sector.id);
      if (!science.length) {
        anomaly.study.paused = true;
        paused.push(anomaly);
        return;
      }
      anomaly.study.paused = false;
      anomaly.study.shipId = science[0].id;
      anomaly.study.turnsLeft -= 1;
      if (anomaly.study.turnsLeft <= 0) completed.push(anomaly);
    });
  });
  completed.forEach(completeAnomalyStudy);
  return { completed: completed, paused: paused };
}

/* Called whenever a hex is charted. Fires the one-time discovery notice. */
function revealAnomalyAt(row, col, sectorId, options) {
  const anomaly = getAnomalyAt(row, col, sectorId);
  if (!anomaly || anomaly.discovered) return null;
  anomaly.discovered = true;
  anomaly.discoveredTurn = state.turn;
  state.stats.anomaliesFound += 1;
  if (!options || !options.silent) {
    toast("🔭 Survey site detected · " + getAnomalyName(anomaly) + " · " + getAnomalyKind(anomaly).label);
  }
  return anomaly;
}

/* Boot sweep: anything already inside charted space is already discovered. */
function revealKnownAnomalies() {
  state.galaxy.sectors.forEach(function (sector) {
    (sector.anomalies ? Object.keys(sector.anomalies) : []).forEach(function (key) {
      const anomaly = sector.anomalies[key];
      if (!anomaly || anomaly.discovered) return;
      if (!isHexExplored(anomaly.row, anomaly.col, sector.id)) return;
      anomaly.discovered = true;
      anomaly.discoveredTurn = state.turn;
      state.stats.anomaliesFound += 1;
    });
  });
}
