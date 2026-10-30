const move = require('../move');
const sources = require('../sources');

// Ramasse l'énergie au sol, dans les pierres tombales, les ruines puis les conteneurs des sources.
function collect(creep) {
  const dropped = creep.pos.findClosestByRange(FIND_DROPPED_RESOURCES, {
    filter: (r) => r.resourceType === RESOURCE_ENERGY && r.amount >= 50,
  });
  if (dropped) {
    if (creep.pickup(dropped) === ERR_NOT_IN_RANGE) move.to(creep, dropped);
    return;
  }

  // Cible gardée en mémoire tant qu'il lui reste de l'énergie : sinon le hauler, après avoir vidé un conteneur,
  // filerait vers l'autre devenu le plus plein, et ainsi de suite sans jamais livrer.
  let target = Game.getObjectById(creep.memory.pickupId);
  if (!target || !target.store[RESOURCE_ENERGY]) {
    // Cible vidée alors qu'on porte déjà de l'énergie : on livre plutôt que de courir vers une autre.
    if (target && creep.store[RESOURCE_ENERGY]) {
      delete creep.memory.pickupId;
      creep.memory.working = true;
      deliver(creep);
      return;
    }
    const remains = [...creep.room.find(FIND_TOMBSTONES), ...creep.room.find(FIND_RUINS)]
      .filter((o) => o.store[RESOURCE_ENERGY] > 0);
    target = creep.pos.findClosestByRange(remains) || fullestContainer(creep);
    // Conteneurs vides et spawn ou extensions à remplir : on puise dans le stockage.
    const storage = creep.room.storage;
    if ((!target || !target.store[RESOURCE_ENERGY]) && storage && storage.store[RESOURCE_ENERGY]
      && creep.room.energyAvailable < creep.room.energyCapacityAvailable) {
      target = storage;
    }
    creep.memory.pickupId = target ? target.id : undefined;
  }
  if (target && creep.withdraw(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) move.to(creep, target);
}

// Conteneur de source le plus plein, pour éviter qu'il déborde, en laissant aux autres haulers ceux qu'ils visent déjà.
function fullestContainer(creep) {
  const taken = new Set();
  for (const name in Game.creeps) {
    const other = Game.creeps[name];
    if (name !== creep.name && other.memory.role === 'hauler') taken.add(other.memory.pickupId);
  }
  const containers = sources.list(creep.room).map((s) => sources.container(s)).filter(Boolean);
  containers.sort((a, b) => b.store[RESOURCE_ENERGY] - a.store[RESOURCE_ENERGY]);
  return containers.find((c) => !taken.has(c.id)) || containers[0];
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
  if (target && creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) move.to(creep, target);
}

module.exports.run = function (creep) {
  if (creep.memory.working && creep.store[RESOURCE_ENERGY] === 0) creep.memory.working = false;
  if (!creep.memory.working && creep.store.getFreeCapacity() === 0) creep.memory.working = true;

  if (creep.memory.working) deliver(creep);
  else collect(creep);
};
