const move = require('../move');
const sources = require('../sources');
const defense = require('../defense');

// Sous ce stock d'énergie dans le stockage, l'amélioration s'arrête : l'énergie va au spawn et aux tours.
const STORAGE_LOW = 10000;

// Vrai si l'amélioration doit attendre : stockage bas, ou hostiles dangereux hors mode sans échec.
// Jamais en cas de rétrogradation proche (drapeau room.memory.downgrade posé par le spawner).
function paused(room) {
  if (room.memory.downgrade) return false;
  if (room.storage && room.storage.store[RESOURCE_ENERGY] < STORAGE_LOW) return true;
  return !room.controller.safeMode && defense.threats(room).length > 0;
}

// Sans dépôt (route du planner pas encore tracée) : alterne collecte et amélioration.
function roam(creep) {
  if (creep.memory.working && creep.store[RESOURCE_ENERGY] === 0) creep.memory.working = false;
  if (!creep.memory.working && creep.store.getFreeCapacity() === 0) creep.memory.working = true;
  if (!creep.memory.working) {
    // En pause, il dépense ce qu'il porte déjà au lieu de rester planté avec.
    if (paused(creep.room)) {
      if (creep.store[RESOURCE_ENERGY]) creep.memory.working = true;
      return;
    }
    sources.collect(creep);
  } else if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
    move.to(creep, creep.room.controller);
  }
}

// Poste fixe à côté du dépôt (portée 2 du contrôleur, donc chaque case voisine est à portée 3) :
// les haulers y apportent l'énergie, l'upgrader ne marche plus. À chaque tick il améliore avec ce qu'il porte
// et reprend au dépôt ce qui lui manque (permis au même tick ; l'énergie prise ne sert qu'au tick suivant).
// En pause, il finit ce qu'il porte sans en reprendre.
function run(creep) {
  const room = creep.room;
  // Temps de trajet depuis le spawn, noté à la première arrivée au contrôleur : le spawner lance le successeur
  // assez tôt pour qu'il arrive quand cet upgrader meurt.
  if (creep.memory.travel === undefined && creep.pos.inRangeTo(room.controller, 3)) {
    creep.memory.travel = CREEP_LIFE_TIME - creep.ticksToLive;
  }
  if (sources.goBack(creep)) return;
  const depot = room.controller && room.controller.my && sources.depot(room);
  if (!depot) {
    roam(creep);
    return;
  }

  if (creep.pos.isEqualTo(depot.pos) && !depot.container) {
    // Case du tas : les haulers doivent pouvoir s'y poser, on se décale vers le contrôleur (toujours voisin du dépôt).
    move.to(creep, room.controller, { range: 1 });
  } else if (!creep.pos.isNearTo(depot.pos)) {
    move.to(creep, depot.pos, { range: 1 });
  } else if (!paused(room) && creep.store.getFreeCapacity(RESOURCE_ENERGY)) {
    const pile = !depot.container && sources.depotPile(depot);
    if (pile) creep.pickup(pile);
    else if (depot.container && depot.container.store[RESOURCE_ENERGY]) creep.withdraw(depot.container, RESOURCE_ENERGY);
  }
  if (creep.store[RESOURCE_ENERGY]) creep.upgradeController(room.controller);
}

module.exports = { run, paused };
