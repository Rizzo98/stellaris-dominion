/* ============================================================
   EFFECTS — apply a plain resource/stability bundle to a sector or the empire
   Event choices and survey rewards share this one mutation path, so a
   reward can never behave differently from an event effect. Energy and
   minerals land in a sector ledger (the capital sector by default, or the
   sector a survey site belongs to); research, influence and stability are
   empire-wide.
   ============================================================ */

const EFFECT_KEY_ORDER = ["energy", "minerals", "research", "influence", "stability"];

/* Applies { energy, minerals, research, influence, stability } in place.
   Minerals are floored at 0; energy may go negative and is handled by the
   turn pipeline. Positive research is auto-invested in the active project.
   Returns the applied list for logs/tests. */
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
    if (key === "energy" || key === "minerals") {
      if (!targetSectorId) return;
      const next = getSectorStock(targetSectorId, key) + value;
      setSectorStock(targetSectorId, key, key === "energy" ? next : Math.max(0, next));
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
