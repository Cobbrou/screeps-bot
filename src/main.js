// Point d'entrée du bot : le runtime Screeps appelle `loop` à chaque tick.
// Garder cette fonction légère et déléguer la logique aux modules dédiés.
const memory = require('./memory');
const spawner = require('./spawner');
const planner = require('./planner');
const defense = require('./defense');
const expansion = require('./expansion');
const market = require('./market');
const stats = require('./stats');
const move = require('./move');
const roles = {
  harvester: require('./roles/harvester'),
  upgrader: require('./roles/upgrader'),
  builder: require('./roles/builder'),
  miner: require('./roles/miner'),
  hauler: require('./roles/hauler'),
  filler: require('./roles/filler'),
  defender: require('./roles/defender'),
  scout: require('./roles/scout'),
  claimer: require('./roles/claimer'),
  pioneer: require('./roles/pioneer'),
  remoteMiner: require('./roles/remoteMiner'),
  remoteHauler: require('./roles/remoteHauler'),
  reserver: require('./roles/reserver'),
  remoteBuilder: require('./roles/remoteBuilder'),
  remoteDefender: require('./roles/remoteDefender'),
  mineralMiner: require('./roles/mineralMiner'),
  mineralHauler: require('./roles/mineralHauler'),
};

module.exports.loop = function () {
  memory.cleanup();
  stats.measure('defense', defense.run);
  stats.measure('spawner', spawner.run);
  stats.measure('creeps', () => {
    for (const name in Game.creeps) {
      const creep = Game.creeps[name];
      const role = roles[creep.memory.role];
      if (!role) continue;
      // Un créep en erreur ne doit pas empêcher les autres de jouer.
      try {
        role.run(creep);
      } catch (e) {
        console.log(`[${name}] ${e.stack || e}`);
      }
    }
    // Pas notés par les rôles, exécutés ensemble pour pousser les créeps qui barrent la route.
    move.run();
  });
  // Planification, expansion et ventes sautées quand le bucket est bas : non essentielles.
  if (!stats.lowBucket()) {
    stats.measure('planner', planner.run);
    stats.measure('expansion', expansion.run);
    stats.measure('market', market.run);
  }
  stats.run();
};
