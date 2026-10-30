// Récolte l'énergie et remplit spawn et extensions ; améliore le contrôleur s'ils sont pleins.
module.exports.run = function (creep) {
  if (creep.store.getFreeCapacity() > 0) {
    const source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
    if (source && creep.harvest(source) === ERR_NOT_IN_RANGE) creep.moveTo(source);
    return;
  }

  const target = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
    filter: (s) => (s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION)
      && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
  });
  if (target) {
    if (creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) creep.moveTo(target);
  } else if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
    creep.moveTo(creep.room.controller);
  }
};
