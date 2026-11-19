const move = require('../move');
const intel = require('../intel');
const remoteMining = require('../remoteMining');

// Portée de RANGED_ATTACK.
const RANGE = 3;

// Tue les Source Keepers qui gardent les sources de sa salle (creep.memory.target), pour les mineurs distants.
// Se soigne à chaque tick blessé, tire à portée 3 et s'écarte d'un keeper au contact (300 PV/tick en mêlée).
// Sans keeper vivant : attend à portée 3 de l'antre qui le fait réapparaître le plus tôt.
// Salle devenue dangereuse (Invaders, forteresse) : rentre et attend.
// ponytail: un seul tueur par salle ; il ignore le keeper du minerai et les Invaders.
module.exports.run = function (creep) {
  if (creep.hits < creep.hitsMax) creep.heal(creep);
  if (!remoteMining.safe(creep)) {
    remoteMining.retreat(creep);
    return;
  }
  const name = creep.memory.target;
  if (creep.room.name !== name) {
    move.to(creep, new RoomPosition(25, 25, name), { range: 20 });
    return;
  }
  // Trajet noté à l'arrivée : le spawner lance le successeur pour qu'il arrive à la mort de celui-ci.
  if (creep.memory.travel === undefined) creep.memory.travel = CREEP_LIFE_TIME - creep.ticksToLive;
  const lairs = remoteMining.lairs(creep.room);
  const names = new Set(lairs.map((l) => `Keeper${l.id}`));
  const keeper = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS, {
    filter: (c) => c.owner.username === intel.KEEPER && names.has(c.name),
  });
  if (keeper) {
    const range = creep.pos.getRangeTo(keeper);
    if (range <= RANGE) creep.rangedAttack(keeper);
    if (range > RANGE) move.to(creep, keeper, { range: RANGE, reusePath: 3 });
    else if (range <= 1) {
      const flee = PathFinder.search(creep.pos, { pos: keeper.pos, range: RANGE }, { flee: true, maxRooms: 1 });
      if (flee.path.length) move.step(creep, creep.pos.getDirectionTo(flee.path[0]));
    }
    return;
  }
  const wait = (l) => (l.ticksToSpawn === undefined ? Infinity : l.ticksToSpawn);
  const next = lairs.sort((a, b) => wait(a) - wait(b))[0];
  if (next && !creep.pos.inRangeTo(next, RANGE)) move.to(creep, next, { range: RANGE });
};
