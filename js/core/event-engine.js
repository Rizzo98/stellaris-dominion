/* ============================================================
   EVENT ENGINE — cadence, category weights, weighted bucket draws and unrest
   The deck is data-driven. EVENTS holds the cards, EVENT_CATEGORIES holds
   one weight multiplier per category and EVENT_BUCKETS holds which cards
   each category can draw. Weights are read at draw time, so editing a
   card's weight or a category's weightMult changes the deck immediately.

   Civil unrest is a second, stability-driven draw path. UNREST_EVENTS holds
   those cards; they are never in EVENT_BUCKETS. getUnrestChance() maps the
   stability bar to a per-turn probability (0 at 100, rising as it falls) and
   rollUnrestEvent() returns a ready-to-show card or null.

   Tuning API (all safe to call from the console or future content):
     setEventCategoryWeight("hazard", 0)    // retire a whole category
     setEventWeight("pirateRaiders", 30)    // make one card more likely
     addEventToBucket("economy", "solarFlare")
     removeEventFromBucket("contact", "smugglersOffer")
   ============================================================ */

function getEventById(id) {
  return EVENTS.find(function (event) { return event.id === id; }) || null;
}

function getEventCategory(event) {
  if (!event || !event.category) return null;
  return EVENT_CATEGORIES[event.category] || null;
}

/* Effective bucket weight for one card. A disabled or zero-weight category
   removes all of its cards from the draw without editing the cards. */
function getEventWeight(event) {
  if (!event) return 0;
  const category = getEventCategory(event);
  if (!category || category.enabled === false) return 0;
  const base = typeof event.weight === "number" && event.weight > 0 ? event.weight : 1;
  const mult = typeof category.weightMult === "number" ? Math.max(0, category.weightMult) : 1;
  return base * mult;
}

function getEventBucket(categoryId) {
  return (EVENT_BUCKETS[categoryId] || []).map(getEventById).filter(Boolean);
}

function collectEligibleEvents(turn, excludeLast) {
  const now = typeof turn === "number" ? turn : state.turn;
  const seen = new Set();
  const candidates = [];

  EVENT_CATEGORY_ORDER.forEach(function (categoryId) {
    const category = EVENT_CATEGORIES[categoryId];
    if (!category || category.enabled === false) return;
    (EVENT_BUCKETS[categoryId] || []).forEach(function (id) {
      if (seen.has(id)) return;
      seen.add(id);
      const event = getEventById(id);
      if (!event || event.enabled === false) return;
      if (typeof event.minTurn === "number" && now < event.minTurn) return;
      if (typeof event.maxTurn === "number" && now > event.maxTurn) return;
      if (excludeLast && state.events && state.events.lastEventId === event.id) return;
      const weight = getEventWeight(event);
      if (weight <= 0) return;
      candidates.push({ event: event, weight: weight });
    });
  });
  return candidates;
}

/* Cards that can be drawn this turn. The last card is skipped unless it is
   the only option, so the same encounter never comes twice in a row. */
function getEligibleEvents(turn) {
  const list = collectEligibleEvents(turn, true);
  if (list.length) return list;
  return collectEligibleEvents(turn, false);
}

function pickWeightedEvent(candidates) {
  if (!candidates || !candidates.length) return null;
  const total = candidates.reduce(function (sum, entry) { return sum + entry.weight; }, 0);
  if (total <= 0) return null;
  const random = typeof state.rng === "function" ? state.rng : Math.random;
  let roll = random() * total;
  for (let i = 0; i < candidates.length; i += 1) {
    roll -= candidates[i].weight;
    if (roll < 0) return candidates[i].event;
  }
  return candidates[candidates.length - 1].event;
}

function drawEventFromPool(turn) {
  return pickWeightedEvent(getEligibleEvents(turn));
}

/* One card every 'interval' turns at the start of the run. The optional
   intervalRamp lets later phases of the game pace the deck differently. */
function getEventInterval() {
  const cfg = CONFIG.events || {};
  let interval = typeof cfg.interval === "number" ? cfg.interval : 3;
  (cfg.intervalRamp || []).forEach(function (step) {
    if (!step || typeof step.fromTurn !== "number") return;
    if (state.turn >= step.fromTurn && typeof step.interval === "number") {
      interval = step.interval;
    }
  });
  const min = typeof cfg.minInterval === "number" ? cfg.minInterval : 1;
  const max = typeof cfg.maxInterval === "number" ? cfg.maxInterval : 12;
  return clamp(Math.round(interval), min, max);
}

function createEventState() {
  const cfg = CONFIG.events || {};
  const opening = typeof cfg.openingTurn === "number" ? cfg.openingTurn : 1;
  return {
    nextTurn: opening,
    count: 0,
    lastEventId: null,
    lastCategory: null,
    history: [],
    /* Unrest has its own draw history; it never touches the deck schedule. */
    unrestCount: 0,
    lastUnrestId: null,
    lastUnrestTurn: null,
    lastUnrestColony: null
  };
}

function isEventDue(turn) {
  if (!state.events) return false;
  const now = typeof turn === "number" ? turn : state.turn;
  return now >= state.events.nextTurn;
}

/* The only place a turn's card is drawn. Advances the schedule, records the
   history and returns null when no card is eligible (the schedule retries
   on the following turn). */
function drawEvent() {
  if (!state.events) state.events = createEventState();
  const event = drawEventFromPool(state.turn);
  if (!event) {
    state.events.nextTurn = state.turn + 1;
    return null;
  }
  state.events.count += 1;
  state.events.lastEventId = event.id;
  state.events.lastCategory = event.category;
  state.events.history.push({ turn: state.turn, id: event.id, category: event.category });
  if (state.events.history.length > 40) state.events.history.shift();
  state.events.nextTurn = state.turn + getEventInterval();
  return event;
}

/* ---------- civil unrest ----------
   Low stability does not touch production: it raises the chance that the
   turn ends with an unrest card. The chance is 0 at 100 stability and rises
   as the bar falls:

     p = maxChance × ((100 − S) / 100) ^ exponent

   The card pool is UNREST_EVENTS. Unrest prefers the unhappiest colony with
   people in it, and its energy/mineral/population effects hit that colony's
   sector. */

function getUnrestConfig() {
  const cfg = (CONFIG && CONFIG.stability && CONFIG.stability.unrest) || {};
  const numberOr = function (value, fallback) {
    return typeof value === "number" && isFinite(value) ? value : fallback;
  };
  return {
    maxChance: clamp(numberOr(cfg.maxChance, 0.75), 0, 1),
    exponent: Math.max(0.1, numberOr(cfg.exponent, 2))
  };
}

/* The per-turn probability of an unrest card at a given stability. */
function getUnrestChance(stability) {
  const cfg = getUnrestConfig();
  const raw = stability == null
    ? (state && typeof state.stability === "number" ? state.stability : 100)
    : stability;
  const value = clamp(Number(raw) || 0, 0, 100);
  const gap = (100 - value) / 100;
  if (gap <= 0) return 0;
  return clamp(cfg.maxChance * Math.pow(gap, cfg.exponent), 0, 1);
}

function getUnrestEvents() {
  if (typeof UNREST_EVENTS === "undefined") return [];
  return UNREST_EVENTS.filter(function (event) {
    return !!event && event.enabled !== false;
  });
}

function getUnrestEventById(id) {
  const pool = getUnrestEvents();
  for (let i = 0; i < pool.length; i += 1) {
    if (pool[i].id === id) return pool[i];
  }
  return null;
}

/* The unhappiest colony that still has people: unrest starts where the mood
   is worst. The earliest colony keeps a tie. */
function getUnrestTargetColony() {
  if (!state || !state.galaxy) return null;
  let target = null;
  state.galaxy.sectors.forEach(function (sector) {
    const allocation = getSectorColonyAllocations(sector.id);
    Object.keys(allocation.byId).forEach(function (systemId) {
      const report = allocation.byId[systemId];
      if (!report || !(report.population > 0)) return;
      if (!target || report.happiness < target.report.happiness) {
        target = { system: getSystem(systemId), report: report };
      }
    });
  });
  return target;
}

/* One card from the unrest pool, never the same card twice in a row. */
function pickUnrestEvent() {
  const all = getUnrestEvents();
  if (!all.length) return null;
  const lastId = state.events ? state.events.lastUnrestId : null;
  const fresh = all.filter(function (event) { return event.id !== lastId; });
  const pool = fresh.length ? fresh : all;
  const weightOf = function (event) {
    return typeof event.weight === "number" && event.weight > 0 ? event.weight : 1;
  };
  const total = pool.reduce(function (sum, event) { return sum + weightOf(event); }, 0);
  if (total <= 0) return null;
  const random = typeof state.rng === "function" ? state.rng : Math.random;
  let roll = random() * total;
  for (let i = 0; i < pool.length; i += 1) {
    roll -= weightOf(pool[i]);
    if (roll < 0) return pool[i];
  }
  return pool[pool.length - 1];
}

/* Rolls the turn's unrest card. Returns null most of the time, and always at
   100 stability (the roll consumes no RNG in that case). */
function rollUnrestEvent() {
  if (!state || !state.events) return null;
  const chance = getUnrestChance(state.stability);
  if (chance <= 0) return null;
  const random = typeof state.rng === "function" ? state.rng : Math.random;
  if (random() >= chance) return null;
  const template = pickUnrestEvent();
  if (!template) return null;
  const target = getUnrestTargetColony();
  const colonyName = target && target.system ? target.system.name : "the colonies";
  const card = {
    id: template.id,
    title: template.title,
    emoji: template.emoji,
    kicker: template.kicker || "CIVIL UNREST",
    category: "unrest",
    text: String(template.text || "").replace(/\{colony\}/g, colonyName),
    choices: template.choices,
    sectorId: target && target.system ? target.system.sectorId : null,
    unrest: true,
    colonyName: colonyName
  };
  state.events.unrestCount = (state.events.unrestCount || 0) + 1;
  state.events.lastUnrestId = template.id;
  state.events.lastUnrestTurn = state.turn;
  state.events.lastUnrestColony = colonyName;
  return card;
}

/* ---------- deck inspection / tuning ---------- */

function getEventDeckSummary(turn) {
  const now = typeof turn === "number" ? turn : state.turn;
  const eligible = getEligibleEvents(now);
  const eligibleWeights = {};
  eligible.forEach(function (entry) {
    eligibleWeights[entry.event.id] = entry.weight;
  });
  const totalWeight = eligible.reduce(function (sum, entry) { return sum + entry.weight; }, 0);

  const categories = EVENT_CATEGORY_ORDER.map(function (categoryId) {
    const category = EVENT_CATEGORIES[categoryId];
    if (!category) return null;
    const events = (EVENT_BUCKETS[categoryId] || []).map(function (eventId) {
      const event = getEventById(eventId);
      if (!event) return null;
      const weight = getEventWeight(event);
      let reason = "";
      if (category.enabled === false) reason = "Category disabled";
      else if (event.enabled === false) reason = "Card disabled";
      else if (weight <= 0) reason = "Zero weight";
      else if (typeof event.minTurn === "number" && now < event.minTurn) reason = "Unlocks turn " + event.minTurn;
      else if (typeof event.maxTurn === "number" && now > event.maxTurn) reason = "Retired after turn " + event.maxTurn;
      else if (!eligibleWeights[event.id]) reason = "Played last";
      const eligibleNow = !reason;
      return {
        id: event.id,
        title: event.title,
        emoji: event.emoji,
        weight: weight,
        eligible: eligibleNow,
        reason: reason,
        chance: eligibleNow && totalWeight > 0 ? weight / totalWeight : 0
      };
    }).filter(Boolean);
    return {
      id: categoryId,
      name: category.name,
      emoji: category.emoji,
      blurb: category.blurb,
      weightMult: category.weightMult,
      enabled: category.enabled !== false,
      events: events
    };
  }).filter(Boolean);

  return {
    turn: now,
    nextTurn: state.events ? state.events.nextTurn : null,
    interval: getEventInterval(),
    totalWeight: totalWeight,
    lastEventId: state.events ? state.events.lastEventId : null,
    categories: categories
  };
}

function setEventCategoryWeight(categoryId, weightMult) {
  const category = EVENT_CATEGORIES[categoryId];
  if (!category) return false;
  const value = Number(weightMult);
  category.weightMult = isFinite(value) ? Math.max(0, value) : 0;
  return true;
}

function setEventWeight(eventId, weight) {
  const event = getEventById(eventId);
  if (!event) return false;
  const value = Number(weight);
  event.weight = isFinite(value) ? Math.max(0, value) : 0;
  return true;
}

function addEventToBucket(categoryId, eventId) {
  if (!EVENT_CATEGORIES[categoryId]) return false;
  const event = getEventById(eventId);
  if (!event) return false;
  EVENT_CATEGORY_ORDER.forEach(function (otherId) {
    removeEventFromBucket(otherId, eventId);
  });
  if (!Array.isArray(EVENT_BUCKETS[categoryId])) EVENT_BUCKETS[categoryId] = [];
  EVENT_BUCKETS[categoryId].push(eventId);
  event.category = categoryId;
  return true;
}

function removeEventFromBucket(categoryId, eventId) {
  const bucket = EVENT_BUCKETS[categoryId];
  if (!Array.isArray(bucket)) return 0;
  let removed = 0;
  for (let i = bucket.length - 1; i >= 0; i -= 1) {
    if (bucket[i] !== eventId) continue;
    bucket.splice(i, 1);
    removed += 1;
  }
  return removed;
}

/* Development check: warns when a bucket lists a missing card, a card sits
   in a bucket that disagrees with its category, or a card is in no bucket. */
function validateEventDeck() {
  const problems = [];
  const bucketed = new Set();
  EVENT_CATEGORY_ORDER.forEach(function (categoryId) {
    if (!EVENT_CATEGORIES[categoryId]) {
      problems.push("Unknown category in EVENT_CATEGORY_ORDER: " + categoryId);
      return;
    }
    (EVENT_BUCKETS[categoryId] || []).forEach(function (eventId) {
      const event = getEventById(eventId);
      if (!event) {
        problems.push("Bucket " + categoryId + " lists unknown event: " + eventId);
        return;
      }
      bucketed.add(eventId);
      if (event.category !== categoryId) {
        problems.push("Event " + eventId + " is in bucket " + categoryId + " but has category " + event.category);
      }
    });
  });
  EVENTS.forEach(function (event) {
    if (!EVENT_CATEGORIES[event.category]) {
      problems.push("Event " + event.id + " uses unknown category: " + event.category);
    }
    if (!bucketed.has(event.id)) {
      problems.push("Event " + event.id + " is not in any bucket");
    }
  });
  if (typeof UNREST_EVENTS !== "undefined") {
    const unrestIds = new Set();
    UNREST_EVENTS.forEach(function (event) {
      if (!event || !event.id) {
        problems.push("Unrest card without an id");
        return;
      }
      if (unrestIds.has(event.id)) problems.push("Duplicate unrest card id: " + event.id);
      unrestIds.add(event.id);
      if (EVENTS.some(function (other) { return other.id === event.id; })) {
        problems.push("Unrest card id collides with an encounter: " + event.id);
      }
      if (event.category !== "unrest") {
        problems.push("Unrest card " + event.id + " uses category: " + event.category);
      }
      if (!Array.isArray(event.choices) || !event.choices.length) {
        problems.push("Unrest card " + event.id + " has no choices");
      }
    });
  }
  if (problems.length && typeof console !== "undefined" && console.warn) {
    console.warn("[event deck] " + problems.join(" · "));
  }
  return problems;
}
