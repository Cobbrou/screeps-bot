const move = require('../move');
const builder = require('./builder');
const carrier = require('./carrier');
const expansion = require('../expansion');
const remoteMining = require('../remoteMining');

// Ticks avant rétrogradation sous lesquels le pioneer améliore le contrôleur d'une salle sans spawn (E24S3 repasse
// au RCL 3 vers le tick 79349669, puis au RCL 2 : plus de tour).
const DOWNGRADE_GUARD = 5000;

// Créep d'amorçage : rejoint la salle revendiquée par le trajet sûr (move.travel) puis y récolte et construit comme un builder (spawn d'abord).
// Sans trajet sûr, ou salle à nous passée par des hostiles armés (expansion.raided) : se recycle chez lui au lieu
// d'attendre sa mort (le spawner en recrée à la réouverture).
module.exports.run = function (creep) {
  if (creep.room.name !== creep.memory.target) {
    const target = Game.rooms[creep.memory.target];
    const held = target && target.controller && target.controller.my && expansion.raided(target);
    if ((held || !move.travel(creep, creep.memory.target)) && Game.rooms[creep.memory.room]) {
      remoteMining.goRecycle(creep, Game.rooms[creep.memory.room]);
    }
    return;
  }
  // Ruines de l'ancien propriétaire d'abord : un plein en quelques ticks, contre ~25 à la source.
  const ruin = !creep.memory.working && creep.store.getFreeCapacity() > 0
    && carrier.remains(creep, (r) => r === RESOURCE_ENERGY);
  if (ruin) {
    if (creep.withdraw(ruin.from, ruin.resource) === ERR_NOT_IN_RANGE) move.to(creep, ruin.from);
    return;
  }
  // RCL 2 avant le spawn : 200 d'énergie, et le mode sans échec devient disponible (un par niveau gagné).
  // Salle sans spawn proche de la rétrogradation (aucun upgrader pour la tenir) : le niveau des tours passe avant.
  const c = creep.room.controller;
  const low = c.ticksToDowngrade < DOWNGRADE_GUARD && !creep.room.find(FIND_MY_SPAWNS).length;
  if ((c.level < 2 || low) && creep.memory.working && creep.store[RESOURCE_ENERGY]) {
    if (creep.upgradeController(c) === ERR_NOT_IN_RANGE) move.to(creep, c, { range: 3 });
    return;
  }
  builder.run(creep);
};
