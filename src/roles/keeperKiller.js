const move = require('../move');
const intel = require('../intel');
const remoteMining = require('../remoteMining');

// Portée de RANGED_ATTACK.
const RANGE = 3;

// Tue les Source Keepers qui gardent les sources de sa salle (creep.memory.target), pour les mineurs distants.
// Se soigne à chaque tick blessé, tire à portée 3 et s'écarte d'un keeper au contact (300 PV/tick en mêlée).
// Sans keeper vivant : attend à portée 3 de l'antre qui le fait réapparaître le plus tôt.
// Invaders dans la salle : tirés avant les keepers, d'abord le healer à portée le plus entamé, sinon le plus proche
// (tant qu'un healer vit, la cible remonte à chaque tick) ; plus aucun en vue, la salle est rouverte tout de suite (intel.clear).
// Invaders trop forts pour ses PV du moment (remoteMining.huntable, revu à chaque tick en combat) ou salle dangereuse
// autrement (joueur, forteresse) : rentre, se soigne et attend ; remonté, il y retourne si le combat redevient gagnable.
// ponytail: un seul tueur par salle ; il ignore le keeper du minerai.
module.exports.run = function (creep) {
  if (creep.hits < creep.hitsMax) creep.heal(creep);
  const name = creep.memory.target;
  if (!remoteMining.safe(creep) && !remoteMining.huntable(name, creep.hits)) {
    remoteMining.retreat(creep);
    return;
  }
  if (creep.room.name !== name) {
    move.to(creep, new RoomPosition(25, 25, name), { range: 20 });
    return;
  }
  // Trajet noté à l'arrivée : le spawner lance le successeur pour qu'il arrive à la mort de celui-ci.
  if (creep.memory.travel === undefined) creep.memory.travel = CREEP_LIFE_TIME - creep.ticksToLive;
  const invaders = intel.threats(creep.room);
  if (!invaders.length && intel.keeperInvaded(name)) intel.clear(name);
  const lairs = remoteMining.lairs(creep.room);
  const names = new Set(lairs.map((l) => `Keeper${l.id}`));
  const healer = invaders.filter((c) => c.getActiveBodyparts(HEAL) && creep.pos.inRangeTo(c, RANGE))
    .sort((a, b) => a.hits - b.hits)[0];
  const enemy = healer || creep.pos.findClosestByRange(invaders) ||creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS, {
    filter: (c) => c.owner.username === intel.KEEPER && names.has(c.name),
  });
  if (enemy) {
    const range = creep.pos.getRangeTo(enemy);
    if (range <= RANGE) creep.rangedAttack(enemy);
    if (range > RANGE) move.to(creep, enemy, { range: RANGE, reusePath: 3 });
    else if (range <= 1) {
      const flee = PathFinder.search(creep.pos, { pos: enemy.pos, range: RANGE }, { flee: true, maxRooms: 1 });
      if (flee.path.length) move.step(creep, creep.pos.getDirectionTo(flee.path[0]));
    }
    return;
  }
  const wait = (l) => (l.ticksToSpawn === undefined ? Infinity : l.ticksToSpawn);
  const next = lairs.sort((a, b) => wait(a) - wait(b))[0];
  if (next && !creep.pos.inRangeTo(next, RANGE)) move.to(creep, next, { range: RANGE });
};
