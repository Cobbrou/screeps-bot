const sources = require('../sources');
const intel = require('../intel');
const defense = require('../defense');

// Récolte dans une salle voisine non revendiquée et rapporte l'énergie au stockage de sa salle.
// Si la salle devient dangereuse, rentre et attend près du stockage.
module.exports.run = function (creep) {
  if (creep.memory.working && creep.store[RESOURCE_ENERGY] === 0) creep.memory.working = false;
  if (!creep.memory.working && creep.store.getFreeCapacity() === 0) creep.memory.working = true;

  const target = creep.memory.target;
  // Hostiles vus sur place : la salle est notée dangereuse, ce qui déclenche le repli.
  if (creep.room.name === target && defense.threats(creep.room).length) intel.record(creep.room);
  if (creep.memory.working || !intel.safe(target)) {
    const storage = Game.rooms[creep.memory.room].storage;
    if (storage && creep.transfer(storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) creep.moveTo(storage);
    return;
  }
  if (creep.room.name !== target) {
    creep.moveTo(new RoomPosition(25, 25, target), { range: 22 });
    return;
  }
  sources.harvest(creep);
};
