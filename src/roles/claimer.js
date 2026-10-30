const move = require('../move');

// Rejoint la salle visée par l'expansion et en revendique le contrôleur.
module.exports.run = function (creep) {
  const room = Game.rooms[creep.memory.target];
  if (!room) {
    move.to(creep, new RoomPosition(25, 25, creep.memory.target), { range: 22 });
    return;
  }
  if (creep.claimController(room.controller) === ERR_NOT_IN_RANGE) move.to(creep, room.controller);
};
