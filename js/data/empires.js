/* ============================================================
   RIVAL EMPIRES — content pools and AI state definitions
   Rival powers are spawned with the galaxy in js/core/empires.js and grown
   by the state machine in js/core/rival-ai.js. Every entry here is content:
   - RIVAL_EMPIRE_POOL supplies names, emojis, colours and an archetype.
   - RIVAL_ARCHETYPES tune aggression, growth and fleet size.
   - RIVAL_AI_STATES is the state machine's vocabulary. Each state carries a
     display label and a blurb shown in the empire dossier.
   Difficulty is positional: an empire's tier equals its galaxy ring, so
   ring-1 neighbours are small and rim empires are large.
   ============================================================ */

const RIVAL_ARCHETYPES = {
  marauder: {
    id: "marauder",
    name: "Marauders",
    blurb: "Raider clans that prize a fast hull and a full cargo hold.",
    aggressionMult: 1.35,
    fleetCapBonus: 1,
    colonyCapBonus: 0,
    incomeBonus: 0,
    raidBias: 1.6,
    growthBias: 0.8
  },
  builder: {
    id: "builder",
    name: "Builders",
    blurb: "Patient engineers who fortify every lane they touch.",
    aggressionMult: 0.75,
    fleetCapBonus: 0,
    colonyCapBonus: 1,
    incomeBonus: 1,
    raidBias: 0.7,
    growthBias: 1.35
  },
  opportunist: {
    id: "opportunist",
    name: "Opportunists",
    blurb: "They wait for a weak flank, then take it without ceremony.",
    aggressionMult: 1.05,
    fleetCapBonus: 0,
    colonyCapBonus: 0,
    incomeBonus: 1,
    raidBias: 1.1,
    growthBias: 1.0
  }
};

/* Twelve powers so a seven-empire galaxy never repeats a name. */
const RIVAL_EMPIRE_POOL = [
  { name: "Vega Compact", emoji: "🦎", color: "#8ee6a3", archetype: "builder" },
  { name: "Hydra Collective", emoji: "🐍", color: "#7cb8ff", archetype: "opportunist" },
  { name: "Orion Syndicate", emoji: "💠", color: "#67e8d5", archetype: "marauder" },
  { name: "Titan Assembly", emoji: "⚙️", color: "#f4c96b", archetype: "builder" },
  { name: "Nyx Covenant", emoji: "🌑", color: "#c6a8ff", archetype: "opportunist" },
  { name: "Draco Imperium", emoji: "🐉", color: "#ff7a7a", archetype: "marauder" },
  { name: "Corvus Ascendancy", emoji: "🕸️", color: "#b8e0ff", archetype: "builder" },
  { name: "Helios Concord", emoji: "☀️", color: "#ffd166", archetype: "opportunist" },
  { name: "Perseus League", emoji: "🦅", color: "#ffb38a", archetype: "marauder" },
  { name: "Carina Hive", emoji: "🐝", color: "#e0c060", archetype: "builder" },
  { name: "Rigel Directorate", emoji: "🔷", color: "#8ab4ff", archetype: "opportunist" },
  { name: "Umbra Hegemony", emoji: "🕳️", color: "#a78bfa", archetype: "marauder" }
];

const RIVAL_AI_STATES = {
  grow: {
    id: "grow",
    label: "GROW",
    name: "Expansion",
    emoji: "🌱",
    desc: "Claims unowned systems and lays down new hulls."
  },
  patrol: {
    id: "patrol",
    label: "PATROL",
    name: "Patrol",
    emoji: "🛡️",
    desc: "Keeps corvettes on station around its core worlds."
  },
  fortify: {
    id: "fortify",
    label: "FORTIFY",
    name: "Fortification",
    emoji: "🏰",
    desc: "Raises a stronghold over its central approach."
  },
  raid: {
    id: "raid",
    label: "RAID",
    name: "Raid",
    emoji: "⚔️",
    desc: "Sends corvettes toward nearby player space."
  },
  regroup: {
    id: "regroup",
    label: "REGROUP",
    name: "Regroup",
    emoji: "↩️",
    desc: "Recalls its raiders and rebuilds its strength."
  }
};

const RIVAL_AI_STATE_ORDER = ["grow", "patrol", "fortify", "raid", "regroup"];
