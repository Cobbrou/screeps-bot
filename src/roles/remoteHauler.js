const move = require('../move');
const hauler = require('./hauler');
const remoteMining = require('../remoteMining');
const sources = require('../sources');

// Ramasse l'énergie posée au sol autour de sa source distante (le tas le plus gros d'abord : il se perd)
// ou celle du conteneur de la source (sources.pickFrom), puis celle des pierres tombales.
// Rien à prendre : livre s'il porte déjà la moitié de sa capacité, sinon attend à 2 cases de la source.
function collect(creep) {
  const pos = new RoomPosition(creep.memory.x, creep.memory.y, creep.memory.target);
  if (creep.room.name !== pos.roomName) {
    move.to(creep, pos, { range: 2 });
    return;
  }
  const pile = pos.findInRange(FIND_DROPPED_RESOURCES, 2, { filter: (r) => r.resourceType === RESOURCE_ENERGY })
    .sort((a, b) => b.amount - a.amount)[0];
  const box = remoteMining.container({ x: creep.memory.x, y: creep.memory.y, room: creep.memory.target });
  // Pierre tombale (keeper abattu par le tueur, créep mort) : après tas et conteneur, elle ne perd rien avant de tomber.
  const tomb = pos.findInRange(FIND_TOMBSTONES, 2, { filter: (t) => t.store[RESOURCE_ENERGY] > 0 })[0];
  const from = sources.pickFrom(pile, box, creep.store.getFreeCapacity(RESOURCE_ENERGY)) || tomb;
  if (from) {
    const result = from.store ? creep.withdraw(from, RESOURCE_ENERGY) : creep.pickup(from);
    if (result === ERR_NOT_IN_RANGE) move.to(creep, from);
  } else if (creep.store[RESOURCE_ENERGY] >= creep.store.getCapacity() / 2) {
    creep.memory.working = true;
  } else if (!creep.pos.inRangeTo(pos, 2)) {
    move.to(creep, pos, { range: 2 });
  }
}

// Rentre et livre comme un hauler (spawn, extensions, tours, dépôt des upgraders, stockage).
function deliver(creep) {
  if (creep.room.name !== creep.memory.room) {
    move.to(creep, new RoomPosition(25, 25, creep.memory.room), { range: 20 });
    return;
  }
  hauler.deliver(creep);
}

// Fin de vie (remoteMining.ending) : vidé chez lui sans assez de vie pour un autre voyage, il se recycle (`last`, décidé
// à ce moment seulement : en chemin, la vie qui baisse le ferait rebrousser) ; chargé à sa source, il rentre livrer sans
// attendre le plein. Le 2026-11-24, 18 transporteurs sur 40 sont morts de vieillesse chargés (20 600 d'énergie,
// dont 11 000 dans E25S4 où presque rien n'est repris).
module.exports.run = function (creep) {
  if (creep.memory.working && creep.store[RESOURCE_ENERGY] === 0) {
    creep.memory.working = false;
    creep.memory.last = remoteMining.ending(creep, 1) || undefined;
  }
  if (!creep.memory.working && creep.store.getFreeCapacity() === 0) creep.memory.working = true;
  if (creep.store[RESOURCE_ENERGY] && creep.room.name === creep.memory.target && remoteMining.ending(creep, 0.5)) creep.memory.working = true;

  // Salle devenue dangereuse : il rapporte ce qu'il porte, sinon il attend chez lui (ou se recycle, remoteMining.recycle).
  const safe = remoteMining.safe(creep);
  if (remoteMining.dodge(creep)) return;
  if (creep.memory.working || (!safe && creep.store[RESOURCE_ENERGY])) deliver(creep);
  else if (creep.memory.last && remoteMining.goRecycle(creep, Game.rooms[creep.memory.room])) return;
  // Recyclage en cours : surtout pas de collect, son déplacement remplacerait celui vers le spawn. Le 2026-11-23,
  // 7 transporteurs à recycler repartaient ainsi vers leur source et sont morts dans E25S4 fermée.
  else if (safe) collect(creep);
  else if (!remoteMining.recycle(creep)) remoteMining.retreat(creep);
};
