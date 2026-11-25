/* ============================================================
   RUN RULES — the per-match rulebook
   The prototype keeps its balance in live globals: CONFIG drives every
   formula, EVENTS/EVENT_CATEGORIES/EVENT_BUCKETS drive the encounter deck and
   the content tables drive hulls, structures, buildings, survey sites and
   techs. The debug console edits those globals directly, so a run always
   reads the rules it is actually playing with.

   This module is the bridge to a save file. captureRunRules() takes a plain
   JSON snapshot of every tunable table; applyRunRules() writes a snapshot back
   into the live globals in place (keeping array/object identities that other
   modules hold on to); resetRunRules() returns to the defaults captured when
   the page loaded.

   Rules are normalised against the defaults on read, so a save made before a
   field existed still loads with a complete rulebook. Unknown keys in a save
   are kept; wrong-typed values fall back to the default.

   The optional js/data/standard-rules.js ships the published standard: it is
   applied over the in-code tables before RUN_RULE_DEFAULTS is captured, so a
   published rulebook becomes the default for RESET, the tweak counter and new
   matches. adoptRunStandard() makes a freshly pushed rulebook the standard of
   the running page without a reload.

   Shape:
     { version,
       config:    deep clone of CONFIG,
       events:    { categories, cards, buckets, unrest },
       content:   { ships, structures, buildings, anomalies, archetypes,
                    ethics, planetTypes, techs } }
   ============================================================ */

const RUN_RULES_VERSION = 1;

function cloneRuleValue(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function isRuleObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isRuleNumber(value) {
  return typeof value === "number" && isFinite(value);
}

/* Prototype keys never travel through a save file or a form field. */
function isSafeRuleKey(key) {
  return key !== "__proto__" && key !== "constructor" && key !== "prototype";
}

/* ---------- generic JSON helpers ---------- */

/* Merge a saved value over a default value. Objects keep their default keys,
   arrays keep the saved length (a removed tier stays removed) and primitives
   only accept a value of the same type. */
function mergeRuleDefaults(defaults, saved) {
  if (Array.isArray(defaults)) {
    if (!Array.isArray(saved)) return cloneRuleValue(defaults);
    return saved.map(function (value, index) {
      if (index < defaults.length) return mergeRuleDefaults(defaults[index], value);
      return cloneRuleValue(value);
    });
  }
  if (isRuleObject(defaults)) {
    if (!isRuleObject(saved)) return cloneRuleValue(defaults);
    const merged = {};
    Object.keys(defaults).forEach(function (key) {
      if (!isSafeRuleKey(key)) return;
      merged[key] = Object.prototype.hasOwnProperty.call(saved, key)
        ? mergeRuleDefaults(defaults[key], saved[key])
        : cloneRuleValue(defaults[key]);
    });
    Object.keys(saved).forEach(function (key) {
      if (!isSafeRuleKey(key) || Object.prototype.hasOwnProperty.call(merged, key)) return;
      merged[key] = cloneRuleValue(saved[key]);
    });
    return merged;
  }
  if (typeof defaults === "number") return isRuleNumber(saved) ? saved : defaults;
  if (typeof defaults === "boolean") return typeof saved === "boolean" ? saved : defaults;
  if (typeof defaults === "string") return typeof saved === "string" ? saved : defaults;
  if (defaults === null) return saved === null ? null : defaults;
  return cloneRuleValue(saved === undefined ? defaults : saved);
}

/* Write a rule value into an existing object/array without replacing the
   container. CONFIG.economy.facilities.levels is shared by BUILDINGS, so the
   array identity matters; mutating in place keeps every reader pointed at the
   same table. skipKeys leaves a target-owned field (BUILDINGS.levels) alone. */
function replaceRuleValue(target, source, skipKeys) {
  const skip = skipKeys || [];
  if (Array.isArray(target) && Array.isArray(source)) {
    target.length = 0;
    source.forEach(function (value) {
      target.push(cloneRuleValue(value));
    });
    return target;
  }
  if (isRuleObject(target) && isRuleObject(source)) {
    Object.keys(target).forEach(function (key) {
      if (!isSafeRuleKey(key) || skip.indexOf(key) !== -1) return;
      if (Object.prototype.hasOwnProperty.call(source, key)) return;
      delete target[key];
    });
    Object.keys(source).forEach(function (key) {
      if (!isSafeRuleKey(key) || skip.indexOf(key) !== -1) return;
      const current = target[key];
      const next = source[key];
      if (Array.isArray(current) && Array.isArray(next)) {
        replaceRuleValue(current, next);
      } else if (isRuleObject(current) && isRuleObject(next)) {
        replaceRuleValue(current, next);
      } else {
        target[key] = cloneRuleValue(next);
      }
    });
    return target;
  }
  return cloneRuleValue(source);
}

function splitRulePath(path) {
  return String(path == null ? "" : path).split(".").filter(function (part) {
    return part !== "";
  });
}

function getRulePathValue(root, path) {
  const parts = splitRulePath(path);
  let node = root;
  for (let i = 0; i < parts.length; i += 1) {
    if (node === null || node === undefined) return undefined;
    if (!isSafeRuleKey(parts[i])) return undefined;
    node = node[parts[i]];
  }
  return node;
}

function setRulePathValue(root, path, value) {
  const parts = splitRulePath(path);
  if (!parts.length || !root || typeof root !== "object") return false;
  let node = root;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    if (!isSafeRuleKey(key)) return false;
    if (node[key] === null || node[key] === undefined || typeof node[key] !== "object") return false;
    node = node[key];
  }
  const last = parts[parts.length - 1];
  if (!isSafeRuleKey(last)) return false;
  node[last] = value;
  return true;
}

/* ---------- content sources ----------
   'key' names the block in a rulebook. 'target' is the live table the debug
   console edits. 'skip' protects fields that are owned by another module
   (BUILDINGS.levels points at CONFIG.economy.facilities.levels). */
const RUN_CONTENT_SOURCES = [
  { key: "ships", target: function () { return SHIP_TYPES; } },
  { key: "structures", target: function () { return STRUCTURE_TYPES; } },
  { key: "buildings", target: function () { return BUILDINGS; }, skip: ["levels"] },
  { key: "anomalies", target: function () { return ANOMALY_TYPES; } },
  { key: "archetypes", target: function () { return RIVAL_ARCHETYPES; } },
  { key: "ethics", target: function () { return ETHICS; } },
  { key: "planetTypes", target: function () { return PLANET_TYPES; } },
  { key: "techs", target: function () { return TECHS; } }
];

function captureRuleEntries(target, skipKeys) {
  const skip = skipKeys || [];
  const entries = {};
  const add = function (entry) {
    if (!entry || typeof entry.id !== "string" || !entry.id) return;
    const copy = cloneRuleValue(entry);
    skip.forEach(function (key) { delete copy[key]; });
    entries[entry.id] = copy;
  };
  if (Array.isArray(target)) {
    target.forEach(add);
  } else {
    Object.keys(target || {}).forEach(function (id) {
      const entry = target[id];
      if (!entry || typeof entry !== "object") return;
      const copy = cloneRuleValue(entry);
      skip.forEach(function (key) { delete copy[key]; });
      entries[id] = copy;
    });
  }
  return entries;
}

function applyRuleEntries(target, savedEntries, skipKeys) {
  if (!savedEntries || typeof savedEntries !== "object") return;
  const applyEntry = function (entry) {
    if (!entry || typeof entry.id !== "string" || !entry.id) return;
    const saved = savedEntries[entry.id];
    if (!isRuleObject(saved)) return;
    replaceRuleValue(entry, mergeRuleDefaults(entry, saved), skipKeys);
  };
  if (Array.isArray(target)) {
    target.forEach(applyEntry);
  } else {
    Object.keys(target || {}).forEach(function (id) {
      applyEntry(target[id]);
    });
  }
}

/* ---------- event deck ---------- */

function captureEventRules() {
  const categories = {};
  Object.keys(EVENT_CATEGORIES).forEach(function (id) {
    const category = EVENT_CATEGORIES[id];
    if (!category) return;
    categories[id] = {
      enabled: category.enabled !== false,
      weightMult: isRuleNumber(category.weightMult) ? category.weightMult : 1
    };
  });

  const cards = {};
  EVENTS.forEach(function (event) {
    if (!event || !event.id) return;
    cards[event.id] = {
      weight: isRuleNumber(event.weight) ? event.weight : 1,
      enabled: event.enabled !== false,
      minTurn: isRuleNumber(event.minTurn) ? event.minTurn : null,
      maxTurn: isRuleNumber(event.maxTurn) ? event.maxTurn : null,
      category: event.category
    };
  });

  const buckets = {};
  EVENT_CATEGORY_ORDER.forEach(function (id) {
    buckets[id] = (EVENT_BUCKETS[id] || []).slice();
  });

  const unrest = {};
  if (typeof UNREST_EVENTS !== "undefined") {
    UNREST_EVENTS.forEach(function (event) {
      if (!event || !event.id) return;
      unrest[event.id] = {
        weight: isRuleNumber(event.weight) ? event.weight : 1,
        enabled: event.enabled !== false
      };
    });
  }

  return { categories: categories, cards: cards, buckets: buckets, unrest: unrest };
}

function applyRunEventRules(rules) {
  const categories = (rules && rules.categories) || {};
  Object.keys(EVENT_CATEGORIES).forEach(function (id) {
    const category = EVENT_CATEGORIES[id];
    const saved = categories[id];
    if (!category || !saved) return;
    category.enabled = saved.enabled !== false;
    category.weightMult = Math.max(0, isRuleNumber(saved.weightMult) ? saved.weightMult : 1);
  });

  const cards = (rules && rules.cards) || {};
  EVENTS.forEach(function (event) {
    const saved = cards[event.id];
    if (!event || !saved) return;
    event.weight = Math.max(0, isRuleNumber(saved.weight) ? saved.weight : 1);
    if (saved.enabled === false) event.enabled = false;
    else delete event.enabled;
    if (isRuleNumber(saved.minTurn)) event.minTurn = saved.minTurn;
    else delete event.minTurn;
    if (isRuleNumber(saved.maxTurn)) event.maxTurn = saved.maxTurn;
    else delete event.maxTurn;
    if (saved.category && EVENT_CATEGORIES[saved.category]) event.category = saved.category;
  });

  /* Rebuild each bucket in place. A bucket only keeps ids that still exist,
     and the last copy wins, so a hand-edited save cannot draw a phantom card
     or list the same card twice. */
  const known = new Set(EVENTS.map(function (event) { return event.id; }));
  EVENT_CATEGORY_ORDER.forEach(function (categoryId) {
    if (!Array.isArray(EVENT_BUCKETS[categoryId])) EVENT_BUCKETS[categoryId] = [];
    const bucket = EVENT_BUCKETS[categoryId];
    bucket.length = 0;
    const seen = new Set();
    const savedList = rules && rules.buckets && Array.isArray(rules.buckets[categoryId])
      ? rules.buckets[categoryId]
      : [];
    savedList.forEach(function (eventId) {
      if (!known.has(eventId) || seen.has(eventId)) return;
      seen.add(eventId);
      bucket.push(eventId);
    });
  });

  const unrest = (rules && rules.unrest) || {};
  if (typeof UNREST_EVENTS !== "undefined") {
    UNREST_EVENTS.forEach(function (event) {
      const saved = unrest[event.id];
      if (!event || !saved) return;
      event.weight = Math.max(0, isRuleNumber(saved.weight) ? saved.weight : 1);
      if (saved.enabled === false) event.enabled = false;
      else delete event.enabled;
    });
  }
}

/* ---------- full rulebook ---------- */

function captureRunContentRules() {
  const content = {};
  RUN_CONTENT_SOURCES.forEach(function (source) {
    content[source.key] = captureRuleEntries(source.target(), source.skip);
  });
  return content;
}

function captureRunRules() {
  return {
    version: RUN_RULES_VERSION,
    config: cloneRuleValue(CONFIG),
    events: captureEventRules(),
    content: captureRunContentRules()
  };
}

/* Defaults are captured once, before any debug edit can touch a global.
   A published standard (js/data/standard-rules.js) is applied over the code
   tables first: it is the new baseline, not a per-match override. */
const RUN_CODE_DEFAULTS = captureRunRules();
const RUN_STANDARD_SOURCE = typeof STANDARD_RULES !== "undefined" && isRuleObject(STANDARD_RULES)
  ? STANDARD_RULES
  : null;
let RUN_STANDARD_META = typeof STANDARD_RULES_META !== "undefined" && isRuleObject(STANDARD_RULES_META)
  ? cloneRuleValue(STANDARD_RULES_META)
  : null;
let RUN_STANDARD_ACTIVE = !!RUN_STANDARD_SOURCE;

if (RUN_STANDARD_SOURCE) {
  const standard = mergeRuleDefaults(RUN_CODE_DEFAULTS, RUN_STANDARD_SOURCE);
  preserveEventTurnGates(standard, RUN_STANDARD_SOURCE);
  ensureRuleListValue(standard, RUN_CODE_DEFAULTS, "config.economy.facilities.levels");
  ensureRuleListValue(standard, RUN_CODE_DEFAULTS, "config.economy.happinessTiers");
  ensureRuleListValue(standard, RUN_CODE_DEFAULTS, "config.planetSlots.sizes");
  standard.version = RUN_RULES_VERSION;
  applyRulebookSnapshot(standard);
}

const RUN_RULE_DEFAULTS = captureRunRules();

/* minTurn / maxTurn are nullable: null means 'no gate'. The generic merge
   treats null as a wrong type and would restore the default gate, so copy an
   explicit null (or number) straight from the save for those two fields. */
function preserveEventTurnGates(merged, incoming) {
  if (!isRuleObject(incoming) || !isRuleObject(incoming.events) || !isRuleObject(incoming.events.cards)) return;
  const cards = incoming.events.cards;
  Object.keys(cards).forEach(function (id) {
    const saved = cards[id];
    const target = merged.events && merged.events.cards ? merged.events.cards[id] : null;
    if (!isRuleObject(saved) || !isRuleObject(target)) return;
    ["minTurn", "maxTurn"].forEach(function (key) {
      if (!Object.prototype.hasOwnProperty.call(saved, key)) return;
      if (saved[key] === null || isRuleNumber(saved[key])) target[key] = saved[key];
    });
  });
}

/* A rulebook with no facility levels, happiness tiers or planet sizes cannot
   run the game. That is only reachable through a hand-edited save (the UI keeps
   at least one row), but the fallback is cheap and keeps a bad file loadable. */
function ensureRuleListValue(rules, defaults, path) {
  const list = getRulePathValue(rules, path);
  if (Array.isArray(list) && list.length) return;
  const fallback = getRulePathValue(defaults, path);
  if (Array.isArray(fallback) && fallback.length) {
    setRulePathValue(rules, path, cloneRuleValue(fallback));
  }
}

function ensureRuleList(rules, path) {
  ensureRuleListValue(rules, RUN_RULE_DEFAULTS, path);
}

function normalizeRunRules(saved) {
  const incoming = isRuleObject(saved) ? saved : {};
  const merged = mergeRuleDefaults(RUN_RULE_DEFAULTS, incoming);
  if (!isRuleObject(merged)) return cloneRuleValue(RUN_RULE_DEFAULTS);
  preserveEventTurnGates(merged, incoming);
  ensureRuleList(merged, "config.economy.facilities.levels");
  ensureRuleList(merged, "config.economy.happinessTiers");
  ensureRuleList(merged, "config.planetSlots.sizes");
  merged.version = RUN_RULES_VERSION;
  return merged;
}

/* Write a complete rulebook into the live globals. The boot pass for a
   published standard runs before RUN_RULE_DEFAULTS exists, so this helper
   cannot normalise; applyRunRules() reuses it after normalising a save. */
function applyRulebookSnapshot(rules) {
  replaceRuleValue(CONFIG, rules.config || {});
  RUN_CONTENT_SOURCES.forEach(function (source) {
    applyRuleEntries(source.target(), rules.content && rules.content[source.key], source.skip);
  });
  applyRunEventRules(rules.events || {});
}

function applyRunRules(saved) {
  const rules = normalizeRunRules(saved);
  applyRulebookSnapshot(rules);
  return rules;
}

function resetRunRules() {
  return applyRunRules(cloneRuleValue(RUN_RULE_DEFAULTS));
}

/* A successful PUSH TO REMOTE makes the published rulebook the standard of
   the running page without a reload: RESET returns to it and the tweak
   counter drops to zero. The committed js/data/standard-rules.js takes over
   on the next page load. */
function adoptRunStandard(rules, meta) {
  const normalized = normalizeRunRules(rules);
  replaceRuleValue(RUN_RULE_DEFAULTS, normalized);
  RUN_STANDARD_META = isRuleObject(meta) ? cloneRuleValue(meta) : null;
  RUN_STANDARD_ACTIVE = true;
  return RUN_RULE_DEFAULTS;
}

function getRunStandardMeta() {
  return RUN_STANDARD_META ? cloneRuleValue(RUN_STANDARD_META) : null;
}

function isRunStandardActive() {
  return RUN_STANDARD_ACTIVE;
}

/* A read-only view of the live rulebook for counting. It references the live
   tables instead of cloning them (capturing a full clone on every keystroke
   made the debug header needlessly expensive); only the buildings' shared
   'levels' field is dropped to match the shape of a captured rulebook. */
function captureRuleEntryView(target, skipKeys) {
  const skip = skipKeys || [];
  const entries = {};
  const add = function (id, entry) {
    if (!entry || typeof entry !== "object") return;
    const view = {};
    Object.keys(entry).forEach(function (key) {
      if (skip.indexOf(key) !== -1) return;
      view[key] = entry[key];
    });
    entries[id] = view;
  };
  if (Array.isArray(target)) {
    target.forEach(function (entry) {
      if (entry && typeof entry.id === "string" && entry.id) add(entry.id, entry);
    });
  } else {
    Object.keys(target || {}).forEach(function (id) {
      add(id, target[id]);
    });
  }
  return entries;
}

function buildLiveRuleView() {
  const content = {};
  RUN_CONTENT_SOURCES.forEach(function (source) {
    content[source.key] = captureRuleEntryView(source.target(), source.skip);
  });
  return {
    version: RUN_RULES_VERSION,
    config: CONFIG,
    events: captureEventRules(),
    content: content
  };
}

/* How far the live rulebook is from the defaults. Counted by leaf so the UI
   can say '12 tweaks' instead of 'the rules differ'. */
function countRuleOverrides(rules) {
  const live = rules ? normalizeRunRules(rules) : buildLiveRuleView();
  let count = 0;
  const walk = function (left, right) {
    const leftIsArray = Array.isArray(left);
    const rightIsArray = Array.isArray(right);
    if (leftIsArray || rightIsArray) {
      if (!leftIsArray || !rightIsArray) {
        count += 1;
        return;
      }
      if (left.length !== right.length) {
        count += 1;
        return;
      }
      left.forEach(function (value, index) { walk(value, right[index]); });
      return;
    }
    if (isRuleObject(left) || isRuleObject(right)) {
      if (!isRuleObject(left) || !isRuleObject(right)) {
        count += 1;
        return;
      }
      const keys = new Set(Object.keys(left).concat(Object.keys(right)));
      keys.forEach(function (key) {
        if (key === "version") return;
        if (!Object.prototype.hasOwnProperty.call(left, key) ||
            !Object.prototype.hasOwnProperty.call(right, key)) {
          count += 1;
          return;
        }
        walk(left[key], right[key]);
      });
      return;
    }
    if (left !== right) count += 1;
  };
  walk(live, RUN_RULE_DEFAULTS);
  return count;
}

function hasCustomRunRules(rules) {
  return countRuleOverrides(rules) > 0;
}
