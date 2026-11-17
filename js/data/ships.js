/* ============================================================
   SHIP_TYPES — units that make up fleets
   Fleets are arrays of individual ships stored per hex. Attack, hull,
   power and speed are the base per type; hull is the current health pool
   used by combat. Speed is how many hexes the ship can follow in one
   turn. Power is the ship's contribution to the sector's total fleet
   power. Corvettes are the only mobile warships and can be put on patrol;
   builders are the only ships that can construct orbital structures.
   Each hull's emoji is also its sector-map badge icon. A hex that holds more
   than one hull type uses SHIP_FLEET_ICON instead, the generic ship badge.

   'upgrades' lists the stat points a hull gains per installed refit level.
   Military techs unlock those levels (power, hull and speed each have two),
   but a standing hull keeps its old stats until it is refitted at a
   spaceport: see core/helpers.js (getShipStatBonus) and game/actions.js
   (upgradeShip). The array length is the number of tech levels that exist
   for that stat.
   ============================================================ */

const SHIP_TYPES = {
  corvette: {
    id: "corvette",
    name: "Corvette",
    emoji: "🚀",
    role: "Warship",
    attack: 2,
    hull: 5,
    power: 4,
    speed: 1,
    military: true,
    patrolRadius: 1,
    buildTime: 1,
    cost: { minerals: 4 },
    upgrades: { power: [2, 3], hull: [2, 3], speed: [1, 1] }
  },
  science: {
    id: "science",
    name: "Science Ship",
    emoji: "🛰️",
    role: "Survey vessel",
    attack: 1,
    hull: 3,
    power: 2,
    speed: 2,
    military: false,
    buildTime: 1,
    cost: { minerals: 3 },
    ability: "Surveys anomaly sites in the same hex",
    upgrades: { power: [1, 2], hull: [1, 2], speed: [1, 1] }
  },
  builder: {
    id: "builder",
    name: "Builder",
    emoji: "🏗️",
    role: "Construction vessel",
    attack: 0,
    hull: 4,
    power: 1,
    speed: 1,
    military: false,
    buildTime: 1,
    cost: { minerals: 5 },
    ability: "Builds spaceports, gates, trading centers and strongholds in empty space",
    upgrades: { power: [1, 1], hull: [2, 2], speed: [1, 1] }
  }
};
const SHIP_ORDER = ["corvette", "science", "builder"];

/* The three stats a hull can refit, in display order. */
const SHIP_UPGRADE_STATS = ["power", "hull", "speed"];
const SHIP_UPGRADE_STAT_META = {
  power: { id: "power", label: "Power", short: "PWR", icon: "✦" },
  hull: { id: "hull", label: "Hull", short: "HULL", icon: "🛡" },
  speed: { id: "speed", label: "Speed", short: "SPD", icon: "➜" }
};

/* A sector hex shows one icon for its whole fleet. When a hex holds more than
   one ship type there is no single hull to draw, so the badge falls back to
   this generic ship icon. The id is the badge's CSS key: keep "mixed" in step
   with the .fleet-badge.player.fleet-mixed rule in css/views.css. */
const SHIP_FLEET_ICON = {
  id: "mixed",
  emoji: "🛸"
};
