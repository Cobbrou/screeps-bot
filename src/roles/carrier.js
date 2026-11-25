const move = require('../move');
const hauler = require('./hauler');
const mineralHauler = require('./mineralHauler');
const remoteMining = require('../remoteMining');
const expansion = require('../expansion');

// Énergie laissée au stockage de la salle d'origine : de quoi remplir spawn, extensions et tours.
const RESERVE = 10000;
// Sous cette vie, pas de nouveau chargement chez lui : il mourrait chargé avant d'arriver (~100 ticks).
const LAST_TRIP = 150;

// Ruine joignable la plus proche qui contient une ressource retenue par `wanted`, et cette ressource, ou undefined.
function remains(creep, wanted) {
  const held = (o) => Object.keys(o.store).find((r) => o.store[r] > 0 && wanted(r));
  const ruin = creep.pos.findClosestByRange(FIND_RUINS, { filter: (o) => held(o) && move.reachable(creep, o) });
  return ruin ? { from: ruin, resource: held(ruin) } : undefined;
}

function take(creep, from, resource) {
  if (creep.withdraw(from, resource) === ERR_NOT_IN_RANGE) move.to(creep, from);
}

// Soutien d'une salle voisine jeune (expansion.supported) : lui apporte l'énergie du stockage d'origine, livrée comme
// un hauler (spawn, extensions, tours, pioneers et builders, dépôt du contrôleur). Sur place, vide d'abord les ruines,
// qui disparaissent : l'énergie est livrée à la salle, le reste est rapporté au terminal d'origine au retour.
// Salle plus soutenue, ou trop vieux pour un voyage : se recycle chez lui.
module.exports.run = function (creep) {
  const { target } = creep.memory;
  const home = Game.rooms[creep.memory.room];
  const energy = creep.store[RESOURCE_ENERGY];
  const other = Object.keys(creep.store).find((r) => r !== RESOURCE_ENERGY && creep.store[r] > 0);
  const full = creep.store.getFreeCapacity() === 0;
  if (!energy) creep.memory.working = false;
  else if (full) creep.memory.working = true;

  if (creep.memory.working) {
    if (creep.room.name === target) hauler.deliver(creep);
    else move.travel(creep, target);
    return;
  }
  if (creep.room.name === target && !full) {
    // Minerai déjà à bord : pas d'énergie en plus, elle repartirait avec lui.
    const job = !other && remains(creep, (r) => r === RESOURCE_ENERGY);
    if (job) {
      take(creep, job.from, job.resource);
      return;
    }
    // Plus d'énergie dans les ruines : il livre ce qu'il a, sinon repart avec le minerai qui reste.
    if (energy) {
      creep.memory.working = true;
      hauler.deliver(creep);
      return;
    }
    const mineral = remains(creep, (r) => r !== RESOURCE_ENERGY);
    if (mineral) {
      take(creep, mineral.from, mineral.resource);
      return;
    }
  }
  if (creep.room.name !== home.name) {
    move.travel(creep, home.name);
    return;
  }
  if (other) {
    mineralHauler.unload(creep, other);
    return;
  }
  const young = expansion.supported(home);
  if (!young || young.name !== target || (!energy && creep.ticksToLive < LAST_TRIP)) {
    remoteMining.goRecycle(creep, home);
    return;
  }
  const { storage } = home;
  if (storage.store[RESOURCE_ENERGY] > RESERVE) take(creep, storage, RESOURCE_ENERGY);
  else if (!creep.pos.inRangeTo(storage, 3)) move.to(creep, storage, { range: 3 });
};

module.exports.RESERVE = RESERVE;
module.exports.remains = remains;
