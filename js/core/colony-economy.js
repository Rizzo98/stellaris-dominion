/* ============================================================
   COLONY ECONOMY — population, maintenance, housing, happiness and growth
   This module owns the formulas, not the UI. Every economic parameter comes
   from CONFIG.economy, so balancing is a data edit.

   The turn order is deliberately separated into three pure stages:
     1. production   — getColonyProduction() sums staffed facility output.
     2. consumption  — getSectorColonyAllocations() shares the sector ledger
                       between colonies and computes the energy spent on
                       population and the minerals invested in housing.
     3. growth       — getPopulationGrowthForHappiness() turns the resolved
                       happiness into population growth, banked by
                       applyColonyGrowth().

   Maintenance is requested as a percentage of the full requirement. A
   colony can never overdraw its sector: the allocation is capped by the
   stock on hand, and the shortfall shows up as lower energy fulfillment or
   housing, never as a negative resource balance.
   ============================================================ */

function getEconomyConfig() {
  const cfg = (CONFIG && CONFIG.economy) || {};
  const population = cfg.population || {};
  const maintenance = cfg.maintenance || {};
  const facilities = cfg.facilities || {};
  const levels = Array.isArray(facilities.levels) && facilities.levels.length
    ? facilities.levels
    : [{ level: 1, name: "Primitive", minPopulation: 3, workers: 4, output: 8 }];
  const numberOr = function (value, fallback) {
    return typeof value === "number" && isFinite(value) ? value : fallback;
  };
  const workforce = cfg.workforce || {};
  const fallbackStrategies = [
    { id: "roundRobin", label: "ROUND ROBIN", description: "Share workers across every eligible facility, one at a time." },
    { id: "greedy", label: "GREEDY", description: "Fill the earliest facility slots first." }
  ];
  const workerStrategies = (Array.isArray(workforce.strategies) ? workforce.strategies : [])
    .filter(function (entry) { return entry && typeof entry.id === "string" && entry.id; })
    .map(function (entry) {
      return {
        id: entry.id,
        label: typeof entry.label === "string" && entry.label ? entry.label : entry.id.toUpperCase(),
        description: typeof entry.description === "string" ? entry.description : ""
      };
    });
  if (!workerStrategies.length) workerStrategies.push.apply(workerStrategies, fallbackStrategies);
  const requestedStrategy = workforce.defaultStrategy;
  const defaultWorkerStrategy = workerStrategies.some(function (entry) { return entry.id === requestedStrategy; })
    ? requestedStrategy
    : workerStrategies[0].id;
  return {
    workerStrategies: workerStrategies,
    defaultWorkerStrategy: defaultWorkerStrategy,
    startingFacilities: Array.isArray(cfg.startingFacilities)
      ? cfg.startingFacilities.map(function (entry) {
          if (typeof entry === "string") return { type: entry, level: 1 };
          if (!entry || typeof entry.type !== "string") return null;
          return { type: entry.type, level: Math.max(1, Math.floor(numberOr(entry.level, 1))) };
        }).filter(Boolean)
      : [{ type: "power", level: 1 }, { type: "mine", level: 1 }],
    startingPopulation: {
      home: Math.max(0, Math.floor(numberOr(cfg.startingPopulation && cfg.startingPopulation.home, 3))),
      colony: Math.max(0, Math.floor(numberOr(cfg.startingPopulation && cfg.startingPopulation.colony, 5)))
    },
    growthRate: Math.max(0, numberOr(population.baseGrowthRate, 0.05)),
    energyExponent: numberOr(population.energyExponent, 1.1),
    housingExponent: numberOr(population.housingExponent, 0.9),
    happinessMax: Math.max(1, numberOr(population.happinessMax, 100)),
    minPercent: numberOr(maintenance.minPercent, 0),
    maxPercent: Math.max(100, numberOr(maintenance.maxPercent, 200)),
    maxGrowthMultiplier: Math.max(1, numberOr(maintenance.growthMultiplierMax, 2)),
    stepPercent: Math.max(1, numberOr(maintenance.stepPercent, 10)),
    defaultEnergyPercent: numberOr(maintenance.defaultEnergyPercent, 100),
    defaultMineralsPercent: numberOr(maintenance.defaultMineralsPercent, 100),
    tiers: Array.isArray(cfg.happinessTiers) && cfg.happinessTiers.length
      ? cfg.happinessTiers
      : [{ id: "miserable", label: "MISERABLE", min: 0 }],
    facilityLevels: levels
  };
}

function getColonyPopulation(system) {
  const raw = system && typeof system.population === "number" && isFinite(system.population)
    ? system.population
    : 0;
  return Math.max(0, Math.floor(raw));
}

/* E_required = P ^ energyExponent */
function getPopulationEnergyRequirement(population) {
  const cfg = getEconomyConfig();
  const p = Math.max(0, Number(population) || 0);
  return Math.pow(p, cfg.energyExponent);
}

/* H = M_spent ^ housingExponent */
function getHousingCapacity(mineralsSpent) {
  const cfg = getEconomyConfig();
  const spent = Math.max(0, Number(mineralsSpent) || 0);
  return Math.pow(spent, cfg.housingExponent);
}

/* Inverse of the housing formula: the minerals needed to reach H = P. */
function getRequiredHousingMinerals(population) {
  const cfg = getEconomyConfig();
  const p = Math.max(0, Number(population) || 0);
  if (p <= 0) return 0;
  return Math.pow(p, 1 / cfg.housingExponent);
}

/* Standing maintenance is a percentage of the full requirement. The object
   is created lazily and clamped on read so generated, restored or hand-built
   systems always report a valid policy. */
function getColonyMaintenancePolicy(system) {
  const cfg = getEconomyConfig();
  if (!system || typeof system !== "object") {
    return { energy: cfg.defaultEnergyPercent, minerals: cfg.defaultMineralsPercent };
  }
  if (!system.maintenance || typeof system.maintenance !== "object") {
    system.maintenance = {
      energy: cfg.defaultEnergyPercent,
      minerals: cfg.defaultMineralsPercent
    };
  }
  const policy = system.maintenance;
  const clampPercent = function (value, fallback) {
    const raw = typeof value === "number" && isFinite(value) ? value : fallback;
    return clamp(Math.round(raw), cfg.minPercent, cfg.maxPercent);
  };
  policy.energy = clampPercent(policy.energy, cfg.defaultEnergyPercent);
  policy.minerals = clampPercent(policy.minerals, cfg.defaultMineralsPercent);
  return policy;
}

/* The two required amounts and the two requested amounts for one colony. */
function getColonyMaintenanceRequest(system) {
  const population = getColonyPopulation(system);
  const policy = getColonyMaintenancePolicy(system);
  const cfg = getEconomyConfig();
  const energyRequired = getPopulationEnergyRequirement(population);
  const mineralsRequired = getRequiredHousingMinerals(population);
  return {
    population: population,
    energyRequired: energyRequired,
    mineralsRequired: mineralsRequired,
    energyPercent: policy.energy,
    mineralsPercent: policy.minerals,
    energyRequested: energyRequired * (policy.energy / 100),
    mineralsRequested: mineralsRequired * (policy.minerals / 100),
    energyFullPercent: cfg.maxPercent,
    mineralsFullPercent: cfg.maxPercent
  };
}

function getHappinessTier(happiness) {
  const tiers = getEconomyConfig().tiers;
  for (let i = 0; i < tiers.length; i += 1) {
    if (typeof tiers[i].min !== "number" || happiness >= tiers[i].min) return tiers[i];
  }
  return tiers[tiers.length - 1];
}

/* F = happinessMax * min(1, G) * max(0, 1 - h). Excess energy and excess
   housing both stop at the formula's ceilings instead of creating a bonus. */
function getColonyHappiness(energySpent, mineralsSpent, population) {
  const cfg = getEconomyConfig();
  const p = Math.max(0, Number(population) || 0);
  const energyRequired = getPopulationEnergyRequirement(p);
  const housing = getHousingCapacity(mineralsSpent);
  const rawHousingDeficit = Math.max(0, p - housing);
  /* Float pow() can leave a funded colony a hair short of P. Treat that as
     full housing instead of shaving a fraction off every happy colony. */
  const housingDeficit = rawHousingDeficit > 1e-9 ? rawHousingDeficit : 0;
  const normalizedHousingDeficit = p > 0 ? housingDeficit / p : 0;
  const spentEnergy = Math.max(0, Number(energySpent) || 0);
  const energyFulfillment = energyRequired > 0
    ? (spentEnergy >= energyRequired - 1e-9 ? 1 : spentEnergy / energyRequired)
    : 1;
  const happiness = cfg.happinessMax *
    Math.min(1, Math.max(0, energyFulfillment)) *
    Math.max(0, 1 - normalizedHousingDeficit);
  return {
    population: p,
    energyRequired: energyRequired,
    energySpent: Math.max(0, Number(energySpent) || 0),
    energyFulfillment: energyFulfillment,
    housingCapacity: housing,
    housingDeficit: housingDeficit,
    normalizedHousingDeficit: normalizedHousingDeficit,
    happiness: clamp(happiness, 0, cfg.happinessMax),
    tier: getHappinessTier(clamp(happiness, 0, cfg.happinessMax))
  };
}

/* Population_growth = P * base_growth_rate * (F / 100). */
function getPopulationGrowthForHappiness(population, happiness) {
  const cfg = getEconomyConfig();
  const p = Math.max(0, Number(population) || 0);
  const f = clamp(Number(happiness) || 0, 0, cfg.happinessMax);
  return p * cfg.growthRate * (f / cfg.happinessMax);
}

/* The projected report for one colony. When an allocation is supplied by
   getSectorColonyAllocations() the spent figures are the sector's final
   answer; without one the colony is measured against the sector's current
   stock on its own, which is useful for the colony screen and for tests. */
/* Extra maintenance above 100% does not raise happiness (that is capped at
   100), but it accelerates growth. Each axis contributes up to the same
   surplus at the maintenance cap; 200% on both lines reaches
   growthMultiplierMax. The percentages are based on what was actually spent,
   so a sector that cannot fund the request does not get the bonus. */
function getMaintenanceGrowthMultiplier(energySpent, mineralsSpent, population) {
  const cfg = getEconomyConfig();
  const p = Math.max(0, Number(population) || 0);
  const maxBonus = cfg.maxGrowthMultiplier - 1;
  const maxOverPerAxis = Math.max(0, cfg.maxPercent / 100 - 1);
  if (p <= 0 || maxBonus <= 0 || maxOverPerAxis <= 0) return 1;
  const energyRequired = getPopulationEnergyRequirement(p);
  const mineralsRequired = getRequiredHousingMinerals(p);
  const overEnergy = energyRequired > 0
    ? Math.max(0, Math.max(0, energySpent) / energyRequired - 1)
    : 0;
  const overHousing = mineralsRequired > 0
    ? Math.max(0, Math.max(0, mineralsSpent) / mineralsRequired - 1)
    : 0;
  const maxOver = maxOverPerAxis * 2;
  return clamp(1 + ((overEnergy + overHousing) / maxOver) * maxBonus, 1, cfg.maxGrowthMultiplier);
}

function getColonyEconomy(system, allocation) {
  const population = getColonyPopulation(system);
  const workforce = getWorkforcePlan(system);
  const request = getColonyMaintenanceRequest(system);
  const production = getColonyProduction(system, workforce);
  const stockEnergy = system && system.sectorId != null ? getSectorStock(system.sectorId, "energy") : 0;
  const stockMinerals = system && system.sectorId != null ? getSectorStock(system.sectorId, "minerals") : 0;
  let energySpent = allocation && typeof allocation.energySpent === "number"
    ? allocation.energySpent
    : Math.min(request.energyRequested, Math.max(0, stockEnergy));
  let mineralsSpent = allocation && typeof allocation.mineralsSpent === "number"
    ? allocation.mineralsSpent
    : Math.min(request.mineralsRequested, Math.max(0, stockMinerals));
  energySpent = clamp(energySpent, 0, request.energyRequested);
  mineralsSpent = clamp(mineralsSpent, 0, request.mineralsRequested);

  const happiness = getColonyHappiness(energySpent, mineralsSpent, population);
  const baseGrowthAmount = getPopulationGrowthForHappiness(population, happiness.happiness);
  const growthMultiplier = getMaintenanceGrowthMultiplier(energySpent, mineralsSpent, population);
  const growthAmount = baseGrowthAmount * growthMultiplier;
  const growthProgress = clamp(typeof system.growthProgress === "number" ? system.growthProgress : 0, 0, 0.999999999);
  const energyFunding = request.energyRequired > 0 ? (energySpent / request.energyRequired) * 100 : 0;
  const mineralsFunding = request.mineralsRequired > 0 ? (mineralsSpent / request.mineralsRequired) * 100 : 0;
  const turnsToNextPop = growthAmount > 0
    ? Math.max(1, Math.ceil((1 - growthProgress) / growthAmount))
    : null;
  let growthBlockedBy = null;
  if (population <= 0) {
    growthBlockedBy = "population";
  } else if (growthAmount <= 0) {
    growthBlockedBy = happiness.energyFulfillment <= 0 && happiness.housingDeficit > 0
      ? "unfunded"
      : happiness.energyFulfillment <= 0
        ? "energy"
        : happiness.housingDeficit > 0
          ? "housing"
          : "happiness";
  }

  return {
    population: population,
    populationAfterGrowth: population,
    workforce: workforce,
    request: request,
    production: production,
    energySpent: energySpent,
    mineralsSpent: mineralsSpent,
    energyRequested: request.energyRequested,
    mineralsRequested: request.mineralsRequested,
    energyRequired: request.energyRequired,
    mineralsRequired: request.mineralsRequired,
    energyFulfillment: happiness.energyFulfillment,
    housingCapacity: happiness.housingCapacity,
    housingDeficit: happiness.housingDeficit,
    normalizedHousingDeficit: happiness.normalizedHousingDeficit,
    happiness: happiness.happiness,
    tier: happiness.tier,
    baseGrowthAmount: baseGrowthAmount,
    growthAmount: growthAmount,
    growthMultiplier: growthMultiplier,
    energyFunding: energyFunding,
    mineralsFunding: mineralsFunding,
    growthProgress: growthProgress,
    turnsToNextPop: turnsToNextPop,
    canGrow: growthAmount > 0,
    growthBlockedBy: growthBlockedBy,
    netEnergy: production.energy - energySpent,
    netMinerals: production.minerals - mineralsSpent
  };
}

/* Pure production: every completed, staffed building contributes
   output * staffedRatio. Base capital income is added separately because it
   belongs to the home world, not to a facility. */
function getColonyProduction(system, plan) {
  const workforce = plan || getWorkforcePlan(system);
  const resources = { energy: 0, minerals: 0, research: 0, influence: 0 };
  const buildings = [];
  if (!system || !system.colonized) {
    return { resources: resources, buildings: buildings };
  }
  (workforce.entries || []).forEach(function (entry) {
    if (entry.underConstruction || entry.staffedRatio <= 0) return;
    const output = getBuildingOutput(entry.type, entry.level);
    Object.keys(resources).forEach(function (key) {
      if (output[key]) resources[key] += output[key] * entry.staffedRatio;
    });
    buildings.push({
      index: entry.index,
      type: entry.type,
      level: entry.level,
      staffedRatio: entry.staffedRatio,
      output: output
    });
  });
  if (system.home) {
    resources.energy += CONFIG.baseIncome.energy;
    resources.minerals += CONFIG.baseIncome.minerals;
    resources.research += CONFIG.baseIncome.research;
  }
  return { resources: resources, buildings: buildings };
}

/* Split one resource across colonies in proportion to what each asked for.
   When the stock covers every request the requests are paid exactly, which
   keeps a fully funded colony at 100% happiness. */
function allocateSectorResource(requests, available) {
  const total = requests.reduce(function (sum, value) {
    return sum + Math.max(0, value);
  }, 0);
  const stock = Math.max(0, Number(available) || 0);
  if (total <= 0) return requests.map(function () { return 0; });
  if (total <= stock + 1e-9) return requests.map(function (value) { return Math.max(0, value); });
  const scale = stock / total;
  return requests.map(function (value) { return Math.max(0, value) * scale; });
}

/* Every colony in one sector, measured against the same ledger. This is the
   authority the UI and the turn pipeline both read, so a preview shows the
   same energy and housing a colony will actually receive. */
function getSectorColonyAllocations(sectorId) {
  const sector = typeof getSector === "function" ? getSector(sectorId) : null;
  const result = {
    sectorId: sector ? sector.id : sectorId,
    systems: [],
    byId: {},
    energy: { available: 0, requested: 0, spent: 0 },
    minerals: { available: 0, requested: 0, spent: 0 },
    happiness: 0,
    growth: 0
  };
  if (!sector) return result;
  const systems = (typeof getSectorSystems === "function" ? getSectorSystems(sector.id) : [])
    .filter(function (system) { return !!system && system.colonized; });
  if (!systems.length) {
    result.energy.available = Math.max(0, getSectorStock(sector.id, "energy"));
    result.minerals.available = Math.max(0, getSectorStock(sector.id, "minerals"));
    return result;
  }

  const drafts = systems.map(function (system) {
    const plan = getWorkforcePlan(system);
    return {
      system: system,
      workforce: plan,
      production: getColonyProduction(system, plan),
      request: getColonyMaintenanceRequest(system)
    };
  });
  const energyRequests = drafts.map(function (draft) { return draft.request.energyRequested; });
  const mineralRequests = drafts.map(function (draft) { return draft.request.mineralsRequested; });
  const availableEnergy = Math.max(0, getSectorStock(sector.id, "energy"));
  const availableMinerals = Math.max(0, getSectorStock(sector.id, "minerals"));
  const energySpent = allocateSectorResource(energyRequests, availableEnergy);
  const mineralsSpent = allocateSectorResource(mineralRequests, availableMinerals);

  result.energy.available = availableEnergy;
  result.minerals.available = availableMinerals;
  result.energy.requested = energyRequests.reduce(function (sum, value) { return sum + value; }, 0);
  result.minerals.requested = mineralRequests.reduce(function (sum, value) { return sum + value; }, 0);

  let happinessTotal = 0;
  drafts.forEach(function (draft, index) {
    const report = getColonyEconomy(draft.system, {
      energySpent: energySpent[index],
      mineralsSpent: mineralsSpent[index]
    });
    result.systems.push(report);
    result.byId[draft.system.id] = report;
    result.energy.spent += report.energySpent;
    result.minerals.spent += report.mineralsSpent;
    result.happiness += report.happiness;
    result.growth += report.growthAmount;
  });
  result.happiness = systems.length ? result.happiness / systems.length : 0;
  return result;
}

/* Apply the allocations to the ledger and remember the resolved report on
   each colony. The report is the authoritative happiness/growth snapshot for
   this turn; growPopulations() reads it after the turn advances. */
function resolveSectorPopulationMaintenance(sectorId) {
  const allocations = getSectorColonyAllocations(sectorId);
  if (allocations.energy.spent > 0) {
    addSectorStock(allocations.sectorId, "energy", -allocations.energy.spent);
  }
  if (allocations.minerals.spent > 0) {
    addSectorStock(allocations.sectorId, "minerals", -allocations.minerals.spent);
  }
  Object.keys(allocations.byId).forEach(function (systemId) {
    const system = getSystem(systemId);
    if (!system) return;
    const report = allocations.byId[systemId];
    report.resolvedTurn = state ? state.turn : null;
    system.economyReport = report;
  });
  return allocations;
}

function resolvePopulationMaintenance() {
  const sectors = [];
  const summary = {
    sectors: sectors,
    energySpent: 0,
    mineralsSpent: 0,
    energyRequested: 0,
    mineralsRequested: 0,
    colonies: 0,
    happiness: 0
  };
  if (!state || !state.galaxy) return summary;
  state.galaxy.sectors.forEach(function (sector) {
    const allocation = resolveSectorPopulationMaintenance(sector.id);
    sectors.push(allocation);
    summary.energySpent += allocation.energy.spent;
    summary.mineralsSpent += allocation.minerals.spent;
    summary.energyRequested += allocation.energy.requested;
    summary.mineralsRequested += allocation.minerals.requested;
    summary.colonies += allocation.systems.length;
    summary.happiness += allocation.happiness * allocation.systems.length;
  });
  summary.happiness = summary.colonies ? summary.happiness / summary.colonies : 0;
  return summary;
}

/* Bank fractional growth so a +0.25/turn colony gains a person every four
   turns. Growth never removes population: poor conditions simply stop it. */
function applyColonyGrowth(system) {
  const population = getColonyPopulation(system);
  const report = system.economyReport || getColonyEconomy(system);
  const growth = Math.max(0, report.growthAmount || 0);
  let progress = clamp(typeof system.growthProgress === "number" ? system.growthProgress : 0, 0, 0.999999999);
  let nextPopulation = population;
  if (growth > 0 && population > 0) {
    progress += growth;
    const whole = Math.floor(progress + 1e-9);
    if (whole > 0) {
      nextPopulation += whole;
      progress -= whole;
    }
  }
  system.population = nextPopulation;
  system.growthProgress = clamp(progress, 0, 0.999999999);
  system.economyReport = Object.assign({}, report, {
    populationAfterGrowth: nextPopulation,
    growthApplied: growth,
    growthProgressAfter: system.growthProgress
  });
  return { populationBefore: population, populationAfter: nextPopulation, growth: growth };
}

/* ---------- maintenance policy actions ---------- */

function getColonyMaintenanceChangeReason(system, axis, delta) {
  if (!system || !system.colonized) return "Only a colony manages maintenance.";
  if (axis !== "energy" && axis !== "minerals") return "Unknown maintenance axis.";
  const cfg = getEconomyConfig();
  const policy = getColonyMaintenancePolicy(system);
  const current = policy[axis];
  const next = clamp(current + (delta < 0 ? -cfg.stepPercent : cfg.stepPercent),
    cfg.minPercent, cfg.maxPercent);
  if (next === current) {
    return delta > 0
      ? "At the maximum " + cfg.maxPercent + "% maintenance."
      : "Already at " + cfg.minPercent + "% maintenance.";
  }
  return null;
}

function setColonyMaintenance(system, axis, value) {
  const cfg = getEconomyConfig();
  const policy = getColonyMaintenancePolicy(system);
  if (axis !== "energy" && axis !== "minerals") return false;
  policy[axis] = clamp(Math.round(value), cfg.minPercent, cfg.maxPercent);
  return true;
}

function adjustColonyMaintenance(system, axis, delta) {
  const reason = getColonyMaintenanceChangeReason(system, axis, delta);
  if (reason) return { ok: false, reason: reason };
  const cfg = getEconomyConfig();
  const policy = getColonyMaintenancePolicy(system);
  policy[axis] = clamp(policy[axis] + (delta < 0 ? -cfg.stepPercent : cfg.stepPercent),
    cfg.minPercent, cfg.maxPercent);
  return { ok: true, reason: null, value: policy[axis] };
}
