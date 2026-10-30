const sources = require('../sources');

// Ramasse l'énergie au sol, dans les pierres tombales, les ruines puis les conteneurs des sources.
function collect(creep) {
  const dropped = creep.pos.findClosestByRange(FIND_DROPPED_RESOURCES, {
    filter: (r) => r.resourceType === RESOURCE_ENERGY && r.amount >= 50,
  });
  if (dropped) {
    if (creep.pickup(dropped) === ERR_NOT_IN_RANGE) creep.moveTo(dropped);
    return;
  }

  const remains = [...creep.room.find(FIND_TOMBSTONES), ...creep.room.find(FIND_RUINS)]
    .filter((o) => o.store[RESOURCE_ENERGY] > 0);
  let target = creep.pos.findClosestByRange(remains);
  if (!target) {
    // Le conteneur le plus plein, pour éviter qu'il déborde.
    const containers = sources.list(creep.room).map(sources.container).filter(Boolean);
    containers.sort((a, b) => b.store[RESOURCE_ENERGY] - a.store[RESOURCE_ENERGY]);
    target = containers[0];
  }
  if (target && creep.withdraw(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) creep.moveTo(target);
}

// Livre au spawn, aux extensions et aux tours, puis au conteneur du contrôleur, puis au stockage.
function deliver(creep) {
  const room = creep.room;
  let target = creep.pos.findClosestByRange(FIND_MY_STRUCTURES, {
    filter: (s) => (s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION
      || s.structureType === STRUCTURE_TOWER) && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
  });
  if (!target) {
    target = room.controller.pos.findInRange(FIND_STRUCTURES, 2, {
      filter: (s) => s.structureType === STRUCTURE_CONTAINER && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
    })[0] || room.storage;
  }
  if (target && creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) creep.moveTo(target);
}

module.exports.run = function (creep) {
  if (creep.memory.working && creep.store[RESOURCE_ENERGY] === 0) creep.memory.working = false;
  if (!creep.memory.working && creep.store.getFreeCapacity() === 0) creep.memory.working = true;

  if (creep.memory.working) deliver(creep);
  else collect(creep);
};
