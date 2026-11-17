/* ============================================================
   EVENTS — encounter cards, categories and probability buckets
   Effects are plain objects: { energy: -2, stability: 5 }.
   requiresEthic / requiresTech lock individual options.

   The deck is data-driven:
   - EVENT_CATEGORIES groups cards and carries one weight multiplier per
     category, so a whole group can be made rarer or retired at once.
   - Every card has a 'weight' (its own probability bucket) plus a minTurn
     gate for pacing.
   - EVENT_BUCKETS lists which cards each category can draw. Add an id to a
     bucket to include a card, remove it to retire it without deleting the
     card. Weights and multipliers are read at draw time.
   ============================================================ */

const EVENT_CATEGORIES = {
  discovery: {
    id: "discovery",
    name: "Discovery",
    emoji: "🔭",
    blurb: "Ruins, signals and derelicts from older civilisations.",
    weightMult: 1
  },
  contact: {
    id: "contact",
    name: "Contact",
    emoji: "📡",
    blurb: "Foreign fleets, refugees and the black market.",
    weightMult: 1
  },
  economy: {
    id: "economy",
    name: "Economy",
    emoji: "⛏",
    blurb: "Resource finds and industrial opportunities.",
    weightMult: 1
  },
  hazard: {
    id: "hazard",
    name: "Hazard",
    emoji: "⚠️",
    blurb: "Raiders, stellar weather and other bad news.",
    weightMult: 1
  }
};
const EVENT_CATEGORY_ORDER = ["discovery", "contact", "economy", "hazard"];

/* Event effects are plain objects: { energy: -2, stability: 5 }.
   Add requiresEthic / requiresTech to lock an option. Military tags are
   disabled for Pacifists. weight is the card's bucket weight; minTurn keeps
   bigger encounters out of the opening turns. */
const EVENTS = [
  {
    id: "alienRuins",
    title: "Alien Ruins",
    emoji: "🗿",
    kicker: "ANCIENT STRUCTURE",
    category: "discovery",
    weight: 10,
    minTurn: 1,
    text: "A buried complex hums beneath the regolith of a dead moon. Its doors are sealed, but something inside is still awake.",
    choices: [
      { label: "Excavate now", tag: "Risky", effects: { research: 4, stability: -10 } },
      { label: "Seal the ruins", tag: "Cautious", effects: { influence: 2 } },
      { label: "Study carefully", tag: "Xeno", requiresEthic: "xenophile", effects: { research: 6 } }
    ]
  },
  {
    id: "pirateRaiders",
    title: "Pirate Raiders",
    emoji: "☠️",
    kicker: "HOSTILE CONTACT",
    category: "hazard",
    weight: 12,
    minTurn: 3,
    text: "A raider flotilla has shadowed your trade lanes for three cycles. Their captain offers safe passage for a price, and their guns are already warm.",
    choices: [
      { label: "Pay the tribute", tag: "Costly", effects: { energy: -4, stability: 2 } },
      { label: "Return fire", tag: "Military", effects: { influence: 2, stability: -3 } }
    ]
  },
  {
    id: "refugeeFleet",
    title: "Refugee Fleet",
    emoji: "🚀",
    kicker: "DISTRESS SIGNAL",
    category: "contact",
    weight: 10,
    minTurn: 1,
    text: "Three battered colony ships drift at the edge of your space. Their reactors are failing, and they carry more souls than your docks can hold.",
    choices: [
      { label: "Offer sanctuary", tag: "Compassion", effects: { stability: 5, energy: -3 } },
      { label: "Turn them away", tag: "Pragmatic", effects: { influence: 3, stability: -4 } }
    ]
  },
  {
    id: "ancientSignal",
    title: "Ancient Signal",
    emoji: "📡",
    kicker: "UNKNOWN ORIGIN",
    category: "discovery",
    weight: 9,
    minTurn: 5,
    text: "A transmission older than your species repeats from a black moon. It contains a map to something placed deliberately out of reach.",
    choices: [
      { label: "Trace the signal", tag: "Curious", effects: { research: 3 } },
      { label: "Broadcast a reply", tag: "Xeno", requiresEthic: "xenophile", effects: { research: 4, influence: 2 } },
      { label: "Decode the archive", tag: "Archaeology", requiresTech: "xenoArchaeology", effects: { research: 5 } }
    ]
  },
  {
    id: "mineralVein",
    title: "Mineral Vein",
    emoji: "⛰️",
    kicker: "PLANETARY SURVEY",
    category: "economy",
    weight: 14,
    minTurn: 1,
    text: "A survey probe finds a dense seam beneath an unstable crust. The ore is rich enough to change your economy.",
    choices: [
      { label: "Strip-mine it", tag: "Greedy", effects: { minerals: 7, stability: -3 } },
      { label: "Extract carefully", tag: "Measured", effects: { minerals: 3, stability: 2 } }
    ]
  },
  {
    id: "solarFlare",
    title: "Solar Flare",
    emoji: "☀️",
    kicker: "STELLAR WEATHER",
    category: "hazard",
    weight: 8,
    minTurn: 2,
    text: "A coronal wave is about to wash over the home system. Your engineers have minutes to decide where to route the surge.",
    choices: [
      { label: "Divert to shields", tag: "Protective", effects: { energy: -3, stability: 2 } },
      { label: "Harvest the storm", tag: "Opportunist", effects: { research: 3, stability: -2 } }
    ]
  },
  {
    id: "smugglersOffer",
    title: "Smuggler's Offer",
    emoji: "📦",
    kicker: "BLACK MARKET",
    category: "contact",
    weight: 9,
    minTurn: 4,
    text: "A masked trader offers a crate of stolen alien technology. The price is steep, and the cargo is humming.",
    choices: [
      { label: "Buy the crate", tag: "Costly", effects: { energy: -4, research: 5 } },
      { label: "Seize the cargo", tag: "Military", effects: { minerals: 5, stability: -3 } }
    ]
  },
  {
    id: "ghostFleet",
    title: "Ghost Fleet",
    emoji: "👾",
    kicker: "DERELICT CONTACT",
    category: "discovery",
    weight: 7,
    minTurn: 7,
    text: "An abandoned fleet drifts in perfect formation, its crews long gone. Something aboard is still transmitting a welcome.",
    choices: [
      { label: "Strip the hulls", tag: "Practical", effects: { minerals: 6, stability: -2 } },
      { label: "Board the flagship", tag: "Xeno-Archaeology", requiresTech: "xenoArchaeology", effects: { research: 4, influence: 2 } }
    ]
  }
];

/* One bucket per category. Edit these arrays to add or retire cards from the
   weighted draw; the cards themselves can stay defined in EVENTS. A card is
   only ever drawn from the bucket that lists it. */
const EVENT_BUCKETS = {
  discovery: ["alienRuins", "ancientSignal", "ghostFleet"],
  contact: ["refugeeFleet", "smugglersOffer"],
  economy: ["mineralVein"],
  hazard: ["pirateRaiders", "solarFlare"]
};
