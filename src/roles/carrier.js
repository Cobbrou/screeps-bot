const move = require('../move');
const hauler = require('./hauler');
const mineralHauler = require('./mineralHauler');
const remoteMining = require('../remoteMining');
const expansion = require('../expansion');
const intel = require('../intel');
const upgraders = require('./upgrader');

// Énergie laissée au stockage de la salle d'origine : de quoi remplir spawn, extensions et tours, et au moins la réserve
// qui fait reprendre l'amélioration (100 000 dès le RCL 7, upgrader.storageHigh) : le soutien ne la vide pas.
const RESERVE = 10000;
// Pendant une guerre (Memory.war), RESERVE seule : la reconstruction de la salle reprise passe avant l'amélioration, en pause.
const reserve = (home) => (Memory.war ? RESERVE : Math.max(RESERVE, upgraders.storageHigh(home)));
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
    if (creep.room.name === target) {
      hauler.deliver(creep);
      return;
    }
    // Aucun trajet sûr (salle tenue par des hostiles, voir intel.avoid) : il rend sa charge chez lui (plus bas).
    if (move.travel(creep, target)) return;
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
  // Salle soutenue sans trajet sûr : le 2026-11-26, 6 carriers ont attendu pleins dans E25S3 qu'E24S3 rouvre,
  // ~7 500 d'énergie sortie du stockage pour rien. L'énergie y retourne, puis le carrier se recycle (le spawner
  // n'en recrée pas tant que la salle est tenue).
  const closed = young && young.name === target && (!intel.route(home.name, target) || expansion.raided(young));
  if (!young || young.name !== target || closed || (!energy && creep.ticksToLive < LAST_TRIP)) {
    if (!energy || !home.storage) remoteMining.goRecycle(creep, home);
    else if (creep.transfer(home.storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) move.to(creep, home.storage);
    return;
  }
  const { storage } = home;
  if (storage.store[RESOURCE_ENERGY] > reserve(home)) take(creep, storage, RESOURCE_ENERGY);
  else if (!creep.pos.inRangeTo(storage, 3)) move.to(creep, storage, { range: 3 });
};

module.exports.reserve = reserve;
module.exports.remains = remains;
