const move = require('../move');
const planner = require('../planner');
const sources = require('../sources');
const upgraders = require('./upgrader');

// Chantier prioritaire de la salle : ordre de construction du planner (planner.priority), puis le moins
// de travail restant. Tous les builders y vont ensemble : chaque structure est finie au plus vite.
function target(room, sites) {
  const key = (s) => [planner.priority(room, s.structureType), s.progressTotal - s.progress];
  return sites.reduce((best, s) => {
    if (!best) return s;
    const [p, w] = key(s);
    const [bp, bw] = key(best);
    return p < bp || (p === bp && w < bw) ? s : best;
  }, undefined);
}

// Sous cette part de ses points de vie, une structure est réparée avant toute construction (usure, decay).
const URGENT_RATIO = 0.5;
// Hors chantier, une structure est réparée sous cette part de ses points de vie : l'usure normale d'une route
// (100 PV tous les 1000 ticks) ne mobilise pas les builders à chaque tick, ils améliorent le contrôleur.
const REPAIR_RATIO = 0.8;

// Répare la structure en cours, ou la plus proche sous `ratio` de ses points de vie (hors murs et remparts).
// La cible est gardée jusqu'à réparation complète. Vrai si le créep a une structure à réparer.
function repair(creep, ratio) {
  let damaged = Game.getObjectById(creep.memory.repairId);
  if (!damaged || damaged.hits === damaged.hitsMax) {
    const candidates = creep.room.find(FIND_STRUCTURES, {
      filter: (s) => s.hits < s.hitsMax * ratio
        && s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_RAMPART,
    });
    damaged = candidates.length ? creep.pos.findClosestByPath(candidates) : null;
    creep.memory.repairId = damaged ? damaged.id : undefined;
  }
  if (!damaged) return false;
  const result = creep.repair(damaged);
  if (result === ERR_NOT_IN_RANGE) move.to(creep, damaged);
  else if (result === OK) sources.stepAway(creep);
  return true;
}

// Construit le chantier prioritaire de la salle. Vrai si le créep a un chantier.
// Utilisé aussi par les harvesters pour leur surplus.
function build(creep) {
  // Recalculé à chaque tick (3 chantiers actifs au plus, sans calcul de chemin) : un chantier
  // plus prioritaire apparu entre-temps remplace la cible en cours. siteId sert à wait.
  // Un créep (y compris le builder lui-même) sur le chantier d'une structure bloquante (mur...) empêche de la construire
  // (ERR_INVALID_TARGET) : chantier ignoré tant que la case est occupée, sinon le builder s'y bloquerait indéfiniment.
  const sites = creep.room.find(FIND_MY_CONSTRUCTION_SITES, {
    filter: (s) => !OBSTACLE_OBJECT_TYPES.includes(s.structureType) || !s.pos.lookFor(LOOK_CREEPS).length,
  });
  const site = target(creep.room, sites);
  creep.memory.siteId = site ? site.id : undefined;
  if (!site) return false;
  // Portée 3 : le créep peut construire en s'écartant de la source qu'il bloquerait.
  const result = creep.build(site);
  if (result === ERR_NOT_IN_RANGE) move.to(creep, site, { range: 3 });
  else if (result === OK) sources.stepAway(creep);
  return true;
}

// Remplace la barrière signalée par le planner (room.memory.swapBarrier), une fois tous les chantiers finis :
// détruite seulement à portée de construction, nouveau chantier posé au tick suivant. Vrai si le créep s'en occupe.
function swapBarrier(creep) {
  const swap = creep.room.memory.swapBarrier;
  if (!swap) return false;
  const pos = new RoomPosition(Math.floor(swap.k / 50), swap.k % 50, creep.room.name);
  if (!creep.pos.inRangeTo(pos, 3)) {
    move.to(creep, pos, { range: 3 });
    return true;
  }
  const old = pos.lookFor(LOOK_STRUCTURES)
    .find((s) => s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART);
  if (old) {
    // Refusé tant qu'un hostile est dans la salle : la barrière reste.
    old.destroy();
  } else {
    // En cas d'échec, le planner repose la barrière à son prochain passage.
    pos.createConstructionSite(swap.type);
    delete creep.room.memory.swapBarrier;
  }
  return true;
}

// Vrai si les haulers livrent les builders de la salle : pas de stockage (sinon le builder y puise lui-même)
// et au moins un hauler vivant (sinon personne ne viendrait).
function fed(room) {
  if (room.storage) return false;
  return Object.values(Game.creeps).some((c) => c.memory.role === 'hauler' && c.memory.room === room.name);
}

// Builder vide qui attend un hauler : il ramasse l'énergie au sol adjacente (hors dépôt des upgraders)
// et se poste à portée de sa cible, pour que l'énergie livrée serve sans nouveau trajet.
function wait(creep) {
  if (sources.goBack(creep)) return;
  const controller = creep.room.controller;
  const pile = creep.pos.findInRange(FIND_DROPPED_RESOURCES, 1, {
    filter: (r) => r.resourceType === RESOURCE_ENERGY && !(controller && r.pos.inRangeTo(controller, 3)),
  })[0];
  if (pile) creep.pickup(pile);
  const target = Game.getObjectById(creep.memory.siteId) || Game.getObjectById(creep.memory.repairId);
  if (target && !creep.pos.inRangeTo(target, 3)) move.to(creep, target, { range: 3 });
}

// Répare les structures très abîmées ; sinon construit les chantiers ; sinon remplace la barrière signalée ;
// sinon répare ce qui est sous REPAIR_RATIO ;
// sinon améliore le contrôleur.
// Sans stockage, les haulers apportent l'énergie (hauler.deliveryTarget) : le builder travaille dès qu'il en porte
// et attend sur place sinon, au lieu de marcher jusqu'aux sources. Avec stockage ou sans hauler, il se recharge seul.
module.exports.run = function (creep) {
  const delivered = fed(creep.room);
  if (delivered) {
    creep.memory.working = creep.store[RESOURCE_ENERGY] > 0;
  } else {
    if (creep.memory.working && creep.store[RESOURCE_ENERGY] === 0) creep.memory.working = false;
    if (!creep.memory.working && creep.store.getFreeCapacity() === 0) creep.memory.working = true;
  }
  if (creep.memory.working && sources.goBack(creep)) return;

  if (!creep.memory.working) {
    if (delivered) wait(creep);
    else sources.collect(creep);
    return;
  }

  // Rétrogradation proche (drapeau posé par le spawner) : droit au contrôleur.
  if (!creep.room.memory.downgrade) {
    if (repair(creep, URGENT_RATIO)) return;
    if (build(creep)) return;
    if (swapBarrier(creep)) return;
    if (repair(creep, REPAIR_RATIO)) return;
    // Plus rien à construire ni à réparer : le builder devient upgrader s'il reste une place au dépôt
    // (le spawner ne crée pas d'upgrader pendant les chantiers, ceux-ci prennent le relais).
    const room = creep.room;
    if (room.controller && room.controller.my && !room.find(FIND_MY_CONSTRUCTION_SITES).length) {
      const placed = Object.values(Game.creeps)
        .filter((c) => c.memory.role === 'upgrader' && c.memory.room === room.name).length;
      if (placed < upgraders.spots(room)) {
        creep.memory.role = 'upgrader';
        return;
      }
    }
  }
  if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
    move.to(creep, creep.room.controller);
  }
};

module.exports.build = build;
