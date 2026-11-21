#!/usr/bin/env node
/* ============================================================
   MILITARY HARNESS — logic checks for the rival/patrol/stronghold pass
   The app intentionally has no build step, so this harness loads the
   classic browser scripts in a Node VM with tiny UI stubs. Run it with:

       node tests/military-harness.js

   It covers seeded rival spawning, difficulty by ring, hex patrol
   ranges and map coverage, patrol combat, strongholds, raids, AI growth
   and cross-lane raid movement. It does not render DOM; see the README
   for the headless-Chrome verification of the views.
   ============================================================ */

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const root = path.resolve(__dirname, "..");
const files = [
  "js/data/config.js",
  "js/data/ethics.js",
  "js/data/buildings.js",
  "js/data/structures.js",
  "js/data/ships.js",
  "js/data/empires.js",
  "js/data/techs.js",
  "js/data/events.js",
  "js/data/anomalies.js",
  "js/data/resources.js",
  "js/data/systems.js",
  "js/core/rng.js",
  "js/core/galaxy.js",
  "js/core/state.js",
  "js/core/run-rules.js",
  "js/core/helpers.js",
  "js/core/colony.js",
  "js/core/colony-economy.js",
  "js/core/hex-grid.js",
  "js/core/empires.js",
  "js/core/combat.js",
  "js/core/rival-ai.js",
  "js/core/effects.js",
  "js/core/survey.js",
  "js/core/event-engine.js",
  "js/core/trade.js",
  "js/core/economy.js",
  "js/game/planet-nav.js",
  "js/game/actions.js",
  "js/game/military-actions.js",
  "js/game/turn.js"
];

let checks = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  checks += 1;
}
function eq(actual, expected, message) {
  assert.strictEqual(actual, expected, message + " (got " + actual + ", want " + expected + ")");
  checks += 1;
}

function createContext() {
  const context = {
    console: console,
    Math: Math,
    Date: Date,
    JSON: JSON,
    Set: Set,
    Map: Map,
    Object: Object,
    Array: Array,
    Number: Number,
    String: String,
    Boolean: Boolean,
    isFinite: isFinite,
    parseInt: parseInt,
    parseFloat: parseFloat,
    performance: { now: function () { return 0; } },
    requestAnimationFrame: function () { return 0; },
    setTimeout: function () { return 0; },
    clearTimeout: function () {},
    document: {
      querySelector: function () { return null; },
      querySelectorAll: function () { return []; },
      getElementById: function () { return null; },
      addEventListener: function () {}
    },
    window: {},
    els: {},
    toast: function () {},
    renderAll: function () {},
    renderMap: function () {},
    renderNav: function () {},
    setResourceTexts: function () {},
    hideToast: function () {},
    closeSheet: function () {},
    showEventLayer: function () {},
    hideEventLayer: function () {}
  };
  vm.createContext(context);
  files.forEach(function (file) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
  });
  return context;
}

const context = createContext();
function run(code) {
  return vm.runInContext(code, context);
}
function reset() {
  run("state = createInitialState(null); state.phase = 'actions'; state.ethic = 'militarist';");
}

function testSpawn() {
  reset();
  const empires = run("state.empires");
  ok(empires.length >= 5 && empires.length <= 7, "spawns 5-7 rival empires");
  eq(new Set(empires.map(function (e) { return e.ring; })).size, 4, "one rival per galaxy ring");

  empires.forEach(function (empire) {
    ok(!!run("getSystem('" + empire.capitalSystemId + "').owner"), empire.name + " owns a capital system");
    eq(run("getEmpireShipCount(getEmpire('" + empire.id + "'))"), 1 + empire.ring,
      empire.name + " starts with ring + 1 corvettes");
    if (empire.ring >= 3) {
      eq(run("getEmpireStrongholds(getEmpire('" + empire.id + "')).length"), 1,
        empire.name + " starts with a stronghold");
    }
  });

  const powerByRing = {};
  empires.forEach(function (empire) {
    if (!powerByRing[empire.ring]) powerByRing[empire.ring] = [];
    powerByRing[empire.ring].push(run("getEmpirePower(getEmpire('" + empire.id + "'))"));
  });
  const ringPower = [1, 2, 3, 4].map(function (ring) {
    const list = powerByRing[ring] || [0];
    return list.reduce(function (sum, value) { return sum + value; }, 0) / list.length;
  });
  ok(ringPower[0] < ringPower[1] && ringPower[1] < ringPower[2] && ringPower[2] < ringPower[3],
    "average power rises from the near-core ring to the rim");

  // Same galaxy seed must place the same powers.
  const a = run("JSON.stringify(createGalaxy(CONFIG.galaxy.seed).empires.map(e => ({name:e.name, ring:e.ring, sector:e.sectorId, capital:e.capitalSystemId, ships:getEmpireShipCount(e)})))");
  const b = run("JSON.stringify(createGalaxy(CONFIG.galaxy.seed).empires.map(e => ({name:e.name, ring:e.ring, sector:e.sectorId, capital:e.capitalSystemId, ships:getEmpireShipCount(e)})))");
  eq(a, b, "rival spawn is deterministic per seed");

  const rival = empires[0];
  ok(run("getColonizeBlockReason(getSystem('" + rival.capitalSystemId + "')).indexOf('Controlled by') === 0"),
    "rival systems cannot be colonised");
}

function testHexMath() {
  eq(run("hexDistance(0,0,1,0)"), 1, "neighbour distance is 1");
  eq(run("hexDistance(0,0,0,0)"), 0, "self distance is 0");
  eq(run("hexDistance(0,1,2,2)"), run("hexDistance(2,2,0,1)"), "hex distance is symmetric");
  eq(run("hexesWithinRadius(2,3,1).length"), 7, "radius 1 contains the centre and six neighbours");
  eq(run("hexesWithinRadius(2,3,2).length"), 16, "radius 2 clips to the 4x6 sector");
  ok(run("hexesWithinRadius(2,3,2).every(c => hexDistance(2,3,c[0],c[1]) <= 2)"),
    "every radius cell is within range");
}

function angleDifference(a, b) {
  const full = Math.PI * 2;
  let delta = Math.abs(a - b) % full;
  if (delta > Math.PI) delta = full - delta;
  return delta;
}

function testLandingTopology() {
  reset();
  const sectors = run("state.galaxy.sectors.map(function (sector) { return { id: sector.id, ring: sector.ring, angle: sector.angle, neighbors: sector.neighbors.slice(), landings: Object.assign({}, sector.landings) }; })");
  const slots = run("getSectorLandingSlots().map(function (slot) { return { key: slot.key, oppositeKey: slot.oppositeKey, angle: slot.angle, row: slot.row, col: slot.col }; })");
  const positions = run("state.galaxy.sectors.map(function (sector) { const point = galaxyNodePosition(sector); return { id: sector.id, x: point.x, y: point.y }; })");
  const slotByKey = {};
  slots.forEach(function (slot) { slotByKey[slot.key] = slot; });
  const byId = {};
  sectors.forEach(function (sector) { byId[sector.id] = sector; });
  const posById = {};
  positions.forEach(function (position) { posById[position.id] = position; });

  const bad = [];
  let maxBearingError = 0;
  let edges = 0;
  sectors.forEach(function (a) {
    const keys = Object.keys(a.landings || {});
    if (keys.length !== a.neighbors.length) bad.push(a.id + " has " + keys.length + " ports for " + a.neighbors.length + " lanes");
    const unique = new Set(keys.map(function (id) { return a.landings[id]; }));
    if (unique.size !== keys.length) bad.push(a.id + " reuses a landing hex");
    keys.forEach(function (id) {
      const key = a.landings[id];
      const slot = slotByKey[key];
      if (!slot) {
        bad.push(a.id + " has no slot for " + key);
        return;
      }
      if (run("getSystemAtHex(" + slot.row + ", " + slot.col + ", " + JSON.stringify(a.id) + ")")) {
        bad.push(a.id + " puts a system on landing " + key);
      }
      if (run("getAnomalyAt(" + slot.row + ", " + slot.col + ", " + JSON.stringify(a.id) + ")")) {
        bad.push(a.id + " puts a site on landing " + key);
      }
    });
    a.neighbors.forEach(function (bid) {
      if (a.id >= bid) return;
      const b = byId[bid];
      if (!b) return;
      const from = slotByKey[a.landings[bid]];
      const to = slotByKey[b.landings[a.id]];
      if (!from || !to || from.oppositeKey !== to.key) {
        bad.push(a.id + " and " + bid + " are not mirrored");
        return;
      }
      const pa = posById[a.id];
      const pb = posById[bid];
      const bearing = Math.atan2(pb.y - pa.y, pb.x - pa.x);
      const error = angleDifference(bearing, from.angle) * 180 / Math.PI;
      if (error > maxBearingError) maxBearingError = error;
      edges += 1;
    });
  });

  eq(bad.length, 0, "every lane gets a unique, mirrored landing port off systems and sites");
  ok(edges > 0, "the generated galaxy has lanes to place");
  ok(maxBearingError < 60,
    "landing ports stay within 60 degrees of the galaxy bearing (max " + maxBearingError.toFixed(1) + ")");
  eq(run("getSectorLandingEntries('sec-core').length"),
    run("getSector('sec-core').neighbors.length"),
    "the map lists one landing per adjacent sector");
  eq(run("getLandingHexFor('sec-core', 'missing')"),
    run("hexKey(getSector('sec-core').entryRow, getSector('sec-core').entryCol)"),
    "a missing lane falls back to the central entry hex");

  const core = byId["sec-core"];
  const layout = run("({ x: CONFIG.galaxy.layout.centerX, y: CONFIG.galaxy.layout.centerY })");
  let northId = null;
  let southId = null;
  let northError = Infinity;
  let southError = Infinity;
  core.neighbors.forEach(function (id) {
    const point = posById[id];
    const angle = Math.atan2(point.y - layout.y, point.x - layout.x);
    const toNorth = angleDifference(angle, -Math.PI / 2);
    const toSouth = angleDifference(angle, Math.PI / 2);
    if (toNorth < northError) {
      northId = id;
      northError = toNorth;
    }
    if (toSouth < southError) {
      southId = id;
      southError = toSouth;
    }
  });
  eq(slotByKey[core.landings[northId]].row, 0,
    "the northern neighbour lands on the top row");
  eq(slotByKey[core.landings[southId]].row, run("CONFIG.sector.rows") - 1,
    "the southern neighbour lands on the bottom row");
}

function testRivalLandingJump() {
  reset();
  const info = run("(function () { const from = getSector('sec-core'); const to = getSector(from.neighbors[0]); const ship = createShip('corvette', { id: 'rival-lane-test', owner: state.empires[0].id }); ship.jumpSector = to.id; from.rivalFleets[getLandingHexFor(from, to.id)] = [ship]; return { from: from.id, to: to.id, departure: getLandingHexFor(from, to.id), expected: getLandingHexFor(to, from.id) }; })()");
  run("advanceRivalFleets()");
  const arrival = run("getRivalFleetAt(parseHexKey('" + info.expected + "').row, parseHexKey('" + info.expected + "').col, '" + info.to + "')");
  ok(arrival.some(function (ship) { return ship.id === "rival-lane-test"; }),
    "a rival lane jump arrives on the mirrored landing port");
  eq(run("getRivalFleetAt(parseHexKey('" + info.departure + "').row, parseHexKey('" + info.departure + "').col, '" + info.from + "').length"), 0,
    "the rival leaves its departure port");
}

function testPatrolCoverage() {
  reset();
  eq(run("getSectorPatrolCoverage('sec-core').sourceCount"), 0,
    "a sector with no patrols or strongholds starts uncovered");
  run("(function(){ const s=getSector('sec-core'); s.fleets={}; s.fleets[hexKey(2,3)]=[createShip('corvette',{id:'cover-a',name:'Cover',patrol:true})]; })()");
  const corvetteCoverage = run("getSectorPatrolCoverage('sec-core')");
  eq(corvetteCoverage.patrols, 1, "a patrolling corvette contributes one source");
  eq(corvetteCoverage.hexCount, 7, "a radius-1 corvette covers seven hexes");
  eq(corvetteCoverage.zones["2,3"].kind, "corvette", "corvette zones are tagged for the map");
  run("(function(){ const s=getSector('sec-core'); s.structures[hexKey(2,0)]={type:'stronghold',owner:'player',underConstruction:false,startedTurn:1,hull:10}; })()");
  const combined = run("getSectorPatrolCoverage('sec-core')");
  eq(combined.strongholds, 1, "an online stronghold contributes one source");
  eq(combined.sourceCount, 2, "patrol and stronghold sources are summed");
  ok(combined.hexCount > 7, "the stronghold radius expands the merged layer");
  ok(Object.keys(combined.zones).some(function (key) { return combined.zones[key].kind === "stronghold"; }),
    "stronghold zones are tagged for the map");
  run("getStructureAt(2,0,'sec-core').underConstruction = true;");
  eq(run("getSectorPatrolCoverage('sec-core').strongholds"), 0,
    "offline strongholds do not contribute");
}

function testPatrolCombat() {
  reset();
  run("(function(){ const s=getSector('sec-core'); s.fleets[hexKey(0,0)]=[createShip('corvette',{id:'test-a',name:'Test A',patrol:true})]; s.rivalFleets[hexKey(0,1)]=[createShip('corvette',{id:'test-r',name:'Rival',owner:state.empires[0].id,patrol:true})]; })()");
  run("resolveMilitaryTurn()");
  eq(run("getFleetAt(0,0).find(s=>s.id==='test-a').hull"), 3, "patrol corvette takes return fire");
  eq(run("getRivalFleetAt(0,1).find(s=>s.id==='test-r').hull"), 3, "rival patrol takes patrol fire");
  run("resolveMilitaryTurn(); resolveMilitaryTurn();");
  eq(run("getFleetAt(0,0).filter(s=>s.id==='test-a').length"), 0, "destroyed corvette leaves the fleet");
  eq(run("getRivalFleetAt(0,1).filter(s=>s.id==='test-r').length"), 0, "destroyed rival leaves its fleet");
  eq(run("state.military.kills"), 1, "player kill counted");
  eq(run("state.military.losses"), 1, "player loss counted");
  ok(run("state.military.salvage >= 2"), "salvage awarded for a destroyed rival");
  ok(run("state.military.log.length > 0"), "combat writes a military dispatch");
}

function testStronghold() {
  reset();
  run("(function(){ const s=getSector('sec-core'); s.structures[hexKey(1,1)]={type:'stronghold',owner:'player',underConstruction:false,startedTurn:1,hull:10}; s.rivalFleets[hexKey(1,3)]=[createShip('corvette',{id:'test-r2',name:'Rival 2',owner:state.empires[0].id})]; })()");
  eq(run("getSectorPower('sec-core')"), 17, "online stronghold contributes 6 power");
  eq(run("getEconomy().strongholdUpkeep"), 2, "online stronghold draws 2 energy upkeep");
  run("resolveMilitaryTurn()");
  eq(run("getRivalFleetAt(1,3).find(s=>s.id==='test-r2').hull"), 2, "stronghold fires at radius 2");
  eq(run("getStructureAt(1,1).hull"), 10, "non-patrolling rival cannot return fire at range 2");

  run("getStructureAt(1,1).underConstruction = true;");
  eq(run("getSectorPower('sec-core')"), 11, "offline stronghold adds no power");
  eq(run("getEconomy().strongholdUpkeep"), 0, "offline stronghold draws no upkeep");
}

function testRaidCoverage() {
  reset();
  run("(function(){ const s=getSector('sec-core'); s.fleets={}; const sys=state.systems.find(x=>x.home); s.fleets[hexKey(1,3)]=[createShip('corvette',{id:'guard',name:'Guard',patrol:true})]; s.rivalFleets[hexKey(sys.row,sys.col)]=[createShip('corvette',{id:'raider',name:'Raider',owner:state.empires[0].id})]; setSectorStock('sec-core','minerals',10); state.stability=70; })()");
  run("resolveRaids()");
  eq(run("getSectorStock('sec-core', 'minerals')"), 10, "radius-1 patrol prevents a raid");
  eq(run("state.stability"), 70, "protected colony loses no stability");
  run("(function(){ const s=getSector('sec-core'); for (let r=0;r<CONFIG.sector.rows;r+=1) for (let c=0;c<CONFIG.sector.cols;c+=1) delete s.fleets[hexKey(r,c)]; })()");
  run("resolveRaids()");
  ok(run("getSectorStock('sec-core', 'minerals') < 10"), "uncovered colony is raided");
  eq(run("state.stability"), 69, "raid costs 1 stability");
  eq(run("state.military.raids"), 1, "raid is counted");
}

function testPlayerPatrolOrder() {
  reset();
  const shipId = run("getFleetAt(2,3,'sec-core').find(s=>s.type==='corvette').id");
  run("state.ui.selectedHex = hexKey(2,3); state.ui.shipSelection = ['" + shipId + "'];");
  run("setSelectedShipsPatrol(true)");
  eq(run("getFleetAt(2,3,'sec-core').find(s=>s.id==='" + shipId + "').patrol"), true,
    "SET PATROL puts the selected corvette on station");
  run("state.ui.move = {sectorId:'sec-core', from:hexKey(2,3), ids:['" + shipId + "'], previewPath:['1,3'], previewDestination:'1,3'};");
  run("confirmFleetMove()");
  eq(run("getFleetAt(2,3,'sec-core').find(s=>s.id==='" + shipId + "').patrol"), false,
    "assigning a route stands the corvette down");
  ok(run("!!getFleetAt(2,3,'sec-core').find(s=>s.id==='" + shipId + "').path"),
    "the route is still assigned");
}

function testBuilderStronghold() {
  reset();
  run("setSectorStock('sec-core', 'minerals', 30);");
  const emptyKey = run("(function(){ for (let r=0;r<CONFIG.sector.rows;r+=1) for (let c=0;c<CONFIG.sector.cols;c+=1){ if(r===CONFIG.sector.entryRow&&c===CONFIG.sector.entryCol) continue; if(getSystemAtHex(r,c,'sec-core')) continue; if(getStructureAt(r,c,'sec-core')) continue; return hexKey(r,c); } return null; })()");
  ok(!!emptyKey, "found an empty hex for the builder");
  run("(function(){ const s=getSector('sec-core'); s.fleets['" + emptyKey + "']=[createShip('builder',{id:'test-builder',name:'Builder Test'})]; state.ui.selectedHex='" + emptyKey + "'; })()");
  eq(run("STRUCTURE_TYPES.stronghold.power"), 6, "stronghold power is 6");
  eq(run("STRUCTURE_TYPES.stronghold.patrolRadius"), 2, "stronghold patrol radius is 2");
  eq(run("STRUCTURE_TYPES.stronghold.energyUpkeep"), 2, "stronghold has upkeep");
  run("buildStructure('stronghold')");
  eq(run("getSectorStock('sec-core', 'minerals')"), 20, "stronghold costs 10 minerals from the sector");
  run("completeConstruction()");
  eq(run("getStructureAt(parseHexKey('" + emptyKey + "').row,parseHexKey('" + emptyKey + "').col).underConstruction"), false,
    "stronghold comes online next turn");
  eq(run("getPlayerStrongholds().length"), 1, "online stronghold is listed");
  eq(run("getEconomy().strongholdUpkeep"), 2, "built stronghold is charged upkeep");
}

function testRadarBuild() {
  reset();
  run("setSectorStock('sec-core', 'minerals', 30);");
  const emptyKey = run("(function(){ for (let r=0;r<CONFIG.sector.rows;r+=1) for (let c=0;c<CONFIG.sector.cols;c+=1){ if(getSystemAtHex(r,c,'sec-core')) continue; if(getStructureAt(r,c,'sec-core')) continue; return hexKey(r,c); } return null; })()");
  ok(!!emptyKey, "found an empty hex for a radar");
  run("(function(){ const s=getSector('sec-core'); s.fleets['" + emptyKey + "']=[createShip('builder',{id:'radar-builder',name:'Builder Test'})]; state.ui.selectedHex='" + emptyKey + "'; })()");
  eq(run("STRUCTURE_TYPES.radar.cost.minerals"), 5, "a radar costs 5 minerals");
  eq(run("STRUCTURE_TYPES.radar.energyUpkeep"), 1, "a radar draws 1 energy upkeep");
  eq(run("getSectorIntelligence('sec-core')"), 1, "a sector starts at intelligence 1");
  run("buildStructure('radar')");
  eq(run("getSectorStock('sec-core', 'minerals')"), 25, "the radar is paid from the sector");
  eq(run("getStructureAt(parseHexKey('" + emptyKey + "').row,parseHexKey('" + emptyKey + "').col).type"), "radar", "the radar occupies the builder hex");
  eq(run("getSectorIntelligence('sec-core')"), 1, "a radar under construction gives no intelligence yet");
  run("completeConstruction()");
  eq(run("getSectorIntelligence('sec-core')"), 2, "an online radar adds +1 intelligence");
}

function testRadarIntel() {
  reset();
  const route = run("(function(){ const target=getSector('sec-core'); const from=getSector(target.neighbors[0]); return {target:target.id, from:from.id, departure:getLandingHexFor(from,target.id), entry:getLandingHexFor(target,from.id)}; })()");
  run("(function(){ const target=getSector('" + route.target + "'); const from=getSector('" + route.from + "'); const e=state.empires[0]; const ship=createShip('corvette',{id:'intel-raider',owner:e.id}); ship.raidTargetSectorId=target.id; ship.pathSectorId=from.id; ship.path=['0,0','0,1']; from.rivalFleets['" + route.departure + "']=[ship]; })()");
  eq(run("getRaidWarningsForSector('sec-core').length"), 0,
    "a three-turn approach is hidden at intelligence 1");
  run("(function(){ const s=getSector('sec-core'); s.structures[hexKey(0,0)]={type:'radar',owner:'player',underConstruction:true,startedTurn:1}; })()");
  eq(run("getSectorIntelligence('sec-core')"), 1, "a building radar does not add intelligence");
  run("getStructureAt(0,0,'sec-core').underConstruction=false;");
  eq(run("getSectorIntelligence('sec-core')"), 2, "one online radar gives intelligence 2");
  eq(run("getRaidWarningsForSector('sec-core').length"), 0,
    "a three-turn approach is hidden at intelligence 2");
  run("(function(){ const s=getSector('sec-core'); s.structures[hexKey(0,1)]={type:'radar',owner:'player',underConstruction:false,startedTurn:1}; })()");
  eq(run("getSectorIntelligence('sec-core')"), 3, "a second radar gives intelligence 3");
  const warnings = run("getRaidWarningsForSector('sec-core')");
  eq(warnings.length, 1, "a three-turn approach is detected at intelligence 3");
  eq(warnings[0].turns, 3, "the ETA counts three end-turns to entry");
  eq(warnings[0].key, route.entry, "the warning sits on the lane landing port");
  eq(warnings[0].shipCount, 1, "one hostile hull is counted");
  eq(warnings[0].fromSectorId, route.from, "the warning names the sector the raider jumps from");
}

function testRadarDefault() {
  reset();
  const route = run("(function(){ const target=getSector('sec-core'); const from=getSector(target.neighbors[0]); return {target:target.id, from:from.id, departure:getLandingHexFor(from,target.id), entry:getLandingHexFor(target,from.id)}; })()");
  run("(function(){ const target=getSector('" + route.target + "'); const from=getSector('" + route.from + "'); const e=state.empires[0]; const ship=createShip('corvette',{id:'default-raider',owner:e.id}); ship.raidTargetSectorId=target.id; from.rivalFleets['" + route.departure + "']=[ship]; })()");
  const warnings = run("getRaidWarningsForSector('sec-core')");
  eq(warnings.length, 1, "base intelligence warns about a one-turn entry");
  eq(warnings[0].turns, 1, "the base warning counts one turn");
  eq(warnings[0].key, route.entry, "the base warning uses the lane port");
}

function testRaidCountdown() {
  reset();
  const route = run("(function(){ const target=getSector('sec-core'); const from=getSector(target.neighbors[0]); return {target:target.id, from:from.id, departure:getLandingHexFor(from,target.id), entry:getLandingHexFor(target,from.id), empire:state.empires[0].id}; })()");
  run("(function(){ const target=getSector('" + route.target + "'); const from=getSector('" + route.from + "'); const dep=parseHexKey('" + route.departure + "'); let start=null; let path=null; for(let r=0;r<CONFIG.sector.rows&&!start;r+=1){ for(let c=0;c<CONFIG.sector.cols&&!start;c+=1){ if(getSystemAtHex(r,c,from.id)) continue; const p=findHexPath(r,c,dep.row,dep.col); if(p&&p.length===2){ start=hexKey(r,c); path=p; } } } if(!start) throw new Error('no countdown path'); const e=getEmpire('" + route.empire + "'); const ship=createShip('corvette',{id:'countdown-raider',owner:e.id}); ship.raidTargetSectorId=target.id; ship.pathSectorId=from.id; ship.path=path; from.rivalFleets[start]=[ship]; const s=getSector('sec-core'); s.structures[hexKey(0,0)]={type:'radar',owner:'player',underConstruction:false,startedTurn:1}; s.structures[hexKey(0,1)]={type:'radar',owner:'player',underConstruction:false,startedTurn:1}; })()");
  eq(run("getRaidWarningsForSector('sec-core')[0].turns"), 3, "the initial warning reads three turns");
  run("orderRaidShips(getEmpire('" + route.empire + "'), 'sec-core'); advanceRivalFleets();");
  eq(run("getRaidWarningsForSector('sec-core')[0].turns"), 2, "one end-turn of movement leaves two turns");
  run("orderRaidShips(getEmpire('" + route.empire + "'), 'sec-core'); advanceRivalFleets();");
  eq(run("getRaidWarningsForSector('sec-core')[0].turns"), 1, "reaching the departure port leaves one jump turn");
  run("orderRaidShips(getEmpire('" + route.empire + "'), 'sec-core'); advanceRivalFleets();");
  eq(run("getRaidWarningsForSector('sec-core').length"), 0, "the warning clears once the raider enters the sector");
}

function testAiGrowth() {
  reset();
  run("(function(){ for (let i=0;i<24;i+=1){ state.turn += 1; runRivalTurn(); resolveMilitaryTurn(); } })()");
  const stats = run("state.empires.map(e=>({id:e.id,state:e.stateId,ships:getEmpireShipCount(e),cap:e.fleetCap,cols:getEmpireColonyCount(e),colcap:e.colonyCap,strong:getEmpireStrongholds(e).length,minerals:e.minerals}))");
  stats.forEach(function (entry) {
    ok(run("RIVAL_AI_STATE_ORDER.indexOf('" + entry.state + "')") !== -1, entry.id + " keeps a valid AI state");
    ok(entry.ships <= entry.cap, entry.id + " respects its fleet cap");
    ok(entry.cols <= entry.colcap, entry.id + " respects its colony cap");
    ok(entry.strong <= 1, entry.id + " keeps one stronghold");
    ok(entry.minerals >= 0, entry.id + " treasury stays non-negative");
  });
  ok(stats.some(function (entry) { return entry.cols > 1; }) ||
     stats.some(function (entry) { return entry.ships > 1 + parseInt(entry.id.slice(4), 10); }),
    "at least one rival expands during the run");
  ok(run("state.military.log.length <= CONFIG.military.logLimit"), "military log is capped");
}

function testRaidMovement() {
  reset();
  run("state.turn = 12;");
  const info = run("(function(){ const e=state.empires.find(x=>getEmpireRaidTargets(x).length); if(!e) return null; e.stateId='raid'; e.stateTurns=100; const launched=launchRaid(e); return {id:e.id, launched:!!launched, target:(getEmpireRaiders(e)[0]||{}).ship ? getEmpireRaiders(e)[0].ship.raidTargetSectorId : null}; })()");
  ok(info && info.launched, "a rival can launch a raid toward player space");
  let reached = false;
  for (let i = 0; i < 16 && !reached; i += 1) {
    run("state.turn += 1; runRivalTurn();");
    reached = run("(function(){ const e=getEmpire('" + info.id + "'); return getEmpireShipsWithPositions(e).some(p => p.ship.raidTargetSectorId && p.sectorId === p.ship.raidTargetSectorId); })()");
    run("resolveMilitaryTurn();");
    if (run("state.phase") === "ended") break;
  }
  ok(reached, "the raider reaches the target sector through lane jumps");
}

function testBattleReadout() {
  reset();
  const emptyKey = run("(function(){ for (let r=0;r<CONFIG.sector.rows;r+=1) for (let c=0;c<CONFIG.sector.cols;c+=1){ if(getSystemAtHex(r,c,'sec-core')) continue; if(getStructureAt(r,c,'sec-core')) continue; return hexKey(r,c); } return hexKey(0,0); })()");
  run("(function(){ const s=getSector('sec-core'); const e=state.empires[0]; s.fleets['" + emptyKey + "']=[createShip('corvette',{id:'battle-a',name:'Aegis'}),createShip('corvette',{id:'battle-b',name:'Bulwark'}),createShip('science',{id:'battle-c',name:'Kepler'})]; s.rivalFleets['" + emptyKey + "']=[createShip('corvette',{id:'battle-r1',name:'Talon',owner:e.id,hull:1}),createShip('corvette',{id:'battle-r2',name:'Wake',owner:e.id})]; })()");

  const battle = run("getHexBattleReadout('sec-core',parseHexKey('" + emptyKey + "').row,parseHexKey('" + emptyKey + "').col)");
  ok(!!battle, "a shared hex produces a battle readout");
  eq(battle.player.totals.ships, 3, "player fleet count is read from the hex");
  eq(battle.rival.totals.ships, 2, "enemy fleet count is read from the hex");
  eq(battle.player.totals.attack, 4, "only warships contribute to the player volley");
  eq(battle.rival.totals.attack, 4, "the rival volley uses the same attack rule");
  eq(battle.player.totals.hull, 13, "player hull is current, not maximum");
  eq(battle.rival.totals.hull, 6, "damaged enemy hull is carried into the readout");
  ok(battle.balance.playerPercent > 0 && battle.balance.playerPercent < 100,
    "the balance bar has a player share between the two sides");
  eq(battle.balance.enemyPercent, 100 - battle.balance.playerPercent, "the balance bar shares add up to 100");
  ok(["PLAYER ADVANTAGE", "ENEMY ADVANTAGE", "CONTESTED"].indexOf(battle.balance.label) !== -1,
    "the balance bar labels the current leader");

  eq(battle.forecast.playerStrike.attack, 4, "the player volley uses the player attack total");
  eq(battle.forecast.enemyStrike.attack, 4, "the enemy volley uses the enemy attack total");
  eq(battle.forecast.rivalShipLosses, 1, "concentrated player fire destroys the damaged corvette");
  eq(battle.forecast.playerShipLosses, 1, "return fire destroys the weakest player ship");
  eq(battle.forecast.rivalHullAfter, 2, "the enemy keeps the surviving corvette's remaining hull");
  eq(battle.forecast.playerHullAfter, 9, "player hull is reduced by the enemy volley");
  eq(battle.forecast.playerStructureLosses, 0, "no static losses are invented for a ship battle");

  const playerHullBefore = run("getFleetAt(parseHexKey('" + emptyKey + "').row,parseHexKey('" + emptyKey + "').col,'sec-core').find(s=>s.id==='battle-a').hull");
  run("getHexBattleReadout('sec-core',parseHexKey('" + emptyKey + "').row,parseHexKey('" + emptyKey + "').col)");
  eq(run("getFleetAt(parseHexKey('" + emptyKey + "').row,parseHexKey('" + emptyKey + "').col,'sec-core').find(s=>s.id==='battle-a').hull"),
    playerHullBefore, "opening the battle readout does not mutate hulls");

  run("(function(){ const s=getSector('sec-core'); const e=state.empires[0]; s.structures['" + emptyKey + "']={type:'stronghold',owner:e.id,underConstruction:false,startedTurn:1,hull:10}; })()");
  const withStronghold = run("getHexBattleReadout('sec-core',parseHexKey('" + emptyKey + "').row,parseHexKey('" + emptyKey + "').col)");
  eq(withStronghold.rival.totals.structures, 1, "a hostile stronghold joins the enemy order of battle");
  eq(withStronghold.rival.totals.attack, 7, "the stronghold's attack is included in the enemy volley");
  ok(withStronghold.rival.units.some(function (unit) { return unit.kind === "structure"; }),
    "the battle roster tags the stronghold as a static unit");

  run("(function(){ const s=getSector('sec-core'); delete s.rivalFleets['" + emptyKey + "']; delete s.structures['" + emptyKey + "']; })()");
  eq(run("getHexBattleReadout('sec-core',parseHexKey('" + emptyKey + "').row,parseHexKey('" + emptyKey + "').col)"), null,
    "a hex with only one fleet has no battle readout");
}

/* Ranged defence: patrols and strongholds fire across hexes, stationary
   hulls may have no return fire, and the defended hex must still find the
   engagement for its fleet-tab callout. */
function testRangedBattleReadout() {
  reset();
  run("(function(){ const s=getSector('sec-core'); const home=state.systems.find(function(x){return x.home;}); delete s.fleets[hexKey(home.row,home.col)]; })()");
  const pair = run("(function(){ for(let r=0;r<CONFIG.sector.rows;r+=1){ for(let c=0;c<CONFIG.sector.cols;c+=1){ if(getSystemAtHex(r,c,'sec-core')||getStructureAt(r,c,'sec-core')) continue; const ns=getNeighbors(r,c); for(let i=0;i<ns.length;i+=1){ const n=ns[i]; if(getSystemAtHex(n[0],n[1],'sec-core')||getStructureAt(n[0],n[1],'sec-core')) continue; return {hr:r,hc:c,pr:n[0],pc:n[1]}; } } } return null; })()");
  ok(!!pair, "found two adjacent empty hexes for the ranged test");
  const hostileKey = pair.hr + "," + pair.hc;
  const patrolKey = pair.pr + "," + pair.pc;
  run("(function(){ const s=getSector('sec-core'); const e=state.empires[0]; s.fleets['" + patrolKey + "']=[createShip('corvette',{id:'ranged-patrol',patrol:true})]; s.rivalFleets['" + hostileKey + "']=[createShip('corvette',{id:'ranged-raider',owner:e.id})]; })()");

  const battle = run("getHexBattleReadout('sec-core'," + pair.hr + "," + pair.hc + ")");
  ok(!!battle, "a patrol in range of a hostile hex produces a ranged readout");
  eq(battle.inHex, false, "no player unit stands in the hostile hex");
  eq(battle.ranged, true, "the readout is tagged as ranged");
  eq(battle.player.ranged, 1, "the patrol is counted as a ranged unit");
  eq(battle.rival.ranged, 0, "the hostile corvette is inside the contested hex");
  eq(battle.player.totals.ships, 1, "the patrol joins the player order of battle");
  eq(battle.rival.totals.ships, 1, "the hostile corvette joins the enemy order of battle");
  eq(battle.player.units[0].canFire, true, "the patrol has a firing solution");
  eq(battle.rival.units[0].canFire, false, "the stationary corvette cannot reach the patrol");
  eq(battle.player.units[0].distance, 1, "the patrol is one hex from the battle");
  eq(battle.player.attackInRange, 2, "the patrol attack enters the player volley");
  eq(battle.rival.attackInRange, 0, "the hostile volley has no firing solution");
  eq(battle.forecast.playerStrike.attack, 2, "the forecast player volley is 2 ATK");
  eq(battle.forecast.enemyStrike.attack, 0, "the forecast enemy volley is empty");
  eq(battle.forecast.playerHullAfter, 5, "the patrol takes no return fire");
  eq(battle.forecast.rivalHullAfter, 3, "the hostile corvette loses 2 hull");
  ok(battle.balance.playerPercent > 50, "the balance favours the firing patrol");
  eq(battle.balance.leader, "player", "the balance leader is the player");
  eq(battle.forecast.label, "PLAYER WINS THE EXCHANGE", "the patrol wins the projected exchange");

  eq(run("isHexExplored(" + pair.hr + "," + pair.hc + ",'sec-core')"), false,
    "a rival fleet alone does not chart its hex");
  eq(run("getBattleInvolvingHex('sec-core'," + pair.pr + "," + pair.pc + ")"), null,
    "an uncharted hostile hex does not leak the engagement into the defended hex");
  run("markHexExplored(" + pair.hr + "," + pair.hc + ",'sec-core')");
  const linked = run("getBattleInvolvingHex('sec-core'," + pair.pr + "," + pair.pc + ")");
  ok(!!linked, "the defended hex finds the engagement once it is charted");
  eq(linked.row, pair.hr, "the callout anchor row is the hostile hex");
  eq(linked.col, pair.hc, "the callout anchor column is the hostile hex");

  run("resolveMilitaryTurn()");
  eq(run("getRivalFleetAt(parseHexKey('" + hostileKey + "').row,parseHexKey('" + hostileKey + "').col,'sec-core').find(function(s){return s.id==='ranged-raider';}).hull"), 3,
    "the patrol's 2 ATK lands on the raider");
  eq(run("getFleetAt(parseHexKey('" + patrolKey + "').row,parseHexKey('" + patrolKey + "').col,'sec-core').find(function(s){return s.id==='ranged-patrol';}).hull"), 5,
    "the raider deals no return fire");
  const afterVolley = run("getHexBattleReadout('sec-core'," + pair.hr + "," + pair.hc + ")");
  ok(!!afterVolley, "the engagement remains after the first volley");
  eq(afterVolley.forecast.rivalHullAfter, 1, "the next forecast follows the damaged hull");

  reset();
  run("(function(){ const s=getSector('sec-core'); const home=state.systems.find(function(x){return x.home;}); delete s.fleets[hexKey(home.row,home.col)]; })()");
  const holdPair = run("(function(){ for(let r=0;r<CONFIG.sector.rows;r+=1){ for(let c=0;c<CONFIG.sector.cols;c+=1){ if(getSystemAtHex(r,c,'sec-core')||getStructureAt(r,c,'sec-core')) continue; const cells=hexesWithinRadius(r,c,2); for(let i=0;i<cells.length;i+=1){ const n=cells[i]; if(hexDistance(r,c,n[0],n[1])!==2) continue; if(getSystemAtHex(n[0],n[1],'sec-core')||getStructureAt(n[0],n[1],'sec-core')) continue; return {hr:r,hc:c,sr:n[0],sc:n[1]}; } } } return null; })()");
  ok(!!holdPair, "found a hostile hex two hexes from a stronghold site");
  run("(function(){ const s=getSector('sec-core'); const e=state.empires[0]; s.rivalFleets['" + holdPair.hr + "," + holdPair.hc + "']=[createShip('corvette',{id:'hold-raider',owner:e.id})]; s.structures['" + holdPair.sr + "," + holdPair.sc + "']={type:'stronghold',owner:'player',underConstruction:false,startedTurn:1,hull:10}; })()");
  const holdBattle = run("getHexBattleReadout('sec-core'," + holdPair.hr + "," + holdPair.hc + ")");
  ok(!!holdBattle, "a stronghold two hexes away produces a ranged readout");
  eq(holdBattle.player.ranged, 1, "the stronghold joins as a ranged unit");
  eq(holdBattle.player.totals.structures, 1, "the stronghold is counted as a static unit");
  eq(holdBattle.player.attackInRange, 3, "the stronghold contributes 3 ATK");
  eq(holdBattle.rival.attackInRange, 0, "the corvette cannot reach the stronghold");
  eq(holdBattle.forecast.playerStrike.attack, 3, "the stronghold volley is forecast");
  eq(holdBattle.forecast.enemyStrike.attack, 0, "the stronghold takes no return fire");
  eq(holdBattle.forecast.label, "PLAYER WINS THE EXCHANGE", "the stronghold wins the projected exchange");
  run("markHexExplored(" + holdPair.hr + "," + holdPair.hc + ",'sec-core')");
  const holdLinked = run("getBattleInvolvingHex('sec-core'," + holdPair.sr + "," + holdPair.sc + ")");
  ok(!!holdLinked, "the stronghold hex finds its ranged engagement");
  eq(holdLinked.row, holdPair.hr, "the stronghold callout anchors on the hostile hex");
  eq(holdLinked.col, holdPair.hc, "the stronghold callout anchor column is the hostile hex");

  reset();
  run("(function(){ const s=getSector('sec-core'); const home=state.systems.find(function(x){return x.home;}); delete s.fleets[hexKey(home.row,home.col)]; })()");
  const reversePair = run("(function(){ for(let r=0;r<CONFIG.sector.rows;r+=1){ for(let c=0;c<CONFIG.sector.cols;c+=1){ if(getSystemAtHex(r,c,'sec-core')||getStructureAt(r,c,'sec-core')) continue; const ns=getNeighbors(r,c); for(let i=0;i<ns.length;i+=1){ const n=ns[i]; if(getSystemAtHex(n[0],n[1],'sec-core')||getStructureAt(n[0],n[1],'sec-core')) continue; return {hr:r,hc:c,pr:n[0],pc:n[1]}; } } } return null; })()");
  ok(!!reversePair, "found adjacent empty hexes for the reverse test");
  run("(function(){ const s=getSector('sec-core'); const e=state.empires[0]; s.fleets['" + reversePair.pr + "," + reversePair.pc + "']=[createShip('corvette',{id:'reverse-target'})]; s.structures['" + reversePair.hr + "," + reversePair.hc + "']={type:'stronghold',owner:e.id,underConstruction:false,startedTurn:1,hull:10}; })()");
  const reverse = run("getHexBattleReadout('sec-core'," + reversePair.hr + "," + reversePair.hc + ")");
  ok(!!reverse, "a hostile stronghold firing at a player ship produces a readout");
  eq(reverse.inHex, false, "the player corvette is outside the hostile stronghold hex");
  eq(reverse.player.units[0].canFire, false, "the corvette cannot return fire at range");
  eq(reverse.rival.units[0].canFire, true, "the stronghold has a firing solution");
  eq(reverse.forecast.playerStrike.attack, 0, "the player volley is empty");
  eq(reverse.forecast.enemyStrike.attack, 3, "the stronghold volley is forecast");
  eq(reverse.balance.leader, "rival", "the balance favours the firing stronghold");
  eq(reverse.forecast.label, "ENEMY WINS THE EXCHANGE", "the hostile stronghold wins the projected exchange");

  reset();
  run("(function(){ const s=getSector('sec-core'); const home=state.systems.find(function(x){return x.home;}); delete s.fleets[hexKey(home.row,home.col)]; })()");
  const quietPair = run("(function(){ for(let r=0;r<CONFIG.sector.rows;r+=1){ for(let c=0;c<CONFIG.sector.cols;c+=1){ if(getSystemAtHex(r,c,'sec-core')||getStructureAt(r,c,'sec-core')) continue; const ns=getNeighbors(r,c); for(let i=0;i<ns.length;i+=1){ const n=ns[i]; if(getSystemAtHex(n[0],n[1],'sec-core')||getStructureAt(n[0],n[1],'sec-core')) continue; return {hr:r,hc:c,pr:n[0],pc:n[1]}; } } } return null; })()");
  run("(function(){ const s=getSector('sec-core'); const e=state.empires[0]; s.fleets['" + quietPair.pr + "," + quietPair.pc + "']=[createShip('science',{id:'quiet-science'})]; s.rivalFleets['" + quietPair.hr + "," + quietPair.hc + "']=[createShip('science',{id:'quiet-rival',owner:e.id})]; })()");
  eq(run("getHexBattleReadout('sec-core'," + quietPair.hr + "," + quietPair.hc + ")"), null,
    "two civilian hulls sharing a hex are not a battle");
}

/* Fleet icons: a same-type fleet keeps its own hull icon, a mixed hex falls
   back to the generic ship icon, and the composition label stays deterministic. */
function testFleetIcons() {
  reset();
  eq(run("getFleetIconKey([{type:'corvette'},{type:'corvette'}])"), "corvette",
    "two corvettes keep the corvette icon");
  eq(run("getFleetIconKey([{type:'science'},{type:'builder'}])"), "mixed",
    "different hulls fall back to the generic icon");
  eq(run("getFleetIconKey([])"), "mixed", "an empty fleet falls back to the generic icon");
  ok(run("getFleetIconEmoji([{type:'corvette'}]) === SHIP_TYPES.corvette.emoji"),
    "the corvette badge uses the corvette emoji");
  ok(run("getFleetIconEmoji([{type:'science'}]) === SHIP_TYPES.science.emoji"),
    "the science badge uses the science emoji");
  ok(run("getFleetIconEmoji([{type:'builder'}]) === SHIP_TYPES.builder.emoji"),
    "the builder badge uses the builder emoji");
  ok(run("getFleetIconEmoji([{type:'corvette'},{type:'science'}]) === SHIP_FLEET_ICON.emoji"),
    "a mixed hex uses the generic fleet emoji");
  eq(run("getFleetCompositionText([{type:'corvette'},{type:'corvette'},{type:'science'},{type:'builder'}])"),
    "2 corvettes, 1 science ship, 1 builder", "the composition label reads in ship order");
  eq(run("getFleetCompositionText([{type:'science'}])"), "1 science ship",
    "a single hull is singular in the label");
  eq(run("getFleetIconKey([{type:'corvette'},{type:'unknown'}])"), "corvette",
    "an unknown hull is ignored instead of forcing a mixed icon");
  eq(run("getFleetCompositionText([])"), "", "an empty fleet has no composition label");
}

try {
  testSpawn();
  testHexMath();
  testLandingTopology();
  testRivalLandingJump();
  testPatrolCoverage();
  testPatrolCombat();
  testStronghold();
  testRaidCoverage();
  testPlayerPatrolOrder();
  testBuilderStronghold();
  testRadarBuild();
  testRadarIntel();
  testRadarDefault();
  testRaidCountdown();
  testAiGrowth();
  testRaidMovement();
  testFleetIcons();
  testBattleReadout();
  testRangedBattleReadout();
  console.log("military harness: " + checks + " checks passed");
} catch (error) {
  console.error("military harness: FAILED after " + checks + " checks");
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
}
