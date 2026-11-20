/* ============================================================
   BUILDINGS — structures that occupy a colony slot
   Output, upkeep, worker demand and build cost per type.

   Power Plants and Mines are the two production facilities. Their four
   levels are shared and live in CONFIG.economy.facilities.levels: a level
   grants one resource output for one worker requirement and needs a minimum
   colony population before it can operate at all. The same table is attached
   to both definitions so refits, tooltips and the tech tree read identical
   numbers.

   Labs and Embassies are support buildings: they still use the older
   output/perLevel table, need one worker and pay energy upkeep, but they are
   not part of the facility level gate.

   Levels: every building starts at level 1. A completed Building category
   tech raises the level the building MAY be refitted to (2, 3 and 4). The
   refit is a manual order paid on the colony screen: a tech never upgrades a
   standing building by itself.
   ============================================================ */

const FACILITY_LEVELS = CONFIG.economy.facilities.levels;

const BUILDINGS = {
  mine: {
    id: "mine",
    name: "Mine",
    emoji: "⛏️",
    desc: "Cuts ore from the crust. Higher levels automate the seams but need a bigger colony to crew them.",
    cost: { minerals: 5 },
    resource: "minerals",
    facility: true,
    levels: FACILITY_LEVELS,
    maxLevel: 4,
    energyUpkeep: 0,
    workers: FACILITY_LEVELS[0].workers
  },
  power: {
    id: "power",
    name: "Power Plant",
    emoji: "🏭",
    desc: "Feeds the colony grid. Higher levels are far more efficient per worker.",
    cost: { minerals: 5 },
    resource: "energy",
    facility: true,
    levels: FACILITY_LEVELS,
    maxLevel: 4,
    energyUpkeep: 0,
    workers: FACILITY_LEVELS[0].workers
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
