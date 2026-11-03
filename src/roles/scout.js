const move = require('../move');
const intel = require('../intel');

// Voisines où l'éclaireur peut aller : même statut (zones novices ou fermées infranchissables),
// salles à keepers évitées (les keepers tuent l'éclaireur, qui n'y apprendrait rien d'utile) sauf s'il n'y a rien d'autre (éclaireur déjà dans un secteur de keepers).
// getRoomStatus renvoie undefined dans le simulateur (salle « sim ») : pas de statut, pas de voisine.
function exits(here) {
  const statusOf = (name) => (Game.map.getRoomStatus(name) || {}).status;
  const status = statusOf(here);
  if (!status) return [];
  const open = Object.values(Game.map.describeExits(here) || {})
    .filter((name) => statusOf(name) === status);
  const calm = open.filter((name) => !intel.keeperRoom(name));
  return calm.length ? calm : open;
}

module.exports.exits = exits;

// Explore les salles voisines, en allant toujours vers celle visitée il y a le plus longtemps.
module.exports.run = function (creep) {
  const here = creep.room.name;
  if (creep.memory.scanned !== here) {
    intel.record(creep.room);
    creep.memory.scanned = here;
  }
  if (!creep.memory.target || creep.memory.target === here) {
    const list = exits(here);
    const age = (name) => (intel.get(name) ? intel.get(name).time : 0);
    creep.memory.target = list.reduce((a, b) => (age(b) < age(a) ? b : a), list[0]);
  }
  if (!creep.memory.target) return;
  // Portée 22 depuis le centre : il suffit d'entrer dans la salle, la case centrale peut être un mur.
  const result = move.to(creep, new RoomPosition(25, 25, creep.memory.target), { range: 22, reusePath: 50 });
  if (result === ERR_NO_PATH) {
    intel.skip(creep.memory.target);
    delete creep.memory.target;
  }
};
