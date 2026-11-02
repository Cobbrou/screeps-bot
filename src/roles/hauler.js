const move = require('../move');
const sources = require('../sources');
const defense = require('../defense');

// Énergie au sol au-delà de laquelle le dépôt sans conteneur n'est plus alimenté : le tas perd 1 par tranche
// de 1 000 à chaque tick, inutile de l'entasser plus que ne le ferait un conteneur.
const DEPOT_MAX = CONTAINER_CAPACITY;
// Tour visée seulement s'il lui manque au moins cette énergie, sauf hostiles présents : pas de détour pour quelques points.
// Le remplissage en passant (fillNearby) la complète sans condition.
const TOWER_REFILL = 200;

// Ramasse l'énergie au sol, dans les pierres tombales, les ruines puis les conteneurs des sources.
// L'énergie posée près du contrôleur (par les remoteHauler) est laissée aux upgraders et aux builders.
function collect(creep) {
  const controller = creep.room.controller;
  const dropped = creep.pos.findClosestByRange(FIND_DROPPED_RESOURCES, {
    filter: (r) => r.resourceType === RESOURCE_ENERGY && r.amount >= 50
      && !(controller && r.pos.inRangeTo(controller, 3)),
  });
  if (dropped) {
    if (creep.pickup(dropped) === ERR_NOT_IN_RANGE) {
      fillNearby(creep);
      move.to(creep, dropped);
    }
    return;
  }

  // Cible gardée en mémoire tant qu'il lui reste de l'énergie : sinon le hauler, après avoir vidé un conteneur,
  // filerait vers l'autre devenu le plus plein, et ainsi de suite sans jamais livrer.
  let target = Game.getObjectById(creep.memory.pickupId);
  if (!target || !target.store[RESOURCE_ENERGY]) {
    // Cible vidée alors qu'on porte déjà au moins la moitié de sa capacité : on livre plutôt que de courir
    // vers une autre. En dessous (pierre tombale presque vide…), traverser la salle ne vaut pas le coup.
    if (target && creep.store[RESOURCE_ENERGY] >= creep.store.getCapacity() / 2) {
      delete creep.memory.pickupId;
      creep.memory.working = true;
      deliver(creep);
      return;
    }
    const remains = [...creep.room.find(FIND_TOMBSTONES), ...creep.room.find(FIND_RUINS)]
      .filter((o) => o.store[RESOURCE_ENERGY] > 0);
    target = creep.pos.findClosestByRange(remains) || fullestContainer(creep);
    // Conteneurs vides et spawn ou extensions à remplir : on puise dans le stockage.
    const storage = creep.room.storage;
    if ((!target || !target.store[RESOURCE_ENERGY]) && storage && storage.store[RESOURCE_ENERGY]
      && creep.room.energyAvailable < creep.room.energyCapacityAvailable) {
      target = storage;
    }
    creep.memory.pickupId = target ? target.id : undefined;
  }
  // Le remplissage en passant n'a lieu qu'en chemin : transfer et withdraw au même tick ne sont pas garantis.
  if (target && creep.withdraw(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
    fillNearby(creep);
    move.to(creep, target);
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

// Conteneur de source le plus plein, pour éviter qu'il déborde, en laissant aux autres haulers ceux qu'ils visent déjà.
function fullestContainer(creep) {
  const taken = new Set();
  for (const name in Game.creeps) {
    const other = Game.creeps[name];
    if (name !== creep.name && other.memory.role === 'hauler') taken.add(other.memory.pickupId);
  }
  const containers = sources.list(creep.room).map((s) => sources.container(s)).filter(Boolean);
  containers.sort((a, b) => b.store[RESOURCE_ENERGY] - a.store[RESOURCE_ENERGY]);
  return containers.find((c) => !taken.has(c.id)) || containers[0];
}

// Livre au spawn, aux extensions et aux tours (s'il leur manque TOWER_REFILL, sauf hostiles), puis aux builders (sans stockage), puis au dépôt des upgraders
// (sources.depot), puis au stockage.
// Sans conteneur, le dépôt est une case (RoomPosition) où l'énergie est posée au sol, jusqu'à DEPOT_MAX.
// Un builder n'est visé que s'il lui manque au moins la moitié de sa capacité : pas de détour pour quelques points.
// Avec un stockage, les builders y puisent eux-mêmes.
// `skip` : structure ou builder qu'on vient de remplir ce tick, à ne plus viser.
function deliveryTarget(creep, skip) {
  const room = creep.room;
  const threatened = defense.threats(room).length > 0;
  const structure = creep.pos.findClosestByRange(FIND_MY_STRUCTURES, {
    filter: (s) => s !== skip && needsEnergy(s) && (s.structureType !== STRUCTURE_TOWER || threatened
      || s.store.getFreeCapacity(RESOURCE_ENERGY) >= TOWER_REFILL),
  });
  if (structure) return structure;
  if (!room.storage) {
    const builder = creep.pos.findClosestByRange(FIND_MY_CREEPS, {
      filter: (c) => c !== skip && c.memory.role === 'builder'
        && c.store.getFreeCapacity(RESOURCE_ENERGY) >= c.store.getCapacity() / 2,
    });
    if (builder) return builder;
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
// au lieu de perdre un tick sur place.
function deliver(creep) {
  const target = deliveryTarget(creep);
  if (!target) return;
  if (target instanceof RoomPosition) {
    if (creep.pos.isEqualTo(target)) {
      creep.drop(RESOURCE_ENERGY);
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
  }
}

module.exports.run = function (creep) {
  if (creep.memory.working && creep.store[RESOURCE_ENERGY] === 0) creep.memory.working = false;
  if (!creep.memory.working && creep.store.getFreeCapacity() === 0) creep.memory.working = true;

  if (creep.memory.working) deliver(creep);
  else collect(creep);
};

module.exports.deliver = deliver;
module.exports.deliveryTarget = deliveryTarget;
