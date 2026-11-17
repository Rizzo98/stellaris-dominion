/* ============================================================
   CONFIG — balance knobs for the whole run
   Starting stockpiles, base yields, colonisation/build costs, population
   housing/sustenance/growth, stability bands, the galaxy/sector layout,
   military rules and rival empire spawn/raid settings.
   ============================================================ */

const CONFIG = {
  /* Energy and minerals are stockpiled per sector; research and influence
     are empire-wide. startingResources seeds the home sector's energy and
     minerals plus the empire's research and influence. */
  startingResources: { energy: 10, minerals: 10, research: 0, influence: 5 },
  baseIncome: { energy: 2, minerals: 2, research: 0, influence: 1 },
  stability: {
    start: 70,
    lowThreshold: 30,
    productionMultiplier: 0.75,
    energyDeficitPenalty: 2
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
  /* Population is no longer housed by buildings. Every colony owns a founding
     shelter and the player funds the rest with two standing upkeeps:
       - housing: a mineral upkeep per turn. Every mineralsPerHouse minerals
         adds one house, up to the planet's size in extra houses. Houses are
         the hard population cap.
       - sustenance: an energy upkeep per turn. Each energy feeds
         populationPerEnergy people; feeding everyone gives full growth, a
         surplus can raise it to maxMult and a shortage slows it down.
     Both upkeeps are paid from the colony sector's ledger every turn.
     Growth saturates: a colony gains
     growthRate * sustenance * (1 - population / housing) per turn, so it
     starts fast and slows as the houses fill. Fractions carry between turns. */
  population: {
    homeStart: 3,
    colonyStart: 1,
    homeBaseCap: 3,
    colonyBaseCap: 1,
    growthRate: 1.5,
    housing: {
      mineralsPerHouse: 2
    },
    sustenance: {
      populationPerEnergy: 2,
      maxMult: 1.25,
      /* Highest threshold first: getSustenanceTier() takes the first match. */
      tiers: [
        { id: "thriving", label: "THRIVING", min: 1.25 },
        { id: "content", label: "CONTENT", min: 1 },
        { id: "frugal", label: "FRUGAL", min: 0.5 },
        { id: "malnourished", label: "MALNOURISHED", min: 0.01 },
        { id: "starving", label: "STARVING", min: 0 }
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