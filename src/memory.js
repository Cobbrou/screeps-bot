// Supprime de Memory les créeps qui n'existent plus.
module.exports.cleanup = function () {
  for (const name in Memory.creeps) {
    if (!Game.creeps[name]) delete Memory.creeps[name];
  }
};
