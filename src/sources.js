// Identifiants des sources par salle, gardés entre les ticks jusqu'au reset du global.
const sourceIds = {};

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

module.exports.list = list;

// Fait récolter le créep sur sa source attribuée.
module.exports.harvest = function (creep) {
  if (!creep.memory.sourceId) assign(creep);
  const source = Game.getObjectById(creep.memory.sourceId);
  if (!source) {
    delete creep.memory.sourceId;
    return;
  }
  if (creep.harvest(source) === ERR_NOT_IN_RANGE) creep.moveTo(source);
};
