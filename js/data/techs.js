/* ============================================================
   TECHS — research catalogue: categories, groups and effects
   The tech tab is split into three categories:

     building  — three levels per building (Mine, Power Plant, Lab, Embassy).
                 A completed tech raises the level a building MAY be refitted
                 to; a standing building keeps its old level until the player
                 pays the refit on the colony screen.
     military  — power / hull / speed lines for every hull plus the stronghold
                 line. A completed tech raises the level a hull MAY be
                 refitted to; the refit is ordered at a spaceport.
     trade     — radar (INTEL per radar), gate (jump ops per gate),
                 trading center (routes per center) and the doctrine pair.

   'ascension' sits outside the three categories as the final project.

   Effect payloads are plain numbers that core/helpers.js reads:
     building + buildingLevel      -> refit cap for that building
     shipType + stat + statLevel   -> refit cap for one hull stat
     strongholdAttack / strongholdHull / strongholdRadius -> summed bonuses
     radarBonus                    -> extra INTEL per online radar
     gateOps                       -> absolute ops per operational gate
     tradeRoutes                   -> absolute routes per trading center
     influenceBonus                -> flat empire influence
   TECH_CATEGORIES and TECH_GROUPS drive the tab's category switch and the
   group headings inside it.
   ============================================================ */

const TECH_CATEGORIES = [
  {
    id: "building",
    name: "Buildings",
    label: "BUILDINGS",
    emoji: "🏗️",
    kicker: "COLONIAL INDUSTRY",
    blurb: "Three levels for every building. A completed tech unlocks the next level; a standing building keeps its old output until you refit it on the colony screen for half its build cost."
  },
  {
    id: "military",
    name: "Military",
    label: "MILITARY",
    emoji: "⚔️",
    kicker: "FLEET DOCTRINE",
    blurb: "Power, hull and speed lines for every hull, plus the stronghold line. Hulls do not refit themselves: order the refit while the ship sits in a sector with an operational spaceport."
  },
  {
    id: "trade",
    name: "Trade & Exploration",
    label: "TRADE & EXPLORATION",
    emoji: "🧭",
    kicker: "LOGISTICS",
    blurb: "Radars see further, gates move more fleets per turn and trading centers run more routes. Repair is a spaceport service, not a tech."
  }
];
const TECH_CATEGORY_ORDER = ["building", "military", "trade"];

const TECH_GROUPS = {
  mine: { id: "mine", category: "building", name: "Mine", emoji: "⛏️", hint: "Refit a standing Mine with the upgrade button on its colony slot." },
  power: { id: "power", category: "building", name: "Power Plant", emoji: "🏭", hint: "Refit a standing Power Plant on its colony slot." },
  lab: { id: "lab", category: "building", name: "Lab", emoji: "🔬", hint: "Refit a standing Lab on its colony slot." },
  embassy: { id: "embassy", category: "building", name: "Embassy", emoji: "🏛️", hint: "Refit a standing Embassy on its colony slot." },

  corvette: { id: "corvette", category: "military", name: "Corvette", emoji: "🚀", hint: "Refits need an operational spaceport in the ship's sector." },
  science: { id: "science", category: "military", name: "Science Ship", emoji: "🛰️", hint: "Refits need an operational spaceport in the ship's sector." },
  builder: { id: "builder", category: "military", name: "Builder", emoji: "🏗️", hint: "Refits need an operational spaceport in the ship's sector." },
  stronghold: { id: "stronghold", category: "military", name: "Stronghold", emoji: "🏰", hint: "Strongholds are static. A completed tech applies to every stronghold at once." },

  radar: { id: "radar", category: "trade", name: "Radar", emoji: "📡", hint: "More INTEL widens the raid forecast window on the sector map." },
  gate: { id: "gate", category: "trade", name: "Gate", emoji: "🌀", hint: "Ops are spent per fleet jump and refresh at the start of every turn." },
  trading: { id: "trading", category: "trade", name: "Trading Center", emoji: "🏪", hint: "Extra routes are edited per center in the hex dossier." },
  doctrine: { id: "doctrine", category: "trade", name: "Doctrine", emoji: "🏛️", hint: "Empire-wide bonuses." },
  final: { id: "final", category: "final", name: "Final Project", emoji: "🌌", hint: "The last technology. Completing it ends the run." }
};
const TECH_GROUP_ORDER = [
  "mine", "power", "lab", "embassy",
  "corvette", "science", "builder", "stronghold",
  "radar", "gate", "trading", "doctrine",
  "final"
];

const TECHS = {};

function registerTech(def) {
  TECHS[def.id] = def;
  return def;
}

function techRoman(tier) {
  return ["I", "II", "III", "IV"][tier - 1] || String(tier);
}

/* ---------- building category: three levels per building ---------- */

/* output/perLevel live in js/data/buildings.js; this table adds the flavour
   and the prices. Level 1 is the building as built, so the first tech
   unlocks level 2. */
const BUILDING_TECH_LINES = [
  {
    building: "mine",
    resource: "minerals",
    icon: "⛏",
    names: ["Deep Core Drilling I", "Deep Core Drilling II", "Deep Core Drilling III"],
    costs: [18, 30, 46],
    detail: "Seismic sounding reaches the seams the first survey missed."
  },
  {
    building: "power",
    resource: "energy",
    icon: "⚡",
    names: ["Grid Amplification I", "Grid Amplification II", "Grid Amplification III"],
    costs: [18, 30, 46],
    detail: "Bigger cores and a colder cooling loop push the colonial grid."
  },
  {
    building: "lab",
    resource: "research",
    icon: "🔬",
    names: ["Cognitive Arrays I", "Cognitive Arrays II", "Cognitive Arrays III"],
    costs: [20, 34, 52],
    detail: "Stacked compute tiers let one lab argue with itself."
  },
  {
    building: "embassy",
    resource: "influence",
    icon: "🏛",
    names: ["Diplomatic Corps I", "Diplomatic Corps II", "Diplomatic Corps III"],
    costs: [20, 34, 52],
    detail: "More attachés, more languages, more favours owed."
  }
];

BUILDING_TECH_LINES.forEach(function (line) {
  const def = BUILDINGS[line.building];
  const base = def.output[line.resource] || 0;
  const step = def.perLevel[line.resource] || 0;
  const maxLevel = def.maxLevel || 4;
  line.names.forEach(function (name, index) {
    const level = index + 2;
    if (level > maxLevel) return;
    const value = base + step * (level - 1);
    const previous = value - step;
    registerTech({
      id: line.building + "Tech" + (level - 1),
      name: name,
      emoji: def.emoji,
      category: "building",
      group: line.building,
      tier: level - 1,
      cost: line.costs[index],
      requiresTech: level > 2 ? [line.building + "Tech" + (level - 2)] : [],
      building: line.building,
      buildingLevel: level,
      effect: "Unlocks " + def.name + " level " + level + ": " + value + " " + line.icon +
        " per building instead of " + previous + " " + line.icon + ".",
      detail: line.detail
    });
  });
});

/* ---------- military category: hull refit lines ---------- */

const SHIP_TECH_LINES = [
  {
    shipType: "corvette",
    stats: [
      { stat: "power", label: "Weapon Lattice", costs: [16, 28], detail: "Hardpoints wired to a shared targeting bus." },
      { stat: "hull", label: "Armour Plating", costs: [16, 28], detail: "Layered plating over the frame the yard already welds." },
      { stat: "speed", label: "Thruster Tuning", costs: [18, 30], detail: "Tighter nozzles, hotter burn, shorter reaction time." }
    ]
  },
  {
    shipType: "science",
    stats: [
      { stat: "power", label: "Sensor Array", costs: [16, 28], detail: "A wider dish pulls more signal out of the dark." },
      { stat: "hull", label: "Survey Shielding", costs: [16, 28], detail: "Nobody surveys a ruin through a cracked hull." },
      { stat: "speed", label: "Ion Drive", costs: [18, 30], detail: "Steady thrust instead of a chemical sprint." }
    ]
  },
  {
    shipType: "builder",
    stats: [
      { stat: "power", label: "Drone Bay", costs: [16, 28], detail: "Construction drones that finally fly in formation." },
      { stat: "hull", label: "Hull Plating", costs: [16, 28], detail: "A yard ship survives the yard." },
      { stat: "speed", label: "Construction Thrusters", costs: [18, 30], detail: "Heavy tug motors for a hull that carries its own crane." }
    ]
  }
];

SHIP_TECH_LINES.forEach(function (line) {
  const type = SHIP_TYPES[line.shipType];
  const plural = type.name + "s";
  line.stats.forEach(function (entry) {
    const meta = SHIP_UPGRADE_STAT_META[entry.stat];
    const steps = (type.upgrades && type.upgrades[entry.stat]) || [];
    const base = type[entry.stat] || 0;
    let running = base;
    steps.forEach(function (delta, index) {
      const level = index + 1;
      running += delta;
      registerTech({
        id: line.shipType + entry.stat.charAt(0).toUpperCase() + entry.stat.slice(1) + level,
        name: type.name + " " + entry.label + " " + techRoman(level),
        emoji: type.emoji,
        category: "military",
        group: line.shipType,
        tier: level,
        cost: entry.costs[index] || entry.costs[entry.costs.length - 1],
        requiresTech: level > 1
          ? [line.shipType + entry.stat.charAt(0).toUpperCase() + entry.stat.slice(1) + (level - 1)]
          : [],
        shipType: line.shipType,
        stat: entry.stat,
        statLevel: level,
        effect: "Unlocks " + meta.label.toLowerCase() + " level " + level + " on every " + type.name +
          ": +" + delta + " " + meta.icon + " " + meta.short + " per hull.",
        detail: entry.detail + " A fully refitted " + type.name + " reads " + running + " " + meta.icon + "."
      });
    });
  });
});

/* Stronghold line: the techs that sharpen the static defender. */
[
  {
    id: "planetaryDefense",
    name: "Planetary Defense",
    emoji: "🛡️",
    tier: 1,
    cost: 36,
    exclusive: "diplomacyNetwork",
    strongholdAttack: 1,
    effect: "+1 ⚔ attack for every stronghold you own.",
    detail: "Orbital batteries, shield grids, and a very loud alarm."
  },
  {
    id: "planetaryDefense2",
    name: "Orbital Crossfire",
    emoji: "🎯",
    tier: 2,
    cost: 46,
    requiresTech: ["planetaryDefense"],
    strongholdAttack: 1,
    effect: "+1 more ⚔ attack per stronghold (2 in total).",
    detail: "Cross-linked fire control spends one target twice."
  },
  {
    id: "strongholdHull1",
    name: "Bastion Plating",
    emoji: "🧱",
    tier: 1,
    cost: 30,
    strongholdHull: 4,
    effect: "+4 🛡 hull for every stronghold (10 → 14).",
    detail: "Ribbed armour that shrugs off a raider volley."
  },
  {
    id: "strongholdHull2",
    name: "Reinforced Bastion",
    emoji: "🧱",
    tier: 2,
    cost: 44,
    requiresTech: ["strongholdHull1"],
    strongholdHull: 4,
    effect: "+4 more 🛡 hull per stronghold (14 → 18).",
    detail: "Two hulls welded into one, with the crew between them."
  },
  {
    id: "strongholdRadius",
    name: "Extended Coverage",
    emoji: "📶",
    tier: 2,
    cost: 38,
    requiresTech: ["strongholdHull1"],
    strongholdRadius: 1,
    effect: "Stronghold weapon range and patrol coverage grow from 2 hexes to 3.",
    detail: "Relay masts put the battery's eyes one ring further out."
  }
].forEach(function (def) {
  registerTech(Object.assign({
    category: "military",
    group: "stronghold",
    requiresTech: []
  }, def));
});

/* ---------- trade & exploration category ---------- */

registerTech({
  id: "radarTech1",
  name: "Signal Analysis I",
  emoji: "📡",
  category: "trade",
  group: "radar",
  tier: 1,
  cost: 16,
  radarBonus: 1,
  effect: "Every online Radar adds +2 INTEL instead of +1.",
  detail: "Filter the lane noise, keep the drives that matter."
});

registerTech({
  id: "radarTech2",
  name: "Signal Analysis II",
  emoji: "📡",
  category: "trade",
  group: "radar",
  tier: 2,
  cost: 30,
  requiresTech: ["radarTech1"],
  radarBonus: 1,
  effect: "Every online Radar adds +3 INTEL instead of +2.",
  detail: "Predictive tracking turns a blip into an arrival window."
});

registerTech({
  id: "gateTech1",
  name: "Gate Throughput I",
  emoji: "🌀",
  category: "trade",
  group: "gate",
  tier: 1,
  cost: 20,
  gateOps: 2,
  effect: "Every operational gate accepts 2 fleet jumps per turn instead of 1.",
  detail: "A second aperture, cycled against the first."
});

registerTech({
  id: "gateTech2",
  name: "Gate Throughput II",
  emoji: "🌀",
  category: "trade",
  group: "gate",
  tier: 2,
  cost: 34,
  requiresTech: ["gateTech1"],
  gateOps: 3,
  effect: "Every operational gate accepts 3 fleet jumps per turn.",
  detail: "Shared corridor scheduling across the whole sector."
});

registerTech({
  id: "gateTech3",
  name: "Gate Throughput III",
  emoji: "🌀",
  category: "trade",
  group: "gate",
  tier: 3,
  cost: 50,
  requiresTech: ["gateTech2"],
  gateOps: 4,
  effect: "Every operational gate accepts 4 fleet jumps per turn.",
  detail: "A corridor wide enough to move a war through one afternoon."
});

registerTech({
  id: "tradeRouteTech1",
  name: "Trade Network I",
  emoji: "🏪",
  category: "trade",
  group: "trading",
  tier: 1,
  cost: 22,
  tradeRoutes: 2,
  effect: "Every trading center can run 2 routes at once instead of 1.",
  detail: "One counter, two queues, one ledger."
});

registerTech({
  id: "tradeRouteTech2",
  name: "Trade Network II",
  emoji: "🏪",
  category: "trade",
  group: "trading",
  tier: 2,
  cost: 36,
  requiresTech: ["tradeRouteTech1"],
  tradeRoutes: 3,
  effect: "Every trading center can run 3 routes at once.",
  detail: "Dockmasters stop walking every manifest to the same desk."
});

registerTech({
  id: "tradeRouteTech3",
  name: "Trade Network III",
  emoji: "🏪",
  category: "trade",
  group: "trading",
  tier: 3,
  cost: 52,
  requiresTech: ["tradeRouteTech2"],
  tradeRoutes: 4,
  effect: "Every trading center can run 4 routes at once.",
  detail: "A clearing house for half the ring."
});

registerTech({
  id: "xenoArchaeology",
  name: "Xeno-Archaeology",
  emoji: "🗿",
  category: "trade",
  group: "doctrine",
  tier: 1,
  cost: 26,
  effect: "Unlocks extra choices in alien events.",
  detail: "Read the dead before their ruins are lost forever."
});

registerTech({
  id: "diplomacyNetwork",
  name: "Diplomacy Network",
  emoji: "🏛️",
  category: "trade",
  group: "doctrine",
  tier: 2,
  cost: 36,
  exclusive: "planetaryDefense",
  influenceBonus: 2,
  effect: "+2 influence per turn.",
  detail: "Words open doors that fleets cannot. Also, nice stationery."
});

/* ---------- final project ---------- */

registerTech({
  id: "ascension",
  name: "Ascension",
  emoji: "🌌",
  category: "final",
  group: "final",
  tier: 1,
  cost: 60,
  requiresTechs: 2,
  final: true,
  effect: "The final technology. Completing it wins the game.",
  detail: "Cross the threshold. There is no going back."
});

/* ---------- display order ---------- */

/* Grouped order: category, then group, then tier. Anything that sits
   outside the three categories (the final project) is appended last. */
const TECH_GROUPED_ORDER = TECH_CATEGORY_ORDER.reduce(function (order, categoryId) {
  return order.concat(TECH_GROUP_ORDER.reduce(function (groupOrder, groupId) {
    const group = TECH_GROUPS[groupId];
    if (!group || group.category !== categoryId) return groupOrder;
    const ids = Object.keys(TECHS).filter(function (id) {
      return TECHS[id].group === groupId;
    }).sort(function (a, b) {
      return (TECHS[a].tier || 1) - (TECHS[b].tier || 1);
    });
    return groupOrder.concat(ids);
  }, []));
}, []);

const TECH_ORDER = TECH_GROUPED_ORDER.concat(Object.keys(TECHS).filter(function (id) {
  return TECH_GROUPED_ORDER.indexOf(id) === -1;
}));
