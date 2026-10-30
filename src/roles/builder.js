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

  // Cibles gardées en mémoire tant qu'elles restent valides : évite un calcul de chemin à chaque tick.
  let site = Game.getObjectById(creep.memory.siteId);
  if (!site) {
    site = creep.pos.findClosestByPath(FIND_MY_CONSTRUCTION_SITES);
    creep.memory.siteId = site ? site.id : undefined;
  }
  if (site) {
    if (creep.build(site) === ERR_NOT_IN_RANGE) creep.moveTo(site);
    return;
  }

  let damaged = Game.getObjectById(creep.memory.repairId);
  if (!damaged || damaged.hits === damaged.hitsMax) {
    damaged = creep.pos.findClosestByPath(FIND_STRUCTURES, {
      filter: (s) => s.hits < s.hitsMax
        && s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_RAMPART,
    });
    creep.memory.repairId = damaged ? damaged.id : undefined;
  }
  if (damaged) {
    if (creep.repair(damaged) === ERR_NOT_IN_RANGE) creep.moveTo(damaged);
  } else if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
    creep.moveTo(creep.room.controller);
  }
};
