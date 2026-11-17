/* ============================================================
   SYSTEMS — content pools for galaxy generation
   The home capital is fixed. Every other system, including the rest
   of the home sector, is assembled by js/core/galaxy.js from these
   name and planet pools.
   ============================================================ */

const HOME_SECTOR_NAME = "Solara Core";

/* The capital always sits on the home sector's entry hex. Its four
   neighbours are seeded like every other sector's systems. */
const HOME_CAPITAL = {
  id: "home",
  name: "Solara",
  emoji: "🌍",
  row: CONFIG.sector.entryRow,
  col: CONFIG.sector.entryCol,
  color: "#67e8d5",
  home: true,
  type: "garden",
  blurb: "The cradle world. Its temperate belt and old mines keep the capital alive."
};

/* Sector names are shuffled per run; the home sector keeps HOME_SECTOR_NAME. */
const SECTOR_NAMES = [
  "Aurora", "Vega", "Orion", "Cygnus", "Lyra", "Draco", "Perseus", "Carina",
  "Corvus", "Helios", "Nova", "Rigel", "Sirius", "Titan", "Vesper", "Zephyr",
  "Atlas", "Ceres", "Dione", "Eridu", "Fenrir", "Gemini", "Hydra", "Iris",
  "Juno", "Kepler", "Lupus", "Mira", "Nyx", "Oberon", "Pallas", "Quasar",
  "Rhea", "Sable", "Talos", "Umbra", "Vulcan", "Wolf", "Xenon", "Yara"
];

/* Planet archetypes used by generated systems. Weight drives rarity. */
const PLANET_TYPES = [
  {
    id: "garden", emoji: "🌍", color: "#67e8d5", weight: 3,
    blurbs: [
      "A temperate world with a breathable atmosphere and shallow seas.",
      "Its biosphere is young, noisy and unusually cooperative."
    ]
  },
  {
    id: "ocean", emoji: "🌊", color: "#7cb8ff", weight: 2,
    blurbs: [
      "A world of unbroken ocean, broken only by storm belts.",
      "Warm currents circle the globe beneath permanent cloud cover."
    ]
  },
  {
    id: "volcanic", emoji: "🌋", color: "#ff9b73", weight: 2,
    blurbs: [
      "A volcanic world with a thin, mineral-rich crust and very little patience.",
      "Tidal flexing keeps the surface molten and the mines honest."
    ]
  },
  {
    id: "forest", emoji: "🌿", color: "#8ee6a3", weight: 2,
    blurbs: [
      "Dense forests, fast rivers, and a biosphere that has never met a mower.",
      "The canopy is older than most civilisations and twice as stubborn."
    ]
  },
  {
    id: "gasGiant", emoji: "🪐", color: "#7cb8ff", weight: 2,
    blurbs: [
      "A ringed gas giant hiding a chain of mineral-rich moons in its shadow.",
      "Its bands shift every season; its moons are the real prize."
    ]
  },
  {
    id: "desert", emoji: "🏜️", color: "#f4c96b", weight: 2,
    blurbs: [
      "Dry, bright and rich in rare minerals beneath the dust.",
      "The dunes hide glass plains from a war nobody remembers."
    ]
  },
  {
    id: "tundra", emoji: "❄️", color: "#8ed7ff", weight: 2,
    blurbs: [
      "A cold world of glacial plateaus and geothermal seams.",
      "Its thin air is clean, its ore is deep, and its winters are absolute."
    ]
  },
  {
    id: "relic", emoji: "🛸", color: "#c6a8ff", weight: 1,
    blurbs: [
      "A dead civilisation's orbital debris still hums with power.",
      "Something ancient sleeps under the regolith. The survey team is excited."
    ]
  }
];

/* System names are assembled from a word plus an optional numeral. */
const SYSTEM_NAME_WORDS = [
  "Vega", "Orion", "Lyra", "Rigel", "Altair", "Deneb", "Ceres", "Rhea",
  "Titan", "Nyx", "Mira", "Atlas", "Juno", "Iris", "Hydra", "Draco",
  "Corvus", "Carina", "Helios", "Nova", "Solace", "Vela", "Pavo", "Caelum",
  "Eos", "Hestia", "Mimas", "Dione", "Tethys", "Iapetus", "Oberon", "Titania",
  "Umbriel", "Ariel", "Miranda", "Triton", "Proteus", "Nereid", "Charon", "Styx",
  "Hyperion", "Phoebe", "Janus", "Pandora", "Calypso", "Elara", "Sinope", "Ananke",
  "Carme", "Himalia", "Lysithea", "Themisto", "Orpheus", "Talos", "Metis", "Thebe",
  "Amalthea", "Adrastea", "Larissa", "Galatea"
];
const SYSTEM_NAME_SUFFIXES = [" II", " III", " IV", " V", " IX", "-7", "-9"];
