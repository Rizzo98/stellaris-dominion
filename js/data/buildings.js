/* ============================================================
   BUILDINGS — structures that occupy a colony slot
   Output, upkeep, worker demand and build cost per type.
   Housing is no longer a building: it is paid for with the colony's
   mineral population upkeep (see CONFIG.population and core/colony.js).

   Levels: every building has a level that starts at 1. A completed
   Building category tech raises the level the building MAY be refitted to
   (2, 3 and 4). 'output' is the level 1 yield and 'perLevel' is the extra
   yield added by every level above 1, so a Mine reads 3 / 4 / 5 / 6 ⛏.
   The refit is a manual order paid on the colony screen: a tech never
   upgrades a standing building by itself.
   ============================================================ */

const BUILDINGS = {
  mine: {
    id: "mine",
    name: "Mine",
    emoji: "⛏️",
    desc: "Cuts ore from the crust. Two crews run a full shift.",
    cost: { minerals: 5 },
    output: { minerals: 3 },
    perLevel: { minerals: 1 },
    maxLevel: 4,
    energyUpkeep: 1,
    workers: 2
  },
  power: {
    id: "power",
    name: "Power Plant",
    emoji: "🏭",
    desc: "Feeds the colony grid.",
    cost: { minerals: 5 },
    output: { energy: 4 },
    perLevel: { energy: 1 },
    maxLevel: 4,
    energyUpkeep: 0,
    workers: 1
  },
  lab: {
    id: "lab",
    name: "Lab",
    emoji: "🔬",
    desc: "Turns curious minds into research.",
    cost: { minerals: 8 },
    output: { research: 2 },
    perLevel: { research: 1 },
    maxLevel: 4,
    energyUpkeep: 1,
    workers: 1
  },
  embassy: {
    id: "embassy",
    name: "Embassy",
    emoji: "🏛️",
    desc: "A permanent mission to alien powers.",
    cost: { minerals: 8 },
    output: { influence: 2 },
    perLevel: { influence: 1 },
    maxLevel: 4,
    energyUpkeep: 2,
    workers: 1
  }
};
const BUILDING_ORDER = ["mine", "power", "lab", "embassy"];
