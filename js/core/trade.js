/* ============================================================
   TRADE — gate-linked sector transfers and gate jump operations
   Energy and minerals live in per-sector ledgers. A trading center only
   works while its sector holds an operational gate, and it can only reach
   sectors linked to that gate through the galaxy lanes. A hop that leaves a
   sector other than the center's own needs a gate there too, so gates relay
   trade outward. Routes ship once per turn, after production, and never take
   more than the source sector holds.

   A center runs one route by default. The Trade Network techs raise that to
   2, 3 and 4 routes per center (see getTradeRouteCap in core/helpers.js).
   Every route is an independent destination plus energy/mineral amounts.
   structure.routes holds them and structure.trade stays aliased to route 0
   so older call sites and tools keep working.

   Gates also spend jump operations: every operational gate in a sector
   accepts getGateOpsPerGate() fleet jumps per turn, and the used counter
   resets when the turn number changes.
   ============================================================ */

/* Player gates that are online, anywhere in the sector. */
function getOperationalGates(sectorId) {
  const sector = getSector(sectorId);
  const gates = [];
  if (!sector) return gates;
  Object.keys(sector.structures || {}).forEach(function (key) {
    const structure = sector.structures[key];
    if (!structure || structure.type !== "gate" || structure.underConstruction) return;
    if (!isPlayerStructure(structure)) return;
    gates.push({ sectorId: sector.id, key: key, structure: structure });
  });
  return gates;
}

function hasOperationalGateInSector(sectorId) {
  return getOperationalGates(sectorId).length > 0;
}

/* ---------- gate jump operations ---------- */

/* Ops used this turn per sector. The bookkeeping is lazy: a stored turn
   that no longer matches the live turn is simply reset. */
function getGateOpsState(sectorId) {
  const sector = getSector(sectorId);
  if (!sector) return { turn: state ? state.turn : 0, used: 0 };
  if (!sector.gateOps || sector.gateOps.turn !== state.turn) {
    sector.gateOps = { turn: state.turn, used: 0 };
  }
  return sector.gateOps;
}

/* { gates, perGate, cap, used, left } for a sector. The cap is every
   operational gate multiplied by the per-gate ops the tech tree allows, so
   a second gate in the same sector doubles the jump capacity. */
function getSectorGateOps(sectorId) {
  const sector = getSector(sectorId);
  const gates = sector ? getOperationalGates(sector.id).length : 0;
  const perGate = getGateOpsPerGate();
  const cap = gates * perGate;
  const ops = getGateOpsState(sectorId);
  const used = sector ? Math.max(0, ops.used) : 0;
  return {
    gates: gates,
    perGate: perGate,
    cap: cap,
    used: used,
    left: Math.max(0, cap - used)
  };
}

/* Spend one op. Returns false and changes nothing when the sector is out. */
function consumeGateOp(sectorId) {
  const summary = getSectorGateOps(sectorId);
  if (summary.left <= 0) return false;
  getGateOpsState(sectorId).used += 1;
  return true;
}

/* ---------- trade reach ---------- */

function getTradeMaxHops() {
  const value = CONFIG.trade && CONFIG.trade.maxHops;
  return Math.max(1, Math.floor(typeof value === "number" ? value : 4));
}

function getTradeMaxAmount() {
  const value = CONFIG.trade && CONFIG.trade.maxAmount;
  return Math.max(1, Math.floor(typeof value === "number" ? value : 20));
}

/* Every sector the center's gate can reach. The source sector can always
   open the first hop; each further hop must leave a sector that also has an
   operational gate, so a chain of gates extends the trade network.
   Returns { allowed, reason, gateKey, gates, targets: [{ sectorId, sector, hops, path }] }. */
function getTradeReach(sectorId) {
  const sector = getSector(sectorId);
  if (!sector) {
    return { allowed: false, reason: "Unknown sector.", gateKey: null, gates: [], targets: [] };
  }
  const gates = getOperationalGates(sector.id);
  if (!gates.length) {
    return {
      allowed: false,
      reason: "No operational gate in " + sector.name + ".",
      gateKey: null,
      gates: gates,
      targets: []
    };
  }

  const maxHops = getTradeMaxHops();
  const visited = {};
  visited[sector.id] = { path: [sector.id], hops: 0 };
  const queue = [sector.id];
  const targets = [];

  while (queue.length) {
    const currentId = queue.shift();
    const current = visited[currentId];
    if (!current || current.hops >= maxHops) continue;
    /* The source already proved it has a gate. Any other sector only relays
       trade onward when it has an operational gate of its own. */
    if (currentId !== sector.id && !hasOperationalGateInSector(currentId)) continue;
    const currentSector = getSector(currentId);
    if (!currentSector) continue;

    currentSector.neighbors.forEach(function (nextId) {
      if (visited[nextId]) return;
      const nextSector = getSector(nextId);
      if (!nextSector) return;
      const path = current.path.concat([nextId]);
      const hops = current.hops + 1;
      visited[nextId] = { path: path, hops: hops };
      targets.push({ sectorId: nextId, sector: nextSector, hops: hops, path: path });
      queue.push(nextId);
    });
  }

  targets.sort(function (a, b) {
    if (a.hops !== b.hops) return a.hops - b.hops;
    if (a.sector.ring !== b.sector.ring) return a.sector.ring - b.sector.ring;
    return a.sector.index - b.sector.index;
  });

  return {
    allowed: true,
    reason: null,
    gateKey: gates[0].key,
    gates: gates,
    targets: targets
  };
}

/* ---------- trading centers and their routes ---------- */

/* Every player trading center in the galaxy, online or not. */
function getTradingCenters() {
  const centers = [];
  if (!state || !state.galaxy) return centers;
  state.galaxy.sectors.forEach(function (sector) {
    Object.keys(sector.structures || {}).forEach(function (key) {
      const structure = sector.structures[key];
      if (!structure || structure.type !== "trading") return;
      if (!isPlayerStructure(structure)) return;
      centers.push({ sectorId: sector.id, sector: sector, key: key, structure: structure });
    });
  });
  return centers;
}

function createTradeRouteConfig() {
  return { targetSectorId: null, energy: 0, minerals: 0 };
}

/* The editable route configs of one center. The list is padded up to the
   cap the tech tree allows, so a newly researched Trade Network tech simply
   exposes another route slot. structure.trade is kept pointing at route 0.
   Amounts are whole units and clamped to CONFIG.trade.maxAmount. */
function getCenterRoutes(structure) {
  if (!structure) return [];
  if (!Array.isArray(structure.routes)) {
    structure.routes = [];
    if (structure.trade && typeof structure.trade === "object") {
      structure.routes.push(structure.trade);
    }
  }
  if (!structure.routes.length) structure.routes.push(createTradeRouteConfig());
  const cap = getTradeRouteCap();
  const max = getTradeMaxAmount();
  while (structure.routes.length < cap) structure.routes.push(createTradeRouteConfig());
  structure.routes.forEach(function (config) {
    if (!config || typeof config !== "object") return;
    if (config.targetSectorId === undefined) config.targetSectorId = null;
    config.energy = clamp(Math.floor(config.energy || 0), 0, max);
    config.minerals = clamp(Math.floor(config.minerals || 0), 0, max);
  });
  /* Route 0 doubles as the legacy structure.trade object. */
  structure.trade = structure.routes[0];
  return structure.routes;
}

/* The editable route config on a center. Amounts are whole units. */
function getTradeConfig(structure, index) {
  if (!structure) return createTradeRouteConfig();
  const routes = getCenterRoutes(structure);
  const slot = clamp(Math.floor(index || 0), 0, routes.length - 1);
  return routes[slot];
}

/* One entry per configured center route, with the live reach check. Status
   is active (shipping), empty (route set, nothing to send), idle (no target),
   building (center offline), no-gate or out-of-reach. A center with no
   destination on any route still reports one idle entry so the galaxy panel
   and the tests can see it. */
function getSectorTrades() {
  const routes = [];
  const reachCache = {};
  getTradingCenters().forEach(function (entry) {
    const structure = entry.structure;
    const configs = getCenterRoutes(structure);
    if (!reachCache[entry.sectorId]) reachCache[entry.sectorId] = getTradeReach(entry.sectorId);
    const reach = reachCache[entry.sectorId];
    const centerRoutes = [];
    let configuredCount = 0;

    configs.forEach(function (config, index) {
      const target = config.targetSectorId ? getSector(config.targetSectorId) : null;
      if (config.targetSectorId) configuredCount += 1;
      let status = "idle";
      let reason = "No destination selected.";
      let hops = 0;
      let path = [];

      if (structure.underConstruction) {
        status = "building";
        reason = "Trading center is under construction.";
      } else if (!reach.allowed) {
        status = "no-gate";
        reason = reach.reason;
      } else if (!config.targetSectorId || !target) {
        status = "idle";
        reason = "No destination selected.";
      } else {
        const match = reach.targets.find(function (candidate) {
          return candidate.sectorId === config.targetSectorId;
        });
        if (!match) {
          status = "out-of-reach";
          reason = target.name + " is outside this gate's reach.";
        } else if (!config.energy && !config.minerals) {
          status = "empty";
          reason = "Set an energy or mineral amount.";
          hops = match.hops;
          path = match.path;
        } else {
          status = "active";
          reason = null;
          hops = match.hops;
          path = match.path;
        }
      }

      centerRoutes.push({
        structure: structure,
        config: config,
        routeIndex: index,
        sourceSectorId: entry.sectorId,
        sourceSector: entry.sector,
        sourceKey: entry.key,
        targetSectorId: config.targetSectorId,
        targetSector: target,
        energy: config.energy,
        minerals: config.minerals,
        hops: hops,
        path: path,
        status: status,
        reason: reason
      });
    });

    if (!configuredCount) {
      /* Nothing configured: publish the first slot only, so a bare center
         still reads as IDLE / NO GATE instead of one row per empty slot. */
      if (centerRoutes.length) routes.push(centerRoutes[0]);
      return;
    }
    centerRoutes.forEach(function (route) {
      if (route.targetSectorId) routes.push(route);
    });
  });
  return routes;
}

/* Planned inflow and outflow for one sector, used by the ledger and the
   topbar delta. Only active routes move stock. */
function getSectorTradeFlow(sectorId) {
  const flow = {
    in: { energy: 0, minerals: 0 },
    out: { energy: 0, minerals: 0 },
    entries: []
  };
  getSectorTrades().forEach(function (route) {
    if (route.status !== "active") return;
    if (route.sourceSectorId === sectorId) {
      flow.out.energy += route.energy;
      flow.out.minerals += route.minerals;
      flow.entries.push(route);
    } else if (route.targetSectorId === sectorId) {
      flow.in.energy += route.energy;
      flow.in.minerals += route.minerals;
      flow.entries.push(route);
    }
  });
  return flow;
}

/* A compact summary for the galaxy layer menu and trade panel. */
function getTradeSummary() {
  const routes = getSectorTrades();
  const active = routes.filter(function (route) { return route.status === "active"; });
  const blocked = routes.filter(function (route) {
    return route.status === "no-gate" || route.status === "out-of-reach";
  });
  const totals = { energy: 0, minerals: 0 };
  active.forEach(function (route) {
    totals.energy += route.energy;
    totals.minerals += route.minerals;
  });
  return {
    routes: routes,
    active: active,
    blocked: blocked,
    centerCount: getTradingCenters().length,
    routeCount: routes.length,
    energy: totals.energy,
    minerals: totals.minerals
  };
}

/* Routes ship after production. A sector never sends more than it holds;
   energy stock may be negative after upkeep, which simply ships nothing.
   Routes of the same center run in slot order, so the second route sees
   whatever the first one left behind. */
function resolveTradeTransfers() {
  const report = { routes: [], energy: 0, minerals: 0, shipped: 0, blocked: 0 };
  getSectorTrades().forEach(function (route) {
    const structure = route.structure;
    const config = route.config || {};
    if (route.status !== "active") {
      report.blocked += 1;
      config.lastTrade = {
        turn: state.turn,
        status: route.status,
        targetSectorId: route.targetSectorId,
        energy: 0,
        minerals: 0
      };
      if (route.routeIndex === 0) structure.lastTrade = config.lastTrade;
      return;
    }

    const availableEnergy = Math.max(0, Math.floor(getSectorStock(route.sourceSectorId, "energy")));
    const availableMinerals = Math.max(0, Math.floor(getSectorStock(route.sourceSectorId, "minerals")));
    const sendEnergy = Math.min(route.energy, availableEnergy);
    const sendMinerals = Math.min(route.minerals, availableMinerals);
    if (!sendEnergy && !sendMinerals) {
      config.lastTrade = {
        turn: state.turn,
        status: "short",
        targetSectorId: route.targetSectorId,
        energy: 0,
        minerals: 0,
        short: true
      };
      if (route.routeIndex === 0) structure.lastTrade = config.lastTrade;
      report.routes.push({
        sourceSectorId: route.sourceSectorId,
        targetSectorId: route.targetSectorId,
        energy: 0,
        minerals: 0,
        status: "short"
      });
      return;
    }

    addSectorStock(route.sourceSectorId, "energy", -sendEnergy);
    addSectorStock(route.sourceSectorId, "minerals", -sendMinerals);
    addSectorStock(route.targetSectorId, "energy", sendEnergy);
    addSectorStock(route.targetSectorId, "minerals", sendMinerals);
    config.lastTrade = {
      turn: state.turn,
      status: "shipped",
      targetSectorId: route.targetSectorId,
      energy: sendEnergy,
      minerals: sendMinerals,
      short: sendEnergy < route.energy || sendMinerals < route.minerals
    };
    if (route.routeIndex === 0) structure.lastTrade = config.lastTrade;
    report.routes.push({
      sourceSectorId: route.sourceSectorId,
      targetSectorId: route.targetSectorId,
      energy: sendEnergy,
      minerals: sendMinerals,
      status: "shipped"
    });
    report.energy += sendEnergy;
    report.minerals += sendMinerals;
    report.shipped += 1;
  });
  return report;
}

/* ---------- player controls ---------- */

function getTradeCenterEntry(sectorId, key) {
  const sector = getSector(sectorId || (state && state.ui ? state.ui.activeSector : null));
  if (!sector || !key) return null;
  const structure = sector.structures ? sector.structures[key] : null;
  if (!structure || structure.type !== "trading" || !isPlayerStructure(structure)) return null;
  return { sectorId: sector.id, sector: sector, key: key, structure: structure };
}

/* Set (or clear) the destination of one route slot. The extra routes unlocked
   by Trade Network techs are addressed with the optional index. */
function setTradingCenterTarget(sectorId, key, targetSectorId, index) {
  const entry = getTradeCenterEntry(sectorId, key);
  if (!entry) return { ok: false, reason: "No trading center in this hex." };
  if (entry.structure.underConstruction) {
    return { ok: false, reason: "The trading center is not online yet." };
  }
  const config = getTradeConfig(entry.structure, index);
  if (!targetSectorId) {
    config.targetSectorId = null;
    return { ok: true, cleared: true };
  }
  const source = getSector(entry.sectorId);
  const target = getSector(targetSectorId);
  if (!target) return { ok: false, reason: "Unknown sector." };
  if (target.id === source.id) return { ok: false, reason: "A trading center cannot trade with its own sector." };
  const reach = getTradeReach(source.id);
  if (!reach.allowed) return { ok: false, reason: reach.reason };
  const match = reach.targets.find(function (candidate) { return candidate.sectorId === target.id; });
  if (!match) {
    return { ok: false, reason: target.name + " is not reachable from this gate." };
  }
  config.targetSectorId = target.id;
  return { ok: true, target: target, hops: match.hops };
}

function adjustTradingCenterAmount(sectorId, key, resource, delta, index) {
  if (resource !== "energy" && resource !== "minerals") return { ok: false, reason: "Unknown resource." };
  const entry = getTradeCenterEntry(sectorId, key);
  if (!entry) return { ok: false, reason: "No trading center in this hex." };
  if (entry.structure.underConstruction) {
    return { ok: false, reason: "The trading center is not online yet." };
  }
  const config = getTradeConfig(entry.structure, index);
  const max = getTradeMaxAmount();
  const step = typeof delta === "number" ? delta : 0;
  config[resource] = clamp(Math.floor(config[resource] || 0) + step, 0, max);
  return { ok: true, value: config[resource], max: max };
}

function clearTradingCenterRoute(sectorId, key, index) {
  const entry = getTradeCenterEntry(sectorId, key);
  if (!entry) return { ok: false, reason: "No trading center in this hex." };
  const config = getTradeConfig(entry.structure, index);
  config.targetSectorId = null;
  config.energy = 0;
  config.minerals = 0;
  delete config.lastTrade;
  return { ok: true };
}

/* How many route slots a center has, and how many of them are in use. */
function getTradingCenterRouteSummary(structure) {
  const routes = getCenterRoutes(structure);
  const cap = getTradeRouteCap();
  const used = routes.slice(0, cap).filter(function (config) {
    return !!config.targetSectorId;
  }).length;
  return { routes: routes.slice(0, cap), cap: cap, used: used };
}

/* Human-readable status for the dossier and the galaxy panel. */
function getTradeStatusLabel(route) {
  if (!route) return "IDLE";
  if (route.status === "active") return "SHIPPING";
  if (route.status === "empty") return "AWAITING AMOUNT";
  if (route.status === "building") return "UNDER CONSTRUCTION";
  if (route.status === "no-gate") return "NO GATE";
  if (route.status === "out-of-reach") return "OUT OF REACH";
  if (route.status === "shipped") return "SHIPPED";
  if (route.status === "short") return "STOCK EMPTY";
  return "IDLE";
}
