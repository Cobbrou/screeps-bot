const move = require('./move');
const stats = require('./stats');
const intel = require('./intel');
const defense = require('./defense');

// Attente maximale (en ticks) de la régénération d'une source avant d'aller récolter ailleurs.
const AWAY_MIN_WAIT = 100;
// Nombre maximal de créeps partis récolter dans une même salle voisine, par source de cette salle.
const AWAY_PER_SOURCE = 2;
// Ticks consécutifs sans case libre autour de la source avant d'aller récolter ailleurs.
const AWAY_BLOCKED_TICKS = 20;
// Retrait minimal dans un conteneur ou le stockage : en dessous, le créep récolte lui-même.
const MIN_WITHDRAW = 100;
// RCL minimal pour aller récolter ailleurs : avant, les corps portent trop peu pour rentabiliser le trajet.
// Sauf dans une salle à une seule source : encombrée dès le début, elle a besoin de ses voisines quel que soit le RCL.
const AWAY_MIN_RCL = 4;
// Ticks entre deux recherches de conteneur ou de stockage quand le créep n'en a pas trouvé.
const WITHDRAW_SCAN_INTERVAL = 10;

// Identifiants des sources par salle et du conteneur de chaque source, gardés jusqu'au reset du global.
const sourceIds = {};
const containerIds = {};

// Sources de la salle, sans relancer `find` à chaque tick.
function list(room) {
  if (!sourceIds[room.name]) sourceIds[room.name] = room.find(FIND_SOURCES).map((s) => s.id);
  return sourceIds[room.name].map((id) => Game.getObjectById(id)).filter(Boolean);
}

// Attribue au créep la source de sa salle qui a le moins de créeps assignés,
// en préférant les sources sans conteneur : celles qui en ont sont occupées par un mineur.
function assign(creep) {
  const counts = {};
  for (const name in Game.creeps) {
    const id = Game.creeps[name].memory.sourceId;
    if (id) counts[id] = (counts[id] || 0) + 1;
  }
  const roomSources = list(creep.room);
  const unmined = roomSources.filter((s) => !container(s));
  const pool = unmined.length ? unmined : roomSources;
  pool.sort((a, b) => (counts[a.id] || 0) - (counts[b.id] || 0));
  if (pool.length) creep.memory.sourceId = pool[0].id;
}

// Conteneur à portée `range` de la cible (adjacent pour une source, portée 2 pour le contrôleur), s'il est construit.
function container(target, range = 1) {
  let found = containerIds[target.id] && Game.getObjectById(containerIds[target.id]);
  if (!found) {
    found = target.pos.findInRange(FIND_STRUCTURES, range, {
      filter: (s) => s.structureType === STRUCTURE_CONTAINER,
    })[0];
    if (found) containerIds[target.id] = found.id;
  }
  return found;
}

// Sources occupées par un mineur vivant, recalculées une fois par tick.
let minedTick = -1;
let minedIds = new Set();

// Vrai si un mineur travaille sur cette source (son conteneur est alors construit).
function mined(source) {
  if (minedTick !== Game.time) {
    minedTick = Game.time;
    minedIds = new Set(Object.values(Game.creeps)
      .filter((c) => c.memory.role === 'miner').map((c) => c.memory.sourceId));
  }
  return minedIds.has(source.id) && !!container(source);
}

// Vrai si la source ne peut pas servir le créep avant longtemps : vide pour plus de AWAY_MIN_WAIT ticks,
// ou toutes ses cases adjacentes praticables occupées par d'autres créeps pendant AWAY_BLOCKED_TICKS ticks.
function unavailable(creep, source) {
  if (source.energy === 0 && source.ticksToRegeneration > AWAY_MIN_WAIT) return true;
  if (creep.pos.isNearTo(source)) {
    delete creep.memory.blocked;
    return false;
  }
  const terrain = source.room.getTerrain();
  const { x, y } = source.pos;
  const occupied = new Set(source.room.lookForAtArea(LOOK_CREEPS, y - 1, x - 1, y + 1, x + 1, true)
    .map((o) => o.x * 50 + o.y));
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (terrain.get(x + dx, y + dy) !== TERRAIN_MASK_WALL && !occupied.has((x + dx) * 50 + y + dy)) {
        delete creep.memory.blocked;
        return false;
      }
    }
  }
  creep.memory.blocked = (creep.memory.blocked || 0) + 1;
  if (creep.memory.blocked < AWAY_BLOCKED_TICKS) return false;
  delete creep.memory.blocked;
  return true;
}

// Récolte dans la salle voisine notée dans `creep.memory.away` ; l'oublie si elle devient dangereuse.
function harvestAway(creep) {
  const away = creep.memory.away;
  // Sur place, le créep signale lui-même les hostiles : intel.safe le fera repartir.
  if (creep.room.name === away.to && defense.threats(creep.room).length) intel.record(creep.room);
  if (!intel.safe(away.to)) {
    delete creep.memory.away;
    return;
  }
  if (creep.room.name !== away.to) {
    move.to(creep, new RoomPosition(25, 25, away.to), { range: 22 });
    return;
  }
  const source = creep.pos.findClosestByRange(FIND_SOURCES_ACTIVE);
  if (source) harvestSource(creep, source);
}

// Salle voisine sûre qui a encore de la place pour un créep de plus, ou undefined.
function awayRoom(room) {
  const counts = {};
  for (const name in Game.creeps) {
    const away = Game.creeps[name].memory.away;
    if (away) counts[away.to] = (counts[away.to] || 0) + 1;
  }
  return Object.values(Game.map.describeExits(room.name))
    .find((name) => intel.safe(name) && (counts[name] || 0) < (intel.get(name).sources || 0) * AWAY_PER_SOURCE);
}

// Fait récolter le créep sur sa source attribuée.
// Dans nos salles à partir du RCL AWAY_MIN_RCL (ou dès le RCL 1 avec une seule source), si cette source est indisponible,
// il part récolter dans une salle voisine sûre qui a de la place. Les harvesters restent toujours sur leur source : ils remplissent le spawn.
function harvest(creep) {
  if (creep.memory.away) return harvestAway(creep);
  if (!creep.memory.sourceId) assign(creep);
  const source = Game.getObjectById(creep.memory.sourceId);
  if (!source) {
    delete creep.memory.sourceId;
    return;
  }
  const controller = creep.room.controller;
  const canLeave = controller && controller.my && (controller.level >= AWAY_MIN_RCL || list(creep.room).length < 2);
  // Source tenue par un mineur : on puise dans son conteneur au lieu de lui prendre la place.
  if (mined(source)) {
    const box = container(source);
    if (box.store[RESOURCE_ENERGY] > 0) {
      if (creep.withdraw(box, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) move.to(creep, box);
      return;
    }
    const to = creep.memory.role !== 'harvester' && canLeave && awayRoom(creep.room);
    if (to) {
      creep.memory.away = { from: creep.room.name, to };
      return harvestAway(creep);
    }
    // Conteneur vide : on attend à l'écart que le mineur le remplisse.
    stepAway(creep);
    return;
  }
  if (creep.memory.role !== 'harvester' && canLeave && unavailable(creep, source)) {
    const to = awayRoom(creep.room);
    if (to) {
      creep.memory.away = { from: creep.room.name, to };
      return harvestAway(creep);
    }
  }
  harvestSource(creep, source);
}

// Ramène dans sa salle un créep parti récolter ailleurs. Vrai tant qu'il est en route.
function goBack(creep) {
  const away = creep.memory.away;
  if (!away) return false;
  if (creep.room.name !== away.from) {
    move.to(creep, new RoomPosition(25, 25, away.from), { range: 22 });
    return true;
  }
  delete creep.memory.away;
  return false;
}

// Récolte la source en comptant l'énergie extraite ; s'en approche si elle est hors de portée.
function harvestSource(creep, source) {
  const result = creep.harvest(source);
  if (result === OK) stats.recordHarvest(creep, source);
  else if (result === ERR_NOT_IN_RANGE) move.to(creep, source);
}

// Écarte d'une case le créep collé à une source pour libérer la place aux récolteurs.
// Utile quand il travaille sur place (ex. : construire le conteneur de la source sur lequel il se tient).
function stepAway(creep) {
  const near = list(creep.room).filter((s) => creep.pos.isNearTo(s));
  if (!near.length) return;
  const result = PathFinder.search(creep.pos, near.map((s) => ({ pos: s.pos, range: 2 })), { flee: true, maxRooms: 1 });
  if (result.path.length) creep.move(creep.pos.getDirectionTo(result.path[0]));
}

// Prend l'énergie dans un conteneur ou le stockage s'il en reste assez (retrait partiel accepté) ; récolte sinon.
// La réserve est gardée en mémoire tant qu'elle suffit ; sans réserve, la salle n'est fouillée
// qu'une fois tous les WITHDRAW_SCAN_INTERVAL ticks.
function collect(creep) {
  const need = Math.min(creep.store.getFreeCapacity(RESOURCE_ENERGY), MIN_WITHDRAW);
  let store = Game.getObjectById(creep.memory.withdrawId);
  if (!store || store.store[RESOURCE_ENERGY] < need) {
    if (!store && Game.time - (creep.memory.withdrawScan || 0) < WITHDRAW_SCAN_INTERVAL) return harvest(creep);
    store = creep.pos.findClosestByRange(FIND_STRUCTURES, {
      filter: (s) => (s.structureType === STRUCTURE_CONTAINER || s.structureType === STRUCTURE_STORAGE)
        && s.store[RESOURCE_ENERGY] >= need,
    });
    creep.memory.withdrawId = store ? store.id : undefined;
    creep.memory.withdrawScan = Game.time;
  }
  if (!store) return harvest(creep);
  if (creep.withdraw(store, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) move.to(creep, store);
}

module.exports = { list, container, harvest, harvestSource, collect, goBack, stepAway };
