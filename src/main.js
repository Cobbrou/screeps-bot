// Point d'entrée du bot : le runtime Screeps appelle `loop` à chaque tick.
// Garder cette fonction légère et déléguer la logique aux modules dédiés.
const memory = require('./memory');
const spawner = require('./spawner');
const planner = require('./planner');
const defense = require('./defense');
const roles = {
  harvester: require('./roles/harvester'),
  upgrader: require('./roles/upgrader'),
  builder: require('./roles/builder'),
  miner: require('./roles/miner'),
  hauler: require('./roles/hauler'),
  defender: require('./roles/defender'),
};

module.exports.loop = function () {
  memory.cleanup();
  defense.run();
  spawner.run();
  for (const name in Game.creeps) {
    const creep = Game.creeps[name];
    const role = roles[creep.memory.role];
    if (role) role.run(creep);
  }
  planner.run();
};
