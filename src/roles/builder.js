const move = require('../move');
const sources = require('../sources');

// Écart toléré entre le chantier le plus court et ceux qu'on accepte comme cible (×1,5).
// Assez large pour ne pas courir après une route à moitié finie à l'autre bout de la salle,
// assez serré pour séparer extensions (3000 points) et conteneurs (5000 points).
const WORK_SPREAD = 1.5;

// Travail restant d'un chantier : les plus courts d'abord (routes, puis extensions…).
// Le spawn passe avant tout, puis les conteneurs : ils débloquent la récolte statique (miners et haulers).
function work(site) {
  if (site.structureType === STRUCTURE_SPAWN) return 0;
  if (site.structureType === STRUCTURE_CONTAINER) return 1;
  return site.progressTotal - site.progress;
}

// Sous cette part de ses points de vie, une structure est réparée avant toute construction (usure, decay).
const URGENT_RATIO = 0.5;

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

// Répare les structures très abîmées ; sinon construit les chantiers ; sinon répare le reste ;
// sinon améliore le contrôleur.
module.exports.run = function (creep) {
  if (creep.memory.working && creep.store[RESOURCE_ENERGY] === 0) creep.memory.working = false;
  if (!creep.memory.working && creep.store.getFreeCapacity() === 0) creep.memory.working = true;
  if (creep.memory.working && sources.goBack(creep)) return;

  if (!creep.memory.working) {
    sources.collect(creep);
    return;
  }

  if (repair(creep, URGENT_RATIO)) return;
  if (build(creep)) return;
  if (repair(creep, 1)) return;
  if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
    move.to(creep, creep.room.controller);
  }
};

module.exports.build = build;
