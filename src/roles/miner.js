const move = require('../move');
const sources = require('../sources');

// Se poste sur le conteneur de sa source et récolte sans fin : l'énergie tombe dans le conteneur.
// Conteneur occupé par un autre créep (le mineur qu'il remplace) : attend sans bouger sur une case voisine
// du conteneur et de la source, en récoltant, et prend la place dès qu'elle se libère.
module.exports.run = function (creep) {
  const source = Game.getObjectById(creep.memory.sourceId);
  if (!source) return;
  // Temps de trajet depuis le spawn, noté à l'arrivée : le spawner lance le successeur assez tôt
  // pour qu'il arrive quand ce mineur meurt.
  if (creep.memory.travel === undefined && creep.pos.isNearTo(source)) {
    creep.memory.travel = CREEP_LIFE_TIME - creep.ticksToLive;
  }
  const container = sources.container(source);
  if (container && !creep.pos.isEqualTo(container.pos)) {
    const dest = container.pos.lookFor(LOOK_CREEPS).length ? sources.waitSpot(creep, source.pos, container) : container.pos;
    // Portée 0 : la case devient sa zone de travail, move.run ne le pousse plus.
    if (dest && !creep.pos.isEqualTo(dest)) return move.to(creep, dest, { range: 0 });
  }
  sources.harvestSource(creep, source);
};
