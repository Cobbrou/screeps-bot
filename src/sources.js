const stats = require('./stats');
const intel = require('./intel');

// Attente maximale (en ticks) de la régénération d'une source avant d'aller récolter ailleurs.
const AWAY_MIN_WAIT = 100;

// Identifiants des sources par salle et du conteneur de chaque source, gardés jusqu'au reset du global.
const sourceIds = {};
const containerIds = {};

// Sources de la salle, sans relancer `find` à chaque tick.
function list(room) {
  if (!sourceIds[room.name]) sourceIds[room.name] = room.find(FIND_SOURCES).map((s) => s.id);
  return sourceIds[room.name].map((id) => Game.getObjectById(id)).filter(Boolean);
}

// Attribue au créep la source de sa salle qui a le moins de créeps assignés.
function assign(creep) {
  const counts = {};
  for (const name in Game.creeps) {
    const id = Game.creeps[name].memory.sourceId;
    if (id) counts[id] = (counts[id] || 0) + 1;
  }
  const roomSources = list(creep.room);
  roomSources.sort((a, b) => (counts[a.id] || 0) - (counts[b.id] || 0));
  if (roomSources.length) creep.memory.sourceId = roomSources[0].id;
}

// Conteneur adjacent à la source, s'il est construit.
function container(source) {
  let found = containerIds[source.id] && Game.getObjectById(containerIds[source.id]);
  if (!found) {
    found = source.pos.findInRange(FIND_STRUCTURES, 1, {
      filter: (s) => s.structureType === STRUCTURE_CONTAINER,
    })[0];
    if (found) containerIds[source.id] = found.id;
  }
  return found;
}

// Vrai si la source ne peut pas servir le créep avant longtemps : vide pour plus de AWAY_MIN_WAIT ticks,
// ou toutes ses cases adjacentes praticables occupées par d'autres créeps.
function unavailable(creep, source) {
  if (source.energy === 0 && source.ticksToRegeneration > AWAY_MIN_WAIT) return true;
  if (creep.pos.isNearTo(source)) return false;
  const terrain = source.room.getTerrain();
  const { x, y } = source.pos;
  const occupied = new Set(source.room.lookForAtArea(LOOK_CREEPS, y - 1, x - 1, y + 1, x + 1, true)
    .map((o) => o.x * 50 + o.y));
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (terrain.get(x + dx, y + dy) !== TERRAIN_MASK_WALL && !occupied.has((x + dx) * 50 + y + dy)) return false;
    }
  }
  return true;
}

// Récolte dans la salle voisine notée dans `creep.memory.away` ; l'oublie si elle devient dangereuse.
function harvestAway(creep) {
  const away = creep.memory.away;
  if (!intel.safe(away.to)) {
    delete creep.memory.away;
    return;
  }
  if (creep.room.name !== away.to) {
    creep.moveTo(new RoomPosition(25, 25, away.to), { range: 22 });
    return;
  }
  const source = creep.pos.findClosestByRange(FIND_SOURCES_ACTIVE);
  if (source) harvestSource(creep, source);
}

// Fait récolter le créep sur sa source attribuée.
// Dans nos salles, si cette source est indisponible, il part récolter dans une salle voisine sûre.
function harvest(creep) {
  if (creep.memory.away) return harvestAway(creep);
  if (!creep.memory.sourceId) assign(creep);
  const source = Game.getObjectById(creep.memory.sourceId);
  if (!source) {
    delete creep.memory.sourceId;
    return;
  }
  if (creep.room.controller && creep.room.controller.my && unavailable(creep, source)) {
    const to = Object.values(Game.map.describeExits(creep.room.name))
      .find((name) => intel.safe(name) && intel.get(name).sources);
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
    creep.moveTo(new RoomPosition(25, 25, away.from), { range: 22 });
    return true;
  }
  delete creep.memory.away;
  return false;
}

// Récolte la source en comptant l'énergie extraite ; s'en approche si elle est hors de portée.
function harvestSource(creep, source) {
  const result = creep.harvest(source);
  if (result === OK) stats.recordHarvest(creep, source);
  else if (result === ERR_NOT_IN_RANGE) creep.moveTo(source);
}

// Prend l'énergie dans un conteneur ou le stockage s'il en reste assez ; récolte sinon.
function collect(creep) {
  const need = creep.store.getFreeCapacity(RESOURCE_ENERGY);
  const store = creep.pos.findClosestByRange(FIND_STRUCTURES, {
    filter: (s) => (s.structureType === STRUCTURE_CONTAINER || s.structureType === STRUCTURE_STORAGE)
      && s.store[RESOURCE_ENERGY] >= need,
  });
  if (!store) return harvest(creep);
  if (creep.withdraw(store, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) creep.moveTo(store);
}

module.exports = { list, container, harvest, harvestSource, collect, goBack };
