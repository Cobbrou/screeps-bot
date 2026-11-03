const move = require('../move');
const hauler = require('./hauler');

// Remplit spawn, extensions et tours depuis le stockage, quand les liens ont remplacé les haulers.
// Toujours plein entre deux livraisons : rien à remplir, il complète sa charge au stockage puis attend près du spawn.
module.exports.run = function (creep) {
  const storage = creep.room.storage;
  if (creep.memory.working && !creep.store[RESOURCE_ENERGY]) creep.memory.working = false;
  if (!creep.memory.working && !creep.store.getFreeCapacity()) creep.memory.working = true;

  if (creep.memory.working) {
    // deliveryTarget ne garde une réservation (deliverId) que pour une structure à remplir :
    // sinon il propose le dépôt ou le stockage, d'où le filler vient.
    const target = hauler.deliveryTarget(creep);
    if (creep.memory.deliverId) {
      const result = creep.transfer(target, RESOURCE_ENERGY);
      if (result === ERR_NOT_IN_RANGE) move.to(creep, target);
      else if (result === OK && creep.store[RESOURCE_ENERGY] > target.store.getFreeCapacity(RESOURCE_ENERGY)) {
        // Encore de l'énergie après ce transfer : en route vers la suivante dans le même tick.
        const next = hauler.deliveryTarget(creep, target);
        if (creep.memory.deliverId && !creep.pos.isNearTo(next)) move.to(creep, next);
      }
      return;
    }
    if (creep.store.getFreeCapacity()) {
      creep.memory.working = false;
    } else {
      const spawn = creep.room.find(FIND_MY_SPAWNS)[0];
      if (spawn && !creep.pos.inRangeTo(spawn, 3)) move.to(creep, spawn, { range: 3 });
      return;
    }
  }
  if (storage && creep.withdraw(storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) move.to(creep, storage);
};
