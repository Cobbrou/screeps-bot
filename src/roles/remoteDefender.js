const move = require('../move');
const defense = require('../defense');
const intel = require('../intel');
const remoteMining = require('../remoteMining');

// Portée de RANGED_ATTACK.
const RANGE = 3;

// Va chasser les Invaders d'une salle distante et la rend aux mineurs dès qu'elle est vide, sans attendre la fin
// du délai d'intel. Un joueur dans la salle la retire de la liste (intel.invaded) : le créep rentre sans tirer.
// Tire à portée 3 et recule devant un hostile au contact. Plus rien à défendre : attend chez lui la prochaine alerte.
// ponytail: un seul défenseur, sans soin ; en envoyer plus si des vagues le battent.
module.exports.run = function (creep) {
  if (creep.room.name === creep.memory.target) {
    if (defense.threats(creep.room).length) intel.record(creep.room);
    else intel.clear(creep.room.name);
  }
  if (!intel.invaded(creep.memory.target)) creep.memory.target = remoteMining.invaded(Game.rooms[creep.memory.room]);
  const name = creep.memory.target;
  if (!name) {
    remoteMining.retreat(creep);
    return;
  }
  if (creep.room.name !== name) {
    move.to(creep, new RoomPosition(25, 25, name), { range: 20 });
    return;
  }
  const enemy = creep.pos.findClosestByRange(defense.threats(creep.room));
  const range = creep.pos.getRangeTo(enemy);
  if (range <= RANGE) creep.rangedAttack(enemy);
  if (range > RANGE) move.to(creep, enemy, { range: RANGE, reusePath: 3 });
  else if (range < RANGE && enemy.getActiveBodyparts(ATTACK)) creep.move(enemy.pos.getDirectionTo(creep));
};
