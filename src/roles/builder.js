const sources = require('../sources');

// Construit les chantiers ; sinon répare (hors murs et remparts) ; sinon améliore le contrôleur.
module.exports.run = function (creep) {
  if (creep.memory.working && creep.store[RESOURCE_ENERGY] === 0) creep.memory.working = false;
  if (!creep.memory.working && creep.store.getFreeCapacity() === 0) creep.memory.working = true;
  if (creep.memory.working && sources.goBack(creep)) return;

  if (!creep.memory.working) {
    sources.collect(creep);
    return;
  }

  const site = creep.pos.findClosestByPath(FIND_MY_CONSTRUCTION_SITES);
  if (site) {
    if (creep.build(site) === ERR_NOT_IN_RANGE) creep.moveTo(site);
    return;
  }

  const damaged = creep.pos.findClosestByPath(FIND_STRUCTURES, {
    filter: (s) => s.hits < s.hitsMax
      && s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_RAMPART,
  });
  if (damaged) {
    if (creep.repair(damaged) === ERR_NOT_IN_RANGE) creep.moveTo(damaged);
  } else if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
    creep.moveTo(creep.room.controller);
  }
};
