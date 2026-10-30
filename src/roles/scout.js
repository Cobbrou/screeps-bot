const move = require('../move');
const intel = require('../intel');

// Explore les salles voisines, en allant toujours vers celle visitée il y a le plus longtemps.
module.exports.run = function (creep) {
  const here = creep.room.name;
  if (creep.memory.scanned !== here) {
    intel.record(creep.room);
    creep.memory.scanned = here;
  }
  if (!creep.memory.target || creep.memory.target === here) {
    // Seulement les salles de même statut : les zones novices ou fermées sont infranchissables.
    const status = Game.map.getRoomStatus(here).status;
    const exits = Object.values(Game.map.describeExits(here))
      .filter((name) => Game.map.getRoomStatus(name).status === status);
    const age = (name) => (intel.get(name) ? intel.get(name).time : 0);
    creep.memory.target = exits.reduce((a, b) => (age(b) < age(a) ? b : a), exits[0]);
  }
  if (!creep.memory.target) return;
  // Portée 22 depuis le centre : il suffit d'entrer dans la salle, la case centrale peut être un mur.
  const result = move.to(creep, new RoomPosition(25, 25, creep.memory.target), { range: 22, reusePath: 50 });
  if (result === ERR_NO_PATH) {
    intel.skip(creep.memory.target);
    delete creep.memory.target;
  }
};
