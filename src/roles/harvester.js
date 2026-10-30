const sources = require('../sources');

// Récolte l'énergie et remplit spawn et extensions ; améliore le contrôleur s'ils sont pleins.
module.exports.run = function (creep) {
  if (creep.memory.working && creep.store[RESOURCE_ENERGY] === 0) creep.memory.working = false;
  if (!creep.memory.working && creep.store.getFreeCapacity() === 0) creep.memory.working = true;
  if (creep.memory.working && sources.goBack(creep)) return;

  if (!creep.memory.working) {
    sources.harvest(creep);
    return;
  }

  // Cible gardée en mémoire tant qu'elle a de la place : évite un calcul de chemin à chaque tick.
  let target = Game.getObjectById(creep.memory.targetId);
  if (!target || !target.store.getFreeCapacity(RESOURCE_ENERGY)) {
    target = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
      filter: (s) => (s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION)
        && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
    });
    creep.memory.targetId = target ? target.id : undefined;
  }
  if (target) {
    if (creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) creep.moveTo(target);
  } else if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
    creep.moveTo(creep.room.controller);
  }
};
