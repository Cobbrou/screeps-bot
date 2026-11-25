const move = require('../move');
const builder = require('./builder');

// Créep d'amorçage : rejoint la salle revendiquée par le trajet sûr (move.travel) puis y récolte et construit comme un builder (spawn d'abord).
module.exports.run = function (creep) {
  if (creep.room.name !== creep.memory.target) {
    move.travel(creep, creep.memory.target);
    return;
  }
  // RCL 2 avant le spawn : 200 d'énergie, et le mode sans échec devient disponible (un par niveau gagné).
  const c = creep.room.controller;
  if (c.level < 2 && creep.memory.working && creep.store[RESOURCE_ENERGY]) {
    if (creep.upgradeController(c) === ERR_NOT_IN_RANGE) move.to(creep, c, { range: 3 });
    return;
  }
  builder.run(creep);
};
