// Attribue au créep la source de sa salle qui a le moins de créeps assignés.
function assign(creep) {
  const counts = {};
  for (const name in Game.creeps) {
    const id = Game.creeps[name].memory.sourceId;
    if (id) counts[id] = (counts[id] || 0) + 1;
  }
  const sources = creep.room.find(FIND_SOURCES);
  sources.sort((a, b) => (counts[a.id] || 0) - (counts[b.id] || 0));
  if (sources.length) creep.memory.sourceId = sources[0].id;
}

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
