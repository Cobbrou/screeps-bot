const move = require('../move');
const sources = require('../sources');
const builder = require('./builder');

// Récolte l'énergie et remplit spawn, extensions puis tours ; s'ils sont pleins, construit, sinon améliore le contrôleur.
module.exports.run = function (creep) {
  if (creep.memory.working && creep.store[RESOURCE_ENERGY] === 0) creep.memory.working = false;
  if (!creep.memory.working && creep.store.getFreeCapacity() === 0) creep.memory.working = true;
  if (creep.memory.working && sources.goBack(creep)) return;

  if (!creep.memory.working) {
    sources.harvest(creep);
    return;
  }

  // Cible gardée en mémoire tant qu'elle a de la place : évite un calcul de chemin à chaque tick.
  let target = Game.getObjectById(creep.memory.targetId);
  // Spawn et extensions d'abord, puis les tours : sans hauler, personne d'autre ne les remplit.
  if (!target || !target.store.getFreeCapacity(RESOURCE_ENERGY)) {
    const needs = (types) => (s) => types.includes(s.structureType) && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
    target = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, { filter: needs([STRUCTURE_SPAWN, STRUCTURE_EXTENSION]) })
      || creep.pos.findClosestByPath(FIND_MY_STRUCTURES, { filter: needs([STRUCTURE_TOWER]) });
    creep.memory.targetId = target ? target.id : undefined;
  }
  if (target) {
    if (creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) move.to(creep, target);
    return;
  }
  // Tout est plein : le surplus construit les chantiers (extensions surtout) avant d'aller au contrôleur.
  if (builder.build(creep)) return;
  if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
    move.to(creep, creep.room.controller);
  }
};
