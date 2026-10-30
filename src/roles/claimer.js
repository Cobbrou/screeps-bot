const move = require('../move');

// Rejoint la salle visée par l'expansion et en revendique le contrôleur.
// Suit la cible actuelle, qui peut avoir changé depuis sa création ; sans expansion en cours, attend.
module.exports.run = function (creep) {
  const exp = Memory.expansion;
  if (!exp) return;
  const room = Game.rooms[exp.target];
  if (!room) {
    move.to(creep, new RoomPosition(25, 25, exp.target), { range: 22 });
    return;
  }
  if (creep.claimController(room.controller) === ERR_NOT_IN_RANGE) move.to(creep, room.controller);
};
