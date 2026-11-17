/* ============================================================
   ANOMALIES — discoverable survey sites inside sectors
   A site is a celestial body or derelict placed on an empty hex at galaxy
   generation time. It stays hidden under the fog of war until a ship charts
   the hex; a science ship stationed in that hex can survey it for
   'studyTurns' turns and the 'reward' bundle is paid on completion.

   To add a site type, append an entry here. weight is its bucket weight in
   the per-sector site roll, studyTurns is the N-turn survey time and reward
   uses the same shape as event effects.
   ============================================================ */

const ANOMALY_KINDS = {
  planet: { id: "planet", label: "Planet", icon: "🪐" },
  moon: { id: "moon", label: "Moon", icon: "🌙" },
  asteroid: { id: "asteroid", label: "Asteroid", icon: "🪨" },
  derelict: { id: "derelict", label: "Derelict", icon: "🛸" },
  anomaly: { id: "anomaly", label: "Anomaly", icon: "🌀" }
};

const ANOMALY_TYPES = [
  {
    id: "buriedRuins",
    name: "Buried Ruins",
    emoji: "🏛️",
    kind: "planet",
    weight: 2,
    studyTurns: 4,
    reward: { research: 10, influence: 1 },
    kicker: "XENO-ARCHAEOLOGY SITE",
    text: "A geometric complex lies half-buried under the regolith. Its walls are older than the colony charter."
  },
  {
    id: "iceMoon",
    name: "Ice Moon",
    emoji: "🌙",
    kind: "moon",
    weight: 3,
    studyTurns: 3,
    reward: { research: 5, energy: 3 },
    kicker: "CRYOVOLCANIC SURVEY",
    text: "A cracked ice shell hides a warm ocean. The vents below it have been running for a very long time."
  },
  {
    id: "metallicAsteroid",
    name: "Metallic Asteroid",
    emoji: "🪨",
    kind: "asteroid",
    weight: 4,
    studyTurns: 2,
    reward: { minerals: 9 },
    kicker: "ORE SURVEY",
    text: "A nickel-iron body drifting out of its belt. A short survey is enough to plan the mining run."
  },
  {
    id: "geothermalRift",
    name: "Geothermal Rift",
    emoji: "🌋",
    kind: "planet",
    weight: 3,
    studyTurns: 3,
    reward: { energy: 6, minerals: 2 },
    kicker: "PLANETARY SURVEY",
    text: "A tectonic scar vents superheated steam into the upper atmosphere. The gradient is enormous."
  },
  {
    id: "derelictProbe",
    name: "Derelict Probe",
    emoji: "🛸",
    kind: "derelict",
    weight: 3,
    studyTurns: 2,
    reward: { research: 4, influence: 1 },
    kicker: "UNKNOWN ORIGIN",
    text: "A pre-war probe tumbles in a slow arc, still transmitting a checksum no one has answered."
  },
  {
    id: "gravityAnomaly",
    name: "Gravity Anomaly",
    emoji: "🌀",
    kind: "anomaly",
    weight: 1,
    studyTurns: 5,
    reward: { research: 8, energy: 2 },
    kicker: "SPATIAL DISTORTION",
    text: "A patch of space bends light around itself. Instruments disagree about how far away it is."
  },
  {
    id: "crystalVein",
    name: "Crystal Vein",
    emoji: "💎",
    kind: "asteroid",
    weight: 2,
    studyTurns: 3,
    reward: { minerals: 6, research: 3 },
    kicker: "CRYSTALLINE SURVEY",
    text: "A shattered planetoid exposing lattices that grew under pressure no lab can reproduce."
  },
  {
    id: "frozenColony",
    name: "Frozen Colony",
    emoji: "🏚️",
    kind: "planet",
    weight: 1,
    studyTurns: 4,
    reward: { research: 6, minerals: 4, influence: 1 },
    kicker: "LOST SETTLEMENT",
    text: "Habitat domes under a kilometre of ice. The colony logs end mid-sentence, all at the same minute."
  }
];
