const move = require('../move');
const intel = require('../intel');

// Salle à Source Keepers : coordonnées 4 à 6 dans le secteur de 10 × 10, hors salle centrale (5, 5).
// Les keepers tuent l'éclaireur, qui n'y apprendrait rien d'utile (pas de contrôleur).
function keeperRoom(name) {
  const m = /^[WE](\d+)[NS](\d+)$/.exec(name);
  if (!m) return false;
  const x = m[1] % 10;
  const y = m[2] % 10;
  return x >= 4 && x <= 6 && y >= 4 && y <= 6 && !(x === 5 && y === 5);
}

// Voisines où l'éclaireur peut aller : même statut (zones novices ou fermées infranchissables),
// salles à keepers évitées sauf s'il n'y a rien d'autre (éclaireur déjà dans un secteur de keepers).
// getRoomStatus renvoie undefined dans le simulateur (salle « sim ») : pas de statut, pas de voisine.
function exits(here) {
  const statusOf = (name) => (Game.map.getRoomStatus(name) || {}).status;
  const status = statusOf(here);
  if (!status) return [];
  const open = Object.values(Game.map.describeExits(here) || {})
    .filter((name) => statusOf(name) === status);
  const calm = open.filter((name) => !keeperRoom(name));
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
