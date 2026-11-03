const move = require('../move');
const builder = require('./builder');

// Créep d'amorçage : rejoint la salle revendiquée par le trajet sûr (move.travel) puis y récolte et construit comme un builder (spawn d'abord).
module.exports.run = function (creep) {
  if (creep.room.name !== creep.memory.target) {
    move.travel(creep, creep.memory.target);
    return;
  }
  builder.run(creep);
};
