// Point d'entrée du bot : le runtime Screeps appelle `loop` à chaque tick.
// Garder cette fonction légère et déléguer la logique aux modules dédiés.
const memory = require('./memory');
const spawner = require('./spawner');
const planner = require('./planner');
const defense = require('./defense');
const stats = require('./stats');
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
  stats.measure('defense', defense.run);
  stats.measure('spawner', spawner.run);
  stats.measure('creeps', () => {
    for (const name in Game.creeps) {
      const creep = Game.creeps[name];
      const role = roles[creep.memory.role];
      if (role) role.run(creep);
    }
  });
  // Planification sautée quand le bucket est bas : c'est le module le plus coûteux.
  if (!stats.lowBucket()) stats.measure('planner', planner.run);
  stats.run();
};
