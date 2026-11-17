const move = require('../move');
const remoteMining = require('../remoteMining');
const intel = require('../intel');

// Rejoint la salle de récolte distante visée et en réserve le contrôleur : ses sources passent à 3 000 énergie.
// Salle devenue dangereuse : rentre et attend.
module.exports.run = function (creep) {
  if (!remoteMining.safe(creep)) {
    remoteMining.retreat(creep);
    return;
  }
  const room = Game.rooms[creep.memory.target];
  if (!room) {
    move.to(creep, new RoomPosition(25, 25, creep.memory.target), { range: 22 });
    return;
  }
  // Réservation laissée par un cœur d'Invader détruit : retirée par attackController (1 tick par CLAIM et par coup),
  // reserveController refusant un contrôleur réservé par un autre.
  const r = room.controller.reservation;
  const result = r && r.username !== intel.me() ? creep.attackController(room.controller) : creep.reserveController(room.controller);
  if (result === ERR_NOT_IN_RANGE) move.to(creep, room.controller);
  // Temps de trajet noté à l'arrivée : le spawner lance le successeur pour qu'il arrive à la mort de celui-ci.
  else if (result === OK && creep.memory.travel === undefined) creep.memory.travel = CREEP_CLAIM_LIFE_TIME - creep.ticksToLive;
};
