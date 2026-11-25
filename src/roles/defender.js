const move = require('../move');
const defense = require('../defense');

// Portée de RANGED_ATTACK.
const RANGE = 3;

// Rempart libre (ou occupé par ce créep) où se tenir, le plus proche de `enemy`, ou null.
function rampartNear(creep, enemy) {
  const ramparts = creep.room.find(FIND_MY_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_RAMPART && defense.standable(s)
      && (s.pos.isEqualTo(creep.pos) || !s.pos.lookFor(LOOK_CREEPS).length),
  });
  return enemy.pos.findClosestByRange(ramparts);
}

// Garde d'une salle jeune (rôle guard, creep.memory.target) : s'y rend d'abord, même avec des hostiles, puis agit comme
// un défenseur, posté près du contrôleur sans spawn.
// Défenseur à distance : se poste sur le rempart le plus proche de l'ennemi et tire depuis là.
// Ennemi hors de portée de tout rempart : s'il est entré dans les murs (defense.inBase), le défenseur s'en approche
// à portée 3, sous le feu des tours ; s'il est dehors, il ne sort jamais : il attend sur ce rempart.
// Vise la cible des tours si elle est à portée (tir concentré), sinon l'hostile le plus proche. Reste près du spawn sinon.
module.exports.run = function (creep) {
  const { target } = creep.memory;
  if (target && creep.room.name !== target) {
    move.to(creep, new RoomPosition(25, 25, target), { range: 20, maxRooms: 2 });
    return;
  }
  const hostiles = defense.threats(creep.room);
  const enemy = creep.pos.findClosestByRange(hostiles);
  if (!enemy) {
    const post = creep.pos.findClosestByRange(FIND_MY_SPAWNS) || creep.room.controller;
    if (post && !creep.pos.inRangeTo(post, 3)) move.to(creep, post);
    return;
  }
  const rampart = rampartNear(creep, enemy);
  if (rampart && rampart.pos.inRangeTo(enemy, RANGE)) {
    if (!creep.pos.isEqualTo(rampart.pos)) move.to(creep, rampart);
  } else if (defense.inBase(creep.room, enemy.pos)) {
    if (!creep.pos.inRangeTo(enemy, RANGE)) move.to(creep, enemy, { range: RANGE });
  } else if (rampart && !creep.pos.isEqualTo(rampart.pos)) {
    move.to(creep, rampart);
  }
  const focus = defense.target(creep.room);
  const shot = focus && creep.pos.inRangeTo(focus, RANGE) ? focus
    : creep.pos.inRangeTo(enemy, RANGE) && enemy;
  if (shot) creep.rangedAttack(shot);
};
