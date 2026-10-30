const sources = require('../sources');

// Se poste sur le conteneur de sa source et récolte sans fin : l'énergie tombe dans le conteneur.
module.exports.run = function (creep) {
  const source = Game.getObjectById(creep.memory.sourceId);
  if (!source) return;
  const container = sources.container(source);
  if (container && !creep.pos.isEqualTo(container.pos)) {
    creep.moveTo(container);
  } else {
    sources.harvestSource(creep, source);
  }
};
