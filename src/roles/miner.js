const move = require('../move');
const sources = require('../sources');

// Se poste sur le conteneur de sa source et récolte sans fin : l'énergie tombe dans le conteneur.
// Conteneur occupé par un autre créep : récolte depuis une case adjacente à la source.
module.exports.run = function (creep) {
  const source = Game.getObjectById(creep.memory.sourceId);
  if (!source) return;
  const container = sources.container(source);
  if (container && !creep.pos.isEqualTo(container.pos) && !container.pos.lookFor(LOOK_CREEPS).length) {
    move.to(creep, container);
  } else {
    sources.harvestSource(creep, source);
  }
};
