const move = require('../move');
const defense = require('../defense');

// Attaque l'hostile le plus proche ; reste près du spawn sinon.
module.exports.run = function (creep) {
  const enemy = creep.pos.findClosestByRange(defense.threats(creep.room));
  if (enemy) {
    if (creep.attack(enemy) === ERR_NOT_IN_RANGE) move.to(creep, enemy);
    return;
  }
  const spawn = creep.pos.findClosestByRange(FIND_MY_SPAWNS);
  if (spawn && !creep.pos.inRangeTo(spawn, 3)) move.to(creep, spawn);
};
