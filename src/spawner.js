// Nombre de créeps voulu par rôle, dans l'ordre de priorité.
const TARGETS = { harvester: 2, upgrader: 2 };
// Corps minimal (200 énergie), à faire grossir avec la capacité de la salle.
const BODY = [WORK, CARRY, MOVE];

module.exports.run = function () {
  const counts = {};
  for (const name in Game.creeps) {
    const role = Game.creeps[name].memory.role;
    counts[role] = (counts[role] || 0) + 1;
  }

  for (const name in Game.spawns) {
    const spawn = Game.spawns[name];
    if (spawn.spawning) continue;
    for (const role in TARGETS) {
      if ((counts[role] || 0) >= TARGETS[role]) continue;
      if (spawn.spawnCreep(BODY, `${role}-${Game.time}`, { memory: { role } }) === OK) {
        counts[role] = (counts[role] || 0) + 1;
      }
      break;
    }
  }
};
