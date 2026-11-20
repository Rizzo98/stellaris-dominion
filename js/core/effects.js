/* ============================================================
   EFFECTS — apply a plain resource/stability/population bundle to a sector
   or the empire. Event choices and survey rewards share this one mutation
   path, so a reward can never behave differently from an event effect.
   Energy and minerals land in a sector ledger (the capital sector by
   default, or the sector a survey site belongs to); research, influence and
   stability are empire-wide; population is moved in the colony the bundle
   points at.
   ============================================================ */

const EFFECT_KEY_ORDER = ["energy", "minerals", "research", "influence", "stability", "population"];

/* Population changes hit the unhappiest colony that still has people in it,
   inside the target sector when one is supplied. A loss is clamped at zero so
   a colony can be emptied but never becomes negative. */
function shiftColonyPopulation(sectorId, amount) {
  const requested = Math.trunc(Number(amount) || 0);
  if (!requested || !state || !state.galaxy) return null;
  const sectorIds = sectorId
    ? [sectorId]
    : state.galaxy.sectors.map(function (sector) { return sector.id; });
  let target = null;
  sectorIds.forEach(function (id) {
    const allocation = getSectorColonyAllocations(id);
    Object.keys(allocation.byId).forEach(function (systemId) {
      const report = allocation.byId[systemId];
      if (!report || !(report.population > 0)) return;
      if (!target || report.happiness < target.report.happiness) {
        target = { system: getSystem(systemId), report: report };
      }
    });
  });
  if (!target || !target.system) return null;
  const before = getColonyPopulation(target.system);
  const after = Math.max(0, before + requested);
  if (after === before) return null;
  target.system.population = after;
  return {
    systemId: target.system.id,
    name: target.system.name,
    before: before,
    after: after,
    applied: after - before
  };
}

/* Applies { energy, minerals, research, influence, stability, population } in place.
   Sector ledgers are floored at 0 by setSectorStock(), so a negative event
   effect can empty a stock but never overdraw it. Positive research is
   auto-invested in the active project. Returns the applied list for
   logs/tests. */
function applyEffects(effects, sectorId) {
  const applied = [];
  let gainedResearch = false;
  if (!effects) return { applied: applied, gainedResearch: gainedResearch };
  const targetSectorId = sectorId || getEconomySectorId();

  Object.keys(effects).forEach(function (key) {
    const value = effects[key];
    if (typeof value !== "number" || !value) return;
    if (key === "stability") {
      state.stability = clamp(state.stability + value, 0, 100);
      applied.push({ key: key, value: value });
      return;
    }
    if (key === "population") {
      const change = shiftColonyPopulation(targetSectorId, value);
      if (!change) return;
      applied.push({ key: key, value: change.applied, systemId: change.systemId });
      return;
    }
    if (key === "energy" || key === "minerals") {
      if (!targetSectorId) return;
      const next = getSectorStock(targetSectorId, key) + value;
      setSectorStock(targetSectorId, key, next);
      applied.push({ key: key, value: value });
      return;
    }
    if (typeof state.resources[key] !== "number") return;
    let next = state.resources[key] + value;
    next = Math.max(0, next);
    state.resources[key] = next;
    if (key === "research" && value > 0) gainedResearch = true;
    applied.push({ key: key, value: value });
  });

  if (gainedResearch && state.tech.active && state.resources.research > 0) {
    investResearchStock();
  }
  return { applied: applied, gainedResearch: gainedResearch };
}

/* "🔬+5 ⚡+3" — used by survey toasts and reward rows. */
function formatEffectSummary(effects) {
  const parts = [];
  EFFECT_KEY_ORDER.forEach(function (key) {
    const value = effects ? effects[key] : 0;
    if (typeof value !== "number" || !value) return;
    const meta = RESOURCE_META[key];
    parts.push((meta ? meta.icon : "") + formatSigned(value));
  });
  return parts.join(" ");
}
