const move = require('./move');

// Renseignements plus vieux que ce délai supprimés, vérifiés tous les INTEL_CHECK ticks.
const INTEL_TTL = 50000;
const INTEL_CHECK = 1000;

// Supprime de Memory les créeps qui n'existent plus et les renseignements périmés sur les salles.
module.exports.cleanup = function () {
  for (const name in Memory.creeps) {
    if (!Game.creeps[name]) {
      delete Memory.creeps[name];
      move.forget(name);
    }
  }
  if (Game.time % INTEL_CHECK) return;
  for (const name in Memory.rooms) {
    const room = Memory.rooms[name];
    if (room.intel && Game.time - room.intel.time > INTEL_TTL) delete room.intel;
    if (!Object.keys(room).length) delete Memory.rooms[name];
  }
};
