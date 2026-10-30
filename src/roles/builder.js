const move = require('../move');
const sources = require('../sources');

// Écart toléré entre le chantier le plus court et ceux qu'on accepte comme cible (×1,5).
// Assez large pour ne pas courir après une route à moitié finie à l'autre bout de la salle,
// assez serré pour séparer extensions (3000 points) et conteneurs (5000 points).
const WORK_SPREAD = 1.5;

// Travail restant d'un chantier : les plus courts d'abord (routes, puis extensions…). Le spawn passe avant tout.
const work = (site) => (site.structureType === STRUCTURE_SPAWN ? 0 : site.progressTotal - site.progress);

// Construit les chantiers ; sinon répare (hors murs et remparts) ; sinon améliore le contrôleur.
module.exports.run = function (creep) {
  if (creep.memory.working && creep.store[RESOURCE_ENERGY] === 0) creep.memory.working = false;
  if (!creep.memory.working && creep.store.getFreeCapacity() === 0) creep.memory.working = true;
  if (creep.memory.working && sources.goBack(creep)) return;

  if (!creep.memory.working) {
    sources.collect(creep);
    return;
  }

  // Cibles gardées en mémoire tant qu'elles restent valides : évite un calcul de chemin à chaque tick.
  // Un chantier bien plus court apparu entre-temps remplace la cible en cours.
  let site = Game.getObjectById(creep.memory.siteId);
  const sites = creep.room.find(FIND_MY_CONSTRUCTION_SITES);
  const limit = Math.min(...sites.map(work)) * WORK_SPREAD;
  if (!site || work(site) > limit) {
    site = creep.pos.findClosestByPath(sites.filter((s) => work(s) <= limit));
    creep.memory.siteId = site ? site.id : undefined;
  }
  if (site) {
    // Portée 3 : le créep peut construire en s'écartant de la source qu'il bloquerait.
    const result = creep.build(site);
    if (result === ERR_NOT_IN_RANGE) move.to(creep, site);
    else if (result === OK) sources.stepAway(creep);
    return;
  }

  let damaged = Game.getObjectById(creep.memory.repairId);
  if (!damaged || damaged.hits === damaged.hitsMax) {
    damaged = creep.pos.findClosestByPath(FIND_STRUCTURES, {
      filter: (s) => s.hits < s.hitsMax
        && s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_RAMPART,
    });
    creep.memory.repairId = damaged ? damaged.id : undefined;
  }
  if (damaged) {
    const result = creep.repair(damaged);
    if (result === ERR_NOT_IN_RANGE) move.to(creep, damaged);
    else if (result === OK) sources.stepAway(creep);
  } else if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
    move.to(creep, creep.room.controller);
  }
};
