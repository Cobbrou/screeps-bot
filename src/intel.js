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

// Vrai si la salle a un contrôleur libre (ni possédé, ni réservé par un autre) et pas d'hostiles récents.
function safe(name) {
  const i = get(name);
  const room = Game.rooms[name];
  if (room && room.controller && room.controller.my) return false;
  return !!(i && i.controller && !i.owner && (!i.reserved || i.reserved === me())
    && Game.time - i.hostile > HOSTILE_COOLDOWN);
}

module.exports = { get, record, skip, safe, me, reservedByMe };
