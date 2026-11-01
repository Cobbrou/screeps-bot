const move = require('../move');
const sources = require('../sources');

// Retrait minimal dans le conteneur du contrôleur, comme MIN_WITHDRAW dans sources.js.
const MIN_WITHDRAW = 100;

// Alterne entre récolte et amélioration du contrôleur de la salle.
module.exports.run = function (creep) {
  if (creep.memory.working && creep.store[RESOURCE_ENERGY] === 0) creep.memory.working = false;
  if (!creep.memory.working && creep.store.getFreeCapacity() === 0) creep.memory.working = true;
  if (creep.memory.working && sources.goBack(creep)) return;

  if (!creep.memory.working) {
    // Le conteneur du contrôleur passe avant tout : sinon le withdrawId de collect reste collé
    // au conteneur d'une source, toujours plein, loin du contrôleur.
    const box = sources.container(creep.room.controller, 2);
    const need = Math.min(creep.store.getFreeCapacity(RESOURCE_ENERGY), MIN_WITHDRAW);
    if (box && box.store[RESOURCE_ENERGY] >= need) {
      if (creep.withdraw(box, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) move.to(creep, box);
    } else {
      sources.collect(creep);
    }
  } else if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
    move.to(creep, creep.room.controller);
  }
};
