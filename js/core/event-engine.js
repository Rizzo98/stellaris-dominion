/* ============================================================
   EVENT ENGINE — cadence, category weights and weighted bucket draws
   The deck is data-driven. EVENTS holds the cards, EVENT_CATEGORIES holds
   one weight multiplier per category and EVENT_BUCKETS holds which cards
   each category can draw. Weights are read at draw time, so editing a
   card's weight or a category's weightMult changes the deck immediately.

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
    history: []
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
  if (problems.length && typeof console !== "undefined" && console.warn) {
    console.warn("[event deck] " + problems.join(" · "));
  }
  return problems;
}
