/* ============================================================
   DEBUG SCHEMA — the tab order, field labels and safe ranges used by the
   debug console (js/ui/debug-screen.js).

   The console itself renders every leaf of CONFIG and of the content tables,
   so a new balance field needs no UI code: it appears with a humanised label
   and a default 0..1000 range. This file is where a field earns a better
   label, a tighter range, a unit, a select or a list template.

   Keys are "<source>:<path>". A path below an array is normalised to use '*'
   for the index (economy.startingFacilities.*.type), so one entry covers every
   row of that list.
   ============================================================ */

const DEBUG_TABS = [
  {
    id: "general",
    label: "GENERAL",
    emoji: "⚙",
    blurb: "Starting stockpile, income, upkeep, stability, refits and input timing."
  },
  {
    id: "economy",
    label: "ECONOMY",
    emoji: "💰",
    blurb: "Colony equations, population growth, maintenance policy, facilities, planet slots, trade and gates."
  },
  {
    id: "events",
    label: "EVENTS",
    emoji: "🎲",
    blurb: "Draw cadence, civil unrest and every encounter card: weights, unlock turns, category and deck membership."
  },
  {
    id: "galaxy",
    label: "GALAXY",
    emoji: "🌌",
    blurb: "Galaxy generation, sector geometry and survey-site density. Generation settings shape the next new match."
  },
  {
    id: "military",
    label: "MILITARY",
    emoji: "⚔",
    blurb: "Combat rules, rival powers, archetype behaviour and every hull's base stats."
  },
  {
    id: "content",
    label: "CONTENT",
    emoji: "📦",
    blurb: "Buildings, orbital structures, survey sites, origins, planet types and research costs."
  }
];
const DEBUG_TAB_ORDER = DEBUG_TABS.map(function (tab) { return tab.id; });

/* Which fields of a content entry the console shows, in order. Nested objects
   (cost, output, reward, upgrades) are rendered child by child. */
const DEBUG_CONTENT_FIELDS = {
  ships: ["attack", "hull", "power", "speed", "buildTime", "cost", "upgrades"],
  structures: ["cost", "buildTime", "energyUpkeep", "power", "attack", "hull", "patrolRadius"],
  buildings: ["cost", "output", "perLevel", "maxLevel", "energyUpkeep", "workers"],
  anomalies: ["weight", "studyTurns", "reward"],
  archetypes: ["aggressionMult", "fleetCapBonus", "colonyCapBonus", "incomeBonus", "raidBias", "growthBias"],
  ethics: ["mineralMult", "influenceFlat", "researchMult", "blocksMilitary", "unlocksXeno"],
  planetTypes: ["weight"]
};

/* Tech entries are a mix of a number cost and optional numeric payloads. */
const DEBUG_TECH_NUMERIC_KEYS = [
  "cost",
  "buildingLevel",
  "statLevel",
  "radarBonus",
  "gateOps",
  "tradeRoutes",
  "influenceBonus",
  "strongholdAttack",
  "strongholdHull",
  "strongholdRadius",
  "requiresTechs"
];

const DEBUG_FIELD_META = {
  /* ---------- general ---------- */
  "config:startingResources.energy": { label: "Starting ⚡ energy", min: 0, max: 9999 },
  "config:startingResources.minerals": { label: "Starting ⛏ minerals", min: 0, max: 9999 },
  "config:startingResources.research": { label: "Starting 🔬 research", min: 0, max: 9999 },
  "config:startingResources.influence": { label: "Starting 🏛 influence", min: 0, max: 9999 },
  "config:baseIncome.energy": { label: "Baseline ⚡ energy / turn", min: 0, max: 1000 },
  "config:baseIncome.minerals": { label: "Baseline ⛏ minerals / turn", min: 0, max: 1000 },
  "config:baseIncome.research": { label: "Baseline 🔬 research / turn", min: 0, max: 1000 },
  "config:baseIncome.influence": { label: "Baseline 🏛 influence / turn", min: 0, max: 1000 },
  "config:colonizeCost.minerals": { label: "Colonise ⛏ minerals", min: 0, max: 9999 },
  "config:colonizeCost.influence": { label: "Colonise 🏛 influence", min: 0, max: 9999 },
  "config:colonyEnergyUpkeep": { label: "Colony ⚡ upkeep / turn", min: 0, max: 1000 },
  "config:research.energyUpkeep": { label: "Research ⚡ upkeep / turn", min: 0, max: 1000 },
  "config:stability.start": { label: "Opening stability", min: 0, max: 100, step: 1 },
  "config:stability.drag": {
    label: "Stability drag",
    help: "Share of yesterday's stability kept each turn. 0.7 = 70% old mood + 30% new mood.",
    min: 0,
    max: 1,
    step: 0.01
  },
  "config:stability.lowThreshold": { label: "Low-stability warning below", min: 0, max: 100 },
  "config:stability.energyDeficitPenalty": { label: "Deficit penalty", help: "Stability lost once per turn when any sector cannot pay its infrastructure upkeep.", min: 0, max: 100 },
  "config:stability.unrest.maxChance": { label: "Unrest max chance", help: "Chance at 0 stability. It falls to 0 at 100.", min: 0, max: 1, step: 0.01 },
  "config:stability.unrest.exponent": { label: "Unrest curve exponent", help: "p = maxChance × ((100 − S) / 100) ^ exponent", min: 0.1, max: 5, step: 0.1 },
  "config:upgrades.buildingCostShare": { label: "Building refit share of build cost", min: 0, max: 2, step: 0.05 },
  "config:upgrades.shipMineralsPerLevel": { label: "Ship refit ⛏ per stat level", min: 0, max: 100, step: 1 },
  "config:upgrades.repairMineralsPerHull": { label: "Repair ⛏ per hull point", min: 0, max: 100, step: 0.1 },
  "config:hold.delayMs": { label: "Long-press delay (ms)", min: 0, max: 5000, step: 10 },
  "config:hold.slop": { label: "Long-press drift slop (px)", min: 0, max: 200, step: 1 },
  "config:swipeThreshold": { label: "Swipe card threshold (px)", min: 10, max: 400, step: 1 },
  "config:turnTickMs": { label: "Turn animation (ms)", min: 0, max: 5000, step: 10 },

  /* ---------- economy ---------- */
  "config:economy.startingPopulation.home": { label: "Capital population", min: 0, max: 1000 },
  "config:economy.startingPopulation.colony": { label: "New colony population", min: 0, max: 1000 },
  "config:economy.startingFacilities": { addLabel: "ADD FACILITY", minItems: 0, template: { type: "power", level: 1 } },
  "config:economy.startingFacilities.*.type": {
    label: "Building",
    options: function () {
      return BUILDING_ORDER.map(function (id) { return { value: id, label: BUILDINGS[id] ? BUILDINGS[id].name : id }; });
    }
  },
  "config:economy.startingFacilities.*.level": { label: "Level", min: 1, max: 10, step: 1 },
  "config:economy.population.baseGrowthRate": { label: "Base growth rate", help: "growth = P × rate × (F / happinessMax) × multiplier", min: 0, max: 2, step: 0.005 },
  "config:economy.population.energyExponent": { label: "Energy exponent (a)", help: "E_required = population ^ a", min: 0.1, max: 4, step: 0.05 },
  "config:economy.population.housingExponent": { label: "Housing exponent (b)", help: "H = minerals spent ^ b, so the minerals for H = P are P ^ (1 / b).", min: 0.1, max: 4, step: 0.05 },
  "config:economy.population.happinessMax": { label: "Happiness ceiling (F_max)", min: 1, max: 1000, step: 1 },
  "config:economy.maintenance.minPercent": { label: "Maintenance floor (%)", min: 0, max: 100, step: 1 },
  "config:economy.maintenance.maxPercent": { label: "Maintenance ceiling (%)", min: 100, max: 1000, step: 10 },
  "config:economy.maintenance.stepPercent": { label: "Maintenance step (%)", min: 1, max: 100, step: 1 },
  "config:economy.maintenance.growthMultiplierMax": { label: "Growth multiplier ceiling", min: 1, max: 10, step: 0.1 },
  "config:economy.maintenance.defaultEnergyPercent": { label: "Default energy maintenance (%)", min: 0, max: 1000, step: 10 },
  "config:economy.maintenance.defaultMineralsPercent": { label: "Default housing maintenance (%)", min: 0, max: 1000, step: 10 },
  "config:economy.happinessTiers": {
    addLabel: "ADD TIER",
    minItems: 1,
    template: function (list) {
      return { id: "custom" + (list.length + 1), label: "CUSTOM", min: 0 };
    }
  },
  "config:economy.happinessTiers.*.id": { label: "Tier id" },
  "config:economy.happinessTiers.*.label": { label: "Tier label" },
  "config:economy.happinessTiers.*.min": { label: "Minimum happiness", min: 0, max: 1000, step: 1 },
  "config:economy.facilities.levels": {
    addLabel: "ADD LEVEL",
    minItems: 1,
    template: function (list) {
      return { level: list.length + 1, name: "New level", minPopulation: 0, workers: 1, output: 1 };
    }
  },
  "config:economy.facilities.levels.*.level": { label: "Level", min: 1, max: 20, step: 1 },
  "config:economy.facilities.levels.*.name": { label: "Level name" },
  "config:economy.facilities.levels.*.minPopulation": { label: "Minimum population", min: 0, max: 10000, step: 1 },
  "config:economy.facilities.levels.*.workers": { label: "Workers required", min: 0, max: 1000, step: 1 },
  "config:economy.facilities.levels.*.output": { label: "Output per turn", min: 0, max: 10000, step: 1 },
  "config:economy.workforce.defaultStrategy": {
    label: "Default worker strategy",
    options: function () {
      const list = (CONFIG.economy && CONFIG.economy.workforce && CONFIG.economy.workforce.strategies) || [];
      return list.map(function (entry) { return { value: entry.id, label: entry.label || entry.id }; });
    }
  },
  "config:planetSlots.sizes": {
    addLabel: "ADD SIZE",
    minItems: 1,
    template: function (list) {
      return { id: "custom" + (list.length + 1), name: "Custom", slots: 4, weight: 10 };
    }
  },
  "config:planetSlots.sizes.*.id": { label: "Size id" },
  "config:planetSlots.sizes.*.name": { label: "Size name" },
  "config:planetSlots.sizes.*.slots": { label: "Standard slots", min: 0, max: 24, step: 1 },
  "config:planetSlots.sizes.*.weight": { label: "Roll weight", min: 0, max: 1000, step: 1 },
  "config:planetSlots.bonus.oneChance": { label: "One bonus slot chance", min: 0, max: 1, step: 0.01 },
  "config:planetSlots.bonus.twoChance": { label: "Two bonus slots chance", min: 0, max: 1, step: 0.01 },
  "config:planetSlots.bonus.max": { label: "Maximum bonus slots", min: 0, max: 10, step: 1 },
  "config:planetSlots.unlockCost.energy": { label: "Unlock slot ⚡ energy", min: 0, max: 9999 },
  "config:planetSlots.unlockCost.minerals": { label: "Unlock slot ⛏ minerals", min: 0, max: 9999 },
  "config:trade.maxHops": { label: "Trade reach (hops)", min: 1, max: 20, step: 1 },
  "config:trade.maxAmount": { label: "Trade amount cap", min: 0, max: 10000, step: 1 },
  "config:trade.baseRoutes": { label: "Routes per center", min: 0, max: 20, step: 1 },
  "config:gates.baseOps": { label: "Jumps per gate / turn", min: 0, max: 20, step: 1 },

  /* ---------- events ---------- */
  "config:events.openingTurn": { label: "Opening card turn", min: 0, max: 500, step: 1 },
  "config:events.interval": { label: "Turns between cards", min: 0, max: 100, step: 1 },
  "config:events.minInterval": { label: "Minimum interval", min: 0, max: 100, step: 1 },
  "config:events.maxInterval": { label: "Maximum interval", min: 1, max: 200, step: 1 },
  "config:events.intervalRamp": { addLabel: "ADD RAMP STEP", minItems: 0, template: { fromTurn: 10, interval: 2 } },
  "config:events.intervalRamp.*.fromTurn": { label: "From turn", min: 0, max: 5000, step: 1 },
  "config:events.intervalRamp.*.interval": { label: "New interval", min: 1, max: 200, step: 1 },

  /* ---------- galaxy ---------- */
  "config:galaxy.seed": { label: "Galaxy seed", min: 0, max: 4294967295, step: 1 },
  "config:galaxy.jumpEnergyCost": { label: "Gate jump ⚡ cost", min: 0, max: 1000, step: 1 },
  "config:galaxy.outerRings": { label: "Outer rings", min: 1, max: 12, step: 1 },
  "config:galaxy.ringOneMin": { label: "Ring one minimum sectors", min: 0, max: 24, step: 1 },
  "config:galaxy.ringOneMax": { label: "Ring one maximum sectors", min: 0, max: 24, step: 1 },
  "config:galaxy.ringGrowth": { label: "Sectors gained per ring", min: 0, max: 20, step: 1 },
  "config:galaxy.parentWindow": { label: "Parent lane window", min: 0, max: 20, step: 1 },
  "config:galaxy.ringShortcutsMin": { label: "Shortcuts minimum", min: 0, max: 10, step: 1 },
  "config:galaxy.ringShortcutsMax": { label: "Shortcuts maximum", min: 0, max: 10, step: 1 },
  "config:galaxy.minSystems": { label: "Systems per sector minimum", min: 0, max: 20, step: 1 },
  "config:galaxy.maxSystems": { label: "Systems per sector maximum", min: 0, max: 20, step: 1 },
  "config:galaxy.layout.width": { label: "Graph width", min: 200, max: 4000, step: 10 },
  "config:galaxy.layout.height": { label: "Graph height", min: 200, max: 4000, step: 10 },
  "config:galaxy.layout.centerX": { label: "Centre X", min: 0, max: 4000, step: 10 },
  "config:galaxy.layout.centerY": { label: "Centre Y", min: 0, max: 4000, step: 10 },
  "config:galaxy.layout.innerRadius": { label: "Inner radius", min: 0, max: 2000, step: 5 },
  "config:galaxy.layout.outerRadius": { label: "Outer radius", min: 0, max: 4000, step: 5 },
  "config:galaxy.layout.radiusCurve": { label: "Radius curve", min: 0, max: 2, step: 0.05 },
  "config:sector.rows": { label: "Sector rows", min: 1, max: 12, step: 1 },
  "config:sector.cols": { label: "Sector columns", min: 1, max: 16, step: 1 },
  "config:sector.entryRow": { label: "Capital row", min: 0, max: 12, step: 1 },
  "config:sector.entryCol": { label: "Capital column", min: 0, max: 16, step: 1 },
  "config:sector.hexSize": { label: "Hex size", min: 10, max: 120, step: 0.5 },
  "config:sector.hexRowGap": { label: "Hex row gap", min: 10, max: 200, step: 1 },
  "config:sector.mapWidth": { label: "Map width", min: 100, max: 1600, step: 10 },
  "config:sector.mapPaddingTop": { label: "Map top padding", min: 0, max: 300, step: 1 },
  "config:sector.mapPaddingBottom": { label: "Map bottom padding", min: 0, max: 300, step: 1 },
  "config:anomalies.homeSites": { label: "Home-sector sites", min: 0, max: 20, step: 1 },
  "config:anomalies.chancePerSector": { label: "Site chance per sector", min: 0, max: 1, step: 0.01 },
  "config:anomalies.ringChanceBonus": { label: "Ring chance bonus", min: 0, max: 1, step: 0.01 },
  "config:anomalies.maxChance": { label: "Site chance ceiling", min: 0, max: 1, step: 0.01 },
  "config:anomalies.maxPerSector": { label: "Sites per sector", min: 0, max: 20, step: 1 },

  /* ---------- military ---------- */
  "config:military.patrolRadius": { label: "Patrol radius", min: 0, max: 6, step: 1 },
  "config:military.repairPerTurn": { label: "Ship repair / turn", min: 0, max: 100, step: 1 },
  "config:military.strongholdRepairPerTurn": { label: "Stronghold repair / turn", min: 0, max: 100, step: 1 },
  "config:military.salvagePerShip": { label: "Salvage per ship", min: 0, max: 1000, step: 1 },
  "config:military.salvagePerStronghold": { label: "Salvage per stronghold", min: 0, max: 1000, step: 1 },
  "config:military.logLimit": { label: "Military log lines", min: 1, max: 200, step: 1 },
  "config:rivals.minCount": { label: "Minimum rival empires", min: 0, max: 30, step: 1 },
  "config:rivals.maxCount": { label: "Maximum rival empires", min: 0, max: 30, step: 1 },
  "config:rivals.raidMinTurn": { label: "First raid turn", min: 0, max: 500, step: 1 },
  "config:rivals.raidLaneRange": { label: "Raid lane range", min: 0, max: 20, step: 1 },
  "config:rivals.maxConcurrentRaids": { label: "Concurrent raids", min: 0, max: 20, step: 1 },
  "config:rivals.stateMinTurns": { label: "AI state minimum turns", min: 0, max: 50, step: 1 },
  "config:rivals.stateMaxTurns": { label: "AI state maximum turns", min: 1, max: 50, step: 1 },

  /* ---------- content ---------- */
  "ships:attack": { label: "Attack", min: 0, max: 1000, step: 1 },
  "ships:hull": { label: "Hull", min: 1, max: 10000, step: 1 },
  "ships:power": { label: "Sector power", min: 0, max: 10000, step: 1 },
  "ships:speed": { label: "Speed (hexes / turn)", min: 0, max: 20, step: 1 },
  "ships:buildTime": { label: "Build time (turns)", min: 0, max: 50, step: 1 },
  "ships:cost.minerals": { label: "Build ⛏ minerals", min: 0, max: 10000, step: 1 },
  "ships:upgrades.*": { label: "Refit stat gain", min: 0, max: 100, step: 1 },
  "structures:cost.minerals": { label: "Build ⛏ minerals", min: 0, max: 10000, step: 1 },
  "structures:buildTime": { label: "Build time (turns)", min: 0, max: 50, step: 1 },
  "structures:energyUpkeep": { label: "⚡ upkeep / turn", min: 0, max: 1000, step: 1 },
  "structures:power": { label: "Sector power", min: 0, max: 10000, step: 1 },
  "structures:attack": { label: "Attack", min: 0, max: 1000, step: 1 },
  "structures:hull": { label: "Hull", min: 1, max: 10000, step: 1 },
  "structures:patrolRadius": { label: "Weapon range", min: 0, max: 12, step: 1 },
  "buildings:cost.minerals": { label: "Build ⛏ minerals", min: 0, max: 10000, step: 1 },
  "buildings:maxLevel": { label: "Maximum level", min: 1, max: 20, step: 1 },
  "buildings:energyUpkeep": { label: "⚡ upkeep / turn", min: 0, max: 1000, step: 1 },
  "buildings:workers": { label: "Workers", min: 0, max: 1000, step: 1 },
  "buildings:output.energy": { label: "Base ⚡ output", min: 0, max: 10000, step: 1 },
  "buildings:output.minerals": { label: "Base ⛏ output", min: 0, max: 10000, step: 1 },
  "buildings:output.research": { label: "Base 🔬 output", min: 0, max: 10000, step: 1 },
  "buildings:output.influence": { label: "Base 🏛 output", min: 0, max: 10000, step: 1 },
  "buildings:perLevel.energy": { label: "⚡ per extra level", min: 0, max: 10000, step: 1 },
  "buildings:perLevel.minerals": { label: "⛏ per extra level", min: 0, max: 10000, step: 1 },
  "buildings:perLevel.research": { label: "🔬 per extra level", min: 0, max: 10000, step: 1 },
  "buildings:perLevel.influence": { label: "🏛 per extra level", min: 0, max: 10000, step: 1 },
  "anomalies:weight": { label: "Roll weight", min: 0, max: 1000, step: 1 },
  "anomalies:studyTurns": { label: "Study turns", min: 0, max: 100, step: 1 },
  "anomalies:reward.energy": { label: "Reward ⚡ energy", min: -10000, max: 10000, step: 1 },
  "anomalies:reward.minerals": { label: "Reward ⛏ minerals", min: -10000, max: 10000, step: 1 },
  "anomalies:reward.research": { label: "Reward 🔬 research", min: -10000, max: 10000, step: 1 },
  "anomalies:reward.influence": { label: "Reward 🏛 influence", min: -10000, max: 10000, step: 1 },
  "anomalies:reward.stability": { label: "Reward stability", min: -100, max: 100, step: 1 },
  "anomalies:reward.population": { label: "Reward population", min: -100, max: 100, step: 1 },
  "archetypes:aggressionMult": { label: "Aggression multiplier", min: 0, max: 10, step: 0.05 },
  "archetypes:fleetCapBonus": { label: "Fleet cap bonus", min: -20, max: 20, step: 1 },
  "archetypes:colonyCapBonus": { label: "Colony cap bonus", min: -20, max: 20, step: 1 },
  "archetypes:incomeBonus": { label: "Income bonus", min: -20, max: 20, step: 1 },
  "archetypes:raidBias": { label: "Raid bias", min: 0, max: 10, step: 0.05 },
  "archetypes:growthBias": { label: "Growth bias", min: 0, max: 10, step: 0.05 },
  "ethics:mineralMult": { label: "⛏ output multiplier", min: 0, max: 10, step: 0.05 },
  "ethics:researchMult": { label: "🔬 output multiplier", min: 0, max: 10, step: 0.05 },
  "ethics:influenceFlat": { label: "🏛 influence / turn", min: -100, max: 100, step: 1 },
  "planetTypes:weight": { label: "Roll weight", min: 0, max: 1000, step: 1 },
  "techs:cost": { label: "Research cost", min: 0, max: 10000, step: 1 },
  "techs:buildingLevel": { label: "Building level", min: 1, max: 20, step: 1 },
  "techs:statLevel": { label: "Stat level", min: 1, max: 20, step: 1 },
  "techs:radarBonus": { label: "Radar INTEL bonus", min: 0, max: 100, step: 1 },
  "techs:gateOps": { label: "Gate ops", min: 0, max: 100, step: 1 },
  "techs:tradeRoutes": { label: "Trade routes", min: 0, max: 100, step: 1 },
  "techs:influenceBonus": { label: "Influence / turn", min: -100, max: 100, step: 1 },
  "techs:strongholdAttack": { label: "Stronghold attack", min: 0, max: 100, step: 1 },
  "techs:strongholdHull": { label: "Stronghold hull", min: 0, max: 100, step: 1 },
  "techs:strongholdRadius": { label: "Stronghold range", min: 0, max: 10, step: 1 },
  "techs:requiresTechs": { label: "Prerequisite count", min: 0, max: 20, step: 1 },
  "techs:requiresTech": { addLabel: "ADD PREREQUISITE", minItems: 0, template: "" },
  "techs:requiresTech.*": { label: "Required tech id" },
  "techs:exclusive": { label: "Exclusive with tech id" }
};
