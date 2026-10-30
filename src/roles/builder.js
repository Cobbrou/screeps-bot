const sources = require('../sources');

// Ordre de construction : le plus utile d'abord ; conteneurs (5000 points) et routes en dernier.
const PRIORITY = {
  [STRUCTURE_SPAWN]: 0, [STRUCTURE_EXTENSION]: 1, [STRUCTURE_TOWER]: 2,
  [STRUCTURE_STORAGE]: 3, [STRUCTURE_CONTAINER]: 5, [STRUCTURE_ROAD]: 6,
};
const rank = (site) => (PRIORITY[site.structureType] !== undefined ? PRIORITY[site.structureType] : 4);

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
  // Un chantier plus prioritaire apparu entre-temps remplace la cible en cours.
  let site = Game.getObjectById(creep.memory.siteId);
  const sites = creep.room.find(FIND_MY_CONSTRUCTION_SITES);
  const best = Math.min(...sites.map(rank));
  if (!site || rank(site) > best) {
    site = creep.pos.findClosestByPath(sites.filter((s) => rank(s) === best));
    creep.memory.siteId = site ? site.id : undefined;
  }
  if (site) {
    // Portée 3 : le créep peut construire en s'écartant de la source qu'il bloquerait.
    const result = creep.build(site);
    if (result === ERR_NOT_IN_RANGE) creep.moveTo(site);
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
    if (result === ERR_NOT_IN_RANGE) creep.moveTo(damaged);
    else if (result === OK) sources.stepAway(creep);
  } else if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
    creep.moveTo(creep.room.controller);
  }
};
