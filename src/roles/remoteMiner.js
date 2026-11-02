const move = require('../move');
const sources = require('../sources');
const remoteMining = require('../remoteMining');

// Rejoint sa source dans une salle voisine et la récolte sans fin : sans CARRY, l'énergie tombe au sol,
// où les remoteHauler la ramassent. Salle devenue dangereuse : rentre et attend.
// ponytail: pas de conteneur distant (l'énergie au sol perd ~1/tick) ; à ajouter avec un builder distant.
module.exports.run = function (creep) {
  if (!remoteMining.safe(creep)) {
    remoteMining.retreat(creep);
    return;
  }
  const pos = new RoomPosition(creep.memory.x, creep.memory.y, creep.memory.target);
  if (!creep.pos.isNearTo(pos)) {
    move.to(creep, pos, { range: 1 });
    return;
  }
  // Temps de trajet noté à l'arrivée : le spawner lance le successeur pour qu'il arrive à la mort de celui-ci.
  if (creep.memory.travel === undefined) creep.memory.travel = CREEP_LIFE_TIME - creep.ticksToLive;
  const source = Game.getObjectById(creep.memory.sourceId);
  if (source) sources.harvestSource(creep, source);
};
