const move = require('../move');
const sources = require('../sources');
const defense = require('../defense');

// Retrait minimal dans le conteneur du contrôleur, comme MIN_WITHDRAW dans sources.js.
const MIN_WITHDRAW = 100;
// Sous ce stock d'énergie dans le stockage, l'amélioration s'arrête : l'énergie va au spawn et aux tours.
const STORAGE_LOW = 10000;

// Vrai si l'amélioration doit attendre : stockage bas, ou hostiles dangereux hors mode sans échec.
// Jamais en cas de rétrogradation proche (drapeau room.memory.downgrade posé par le spawner).
function paused(room) {
  if (room.memory.downgrade) return false;
  if (room.storage && room.storage.store[RESOURCE_ENERGY] < STORAGE_LOW) return true;
  return !room.controller.safeMode && defense.threats(room).length > 0;
}

// Alterne entre récolte et amélioration du contrôleur de la salle.
// En pause, l'upgrader finit l'énergie qu'il porte mais n'en reprend pas.
function run(creep) {
  // Temps de trajet depuis le spawn, noté à la première arrivée au contrôleur : le spawner lance le successeur
  // assez tôt pour qu'il arrive quand cet upgrader meurt.
  // ponytail: sans conteneur au contrôleur, le premier trajet passe par une source et surestime : remplaçant un peu tôt.
  if (creep.memory.travel === undefined && creep.pos.inRangeTo(creep.room.controller, 3)) {
    creep.memory.travel = CREEP_LIFE_TIME - creep.ticksToLive;
  }
  if (creep.memory.working && creep.store[RESOURCE_ENERGY] === 0) creep.memory.working = false;
  if (!creep.memory.working && creep.store.getFreeCapacity() === 0) creep.memory.working = true;
  if (creep.memory.working && sources.goBack(creep)) return;

  if (!creep.memory.working) {
    if (paused(creep.room)) {
      // Il dépense ce qu'il porte déjà au lieu de rester planté avec.
      if (creep.store[RESOURCE_ENERGY]) creep.memory.working = true;
      return;
    }
    // Le conteneur du contrôleur passe avant tout : sinon le withdrawId de collect reste collé
    // au conteneur d'une source, toujours plein, loin du contrôleur.
    const box = sources.container(creep.room.controller, 2);
    const need = Math.min(creep.store.getFreeCapacity(RESOURCE_ENERGY), MIN_WITHDRAW);
    if (box && box.store[RESOURCE_ENERGY] >= need) {
      if (creep.withdraw(box, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) move.to(creep, box);
    } else {
      sources.collect(creep);
    }
  } else if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
    move.to(creep, creep.room.controller);
  }
}

module.exports = { run, paused };
