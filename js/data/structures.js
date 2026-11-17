/* ============================================================
   STRUCTURES — orbital works built by builder ships
   These are separate from colony building slots. A builder can start
   one structure in an empty space hex; it comes online after one turn.
   A stronghold is a static defender: it contributes power to its sector,
   fires on a hostile ship within patrolRadius and charges energy upkeep.
   A radar is a listening post: each online radar adds +1 intelligence to
   its sector, widening the raid forecast window.
   ============================================================ */

const STRUCTURE_TYPES = {
  spaceport: {
    id: "spaceport",
    name: "Spaceport",
    emoji: "🛰️",
    desc: "An orbital shipyard. New ships can be constructed here.",
    effect: "Build new ships at this hex.",
    cost: { minerals: 8 },
    buildTime: 1
  },
  gate: {
    id: "gate",
    name: "Gate",
    emoji: "🌀",
    desc: "A stable intersector corridor. Fleets can jump to nearby sectors.",
    effect: "Allows gate jumps from this hex.",
    cost: { minerals: 6 },
    buildTime: 1
  },
  radar: {
    id: "radar",
    name: "Radar",
    emoji: "📡",
    desc: "A listening post. It watches the jump lanes for incoming raids.",
    effect: "+1 intelligence in this sector.",
    /* Short label for the cramped sector hex map. */
    mapLabel: "RADAR",
    cost: { minerals: 5 },
    buildTime: 1,
    energyUpkeep: 1
  },
  trading: {
    id: "trading",
    name: "Trading Center",
    emoji: "🏪",
    desc: "An orbital exchange. Ships energy and minerals to a gate-linked sector every turn.",
    effect: "Transfers resources to a gate-linked sector.",
    /* Short label for the cramped sector hex map. */
    mapLabel: "TRADE HUB",
    cost: { minerals: 8 },
    buildTime: 1,
    energyUpkeep: 1,
    /* Trade routes are configured per center in the hex dossier. */
    trade: true
  },
  stronghold: {
    id: "stronghold",
    name: "Stronghold",
    emoji: "🏰",
    desc: "A static defence platform. It holds its hex and the two rings around it.",
    effect: "Fires on a hostile ship within 2 hexes.",
    cost: { minerals: 10 },
    buildTime: 1,
    /* Treat the stronghold as a stationary corvette for combat purposes. */
    static: true,
    power: 6,
    attack: 3,
    hull: 10,
    patrolRadius: 2,
    energyUpkeep: 2
  }
};

const STRUCTURE_ORDER = ["spaceport", "gate", "radar", "trading", "stronghold"];