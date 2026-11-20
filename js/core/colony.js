/* ============================================================
   COLONY RULES — planet size, workforce, slots and colonization
   Everything that answers 'what can this colony support right now?'.
   The economic formulas (maintenance, housing, happiness, growth) live in
   core/colony-economy.js; this file decides which facilities can operate and
   which workers are assigned to them.
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

/* ---------- workforce allocation ---------- */

/* Explicit orders live on the colony as { slotIndex: workers }. An absent
   order means 'use this colony's automatic strategy', so a colony works
   without micro-management and a player can still pin a crew where it
   matters. */
function getWorkerOrders(system) {
  if (!system || typeof system !== "object") return {};
  if (!system.workerOrders || typeof system.workerOrders !== "object" || Array.isArray(system.workerOrders)) {
    system.workerOrders = {};
  }
  return system.workerOrders;
}

function hasWorkerOrders(system) {
  return Object.keys(getWorkerOrders(system)).length > 0;
}

function clearWorkerOrders(system) {
  if (!system) return false;
  system.workerOrders = {};
  return true;
}

/* Automatic crew strategies. Round robin hands out one worker at a time to
   every eligible facility (3 people across two 4-worker facilities = 2/1);
   greedy fills the earliest facilities first (3/0). Explicit orders always
   win because the player pinned them. */
function getWorkerStrategy(system) {
  const cfg = getEconomyConfig();
  const ids = (cfg.workerStrategies || []).map(function (entry) { return entry.id; });
  const fallback = cfg.defaultWorkerStrategy || "roundRobin";
  const raw = system && system.workerStrategy;
  return ids.indexOf(raw) !== -1 ? raw : fallback;
}

function getWorkerStrategyLabel(strategy) {
  const cfg = getEconomyConfig();
  const found = (cfg.workerStrategies || []).find(function (entry) { return entry.id === strategy; });
  return found ? found.label : String(strategy || "").toUpperCase();
}

/* The plan resolves every completed building to a crew. Production facilities
   are locked below their minimum colony population; support buildings are
   always available. Automatic workers follow the colony's strategy and can
   never exceed the population; explicit orders are applied first and are
   always capped by the remaining people. */
function getWorkforcePlan(system) {
  const strategy = getWorkerStrategy(system);
  const plan = {
    population: getColonyPopulation(system),
    strategy: strategy,
    jobsTotal: 0,
    jobsStaffed: 0,
    idleJobs: 0,
    assignedWorkers: 0,
    availableWorkers: 0,
    freeWorkers: 0,
    idleBuildings: 0,
    partialBuildings: 0,
    blockedBuildings: 0,
    blockedJobs: 0,
    hasOrders: false,
    entries: []
  };
  if (!system || !system.colonized) return plan;

  const orders = getWorkerOrders(system);
  plan.hasOrders = Object.keys(orders).length > 0;
  let available = plan.population;
  const entries = [];

  (system.slots || []).forEach(function (slot, index) {
    if (!slot) return;
    const level = getBuildingLevel(slot);
    const required = getBuildingWorkers(slot.type, level);
    const minPopulation = getBuildingMinPopulation(slot.type, level);
    const entry = {
      index: index,
      type: slot.type,
      level: level,
      levelName: getBuildingLevelName(slot.type, level),
      underConstruction: !!slot.underConstruction,
      active: false,
      eligible: false,
      minPopulation: minPopulation,
      workersRequired: required,
      workersAssigned: 0,
      staffedRatio: 0,
      explicit: Object.prototype.hasOwnProperty.call(orders, index)
    };

    if (slot.underConstruction) {
      entries.push(entry);
      return;
    }

    entry.eligible = plan.population >= minPopulation;
    if (entry.explicit) {
      const raw = Number(orders[index]);
      const clamped = clamp(Math.floor(isFinite(raw) ? raw : 0), 0, required);
      if (clamped !== raw) orders[index] = clamped;
      const desired = entry.eligible ? clamped : 0;
      const assigned = Math.min(desired, Math.max(0, available));
      available -= assigned;
      entry.workersAssigned = assigned;
    }
    entries.push(entry);
  });

  /* Automatic workers go only to completed, eligible facilities without a
     pinned order. Greedy respects slot order; round robin shares the pool. */
  const automatic = entries.filter(function (entry) {
    return !entry.underConstruction && entry.eligible && !entry.explicit;
  });
  if (strategy === "greedy") {
    automatic.forEach(function (entry) {
      const assigned = Math.min(entry.workersRequired, Math.max(0, available));
      entry.workersAssigned = assigned;
      available -= assigned;
    });
  } else {
    let progress = true;
    while (available > 0 && progress) {
      progress = false;
      automatic.forEach(function (entry) {
        if (available <= 0) return;
        if (entry.workersAssigned >= entry.workersRequired) return;
        entry.workersAssigned += 1;
        available -= 1;
        progress = true;
      });
    }
  }

  entries.forEach(function (entry) {
    if (entry.underConstruction) return;
    const assigned = entry.workersAssigned;
    entry.staffedRatio = entry.workersRequired > 0 ? assigned / entry.workersRequired : 1;
    entry.active = entry.eligible && (entry.workersRequired === 0 || assigned > 0);

    plan.jobsTotal += entry.workersRequired;
    plan.jobsStaffed += assigned;
    plan.assignedWorkers += assigned;
    if (!entry.eligible) {
      plan.blockedBuildings += 1;
      plan.blockedJobs += entry.workersRequired;
    } else if (entry.workersRequired > 0 && assigned === 0) {
      plan.idleBuildings += 1;
    } else if (entry.workersRequired > 0 && assigned < entry.workersRequired) {
      plan.partialBuildings += 1;
    }
  });

  plan.entries = entries;
  plan.availableWorkers = Math.max(0, available);
  plan.freeWorkers = plan.availableWorkers;
  plan.idleJobs = Math.max(0, plan.jobsTotal - plan.jobsStaffed);
  return plan;
}

function findWorkforceEntry(plan, index) {
  return (plan.entries || []).find(function (entry) { return entry.index === index; }) || null;
}

/* A stepper press on one facility. It becomes an explicit order for every
   eligible completed building (so the rest of the crew stays where the
   player can see it), then moves one worker. The plan's capacity guard is
   the same one the renderer reads. */
function getFacilityWorkerChangeReason(system, index, delta) {
  if (!system || !system.colonized) return "Only a colony assigns workers.";
  const plan = getWorkforcePlan(system);
  const entry = findWorkforceEntry(plan, index);
  if (!entry || entry.underConstruction) return "This facility is not online yet.";
  if (!entry.eligible) {
    return "Needs " + entry.minPopulation + " population to operate.";
  }
  const next = clamp(entry.workersAssigned + (delta < 0 ? -1 : 1), 0, entry.workersRequired);
  if (next === entry.workersAssigned) {
    return delta > 0
      ? "This facility already has its full crew."
      : "No workers are assigned here.";
  }
  if (delta > 0 && plan.availableWorkers <= 0) {
    return "No free workers. Reassign a facility first.";
  }
  return null;
}

function adjustFacilityWorkersOrder(system, index, delta) {
  const reason = getFacilityWorkerChangeReason(system, index, delta);
  if (reason) return { ok: false, reason: reason };
  const plan = getWorkforcePlan(system);
  const entry = findWorkforceEntry(plan, index);
  const orders = getWorkerOrders(system);
  if (!plan.hasOrders) {
    /* Pin the crews the player can see. A blocked or unfinished facility
       stays on automatic staffing so it can fill itself once the colony
       reaches its population gate. */
    plan.entries.forEach(function (other) {
      if (!other.underConstruction && other.eligible) orders[other.index] = other.workersAssigned;
    });
  }
  const next = clamp(entry.workersAssigned + (delta < 0 ? -1 : 1), 0, entry.workersRequired);
  orders[index] = next;
  return { ok: true, reason: null, workers: next, plan: getWorkforcePlan(system) };
}

/* ---------- slots, attention and colonization ---------- */

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
