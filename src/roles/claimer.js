const move = require('../move');

// Rejoint la salle visée par l'expansion par le trajet sûr (move.travel) et en revendique le contrôleur.
// Suit la cible actuelle, qui peut avoir changé depuis sa création ; sans expansion en cours, attend.
module.exports.run = function (creep) {
  const exp = Memory.expansion;
  if (!exp) return;
  if (creep.room.name !== exp.target) {
    move.travel(creep, exp.target);
    return;
  }
  const room = creep.room;
  if (creep.claimController(room.controller) === ERR_NOT_IN_RANGE) move.to(creep, room.controller);
};
