const move = require('../move');
const intel = require('../intel');
const remoteMining = require('../remoteMining');
const expansion = require('../expansion');
const boost = require('../boost');

// Portée de RANGED_ATTACK.
const RANGE = 3;

// Garde d'une salle jeune (creep.memory.target), au corps de tueur (remoteMining.KILLER_BODY) quand la salle d'origine
// le paie. Soigne le plus entamé de lui-même et des gardes à son contact, tire à portée 3, soigneurs d'abord.
// Combat jugé à chaque tick sur les gardes vivants et les PV du plus entamé (remoteMining.beats) : perdu, ou salle passée
// par des hostiles armés qui n'y sont plus (expansion.raided), ils se recyclent chez eux (le spawner en recrée s'il le faut) ;
// gagnable, ils y vont groupés (move.regroup).
// Le 2026-11-26, envoyés un à un dans E24S3 tenue par deadlydd, 9 gardes y sont morts sans rien tuer.
// Salle visée en mode sans échec : les hostiles n'y font rien, les gardes y vont et tirent sans juger le combat.
// Marqué au spawn (memory.boost) : passe au lab se faire booster le tir avant de partir.
// Sans hostile : posté à portée 3 du contrôleur, là où un claimer doit venir.
module.exports.run = function (creep) {
  if (creep.memory.boost && boost.apply(creep)) return;
  const name = creep.memory.target;
  const mates = Object.values(Game.creeps)
    .filter((c) => c.memory.role === 'guard' && c.memory.target === name && !c.spawning)
    .sort((a, b) => (a.name < b.name ? -1 : 1));
  const hurt = mates.filter((c) => c.hits < c.hitsMax && c.room.name === creep.room.name && creep.pos.isNearTo(c))
    .sort((a, b) => a.hits / a.hitsMax - b.hits / b.hitsMax)[0];
  if (hurt) creep.heal(hurt);
  const room = Game.rooms[name];
  const hostiles = room ? intel.threats(room) : [];
  const safe = !!room && !!room.controller.safeMode;
  const lost = safe ? false : hostiles.length
    ? !remoteMining.beats(intel.force(hostiles), Math.min(...mates.map((c) => c.hits)), mates.length, intel.force(mates).damage)
    : !!room && expansion.raided(room);
  if (lost) {
    if (!remoteMining.goRecycle(creep, Game.rooms[creep.memory.room])) remoteMining.retreat(creep);
    return;
  }
  if (hostiles.length && !safe) {
    if (mates.length > 1 && move.regroup(creep, mates)) return;
  }
  if (creep.room.name !== name) {
    move.to(creep, new RoomPosition(25, 25, name), { range: 20, maxRooms: 2 });
    return;
  }
  const healers = hostiles.filter((c) => c.getActiveBodyparts(HEAL));
  // En mode sans échec, tous sur la même cible (le soigneur le plus entamé) : seul le tir cumulé dépasse leur soin.
  const focus = (list) => list.slice().sort((a, b) => a.hits - b.hits || (a.id < b.id ? -1 : 1))[0];
  const enemy = safe ? focus(healers) || focus(hostiles)
    : healers.filter((c) => creep.pos.inRangeTo(c, RANGE)).sort((a, b) => a.hits - b.hits)[0]
      || creep.pos.findClosestByRange(healers) || creep.pos.findClosestByRange(hostiles);
  if (!enemy) {
    if (!creep.pos.inRangeTo(room.controller, RANGE)) move.to(creep, room.controller, { range: RANGE });
    return;
  }
  // En route vers sa cible, il tire l'hostile à portée le plus entamé.
  const shot = creep.pos.inRangeTo(enemy, RANGE) ? enemy
    : creep.pos.findInRange(hostiles, RANGE).sort((a, b) => a.hits - b.hits)[0];
  if (shot) creep.rangedAttack(shot);
  if (!creep.pos.inRangeTo(enemy, RANGE)) move.to(creep, enemy, { range: RANGE, reusePath: 3 });
};
