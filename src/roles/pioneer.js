const builder = require('./builder');

// Créep d'amorçage : rejoint la salle revendiquée puis y récolte et construit comme un builder (spawn d'abord).
module.exports.run = function (creep) {
  if (creep.room.name !== creep.memory.target) {
    creep.moveTo(new RoomPosition(25, 25, creep.memory.target), { range: 22 });
    return;
  }
  builder.run(creep);
};
