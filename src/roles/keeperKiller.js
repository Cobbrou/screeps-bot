const move = require('../move');
const intel = require('../intel');
const remoteMining = require('../remoteMining');

// Portée de RANGED_ATTACK.
const RANGE = 3;
// Contre des Invaders, les tueurs avancent groupés : chacun à cette portée au plus du meneur avant d'approcher.
const GROUP_RANGE = 2;
// Plus aucun ennemi à cette portée du meneur : le groupe se reforme (sinon le combat est engagé, chacun pour soi).
const CONTACT_RANGE = 5;

// Vrai si un des tueurs doit attendre ou rejoindre les autres avant d'avancer vers les Invaders. Le meneur (nom le plus
// petit) attend tant qu'un autre est à plus de GROUP_RANGE ; les autres le rejoignent. Pas en plein combat (ennemi à
// CONTACT_RANGE du meneur) : le recul de chacun à portée 3 les écarte un peu, ils restent sur la même cible.
function regroup(creep, mates) {
  const leader = mates[0];
  if (leader.room.find(FIND_HOSTILE_CREEPS, { filter: (c) => leader.pos.inRangeTo(c, CONTACT_RANGE) }).length) return false;
  const apart = mates.some((c) => c.room.name !== leader.room.name || !c.pos.inRangeTo(leader, GROUP_RANGE));
  if (!apart) return false;
  if (creep !== leader) move.to(creep, leader, { range: 1 });
  return true;
}

// Tue les Source Keepers qui gardent les sources de sa salle (creep.memory.target), pour les mineurs distants.
// Soigne à chaque tick le plus entamé de lui-même et des tueurs à son contact, tire à portée 3 et s'écarte
// d'un keeper au contact (300 PV/tick en mêlée). Sans keeper vivant : attend à portée 3 de l'antre qui le fait
// réapparaître le plus tôt.
// Invaders dans la salle : tirés avant les keepers, d'abord le healer à portée le plus entamé, sinon le plus proche
// (tant qu'un healer vit, la cible remonte à chaque tick) ; plus aucun en vue, la salle est rouverte tout de suite (intel.clear),
// même si le combat était jugé perdu.
// Combat jugé sur les tueurs vivants de la salle et les PV du plus entamé (remoteMining.huntable, revu à chaque tick) :
// perdu, ou salle dangereuse autrement (joueur, forteresse), ils rentrent, se soignent et attendent (le spawner envoie
// le second tueur qui manque) ; gagnable, ils y vont groupés (regroup).
// ponytail: il ignore le keeper du minerai.
module.exports.run = function (creep) {
  const name = creep.memory.target;
  const mates = Object.values(Game.creeps)
    .filter((c) => c.memory.role === 'keeperKiller' && c.memory.target === name && !c.spawning)
    .sort((a, b) => (a.name < b.name ? -1 : 1));
  const hurt = mates.filter((c) => c.hits < c.hitsMax && c.room.name === creep.room.name && creep.pos.isNearTo(c))
    .sort((a, b) => a.hits / a.hitsMax - b.hits / b.hitsMax)[0];
  if (hurt) creep.heal(hurt);
  // Plus aucun Invader en vue dans sa salle : rouverte tout de suite, avant de juger le combat. La force notée
  // (huntable) est celle des Invaders partis : jugé perdu, le tueur rentrait sans jamais la rouvrir.
  if (creep.room.name === name && intel.keeperInvaded(name) && !intel.threats(creep.room).length) intel.clear(name);
  if (!remoteMining.safe(creep)) {
    if (!remoteMining.huntable(name, Math.min(...mates.map((c) => c.hits)), mates.length)) {
      remoteMining.retreat(creep);
      return;
    }
    if (mates.length > 1 && regroup(creep, mates)) return;
  }
  if (creep.room.name !== name) {
    move.to(creep, new RoomPosition(25, 25, name), { range: 20 });
    return;
  }
  // Trajet noté à l'arrivée : le spawner lance le successeur pour qu'il arrive à la mort de celui-ci.
  if (creep.memory.travel === undefined) creep.memory.travel = CREEP_LIFE_TIME - creep.ticksToLive;
  const invaders = intel.threats(creep.room);
  const lairs = remoteMining.lairs(creep.room);
  const names = new Set(lairs.map((l) => `Keeper${l.id}`));
  const healer = invaders.filter((c) => c.getActiveBodyparts(HEAL) && creep.pos.inRangeTo(c, RANGE))
    .sort((a, b) => a.hits - b.hits)[0];
  const enemy = healer || creep.pos.findClosestByRange(invaders) || creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS, {
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
