const move = require('../move');
const sources = require('../sources');

// Écart toléré entre le chantier le plus court et ceux qu'on accepte comme cible (×1,5).
// Assez large pour ne pas courir après une route à moitié finie à l'autre bout de la salle,
// assez serré pour séparer extensions (3000 points) et conteneurs (5000 points).
const WORK_SPREAD = 1.5;

// Travail restant d'un chantier : les plus courts d'abord (routes, puis extensions, puis conteneurs…).
// Le spawn passe avant tout. Les extensions précèdent les conteneurs : la capacité finance des mineurs
// complets, alors que sans conteneur les mineurs posent simplement l'énergie au sol.
function work(site) {
  if (site.structureType === STRUCTURE_SPAWN) return 0;
  return site.progressTotal - site.progress;
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

// Construit le chantier prioritaire de la salle (spawn, conteneurs, puis le moins de travail restant).
// Vrai si le créep a un chantier. Utilisé aussi par les harvesters pour leur surplus.
function build(creep) {
  // Cibles gardées en mémoire tant qu'elles restent valides : évite un calcul de chemin à chaque tick.
  // Un chantier bien plus court apparu entre-temps remplace la cible en cours.
  let site = Game.getObjectById(creep.memory.siteId);
  const sites = creep.room.find(FIND_MY_CONSTRUCTION_SITES);
  const limit = Math.min(...sites.map(work)) * WORK_SPREAD;
  if (!site || work(site) > limit) {
    site = creep.pos.findClosestByPath(sites.filter((s) => work(s) <= limit));
    creep.memory.siteId = site ? site.id : undefined;
  }
  if (!site) return false;
  // Portée 3 : le créep peut construire en s'écartant de la source qu'il bloquerait.
  const result = creep.build(site);
  if (result === ERR_NOT_IN_RANGE) move.to(creep, site);
  else if (result === OK) sources.stepAway(creep);
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

// Répare les structures très abîmées ; sinon construit les chantiers ; sinon répare ce qui est sous REPAIR_RATIO ;
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
    if (repair(creep, REPAIR_RATIO)) return;
  }
  if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
    move.to(creep, creep.room.controller);
  }
};

module.exports.build = build;
