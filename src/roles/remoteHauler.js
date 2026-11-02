const move = require('../move');
const hauler = require('./hauler');
const remoteMining = require('../remoteMining');

// Ramasse l'énergie posée au sol autour de sa source distante (le tas le plus gros d'abord).
// Rien à prendre : livre s'il porte déjà la moitié de sa capacité, sinon attend à 2 cases de la source.
function collect(creep) {
  const pos = new RoomPosition(creep.memory.x, creep.memory.y, creep.memory.target);
  if (creep.room.name !== pos.roomName) {
    move.to(creep, pos, { range: 2 });
    return;
  }
  const pile = pos.findInRange(FIND_DROPPED_RESOURCES, 2, { filter: (r) => r.resourceType === RESOURCE_ENERGY })
    .sort((a, b) => b.amount - a.amount)[0];
  if (pile) {
    if (creep.pickup(pile) === ERR_NOT_IN_RANGE) move.to(creep, pile);
  } else if (creep.store[RESOURCE_ENERGY] >= creep.store.getCapacity() / 2) {
    creep.memory.working = true;
  } else if (!creep.pos.inRangeTo(pos, 2)) {
    move.to(creep, pos, { range: 2 });
  }
}

// Rentre et livre comme un hauler (spawn, extensions, tours, dépôt des upgraders, stockage).
function deliver(creep) {
  if (creep.room.name !== creep.memory.room) {
    move.to(creep, new RoomPosition(25, 25, creep.memory.room), { range: 20 });
    return;
  }
  hauler.deliver(creep);
}

module.exports.run = function (creep) {
  if (creep.memory.working && creep.store[RESOURCE_ENERGY] === 0) creep.memory.working = false;
  if (!creep.memory.working && creep.store.getFreeCapacity() === 0) creep.memory.working = true;

  // Salle devenue dangereuse : il rapporte ce qu'il porte, sinon il attend chez lui.
  const safe = remoteMining.safe(creep);
  if (creep.memory.working || (!safe && creep.store[RESOURCE_ENERGY])) deliver(creep);
  else if (!safe) remoteMining.retreat(creep);
  else collect(creep);
};
