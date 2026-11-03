const defense = require('./defense');

// Salle évitée pendant ce nombre de ticks après y avoir vu des hostiles dangereux.
const HOSTILE_COOLDOWN = 1500;

// Renseignements sur une salle déjà explorée (`room.memory.intel`), ou undefined.
function get(name) {
  return Memory.rooms && Memory.rooms[name] && Memory.rooms[name].intel;
}

// Note ce que la salle contient : sources (nombre et positions), contrôleur, propriétaire, réservation
// et dernier passage d'hostiles. Les positions servent aux mineurs distants, envoyés sans visibilité sur la salle.
function record(room) {
  const c = room.controller;
  const previous = room.memory.intel;
  const sources = room.find(FIND_SOURCES);
  room.memory.intel = {
    time: Game.time,
    sources: sources.length,
    sourcePos: sources.map((s) => ({ id: s.id, x: s.pos.x, y: s.pos.y })),
    controller: !!c,
    owner: c && c.owner ? c.owner.username : null,
    reserved: c && c.reservation ? c.reservation.username : null,
    hostile: defense.threats(room).length ? Game.time : (previous && previous.hostile) || 0,
  };
}

// Salle injoignable : notée comme explorée, sans contrôleur, pour ne plus y être envoyé.
function skip(name) {
  if (!Memory.rooms) Memory.rooms = {};
  if (!Memory.rooms[name]) Memory.rooms[name] = {};
  Memory.rooms[name].intel = { time: Game.time };
}

// Notre nom de joueur, lu sur un spawn (undefined sans spawn).
function me() {
  const spawn = Object.values(Game.spawns)[0];
  return spawn && spawn.owner.username;
}

// Vrai si nous réservons la salle : contrôleur visible, sinon dernier renseignement.
function reservedByMe(name) {
  const room = Game.rooms[name];
  if (room && room.controller) return !!(room.controller.reservation && room.controller.reservation.username === me());
  const i = get(name);
  return !!(i && i.reserved && i.reserved === me());
}

// Salle à Source Keepers : coordonnées 4 à 6 dans le secteur de 10 × 10, hors salle centrale (5, 5).
function keeperRoom(name) {
  const m = /^[WE](\d+)[NS](\d+)$/.exec(name);
  if (!m) return false;
  const x = m[1] % 10;
  const y = m[2] % 10;
  return x >= 4 && x <= 6 && y >= 4 && y <= 6 && !(x === 5 && y === 5);
}

// Statut de la salle (normal, novice, respawn, closed) ; undefined dans le simulateur.
function status(name) {
  return (Game.map.getRoomStatus(name) || {}).status;
}

// Vrai si un créep fragile (claimer, pioneer) ne doit pas traverser la salle : keepers, statut différent de `zone`
// (zones séparées par des murs indestructibles), possédée par un autre joueur (tours) ou hostiles récents.
function avoid(name, zone) {
  const i = get(name);
  return keeperRoom(name) || status(name) !== zone
    || !!(i && i.owner && i.owner !== me()) || !!(i && Game.time - i.hostile < HOSTILE_COOLDOWN);
}

// Salles à traverser de `from` à `to` (format de Game.map.findRoute) sans passer par une salle à éviter (avoid),
// ou null sans trajet sûr.
function route(from, to) {
  const zone = status(from);
  const r = Game.map.findRoute(from, to, { routeCallback: (name) => (avoid(name, zone) ? Infinity : 1) });
  return r === ERR_NO_PATH ? null : r;
}

// Vrai si la salle a un contrôleur libre (ni possédé, ni réservé par un autre) et pas d'hostiles récents.
function safe(name) {
  const i = get(name);
  const room = Game.rooms[name];
  if (room && room.controller && room.controller.my) return false;
  return !!(i && i.controller && !i.owner && (!i.reserved || i.reserved === me())
    && Game.time - i.hostile > HOSTILE_COOLDOWN);
}

module.exports = { get, record, skip, safe, me, reservedByMe, keeperRoom, route };
