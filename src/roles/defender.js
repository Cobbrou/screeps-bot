const move = require('../move');
const defense = require('../defense');

// Portée de RANGED_ATTACK.
const RANGE = 3;

// Rempart libre (ou occupé par ce créep) le plus proche de `enemy`, ou null.
function rampartNear(creep, enemy) {
  const ramparts = creep.room.find(FIND_MY_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_RAMPART
      && (s.pos.isEqualTo(creep.pos) || !s.pos.lookFor(LOOK_CREEPS).length),
  });
  return enemy.pos.findClosestByRange(ramparts);
}

// Défenseur à distance : se poste sur le rempart le plus proche de l'ennemi et tire depuis là.
// Si ce rempart est hors de portée de l'ennemi (pas de rempart, ennemi déjà dans la base), il s'en approche à portée 3.
// Vise la cible des tours si elle est à portée (tir concentré), sinon l'hostile le plus proche. Reste près du spawn sinon.
module.exports.run = function (creep) {
  const hostiles = defense.threats(creep.room);
  const enemy = creep.pos.findClosestByRange(hostiles);
  if (!enemy) {
    const spawn = creep.pos.findClosestByRange(FIND_MY_SPAWNS);
    if (spawn && !creep.pos.inRangeTo(spawn, 3)) move.to(creep, spawn);
    return;
  }
  const rampart = rampartNear(creep, enemy);
  if (rampart && rampart.pos.inRangeTo(enemy, RANGE)) {
    if (!creep.pos.isEqualTo(rampart.pos)) move.to(creep, rampart);
  } else if (!creep.pos.inRangeTo(enemy, RANGE)) {
    move.to(creep, enemy, { range: RANGE });
  }
  const focus = defense.target(creep.room);
  const shot = focus && creep.pos.inRangeTo(focus, RANGE) ? focus
    : creep.pos.inRangeTo(enemy, RANGE) && enemy;
  if (shot) creep.rangedAttack(shot);
};
