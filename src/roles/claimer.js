const move = require('../move');

// Rejoint la salle visée par l'expansion par le trajet sûr (move.travel) et en revendique le contrôleur.
// Suit la cible actuelle, qui peut avoir changé depuis sa création (expansion.run en choisit une autre dans le même
// tick) ; sans expansion en cours, se suicide : attendre sa mort ne sert à rien.
module.exports.run = function (creep) {
  const exp = Memory.expansion;
  if (!exp) {
    creep.suicide();
    return;
  }
  if (creep.room.name !== exp.target) {
    move.travel(creep, exp.target);
    return;
  }
  const room = creep.room;
  if (creep.claimController(room.controller) === ERR_NOT_IN_RANGE) move.to(creep, room.controller);
};
