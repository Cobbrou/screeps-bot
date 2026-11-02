const move = require('../move');
const sources = require('../sources');
const defense = require('../defense');

// Énergie au sol au-delà de laquelle le dépôt sans conteneur n'est plus alimenté : le tas perd 1 par tranche
// de 1 000 à chaque tick, inutile de l'entasser plus que ne le ferait un conteneur.
const DEPOT_MAX = CONTAINER_CAPACITY;
// Tour visée seulement s'il lui manque au moins cette énergie, sauf hostiles présents : pas de détour pour quelques points.
// Le remplissage en passant (fillNearby) la complète sans condition.
const TOWER_REFILL = 200;

// Tas d'énergie le plus gros au pied de la source (posé par un mineur sans conteneur, ou débordement du conteneur).
function pileAt(source) {
  return source.pos.findInRange(FIND_DROPPED_RESOURCES, 1, { filter: (r) => r.resourceType === RESOURCE_ENERGY })
    .sort((a, b) => b.amount - a.amount)[0];
}

// Énergie disponible au pied de la source : conteneur et tas.
function stock(source) {
  const box = sources.container(source);
  const pile = pileAt(source);
  return (box ? box.store[RESOURCE_ENERGY] : 0) + (pile ? pile.amount : 0);
}

// Énergie produite par tick par les mineurs de la source (HARVEST_POWER par WORK), au plus ce qu'elle régénère.
function mineRate(source) {
  let work = 0;
  for (const name in Game.creeps) {
    const c = Game.creeps[name];
    if (c.memory.role === 'miner' && c.memory.sourceId === source.id && !c.spawning) work += c.getActiveBodyparts(WORK);
  }
  return Math.min(work * HARVEST_POWER, source.energyCapacity / ENERGY_REGEN_TIME);
}

// Source à vider pour ce trajet. Énergie prévue à l'arrivée : stock, plus la production pendant le trajet,
// moins la place libre des haulers déjà en route vers elle. La plus proche qui remplira le hauler, sinon celle
// qui promet le plus (il attend sur place que les mineurs produisent).
// ponytail: trajet estimé à la distance en ligne droite ; passer au chemin réel si les haulers se trompent de source.
function dispatch(creep) {
  const reserved = {};
  for (const name in Game.creeps) {
    const other = Game.creeps[name];
    if (name !== creep.name && other.memory.role === 'hauler' && other.memory.haul && !other.memory.working) {
      reserved[other.memory.haul] = (reserved[other.memory.haul] || 0) + other.store.getFreeCapacity(RESOURCE_ENERGY);
    }
  }
  const need = creep.store.getCapacity();
  let full;
  let fullRange = Infinity;
  let best;
  let bestExpected = -Infinity;
  for (const source of sources.list(creep.room)) {
    const range = creep.pos.getRangeTo(source);
    const expected = stock(source) + mineRate(source) * range - (reserved[source.id] || 0);
    if (expected >= need && range < fullRange) {
      full = source;
      fullRange = range;
    }
    if (expected > bestExpected) {
      best = source;
      bestExpected = expected;
    }
  }
  return full || best;
}

// Où prendre l'énergie : tas hors des sources, pierre tombale ou ruine (en début de trajet), sinon la source
// attribuée pour le trajet (`creep.memory.haul`, choisie par dispatch) : son tas, puis son conteneur.
// Le stockage remplace une source trop maigre quand spawn ou extensions attendent.
// Retourne l'objet où puiser, ou { wait, range } : où attendre que la source produise.
// L'énergie posée près du contrôleur (par les remoteHauler) est laissée aux upgraders et aux builders.
function pickupTarget(creep) {
  const room = creep.room;
  const controller = room.controller;
  const roomSources = sources.list(room);
  const dropped = creep.pos.findClosestByRange(FIND_DROPPED_RESOURCES, {
    filter: (r) => r.resourceType === RESOURCE_ENERGY && r.amount >= 50
      && !(controller && r.pos.inRangeTo(controller, 3)) && !roomSources.some((s) => r.pos.inRangeTo(s, 1)),
  });
  if (dropped) return dropped;

  let target = Game.getObjectById(creep.memory.pickupId);
  if (target && target.store[RESOURCE_ENERGY]) return target;
  delete creep.memory.pickupId;
  if (!creep.memory.haul) {
    const remains = [...room.find(FIND_TOMBSTONES), ...room.find(FIND_RUINS)].filter((o) => o.store[RESOURCE_ENERGY] > 0);
    target = creep.pos.findClosestByRange(remains);
    if (target) {
      creep.memory.pickupId = target.id;
      return target;
    }
  }

  let source = Game.getObjectById(creep.memory.haul);
  if (!source) {
    source = dispatch(creep);
    if (!source) return undefined;
    creep.memory.haul = source.id;
  }
  const free = creep.store.getFreeCapacity(RESOURCE_ENERGY);
  const storage = room.storage;
  if (stock(source) < free && storage && storage.store[RESOURCE_ENERGY] >= free
    && room.energyAvailable < room.energyCapacityAvailable) {
    delete creep.memory.haul;
    creep.memory.pickupId = storage.id;
    return storage;
  }
  const pile = pileAt(source);
  if (pile) return pile;
  const box = sources.container(source);
  if (box && box.store[RESOURCE_ENERGY]) return box;
  // À portée 2 de la source sans conteneur : les cases voisines restent aux mineurs.
  return { wait: box || source, range: box ? 1 : 2 };
}

// Va vers la collecte sans agir : sert après une livraison, au même tick (un second transfer annulerait le premier).
function headBack(creep) {
  const t = pickupTarget(creep);
  if (!t) return;
  const pos = t.wait ? t.wait.pos : t.pos;
  const range = t.wait ? t.range : 1;
  if (!creep.pos.inRangeTo(pos, range)) move.to(creep, pos, { range });
}

// Fin de trajet de collecte : la prochaine sera répartie à nouveau.
function startDelivery(creep) {
  creep.memory.working = true;
  delete creep.memory.haul;
  delete creep.memory.pickupId;
}

// Prend l'énergie choisie par pickupTarget. Rien à prendre avec au moins la moitié de sa capacité : on livre
// plutôt que d'attendre. Le remplissage en passant n'a lieu qu'en chemin : transfer et withdraw au même tick
// ne sont pas garantis.
function collect(creep) {
  const t = pickupTarget(creep);
  if (!t) return;
  if (t.wait) {
    if (creep.store[RESOURCE_ENERGY] >= creep.store.getCapacity() / 2) {
      startDelivery(creep);
      deliver(creep);
    } else if (!creep.pos.inRangeTo(t.wait, t.range)) {
      fillNearby(creep);
      move.to(creep, t.wait, { range: t.range });
    }
    return;
  }
  const result = t.store ? creep.withdraw(t, RESOURCE_ENERGY) : creep.pickup(t);
  if (result === ERR_NOT_IN_RANGE) {
    fillNearby(creep);
    move.to(creep, t);
  }
}

// Spawn, extension ou tour qui manque d'énergie.
const needsEnergy = (s) => (s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION
  || s.structureType === STRUCTURE_TOWER) && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0;

// En chemin vers sa collecte, le hauler qui porte encore de l'énergie remplit la structure adjacente qui en manque
// (un seul transfer par tick, compatible avec le déplacement).
function fillNearby(creep) {
  if (!creep.store[RESOURCE_ENERGY]) return;
  const near = creep.pos.findInRange(FIND_MY_STRUCTURES, 1, { filter: needsEnergy })[0];
  if (near) creep.transfer(near, RESOURCE_ENERGY);
}

// En chemin vers sa livraison, ramasse l'énergie au sol adjacente s'il reste de la place (pickup, transfer
// et déplacement passent au même tick). Le dépôt des upgraders, près du contrôleur, n'est pas repris.
function pickupNearby(creep) {
  if (!creep.store.getFreeCapacity(RESOURCE_ENERGY)) return;
  const controller = creep.room.controller;
  const pile = creep.pos.findInRange(FIND_DROPPED_RESOURCES, 1, {
    filter: (r) => r.resourceType === RESOURCE_ENERGY && !(controller && r.pos.inRangeTo(controller, 3)),
  })[0];
  if (pile) creep.pickup(pile);
}

// Livre au spawn, aux extensions et aux tours (s'il leur manque TOWER_REFILL, sauf hostiles), puis aux builders (sans stockage), puis au dépôt des upgraders
// (sources.depot), puis au stockage.
// Sans conteneur, le dépôt est une case (RoomPosition) où l'énergie est posée au sol, jusqu'à DEPOT_MAX.
// Un builder n'est visé que s'il lui manque au moins la moitié de sa capacité, énergie des haulers déjà en route
// vers lui déduite (`creep.memory.deliverId`) : pas de détour pour quelques points.
// Avec un stockage, les builders y puisent eux-mêmes.
// `skip` : structure ou builder qu'on vient de remplir ce tick, à ne plus viser.
function deliveryTarget(creep, skip) {
  const room = creep.room;
  const threatened = defense.threats(room).length > 0;
  // Réservation du builder visé : refaite à chaque choix, gardée seulement si un builder est retenu.
  delete creep.memory.deliverId;
  const structure = creep.pos.findClosestByRange(FIND_MY_STRUCTURES, {
    filter: (s) => s !== skip && needsEnergy(s) && (s.structureType !== STRUCTURE_TOWER || threatened
      || s.store.getFreeCapacity(RESOURCE_ENERGY) >= TOWER_REFILL),
  });
  if (structure) return structure;
  if (!room.storage) {
    // Énergie déjà en route vers chaque builder (autres transporteurs chargés qui l'ont choisi) :
    // sans ça, tous les haulers chargés suivent le même builder à travers la salle.
    const incoming = {};
    for (const name in Game.creeps) {
      const other = Game.creeps[name];
      if (other !== creep && other.memory.working && other.memory.deliverId) {
        incoming[other.memory.deliverId] = (incoming[other.memory.deliverId] || 0) + other.store[RESOURCE_ENERGY];
      }
    }
    const builder = creep.pos.findClosestByRange(FIND_MY_CREEPS, {
      filter: (c) => c !== skip && c.memory.role === 'builder'
        && c.store.getFreeCapacity(RESOURCE_ENERGY) - (incoming[c.id] || 0) >= c.store.getCapacity() / 2,
    });
    if (builder) {
      creep.memory.deliverId = builder.id;
      return builder;
    }
  }
  const depot = sources.depot(room);
  if (depot && depot.container) {
    if (depot.container.store.getFreeCapacity(RESOURCE_ENERGY) > 0) return depot.container;
  } else if (depot) {
    const pile = sources.depotPile(depot);
    if (!pile || pile.amount < DEPOT_MAX) return depot.pos;
  }
  return room.storage;
}

// Livre la cible. Si le transfer la remplit et qu'il reste de l'énergie, le hauler part déjà vers la suivante
// au lieu de perdre un tick sur place ; s'il se vide, il repart déjà vers sa collecte (hauler local seulement :
// le remoteHauler, qui livre aussi par ici, retourne à sa salle distante).
function deliver(creep) {
  const target = deliveryTarget(creep);
  if (!target) return;
  if (target instanceof RoomPosition) {
    if (creep.pos.isEqualTo(target)) {
      creep.drop(RESOURCE_ENERGY);
      emptied(creep);
    } else {
      pickupNearby(creep);
      move.to(creep, target);
    }
    return;
  }
  const result = creep.transfer(target, RESOURCE_ENERGY);
  if (result === ERR_NOT_IN_RANGE) {
    pickupNearby(creep);
    move.to(creep, target);
  } else if (result === OK && creep.store[RESOURCE_ENERGY] > target.store.getFreeCapacity(RESOURCE_ENERGY)) {
    const next = deliveryTarget(creep, target);
    if (next && next !== target && !creep.pos.isNearTo(next)) move.to(creep, next);
  } else if (result === OK) {
    emptied(creep);
  }
}

// Le hauler local vidé ce tick repart vers sa collecte sans attendre le tick suivant.
function emptied(creep) {
  if (creep.memory.role !== 'hauler') return;
  creep.memory.working = false;
  headBack(creep);
}

module.exports.run = function (creep) {
  if (creep.memory.working && creep.store[RESOURCE_ENERGY] === 0) creep.memory.working = false;
  if (!creep.memory.working && creep.store.getFreeCapacity() === 0) startDelivery(creep);

  if (creep.memory.working) deliver(creep);
  else collect(creep);
};

module.exports.deliver = deliver;
module.exports.deliveryTarget = deliveryTarget;
