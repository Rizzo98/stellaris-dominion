/* ============================================================
   COLONY RULES — planet size, population, workforce and slots
   Everything that answers 'what can this colony support right now?'.
   ============================================================ */

/* A planet's size is rolled with the galaxy (25 / 50 / 25). Standard slots
   are open immediately after colonisation; bonus slots are locked and are
   opened in order by paying energy + minerals. */
function getPlanetSizeDef(id) {
  const sizes = (CONFIG.planetSlots && CONFIG.planetSlots.sizes) || [];
  return sizes.find(function (size) { return size.id === id; }) ||
    sizes.find(function (size) { return size.id === "medium"; }) ||
    { id: "medium", name: "Medium", slots: 4 };
}

function getStandardSlots(system) {
  return getPlanetSizeDef(system && system.planetSize).slots;
}

function getBonusSlots(system) {
  const max = (CONFIG.planetSlots && CONFIG.planetSlots.bonus && CONFIG.planetSlots.bonus.max) || 2;
  return clamp(Math.floor((system && system.bonusSlots) || 0), 0, max);
}

function getUnlockedBonusSlots(system) {
  return clamp(Math.floor((system && system.unlockedBonusSlots) || 0), 0, getBonusSlots(system));
}

/* Total places a building can occupy, including still-locked bonus slots. */
function getTotalSlots(system) {
  return getStandardSlots(system) + getBonusSlots(system);
}

/* Slots that can currently take a building: standard + opened bonus slots. */
function getMaxSlots(system) {
  return getStandardSlots(system) + getUnlockedBonusSlots(system);
}

function isSlotLocked(system, index) {
  return index >= getMaxSlots(system) && index < getTotalSlots(system);
}

function isSlotBuildable(system, index) {
  return index >= 0 && index < getMaxSlots(system) && !system.slots[index];
}

function createPlanetSlots(system) {
  const slots = [];
  const total = getTotalSlots(system);
  for (let i = 0; i < total; i += 1) slots.push(null);
  return slots;
}

function getSlotUnlockCost(system) {
  const cost = (CONFIG.planetSlots && CONFIG.planetSlots.unlockCost) || { energy: 0, minerals: 0 };
  return { energy: cost.energy || 0, minerals: cost.minerals || 0 };
}

function getSlotUnlockBlockReason(system, index) {
  if (!system || !system.colonized) return "Only a colony can open a slot";
  if (!isSlotLocked(system, index)) return "This slot is already open";
  if (index !== getMaxSlots(system)) return "Open the earlier bonus slot first";
  const cost = getSlotUnlockCost(system);
  const sector = getSector(system.sectorId);
  const sectorName = sector ? sector.name : "this sector";
  const energy = getSectorStock(system.sectorId, "energy");
  const minerals = getSectorStock(system.sectorId, "minerals");
  if (energy < cost.energy) {
    return "Need " + Math.ceil(cost.energy - energy) + " more energy in " + sectorName;
  }
  if (minerals < cost.minerals) {
    return "Need " + Math.ceil(cost.minerals - minerals) + " more minerals in " + sectorName;
  }
  return null;
}

/* ---------- population: houses and sustenance ---------- */

/* Housing is bought with a standing mineral upkeep. One step of upkeep adds
   one house, and a planet can pay for at most its size in extra houses; the
   founding shelter is free. */
function getPopulationHousingUpkeepStep() {
  const cfg = (CONFIG.population && CONFIG.population.housing) || {};
  return Math.max(1, Math.floor(cfg.mineralsPerHouse || 2));
}

function getPopulationSustenanceConfig() {
  const cfg = (CONFIG.population && CONFIG.population.sustenance) || {};
  const maxMult = typeof cfg.maxMult === "number" && cfg.maxMult >= 1 ? cfg.maxMult : 1.25;
  return {
    populationPerEnergy: typeof cfg.populationPerEnergy === "number" && cfg.populationPerEnergy > 0
      ? cfg.populationPerEnergy
      : 2,
    maxMult: maxMult,
    tiers: Array.isArray(cfg.tiers) ? cfg.tiers : [{ id: "starving", label: "STARVING", min: 0 }]
  };
}

function getMaxExtraHouses(system) {
  if (!system || !system.colonized) return 0;
  return Math.max(0, getStandardSlots(system));
}

function getMaxHousingUpkeep(system) {
  return getMaxExtraHouses(system) * getPopulationHousingUpkeepStep();
}

/* The cap has to be enough to feed the biggest population the planet can
   house while still reaching the top sustenance tier. */
function getMaxSustenanceUpkeep(system) {
  if (!system || !system.colonized) return 0;
  const cfg = getPopulationSustenanceConfig();
  const maxPopulation = getBasePopulationCap(system) + getMaxExtraHouses(system);
  return Math.max(1, Math.ceil((maxPopulation * cfg.maxMult) / cfg.populationPerEnergy - 1e-9));
}

/* The colony's standing upkeep policy. Values are whole upkeep units per
   turn: housing is paid in minerals, sustenance in energy. The object is
   created lazily and clamped on read, so generated or older systems always
   report a valid policy. */
function getPopulationPolicy(system) {
  if (!system.populationUpkeep || typeof system.populationUpkeep !== "object") {
    system.populationUpkeep = { housing: 0, sustenance: 0 };
  }
  const policy = system.populationUpkeep;
  const housingMax = getMaxHousingUpkeep(system);
  const sustenanceMax = getMaxSustenanceUpkeep(system);
  const housing = typeof policy.housing === "number" && isFinite(policy.housing) ? policy.housing : 0;
  const sustenance = typeof policy.sustenance === "number" && isFinite(policy.sustenance) ? policy.sustenance : 0;
  policy.housing = clamp(Math.floor(housing), 0, housingMax);
  policy.sustenance = clamp(Math.floor(sustenance), 0, sustenanceMax);
  return policy;
}

/* The housing cap a given mineral upkeep would fund, used by the menu
   preview and by the guard that stops a colony losing its houses. */
function getHousingCapForUpkeep(system, housingUpkeep) {
  if (!system || !system.colonized) return 0;
  const step = getPopulationHousingUpkeepStep();
  const paidHouses = Math.floor(Math.max(0, housingUpkeep) / step);
  return getBasePopulationCap(system) + Math.min(paidHouses, getMaxExtraHouses(system));
}

function getPopulationHousingCap(system) {
  const policy = getPopulationPolicy(system);
  return getHousingCapForUpkeep(system, policy.housing);
}

function getSustenanceSupply(upkeep) {
  const cfg = getPopulationSustenanceConfig();
  return Math.max(0, upkeep || 0) * cfg.populationPerEnergy;
}

function getSustenanceDemand(population) {
  return Math.max(0, population || 0);
}

function getSustenanceTier(mult) {
  const tiers = getPopulationSustenanceConfig().tiers;
  for (let i = 0; i < tiers.length; i += 1) {
    if (typeof tiers[i].min !== "number" || mult >= tiers[i].min) return tiers[i];
  }
  return tiers[tiers.length - 1];
}

/* Sustenance is the share of the population that the energy upkeep can feed,
   expressed as a growth multiplier. Feeding everyone is 100%; surplus food
   and entertainment lift growth up to maxMult (125%), and a shortage drags it
   down. It is always clamped to the top tier. */
function getSustenanceState(population, upkeep) {
  const cfg = getPopulationSustenanceConfig();
  const supply = getSustenanceSupply(upkeep);
  const demand = getSustenanceDemand(population);
  const ratio = demand > 0 ? supply / demand : cfg.maxMult;
  const mult = clamp(ratio, 0, cfg.maxMult);
  return {
    supply: supply,
    demand: demand,
    ratio: ratio,
    capped: ratio > cfg.maxMult,
    mult: mult,
    percent: Math.round(mult * 100),
    maxPercent: Math.round(cfg.maxMult * 100),
    populationPerEnergy: cfg.populationPerEnergy,
    tier: getSustenanceTier(mult)
  };
}

/* Why a stepper move is illegal: out of bounds, or a housing cut that would
   leave more people than houses. Null means the move is allowed. */
function getPopulationUpkeepChangeReason(system, axis, delta) {
  if (!system || !system.colonized) return "Only a colony manages population.";
  if (axis !== "housing" && axis !== "sustenance") return "Unknown population upkeep.";
  const policy = getPopulationPolicy(system);
  const step = axis === "housing" ? getPopulationHousingUpkeepStep() : 1;
  const max = axis === "housing" ? getMaxHousingUpkeep(system) : getMaxSustenanceUpkeep(system);
  const next = clamp(policy[axis] + (delta < 0 ? -step : step), 0, max);
  if (next === policy[axis]) {
    return delta > 0
      ? "At the maximum " + axis + " upkeep."
      : "Already at zero " + axis + " upkeep.";
  }
  if (axis === "housing" && next < policy.housing) {
    const nextCap = getHousingCapForUpkeep(system, next);
    if (nextCap < Math.max(0, system.population || 0)) {
      return "Housing can't fall below the current population.";
    }
  }
  return null;
}

/* Workers are assigned in slot order. A building keeps whatever workers it
   gets, so a 2-worker mine with one crew runs at 50%. Completed buildings
   always pay their full upkeep, even when no worker is available. Population
   growth comes from the houses and sustenance bought with the colony's
   standing upkeep, not from any building. */
function getWorkforcePlan(system) {
  const plan = {
    population: system.colonized ? Math.max(0, system.population || 0) : 0,
    baseHousing: getBasePopulationCap(system),
    housingUpkeep: 0,
    paidHouses: 0,
    cap: 0,
    housingRoom: 0,
    overcrowded: false,
    sustenanceUpkeep: 0,
    sustenance: getSustenanceState(0, 0),
    growthMultiplier: 0,
    growthRate: (CONFIG.population && CONFIG.population.growthRate) || 0,
    growthPerTurn: 0,
    growthProgress: 0,
    turnsToNextPop: null,
    canGrow: false,
    growthBlockedBy: "housing",
    jobsTotal: 0,
    jobsStaffed: 0,
    idleJobs: 0,
    idleBuildings: 0,
    partialBuildings: 0,
    availableWorkers: 0,
    entries: []
  };

  if (!system.colonized) {
    plan.cap = 0;
    plan.growthBlockedBy = "housing";
    return plan;
  }

  const policy = getPopulationPolicy(system);
  plan.housingUpkeep = policy.housing;
  plan.sustenanceUpkeep = policy.sustenance;
  plan.paidHouses = Math.floor(policy.housing / getPopulationHousingUpkeepStep());
  plan.cap = plan.baseHousing + plan.paidHouses;
  plan.sustenance = getSustenanceState(plan.population, policy.sustenance);
  plan.growthMultiplier = plan.sustenance.mult;
  plan.housingRoom = Math.max(0, plan.cap - plan.population);
  plan.overcrowded = plan.population > plan.cap;

  let available = plan.population;
  (system.slots || []).forEach(function (slot, index) {
    if (!slot) return;
    const required = getBuildingWorkers(slot.type);
    const entry = {
      index: index,
      type: slot.type,
      underConstruction: !!slot.underConstruction,
      active: false,
      workersRequired: required,
      workersAssigned: 0,
      staffedRatio: 0
    };

    if (!slot.underConstruction) {
      const assigned = Math.min(required, available);
      available -= assigned;
      entry.workersAssigned = assigned;
      entry.staffedRatio = required > 0 ? assigned / required : 1;
      entry.active = required === 0 || assigned > 0;
      plan.jobsTotal += required;
      plan.jobsStaffed += assigned;
      if (required > 0 && assigned === 0) {
        plan.idleBuildings += 1;
      } else if (required > 0 && assigned < required) {
        plan.partialBuildings += 1;
      }
    }
    plan.entries.push(entry);
  });

  plan.availableWorkers = available;
  plan.idleJobs = plan.jobsTotal - plan.jobsStaffed;
  plan.growthProgress = clamp(system.growthProgress || 0, 0, 1);

  /* The hard limit: no colony may hold more people than houses. A negative
     policy change is refused, but a stale state still reports the overflow so
     growPopulations() can settle it. */
  if (plan.overcrowded) {
    plan.growthBlockedBy = "overcrowded";
  } else if (plan.housingRoom <= 0) {
    plan.growthBlockedBy = "housing";
  } else if (plan.growthMultiplier <= 0) {
    plan.growthBlockedBy = "sustenance";
  } else {
    plan.growthBlockedBy = null;
    const fill = plan.housingRoom / plan.cap;
    plan.growthPerTurn = plan.growthRate * plan.growthMultiplier * fill;
    plan.canGrow = plan.growthPerTurn > 0;
    plan.turnsToNextPop = plan.canGrow
      ? Math.max(1, Math.ceil((1 - plan.growthProgress) / plan.growthPerTurn))
      : null;
  }
  return plan;
}

function getEmptyUnlockedSlots(system) {
  if (!system.colonized) return 0;
  const max = getMaxSlots(system);
  let count = 0;
  for (let i = 0; i < max; i += 1) {
    if (!system.slots[i]) count += 1;
  }
  return count;
}

function getUsedSlots(system) {
  return (system.slots || []).filter(Boolean).length;
}

function getSystemAttention(system) {
  if (!system.colonized) return null;
  if (system.completedNow) return "done";
  if (getEmptyUnlockedSlots(system) > 0) return "slot";
  return null;
}

/* A tech is blocked by the exclusive A/B choice, by an unfinished
   prerequisite in its own line, or by a global tech count (the final
   project). */
function techLockReason(id) {
  const tech = TECHS[id];
  if (!tech || hasTech(id)) return null;
  if (tech.exclusive && state.tech.exclusiveChoice && state.tech.exclusiveChoice !== id) {
    return "Locked — " + TECHS[state.tech.exclusiveChoice].name + " selected";
  }
  const required = Array.isArray(tech.requiresTech) ? tech.requiresTech : [];
  for (let i = 0; i < required.length; i += 1) {
    const dependency = TECHS[required[i]];
    if (!hasTech(required[i])) {
      return "Requires " + (dependency ? dependency.name : required[i]);
    }
  }
  if (tech.requiresTechs && completedTechCount() < tech.requiresTechs) {
    return "Requires " + tech.requiresTechs + " other completed techs";
  }
  return null;
}

function getChoiceLockReason(choice) {
  const ethic = getEthic();
  if (choice.requiresEthic && state.ethic !== choice.requiresEthic) {
    return "Requires " + ETHICS[choice.requiresEthic].name + " ethic";
  }
  if (choice.requiresTech && !hasTech(choice.requiresTech)) {
    return "Requires " + TECHS[choice.requiresTech].name;
  }
  if (ethic && ethic.blocksMilitary && (choice.tag || "").toLowerCase() === "military") {
    return "Pacifist — military options unavailable";
  }
  return null;
}

function getColonizeBlockReason(system) {
  if (!system || system.colonized) return "Already colonized";
  if (system.owner) {
    const empire = getEmpire(system.owner);
    return "Controlled by " + (empire ? empire.name : "a rival power");
  }
  if (!isSystemVisible(system)) return "Send a ship to chart this system first";
  const sector = getSector(system.sectorId);
  const minerals = getSectorStock(system.sectorId, "minerals");
  if (minerals < CONFIG.colonizeCost.minerals) {
    return "Need " + CONFIG.colonizeCost.minerals + " minerals in " + (sector ? sector.name : "this sector");
  }
  if (state.resources.influence < CONFIG.colonizeCost.influence) return "Need " + CONFIG.colonizeCost.influence + " influence";
  return null;
}
