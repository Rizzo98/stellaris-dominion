/* ============================================================
   CONFIG — balance knobs for the whole run
   Starting stockpiles, base yields, colonisation/build costs, the colony
   economy (maintenance formulas, facility levels and population growth),
   stability bands, the galaxy/sector layout, military rules and rival
   empire spawn/raid settings.
   ============================================================ */

const CONFIG = {
  /* Energy and minerals are stockpiled per sector; research and influence
     are empire-wide. startingResources seeds the home sector's energy and
     minerals plus the empire's research and influence. The capital also
     keeps a small baseline yield, and its two starter facilities are already
     online, so a brand-new run can pay its first maintenance bill. */
  startingResources: { energy: 15, minerals: 15, research: 0, influence: 5 },
  baseIncome: { energy: 4, minerals: 4, research: 0, influence: 1 },
  /* Stability is an empire-wide moving average of how its people live. Each
     turn the value keeps a share of what it had and takes the rest from the
     population-weighted happiness of every colony:

       H̄ = Σ(F_i · P_i) / Σ(P_i)
       S' = clamp(drag · S + (1 − drag) · H̄, 0, 100)

     Population is the weight, so a 20-person world pulls four times as hard
     as a 5-person one. With no colony population the value simply holds.
     Event choices, raids and the infrastructure deficit are shocks applied
     on top of the blend, so they fade over the following turns instead of
     resetting the stat. */
  stability: {
    start: 70,
    /* 0.7 keeps most of the value; the remaining 0.3 is the new mood. */
    drag: 0.7,
    /* Presentation threshold: the topbar calls the bar low below this. Low
       stability no longer touches production. */
    lowThreshold: 30,
    energyDeficitPenalty: 2,
    /* Instead, a low bar raises the chance of a civil-unrest card at the end
       of the turn: p = maxChance × ((100 − S) / 100) ^ exponent. It is 0 at
       100 and grows as the bar falls. */
    unrest: {
      maxChance: 0.75,
      exponent: 2
    }
  },
  colonizeCost: { minerals: 10, influence: 3 },
  colonyEnergyUpkeep: 1,
  /* An active research project draws power from the capital sector's grid
     until it completes. Every other upkeep is paid by the sector it sits in. */
  research: { energyUpkeep: 1 },

  /* Trading centers move energy and minerals between sectors. A center only
     works while its sector holds an operational gate; its reach follows the
     galaxy lanes, and a hop that leaves a sector other than the center's own
     needs another operational gate there, so gates relay trade outward.
     baseRoutes is the number of routes a center can run before any tech:
     Trade & Exploration techs raise it to 2, 3 and 4. */
  trade: {
    maxHops: 4,
    maxAmount: 20,
    baseRoutes: 1
  },

  /* Gates spend jump operations. Every operational gate in a sector allows
     baseOps fleet jumps per turn; Gate Throughput techs raise that to
     2, 3 and 4 ops per gate. The counter resets when a new turn begins. */
  gates: {
    baseOps: 1
  },

  /* Tech unlocks never touch an existing asset on their own. A completed
     building tech raises the level a building MAY be refitted to; a
     completed ship tech raises the level a hull MAY be refitted to. Both
     refits are manual orders paid from the sector ledger:
       - a building refit costs buildingCostShare of the building's own
         build cost (a 5 mineral Mine refits for 3),
       - a ship refit costs shipMineralsPerLevel per stat level installed
         and needs an operational spaceport in the ship's sector,
       - an emergency repair costs repairMineralsPerHull per hull point
         restored (minimum 1) and needs the same spaceport. */
  upgrades: {
    buildingCostShare: 0.5,
    shipMineralsPerLevel: 1,
    repairMineralsPerHull: 0.5
  },
  /* Planet size is rolled when the galaxy is generated. The standard slots
     are open from the moment the planet is colonised. A planet also has a
     10% chance of one locked bonus slot and a 5% chance of two; bonus slots
     are opened in order by paying energy and minerals. */
  planetSlots: {
    sizes: [
      { id: "small", name: "Small", slots: 3, weight: 25 },
      { id: "medium", name: "Medium", slots: 4, weight: 50 },
      { id: "large", name: "Large", slots: 6, weight: 25 }
    ],
    bonus: {
      oneChance: 0.10,
      twoChance: 0.05,
      max: 2
    },
    unlockCost: { energy: 5, minerals: 8 }
  },
  /* ---------- colony economy ----------
     Every colony owns three connected numbers: population (P), energy and
     minerals. The formulas below are intentionally the only place the
     balance lives; core/colony-economy.js reads them.

       E_required = P ^ energyExponent
       H          = M_spent ^ housingExponent
       H_deficit  = max(0, P - H)
       h          = H_deficit / P
       G          = E_spent / E_required
       F          = happinessMax * min(1, G) * max(0, 1 - h)
       overE      = max(0, E_spent / E_required - 1)
       overH      = max(0, M_spent / M_required - 1)
       M          = 1 + ((overE + overH) / 2) * (growthMultiplierMax - 1)
       growth     = P * baseGrowthRate * (F / happinessMax) * M

     Maintenance is requested as a percentage of the full requirement. The
     first 100% satisfies happiness; extra energy and housing above 100%
     do not raise happiness, but add to the growth multiplier M. At 200%
     on both lines M reaches growthMultiplierMax (2x). The sector ledger
     caps the actual spend, so an under-funded colony loses fulfillment and
     growth bonus instead of running a negative balance. The sector's other
     upkeep is paid after population maintenance.

     A new colony starts at startingPopulation.colony (enough to operate a
     level-1 facility). The capital starts at startingPopulation.home and
     opens with startingFacilities already built, in slot order. Those are
     ordinary level-1 buildings: they still need a crew and the level-1
     population gate. All of it is part of the same central balance block. */
  economy: {
    startingPopulation: { home: 3, colony: 5 },
    /* Built on the capital before the first turn, in slot order. With the
       default round-robin auto strategy the opening 3 workers split 2/1
       across the Power Plant and Mine. */
    startingFacilities: [
      { type: "power", level: 1 },
      { type: "mine", level: 1 }
    ],
    population: {
      baseGrowthRate: 0.05,
      energyExponent: 1.1,
      housingExponent: 0.9,
      happinessMax: 100
    },
    /* UI copy only: the formula produces the number, the tier names it. */
    happinessTiers: [
      { id: "flourishing", label: "FLOURISHING", min: 90 },
      { id: "content", label: "CONTENT", min: 70 },
      { id: "strained", label: "STRAINED", min: 40 },
      { id: "unhappy", label: "UNHAPPY", min: 10 },
      { id: "miserable", label: "MISERABLE", min: 0 }
    ],
    maintenance: {
      minPercent: 0,
      maxPercent: 200,
      stepPercent: 10,
      growthMultiplierMax: 2,
      defaultEnergyPercent: 100,
      defaultMineralsPercent: 100
    },
    /* Automatic workforce distribution. Round robin hands one worker to
       each eligible facility in turn, so 3 people across two 4-worker
       facilities split 2/1. Greedy fills the earliest facility slots first,
       giving 3/0 in the same colony. Explicit orders still win; clearing
       them returns the colony to the selected strategy. */
    workforce: {
      defaultStrategy: "roundRobin",
      strategies: [
        { id: "roundRobin", label: "ROUND ROBIN", description: "Share workers across every eligible facility, one at a time." },
        { id: "greedy", label: "GREEDY", description: "Fill the earliest facility slots first." }
      ]
    },
    /* Shared by Power Plants and Mines. Level 1 output 8 for 4 workers and a
       minimum colony population of 3, which is the capital's opening size.
       A facility cannot operate below its minimum population; partial
       crews still scale output. */
    facilities: {
      levels: [
        { level: 1, name: "Primitive", minPopulation: 3, workers: 4, output: 8 },
        { level: 2, name: "Industrial", minPopulation: 15, workers: 6, output: 16 },
        { level: 3, name: "Advanced", minPopulation: 40, workers: 9, output: 32 },
        { level: 4, name: "Megastructural", minPopulation: 100, workers: 14, output: 64 }
      ]
    }
  },
  swipeThreshold: 88,
  turnTickMs: 620,

  /* Military rules shared by player patrols, strongholds and the AI.
     A patrolling corvette fires on a hostile within its radius each turn;
     a stronghold is a static defender with the same rules at radius 2.
     Ships also trade fire with hostiles in their own hex even when not
     patrolling. Patrol coverage also blocks colony raids in its hexes. */
  military: {
    patrolRadius: 1,
    repairPerTurn: 2,
    strongholdRepairPerTurn: 1,
    salvagePerShip: 2,
    salvagePerStronghold: 6,
    logLimit: 16
  },

  /* Rival empires are seeded with the galaxy. Each ring gets at least one
     spawn while the map is large enough; deeper rings produce stronger
     powers so the player meets a difficulty curve outward from the core.
     Rivals grow through a small state machine (see js/core/rival-ai.js).
     Only an empire's own sector is colonised, but its raiders can cross
     lanes toward nearby player space. */
  rivals: {
    enabled: true,
    minCount: 5,
    maxCount: 7,
    onePerRing: true,
    raidMinTurn: 4,
    raidLaneRange: 2,
    maxConcurrentRaids: 2,
    stateMinTurns: 2,
    stateMaxTurns: 4
  },

  /* Encounter cards are paced, not drawn every turn. The opening card lands
     on openingTurn; after that one card is due every 'interval' turns.
     intervalRamp can accelerate the deck later, for example
     [{ fromTurn: 20, interval: 2 }]. minInterval/maxInterval clamp the result. */
  events: {
    openingTurn: 1,
    interval: 3,
    minInterval: 1,
    maxInterval: 12,
    intervalRamp: []
  },

  /* Survey sites are seeded onto empty sector hexes at generation time and
     stay hidden under fog until a ship charts the hex. Outer rings are a
     little richer: chance = chancePerSector + ring * ringChanceBonus. */
  anomalies: {
    enabled: true,
    homeSites: 1,
    chancePerSector: 0.5,
    ringChanceBonus: 0.05,
    maxChance: 0.85,
    maxPerSector: 2
  },

  /* One sector is a 4 x 6 hex rectangle: 24 cells, matching the original
     single-sector map. The home capital and the fallback entry hex sit at
     entryRow/entryCol; lane landings are derived per neighbour. */
  sector: {
    rows: 4,
    cols: 6,
    entryRow: 2,
    entryCol: 3,
    hexSize: 34.5,
    hexRowGap: 54,
    mapWidth: 392,
    mapPaddingTop: 24,
    mapPaddingBottom: 24
  },

  /* The galaxy is a sequence of rings around the home core. The core links
     to 4-6 ring-one sectors; every ring grows by ringGrowth sectors, and
     each sector connects inward, outward and around its own ring. Parent
     links and short ring shortcuts are seeded; each sector map gets its own
     derived seed. Every run starts from this seed (or the start-screen one). */
  galaxy: {
    seed: 20261112,
    /* A gate jump burns this much energy per fleet, before the fleet leaves. */
    jumpEnergyCost: 2,
    outerRings: 4,
    ringOneMin: 4,
    ringOneMax: 6,
    ringGrowth: 2,
    parentWindow: 2,
    ringShortcutsMin: 0,
    ringShortcutsMax: 1,
    minSystems: 4,
    maxSystems: 6,
    /* Circular rings on a map larger than the mobile viewport. The radius
       curve spreads the inner rings out and packs the rim: gaps shrink as
       you move outward, so the core and first rings read as "zoomed in".
       The stage scrolls both axes to reach the rest. */
    layout: {
      width: 700,
      height: 720,
      centerX: 350,
      centerY: 350,
      innerRadius: 104,
      outerRadius: 308,
      radiusCurve: 0.6
    }
  }
};