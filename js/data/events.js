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
  },
  /* Unrest is a category for the card chip only. These cards are drawn by the
     stability system (see core/event-engine.js) and never from the paced
     deck, so the category is not in EVENT_CATEGORY_ORDER or EVENT_BUCKETS. */
  unrest: {
    id: "unrest",
    name: "Unrest",
    emoji: "🔥",
    blurb: "Riots, strikes and civil disorder.",
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

/* Civil unrest. These cards are not in any encounter bucket: the stability
   system rolls for one at the end of a turn and the chance is 0 at 100
   stability. They use the same card shape as EVENTS, the {colony} token is
   replaced with the unhappiest colony's name, and energy/minerals hit that
   colony's sector. weight is the card's relative chance inside the pool. */
const UNREST_EVENTS = [
  {
    id: "breadRiot",
    title: "Bread Riot",
    emoji: "🍞",
    kicker: "CIVIL DISORDER",
    category: "unrest",
    weight: 12,
    text: "Hungry crowds have broken into the ration depots of {colony}. The quarter is barricaded and the wardens have withdrawn.",
    choices: [
      { label: "Open the emergency stores", tag: "Compassion", effects: { energy: -6, stability: 4 } },
      { label: "Send in the wardens", tag: "Crackdown", effects: { stability: -3, influence: 1 } },
      { label: "Let the crowds disperse", tag: "Passive", effects: { stability: -1, minerals: -2 } }
    ]
  },
  {
    id: "generalStrike",
    title: "General Strike",
    emoji: "✊",
    kicker: "LABOUR DISPUTE",
    category: "unrest",
    weight: 10,
    text: "The dockworkers of {colony} have walked out. Cargo sits on the pads and the grid runs on skeleton crews.",
    choices: [
      { label: "Concede a maintenance raise", tag: "Conciliatory", effects: { energy: -5, stability: 5 } },
      { label: "Break the strike", tag: "Hardline", effects: { stability: -4, minerals: 3 } }
    ]
  },
  {
    id: "protestMarch",
    title: "Protest March",
    emoji: "📣",
    kicker: "MASS DEMONSTRATION",
    category: "unrest",
    weight: 11,
    text: "A column of demonstrators fills the avenues of {colony}, demanding the governor's resignation.",
    choices: [
      { label: "Address the crowd", tag: "Diplomatic", effects: { influence: -3, stability: 4 } },
      { label: "Disperse the march", tag: "Crackdown", effects: { stability: -5, energy: -2 } },
      { label: "Let the march pass", tag: "Passive", effects: { stability: -2 } }
    ]
  },
  {
    id: "sabotage",
    title: "Sabotage",
    emoji: "🔧",
    kicker: "INDUSTRIAL SABOTAGE",
    category: "unrest",
    weight: 8,
    text: "Someone has cut the coolant lines in {colony}'s power ring. The grid is down and the saboteurs are still at large.",
    choices: [
      { label: "Repair the ring", tag: "Practical", effects: { minerals: -5, energy: -2, stability: 1 } },
      { label: "Blame the agitators", tag: "Populist", effects: { stability: -4, influence: 2 } }
    ]
  },
  {
    id: "emigration",
    title: "Emigration Wave",
    emoji: "🧳",
    kicker: "MASS DEPARTURE",
    category: "unrest",
    weight: 9,
    text: "Families are queueing at the starport of {colony}. They have sold what they own and want passage off-world.",
    choices: [
      { label: "Offer land grants", tag: "Conciliatory", effects: { energy: -4, minerals: -3, stability: 3 } },
      { label: "Let them go", tag: "Pragmatic", effects: { population: -1, stability: -1 } },
      { label: "Close the port", tag: "Hardline", effects: { stability: -4 } }
    ]
  },
  {
    id: "nightLooting",
    title: "Night of Looting",
    emoji: "🏚️",
    kicker: "CIVIL DISORDER",
    category: "unrest",
    weight: 9,
    text: "The market districts of {colony} are dark. Looters stripped the stores before the patrols could close the streets.",
    choices: [
      { label: "Repay the merchants", tag: "Restorative", effects: { minerals: -6, stability: 3 } },
      { label: "Declare a curfew", tag: "Authoritarian", effects: { stability: -2, influence: 2 } },
      { label: "Seize the black market", tag: "Opportunist", effects: { minerals: 4, stability: -3 } }
    ]
  }
];
