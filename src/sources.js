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

// Fait récolter le créep sur sa source attribuée.
function harvest(creep) {
  if (!creep.memory.sourceId) assign(creep);
  const source = Game.getObjectById(creep.memory.sourceId);
  if (!source) {
    delete creep.memory.sourceId;
    return;
  }
  if (creep.harvest(source) === ERR_NOT_IN_RANGE) creep.moveTo(source);
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

module.exports = { list, container, harvest, collect };
