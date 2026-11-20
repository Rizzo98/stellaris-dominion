/* ============================================================
   ECONOMY — per-sector ledgers, planet breakdown and empire totals
   Energy and minerals are held by each sector: every colony, orbital
   structure and upkeep bill belongs to the sector it sits in. Research and
   influence are empire-wide and every sector feeds the same stockpile.
   getPlanetBreakdown() explains one colony, getSectorEconomy() one sector,
   getEconomy() the whole empire. Event drawing lives in
   core/event-engine.js; gate-linked transfers live in core/trade.js.

   Population maintenance is resolved by core/colony-economy.js. This file
   turns those reports into ledger lines, and it never lets a sector stock go
   below zero: a colony that cannot afford its maintenance spends what is
   there and reports lower happiness instead.
   ============================================================ */

function addEntry(list, label, amount, sub) {
  if (!amount) return;
  list.push({ label: label, amount: amount, sub: sub || "" });
}

function roundIncome(value) {
  return Math.round(value * 10) / 10;
}

function buildingWorkerSub(stat) {
  if (!stat.workersRequired) return "";
  const base = stat.workersAssigned + "/" + stat.workersRequired + " workers";
  if (stat.workersAssigned < stat.workersRequired) return base + " · understaffed";
  return base;
}

/* Every building carries its own level, so the ledger tells the player which
   refit the yield came from instead of assuming a researched tech applies. */
function buildingLevelSub(type, level) {
  if (!level || level <= 1) return "";
  const levelName = getBuildingLevelName(type, level);
  return "LVL " + level + (levelName ? " · " + levelName.toUpperCase() : "");
}

function formatEconomic(value) {
  return formatAmount(Math.round(value * 100) / 100);
}

/* Local production for the planet screen and details. Production is
   staffed-facility output; upkeep is the standing colony overhead and the
   energy requested by the colony's maintenance policy. The population report
   also carries the actual spend, happiness and growth calculated for the
   current ledger. */
function getPlanetBreakdown(system, reportOverride) {
  const output = { energy: 0, minerals: 0, research: 0, influence: 0 };
  const counts = { mine: 0, power: 0, lab: 0, embassy: 0 };
  const typeStats = {};
  const workforce = getWorkforcePlan(system);
  const planByIndex = {};
  workforce.entries.forEach(function (entry) { planByIndex[entry.index] = entry; });
  let buildingUpkeep = 0;
  let builtCount = 0;
  const activeBuildings = [];
  let report = reportOverride;
  if (!report) {
    const allocations = system && system.sectorId != null
      ? getSectorColonyAllocations(system.sectorId)
      : null;
    report = allocations && allocations.byId[system.id]
      ? allocations.byId[system.id]
      : getColonyEconomy(system);
  }
  const populationEnergyUpkeep = report.energyRequested;
  const populationMineralUpkeep = report.mineralsRequested;

  if (system.colonized) {
    (system.slots || []).forEach(function (slot, index) {
      if (!slot) return;
      const planEntry = planByIndex[index];
      const level = getBuildingLevel(slot);
      const out = getBuildingOutput(slot.type, level);
      const upkeep = getBuildingUpkeep(slot.type);
      const ratio = !slot.underConstruction && planEntry ? planEntry.staffedRatio : 0;
      const assigned = planEntry ? planEntry.workersAssigned : 0;
      const required = planEntry ? planEntry.workersRequired : getBuildingWorkers(slot.type, level);
      const minPopulation = planEntry ? planEntry.minPopulation : getBuildingMinPopulation(slot.type, level);
      activeBuildings.push({
        index: index,
        type: slot.type,
        level: level,
        levelName: getBuildingLevelName(slot.type, level),
        underConstruction: !!slot.underConstruction,
        eligible: planEntry ? planEntry.eligible : true,
        active: !slot.underConstruction && ratio > 0,
        workersRequired: required,
        workersAssigned: assigned,
        staffedRatio: ratio,
        minPopulation: minPopulation,
        output: out,
        upkeep: upkeep
      });
      if (slot.underConstruction) return;
      builtCount += 1;
      counts[slot.type] = (counts[slot.type] || 0) + 1;

      /* Completed buildings pay their energy upkeep even with no workers. */
      buildingUpkeep += upkeep;

      const stat = typeStats[slot.type] || {
        count: 0,
        level: 1,
        workersAssigned: 0,
        workersRequired: 0,
        minPopulation: 0,
        blocked: 0,
        output: { energy: 0, minerals: 0, research: 0, influence: 0 }
      };
      stat.count += 1;
      stat.level = Math.max(stat.level || 1, level);
      stat.workersAssigned += assigned;
      stat.workersRequired += required;
      stat.minPopulation = Math.max(stat.minPopulation || 0, minPopulation);
      if (!slot.underConstruction && planEntry && !planEntry.eligible) stat.blocked += 1;
      ["energy", "minerals", "research", "influence"].forEach(function (key) {
        const scaled = (out[key] || 0) * ratio;
        stat.output[key] += scaled;
      });
      typeStats[slot.type] = stat;
    });
  }

  const sources = { energy: [], minerals: [], research: [], influence: [] };
  if (system.colonized && system.home) {
    addEntry(sources.energy, "Home capital", CONFIG.baseIncome.energy);
    addEntry(sources.minerals, "Home capital", CONFIG.baseIncome.minerals);
    addEntry(sources.research, "Home capital", CONFIG.baseIncome.research);
  }

  const sourceByType = {
    power: { key: "energy", label: "Power Plants" },
    mine: { key: "minerals", label: "Mines" },
    lab: { key: "research", label: "Labs" },
    embassy: { key: "influence", label: "Embassies" }
  };
  BUILDING_ORDER.forEach(function (type) {
    const stat = typeStats[type];
    const source = sourceByType[type];
    if (!stat || !source) return;
    const amount = stat.output[source.key] || 0;
    if (!amount) return;
    const sub = [buildingWorkerSub(stat), buildingLevelSub(type, stat.level)].filter(Boolean).join(" · ");
    addEntry(sources[source.key], source.label + " ×" + stat.count, amount, sub);
  });

  Object.keys(report.production.resources).forEach(function (key) {
    if (key === "energy" || key === "minerals" || key === "research" || key === "influence") {
      output[key] = report.production.resources[key] || 0;
    }
  });

  const colonyUpkeep = system.colonized ? CONFIG.colonyEnergyUpkeep : 0;
  const upkeepItems = [];
  if (colonyUpkeep) addEntry(upkeepItems, "Colony overhead", colonyUpkeep);
  if (populationEnergyUpkeep) {
    addEntry(upkeepItems, "Population energy maintenance", populationEnergyUpkeep,
      report.request.energyPercent + "% funded · " + formatEconomic(report.energySpent) +
      " of " + formatEconomic(report.energyRequired) + " ⚡ supplied");
  }
  BUILDING_ORDER.forEach(function (type) {
    const count = counts[type] || 0;
    const upkeep = getBuildingUpkeep(type);
    if (count && upkeep) {
      addEntry(upkeepItems, BUILDINGS[type].name + " draw ×" + count, count * upkeep);
    }
  });

  const mineralUpkeepItems = [];
  if (populationMineralUpkeep) {
    addEntry(mineralUpkeepItems, "Population housing investment", populationMineralUpkeep,
      report.request.mineralsPercent + "% funded · H " + formatEconomic(report.housingCapacity) +
      " for " + report.population + " population");
  }
  const populationUpkeep = {
    energy: populationEnergyUpkeep,
    minerals: populationMineralUpkeep
  };
  const infrastructureUpkeep = colonyUpkeep + buildingUpkeep;

  return {
    output: output,
    sources: sources,
    counts: counts,
    typeStats: typeStats,
    activeBuildings: activeBuildings,
    builtCount: builtCount,
    population: report.population,
    workforce: workforce,
    colony: report,
    populationMaintenance: report,
    populationUpkeep: populationUpkeep,
    happiness: report.happiness,
    tier: report.tier,
    housingCapacity: report.housingCapacity,
    housingDeficit: report.housingDeficit,
    energyFulfillment: report.energyFulfillment,
    growthAmount: report.growthAmount,
    growthBlockedBy: report.growthBlockedBy,
    idleJobs: workforce.idleJobs,
    idleBuildings: workforce.idleBuildings,
    partialBuildings: workforce.partialBuildings,
    blockedBuildings: workforce.blockedBuildings,
    colonyUpkeep: colonyUpkeep,
    buildingUpkeep: buildingUpkeep,
    infrastructureUpkeep: infrastructureUpkeep,
    upkeep: infrastructureUpkeep + populationEnergyUpkeep,
    mineralUpkeep: populationMineralUpkeep,
    upkeepItems: upkeepItems,
    mineralUpkeepItems: mineralUpkeepItems,
    localNetEnergy: output.energy - (infrastructureUpkeep + populationEnergyUpkeep),
    localNetMinerals: output.minerals - populationMineralUpkeep
  };
}

/* ---------- sector ledgers ---------- */

/* Energy and minerals are stored on the sector itself. Every sector is
   created with a ledger, but a defensive default keeps older states valid. */
function getSectorLedger(sectorId) {
  const sector = getSector(sectorId);
  if (!sector) return { energy: 0, minerals: 0 };
  if (!sector.economy) sector.economy = { energy: 0, minerals: 0 };
  return sector.economy;
}

function getSectorStock(sectorId, key) {
  const ledger = getSectorLedger(sectorId);
  return typeof ledger[key] === "number" && isFinite(ledger[key]) ? ledger[key] : 0;
}

/* A ledger is never allowed below zero. Turn upkeep and actions both call
   this path, so an overdraw becomes a shortfall in the caller instead of an
   invalid balance. */
function setSectorStock(sectorId, key, value) {
  const ledger = getSectorLedger(sectorId);
  const numeric = typeof value === "number" && isFinite(value) ? value : 0;
  ledger[key] = Math.max(0, numeric);
  return ledger[key];
}

function addSectorStock(sectorId, key, amount) {
  if (!amount) return getSectorStock(sectorId, key);
  return setSectorStock(sectorId, key, getSectorStock(sectorId, key) + amount);
}

function getSectorCarry(sectorId) {
  const sector = getSector(sectorId);
  if (!sector) return { energy: 0, minerals: 0 };
  if (!sector.carry) sector.carry = { energy: 0, minerals: 0 };
  return sector.carry;
}

function canSectorAfford(sectorId, cost) {
  const wanted = cost || {};
  if ((wanted.energy || 0) > getSectorStock(sectorId, "energy") + 1e-9) return false;
  if ((wanted.minerals || 0) > getSectorStock(sectorId, "minerals") + 1e-9) return false;
  return true;
}

/* Spend from one sector's ledger. Returns false and changes nothing when the
   sector cannot cover the cost. */
function spendSectorCost(sectorId, cost) {
  const wanted = cost || {};
  if (!canSectorAfford(sectorId, wanted)) return false;
  if (wanted.energy) addSectorStock(sectorId, "energy", -wanted.energy);
  if (wanted.minerals) addSectorStock(sectorId, "minerals", -wanted.minerals);
  return true;
}

/* Costs belong to the sector where the action happens. When no sector is
   known (a stray event) the current sector pays. */
function getEconomySectorId() {
  if (!state || !state.galaxy) return null;
  const sector = getSector(state.ui ? state.ui.activeSector : null);
  if (sector) return sector.id;
  const home = state.systems ? state.systems.find(function (system) { return system.home; }) : null;
  return home ? home.sectorId : (state.galaxy.sectors[0] ? state.galaxy.sectors[0].id : null);
}

/* Sectors whose current stock cannot cover their projected infrastructure
   upkeep. Population maintenance is intentionally excluded: a colony that
   cannot fully fund it loses happiness, not the empire's stability. */
function getSectorsInDeficit() {
  if (!state || !state.galaxy) return [];
  return state.galaxy.sectors.filter(function (sector) {
    const econ = getSectorEconomy(sector.id);
    const due = Math.max(0, econ.infrastructureUpkeep || 0);
    return due > 0 && getSectorStock(sector.id, "energy") + 1e-9 < due;
  });
}

/* The research directorate draws its upkeep from the capital's sector grid. */
function getCapitalSectorId() {
  if (!state || !state.systems) return null;
  const home = state.systems.find(function (system) { return system.home; });
  return home ? home.sectorId : null;
}

/* ---------- per-sector economy ---------- */

/* Everything that answers 'what does this sector earn and spend?'. */
function getSectorEconomy(sectorId) {
  const sector = getSector(sectorId);
  const counts = { mine: 0, power: 0, lab: 0, embassy: 0 };
  const raw = { energy: 0, minerals: 0, research: 0, influence: 0 };
  const sources = { energy: [], minerals: [], research: [], influence: [] };
  const upkeepItems = [];
  const mineralUpkeepItems = [];
  const planets = [];
  let colonyCount = 0;
  let colonyUpkeep = 0;
  let buildingUpkeep = 0;
  let populationUpkeepEnergy = 0;
  let populationUpkeepMinerals = 0;
  let populationEnergySpent = 0;
  let populationMineralsSpent = 0;
  let happinessTotal = 0;
  let growthTotal = 0;
  let population = 0;
  let housingCapacity = 0;
  let builtCount = 0;
  let idleJobs = 0;
  let idleBuildings = 0;
  let blockedBuildings = 0;
  const allocations = sector ? getSectorColonyAllocations(sector.id) : null;

  if (sector) {
    getSectorSystems(sector.id).forEach(function (system) {
      if (!system.colonized) return;
      colonyCount += 1;
      const planet = getPlanetBreakdown(system, allocations ? allocations.byId[system.id] : null);
      planets.push({ system: system, planet: planet });
      counts.mine += planet.counts.mine;
      counts.power += planet.counts.power;
      counts.lab += planet.counts.lab;
      counts.embassy += planet.counts.embassy;
      raw.energy += planet.output.energy;
      raw.minerals += planet.output.minerals;
      raw.research += planet.output.research;
      raw.influence += planet.output.influence;
      colonyUpkeep += planet.colonyUpkeep;
      buildingUpkeep += planet.buildingUpkeep;
      populationUpkeepEnergy += planet.populationUpkeep.energy;
      populationUpkeepMinerals += planet.populationUpkeep.minerals;
      populationEnergySpent += planet.populationMaintenance.energySpent;
      populationMineralsSpent += planet.populationMaintenance.mineralsSpent;
      happinessTotal += planet.populationMaintenance.happiness;
      growthTotal += planet.populationMaintenance.growthAmount;
      population += planet.population;
      housingCapacity += planet.housingCapacity;
      builtCount += planet.builtCount;
      idleJobs += planet.idleJobs;
      idleBuildings += planet.idleBuildings;
      blockedBuildings += planet.blockedBuildings;
    });
  }

  /* Orbital works pay upkeep in the sector that hosts them. */
  const structureCounts = {};
  if (sector) {
    Object.keys(sector.structures || {}).forEach(function (key) {
      const structure = sector.structures[key];
      if (!structure || structure.underConstruction) return;
      if (!isPlayerStructure(structure)) return;
      const def = STRUCTURE_TYPES[structure.type];
      if (!def || !def.energyUpkeep) return;
      structureCounts[structure.type] = (structureCounts[structure.type] || 0) + 1;
    });
  }
  let structureUpkeep = 0;
  STRUCTURE_ORDER.forEach(function (type) {
    const count = structureCounts[type] || 0;
    const def = STRUCTURE_TYPES[type];
    if (!count || !def || !def.energyUpkeep) return;
    const amount = count * def.energyUpkeep;
    structureUpkeep += amount;
    addEntry(upkeepItems, def.name + " ×" + count, amount);
  });

  /* The research directorate sits in the capital sector. */
  const researchUpkeep = sector && sector.id === getCapitalSectorId() && state.tech.active
    ? getTechEnergyUpkeep(state.tech.active)
    : 0;
  if (researchUpkeep) {
    addEntry(upkeepItems, "Research: " + TECHS[state.tech.active].name, researchUpkeep);
  }

  if (colonyUpkeep) addEntry(upkeepItems, "Colony overhead ×" + colonyCount, colonyUpkeep);
  if (populationUpkeepEnergy) {
    addEntry(upkeepItems, "Population energy maintenance ×" + colonyCount, populationUpkeepEnergy,
      populationEnergySpent < populationUpkeepEnergy
        ? "Short of " + formatEconomic(populationUpkeepEnergy - populationEnergySpent) + " ⚡"
        : "");
  }
  BUILDING_ORDER.forEach(function (type) {
    const count = counts[type] || 0;
    const upkeep = getBuildingUpkeep(type);
    if (count && upkeep) {
      addEntry(upkeepItems, BUILDINGS[type].name + " draw ×" + count, count * upkeep);
    }
  });
  if (populationUpkeepMinerals) {
    addEntry(mineralUpkeepItems, "Population housing investment ×" + colonyCount, populationUpkeepMinerals,
      populationMineralsSpent < populationUpkeepMinerals
        ? "Short of " + formatEconomic(populationUpkeepMinerals - populationMineralsSpent) + " ⛏"
        : "");
  }

  /* Per-colony source rows, so the resource sheet can name the world. */
  planets.forEach(function (entry) {
    ["energy", "minerals", "research", "influence"].forEach(function (key) {
      (entry.planet.sources[key] || []).forEach(function (source) {
        sources[key].push({
          label: entry.system.name + " · " + source.label,
          amount: source.amount,
          sub: source.sub
        });
      });
    });
  });

  const ethic = getEthic();
  const stabilityMult = state.stability < CONFIG.stability.lowThreshold
    ? CONFIG.stability.productionMultiplier
    : 1;
  const mineralMult = ethic && ethic.mineralMult ? ethic.mineralMult : 1;
  const researchMult = ethic && ethic.researchMult ? ethic.researchMult : 1;

  const income = {
    energy: roundIncome(raw.energy * stabilityMult),
    minerals: roundIncome(raw.minerals * mineralMult * stabilityMult),
    research: roundIncome(raw.research * researchMult * stabilityMult),
    influence: roundIncome(raw.influence * stabilityMult)
  };
  const infrastructureUpkeep = colonyUpkeep + buildingUpkeep + structureUpkeep + researchUpkeep;
  const upkeep = infrastructureUpkeep + populationUpkeepEnergy;
  const mineralUpkeep = populationUpkeepMinerals;
  const tradeFlow = sector ? getSectorTradeFlow(sector.id) : {
    in: { energy: 0, minerals: 0 },
    out: { energy: 0, minerals: 0 },
    entries: []
  };
  const net = {
    energy: roundIncome(income.energy - upkeep + tradeFlow.in.energy - tradeFlow.out.energy),
    minerals: roundIncome(income.minerals - mineralUpkeep + tradeFlow.in.minerals - tradeFlow.out.minerals)
  };

  const mineralMods = [];
  if (mineralMult !== 1) mineralMods.push({ label: "Militarist doctrine", mult: mineralMult });
  if (stabilityMult !== 1) mineralMods.push({ label: "Unrest", mult: stabilityMult });
  const researchMods = [];
  if (researchMult !== 1) researchMods.push({ label: "Xenophile doctrine", mult: researchMult });
  if (stabilityMult !== 1) researchMods.push({ label: "Unrest", mult: stabilityMult });
  const energyMods = [];
  if (stabilityMult !== 1) energyMods.push({ label: "Unrest", mult: stabilityMult });
  const influenceMods = [];
  if (stabilityMult !== 1) influenceMods.push({ label: "Unrest", mult: stabilityMult });

  const strongholdCount = structureCounts.stronghold || 0;
  const strongholdUpkeep = strongholdCount * ((STRUCTURE_TYPES.stronghold && STRUCTURE_TYPES.stronghold.energyUpkeep) || 0);
  const tradeCenterCount = structureCounts.trading || 0;
  const tradeCenterUpkeep = tradeCenterCount * ((STRUCTURE_TYPES.trading && STRUCTURE_TYPES.trading.energyUpkeep) || 0);
  const populationMaintenance = {
    colonies: colonyCount,
    energyRequested: populationUpkeepEnergy,
    energySpent: populationEnergySpent,
    mineralsRequested: populationUpkeepMinerals,
    mineralsSpent: populationMineralsSpent,
    happiness: colonyCount ? happinessTotal / colonyCount : 0,
    growth: growthTotal,
    shortfallEnergy: Math.max(0, populationUpkeepEnergy - populationEnergySpent),
    shortfallMinerals: Math.max(0, populationUpkeepMinerals - populationMineralsSpent)
  };

  return {
    sector: sector,
    sectorId: sector ? sector.id : sectorId,
    colonyCount: colonyCount,
    counts: counts,
    builtCount: builtCount,
    population: population,
    housingCapacity: housingCapacity,
    idleJobs: idleJobs,
    idleBuildings: idleBuildings,
    blockedBuildings: blockedBuildings,
    planets: planets,
    raw: raw,
    income: income,
    upkeep: upkeep,
    upkeepItems: upkeepItems,
    colonyUpkeep: colonyUpkeep,
    buildingUpkeep: buildingUpkeep,
    infrastructureUpkeep: infrastructureUpkeep,
    populationUpkeepEnergy: populationUpkeepEnergy,
    populationUpkeepMinerals: populationUpkeepMinerals,
    populationMaintenance: populationMaintenance,
    structureUpkeep: structureUpkeep,
    strongholdCount: strongholdCount,
    strongholdUpkeep: strongholdUpkeep,
    tradeCenterCount: tradeCenterCount,
    tradeCenterUpkeep: tradeCenterUpkeep,
    researchUpkeep: researchUpkeep,
    mineralUpkeep: mineralUpkeep,
    mineralUpkeepItems: mineralUpkeepItems,
    trade: tradeFlow,
    net: net,
    sources: sources,
    stabilityMult: stabilityMult,
    instability: stabilityMult !== 1,
    mineralMult: mineralMult,
    researchMult: researchMult,
    mods: {
      energy: energyMods,
      minerals: mineralMods,
      research: researchMods,
      influence: influenceMods
    }
  };
}

/* Empire-wide output. Research and influence are summed across every sector
   into one stockpile; energy and minerals stay local but the ledger view
   totals them. This powers the topbar, the empire tab and the sheets. */
function getEconomy() {
  const sectors = state.galaxy ? state.galaxy.sectors.map(function (sector) {
    return getSectorEconomy(sector.id);
  }) : [];

  const counts = { mine: 0, power: 0, lab: 0, embassy: 0 };
  const raw = { energy: 0, minerals: 0, research: 0, influence: 0 };
  const income = { energy: 0, minerals: 0, research: 0, influence: 0 };
  const sources = { energy: [], minerals: [], research: [], influence: [] };
  const upkeepItems = [];
  const mineralUpkeepItems = [];
  let colonyCount = 0;
  let colonyUpkeep = 0;
  let buildingUpkeep = 0;
  let infrastructureUpkeep = 0;
  let structureUpkeep = 0;
  let researchUpkeep = 0;
  let populationUpkeepEnergy = 0;
  let mineralUpkeep = 0;
  let populationEnergySpent = 0;
  let populationMineralsSpent = 0;
  let happinessTotal = 0;
  let growthTotal = 0;
  let strongholdCount = 0;
  let strongholdUpkeep = 0;
  let tradeCenterCount = 0;
  let tradeCenterUpkeep = 0;
  let population = 0;
  let housingCapacity = 0;
  let builtCount = 0;
  let idleJobs = 0;
  let idleBuildings = 0;
  let blockedBuildings = 0;
  let netEnergy = 0;
  let netMinerals = 0;

  sectors.forEach(function (sectorEcon) {
    const sectorName = sectorEcon.sector ? sectorEcon.sector.name : sectorEcon.sectorId;
    colonyCount += sectorEcon.colonyCount;
    ["mine", "power", "lab", "embassy"].forEach(function (key) {
      counts[key] += sectorEcon.counts[key];
    });
    ["energy", "minerals", "research", "influence"].forEach(function (key) {
      raw[key] += sectorEcon.raw[key];
      income[key] += sectorEcon.income[key];
      (sectorEcon.sources[key] || []).forEach(function (source) {
        sources[key].push({
          label: sectorName + " · " + source.label,
          amount: source.amount,
          sub: source.sub
        });
      });
    });
    sectorEcon.upkeepItems.forEach(function (item) {
      upkeepItems.push({ label: sectorName + " · " + item.label, amount: item.amount });
    });
    (sectorEcon.mineralUpkeepItems || []).forEach(function (item) {
      mineralUpkeepItems.push({ label: sectorName + " · " + item.label, amount: item.amount });
    });
    colonyUpkeep += sectorEcon.colonyUpkeep;
    buildingUpkeep += sectorEcon.buildingUpkeep;
    infrastructureUpkeep += sectorEcon.infrastructureUpkeep;
    populationUpkeepEnergy += sectorEcon.populationUpkeepEnergy;
    mineralUpkeep += sectorEcon.mineralUpkeep;
    populationEnergySpent += sectorEcon.populationMaintenance.energySpent;
    populationMineralsSpent += sectorEcon.populationMaintenance.mineralsSpent;
    happinessTotal += sectorEcon.populationMaintenance.happiness * sectorEcon.colonyCount;
    growthTotal += sectorEcon.populationMaintenance.growth;
    structureUpkeep += sectorEcon.structureUpkeep;
    researchUpkeep += sectorEcon.researchUpkeep;
    strongholdCount += sectorEcon.strongholdCount;
    strongholdUpkeep += sectorEcon.strongholdUpkeep;
    tradeCenterCount += sectorEcon.tradeCenterCount;
    tradeCenterUpkeep += sectorEcon.tradeCenterUpkeep;
    population += sectorEcon.population;
    housingCapacity += sectorEcon.housingCapacity;
    builtCount += sectorEcon.builtCount;
    idleJobs += sectorEcon.idleJobs;
    idleBuildings += sectorEcon.idleBuildings;
    blockedBuildings += sectorEcon.blockedBuildings;
    netEnergy += sectorEcon.net.energy;
    netMinerals += sectorEcon.net.minerals;
  });

  /* Influence is empire-wide: a baseline, doctrines and tech, plus every
     Embassy in every sector. */
  const influenceSources = [];
  addEntry(influenceSources, "Imperial baseline", CONFIG.baseIncome.influence);
  const ethic = getEthic();
  if (ethic && ethic.influenceFlat) {
    addEntry(influenceSources, ethic.name + " doctrine", ethic.influenceFlat);
  }
  if (hasTech("diplomacyNetwork")) {
    addEntry(influenceSources, "Diplomacy Network", TECHS.diplomacyNetwork.influenceBonus);
  }
  sectors.forEach(function (sectorEcon) {
    (sectorEcon.sources.influence || []).forEach(function (source) {
      addEntry(influenceSources, source.label, source.amount, source.sub);
    });
  });
  const stabilityMult = state.stability < CONFIG.stability.lowThreshold
    ? CONFIG.stability.productionMultiplier
    : 1;
  sources.influence = influenceSources;
  const rawInfluence = raw.influence + CONFIG.baseIncome.influence +
    (ethic && ethic.influenceFlat ? ethic.influenceFlat : 0) +
    (hasTech("diplomacyNetwork") ? TECHS.diplomacyNetwork.influenceBonus : 0);
  income.influence = roundIncome(rawInfluence * stabilityMult);

  const upkeep = infrastructureUpkeep + populationUpkeepEnergy;
  income.energy = roundIncome(income.energy);
  income.minerals = roundIncome(income.minerals);
  income.research = roundIncome(income.research);
  netEnergy = roundIncome(netEnergy);
  netMinerals = roundIncome(netMinerals);

  const trade = getTradeSummary();

  const mineralMods = [];
  const mineralMult = ethic && ethic.mineralMult ? ethic.mineralMult : 1;
  if (mineralMult !== 1) mineralMods.push({ label: "Militarist doctrine", mult: mineralMult });
  if (stabilityMult !== 1) mineralMods.push({ label: "Unrest", mult: stabilityMult });

  const researchMods = [];
  const researchMult = ethic && ethic.researchMult ? ethic.researchMult : 1;
  if (researchMult !== 1) researchMods.push({ label: "Xenophile doctrine", mult: researchMult });
  if (stabilityMult !== 1) researchMods.push({ label: "Unrest", mult: stabilityMult });
  const energyMods = [];
  const influenceMods = [];
  if (stabilityMult !== 1) {
    energyMods.push({ label: "Unrest", mult: stabilityMult });
    influenceMods.push({ label: "Unrest", mult: stabilityMult });
  }
  const populationMaintenance = {
    colonies: colonyCount,
    energyRequested: populationUpkeepEnergy,
    energySpent: populationEnergySpent,
    mineralsRequested: mineralUpkeep,
    mineralsSpent: populationMineralsSpent,
    happiness: colonyCount ? happinessTotal / colonyCount : 0,
    growth: growthTotal,
    shortfallEnergy: Math.max(0, populationUpkeepEnergy - populationEnergySpent),
    shortfallMinerals: Math.max(0, mineralUpkeep - populationMineralsSpent)
  };

  return {
    sectors: sectors,
    trade: trade,
    colonyCount: colonyCount,
    counts: counts,
    builtCount: builtCount,
    population: population,
    housingCapacity: housingCapacity,
    idleJobs: idleJobs,
    idleBuildings: idleBuildings,
    blockedBuildings: blockedBuildings,
    stabilityMult: stabilityMult,
    instability: stabilityMult !== 1,
    strongholdCount: strongholdCount,
    strongholdUpkeep: strongholdUpkeep,
    tradeCenterCount: tradeCenterCount,
    tradeCenterUpkeep: tradeCenterUpkeep,
    structureUpkeep: structureUpkeep,
    researchUpkeep: researchUpkeep,
    colonyUpkeep: colonyUpkeep,
    buildingUpkeep: buildingUpkeep,
    infrastructureUpkeep: infrastructureUpkeep,
    populationUpkeepEnergy: populationUpkeepEnergy,
    mineralUpkeep: mineralUpkeep,
    mineralUpkeepItems: mineralUpkeepItems,
    populationMaintenance: populationMaintenance,
    raw: raw,
    income: income,
    netEnergy: netEnergy,
    netMinerals: netMinerals,
    upkeep: upkeep,
    sources: sources,
    upkeepItems: upkeepItems,
    net: { energy: netEnergy, minerals: netMinerals },
    mods: {
      minerals: mineralMods,
      research: researchMods,
      energy: energyMods,
      influence: influenceMods
    },
    mineralMult: mineralMult,
    researchMult: researchMult,
    influenceMult: stabilityMult,
    energyMult: stabilityMult
  };
}

/* ---------- income application ---------- */

/* Fractional output is banked per sector, so a half-staffed mine pays a
   whole mineral every other turn instead of losing the fraction. */
function applySectorIncome(sectorId, key, amount) {
  if (key !== "energy" && key !== "minerals") return 0;
  const carry = getSectorCarry(sectorId);
  const total = amount + (carry[key] || 0);
  const gain = Math.floor(total + 1e-9);
  carry[key] = Math.max(0, total - gain);
  addSectorStock(sectorId, key, gain);
  return gain;
}

/* Empire-wide income for research and influence. Energy and minerals are
   routed to the sector ledger so the old call sites keep working. */
function applyResourceIncome(key, amount) {
  if (key === "energy" || key === "minerals") {
    return applySectorIncome(getEconomySectorId(), key, amount);
  }
  if (!state.resourceCarry) state.resourceCarry = { research: 0, influence: 0 };
  const carry = state.resourceCarry[key] || 0;
  const total = amount + carry;
  const gain = Math.floor(total + 1e-9);
  state.resourceCarry[key] = Math.max(0, total - gain);
  state.resources[key] = Math.max(0, (state.resources[key] || 0) + gain);
  return gain;
}

/* Snapshot used by the topbar and the end-of-turn number animation: local
   energy and minerals, empire-wide research and influence. */
function getDisplayResources() {
  const sectorId = getEconomySectorId();
  return {
    energy: sectorId ? getSectorStock(sectorId, "energy") : 0,
    minerals: sectorId ? getSectorStock(sectorId, "minerals") : 0,
    research: state.resources.research || 0,
    influence: state.resources.influence || 0
  };
}
