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
  const threats = defense.threats(room);
  room.memory.intel = {
    time: Game.time,
    sources: sources.length,
    sourcePos: sources.map((s) => ({ id: s.id, x: s.pos.x, y: s.pos.y })),
    controller: !!c,
    owner: c && c.owner ? c.owner.username : null,
    reserved: c && c.reservation ? c.reservation.username : null,
    hostile: threats.length ? Game.time : (previous && previous.hostile) || 0,
    // Vrai si les derniers hostiles vus n'étaient que des Invaders : seuls ceux-là sont chassés (remoteDefender).
    invader: threats.length ? threats.every((c) => c.owner.username === defense.INVADER) : !!(previous && previous.invader),
    // Cœur d'Invader présent : il réserve le contrôleur, aucune récolte possible tant qu'il tient (remoteDefender).
    core: !!core(room),
  };
}

// Cœur d'Invader de la salle, ou undefined.
function core(room) {
  return room.find(FIND_HOSTILE_STRUCTURES, { filter: (s) => s.structureType === STRUCTURE_INVADER_CORE })[0];
}

// Réenregistre la salle où se trouve un de nos créeps si elle a des hostiles dangereux, ou si son propriétaire
// ou sa réservation n'est plus celui noté : salle distante prise ou réservée par un joueur, cœur d'Invader.
// Sans ça, l'intel ne changeait qu'au passage de l'éclaireur (SCOUT_REFRESH) et les créeps distants, recréés
// à chaque mort, continuaient d'y aller sous les tours ou sans pouvoir récolter.
function watch(room) {
  const c = room.controller;
  const i = room.memory.intel;
  const owner = c && c.owner ? c.owner.username : null;
  const reserved = c && c.reservation ? c.reservation.username : null;
  if (!i || i.owner !== owner || i.reserved !== reserved || !!i.core !== !!core(room) || defense.threats(room).length) record(room);
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

// Vrai si la salle est possédée ou réservée par un ami (defense.FRIENDS) d'après le dernier renseignement :
// aucun de nos créeps n'y va, pas même l'éclaireur.
function friendly(name) {
  const i = get(name);
  return !!(i && (defense.FRIENDS.includes(i.owner) || defense.FRIENDS.includes(i.reserved)));
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
// (zones séparées par des murs indestructibles), possédée par un autre joueur (tours), réservée par un ami ou hostiles récents.
function avoid(name, zone) {
  const i = get(name);
  return keeperRoom(name) || status(name) !== zone || friendly(name)
    || !!(i && i.owner && i.owner !== me()) || !!(i && Game.time - i.hostile < HOSTILE_COOLDOWN);
}

// Salles à traverser de `from` à `to` (format de Game.map.findRoute) sans passer par une salle à éviter (avoid),
// ou null sans trajet sûr.
function route(from, to) {
  const zone = status(from);
  const r = Game.map.findRoute(from, to, { routeCallback: (name) => (avoid(name, zone) ? Infinity : 1) });
  return r === ERR_NO_PATH ? null : r;
}

// Vrai si la réservation notée est le reste d'un cœur d'Invader détruit : le reserver la retire (attackController),
// et la récolte attend qu'elle tombe (harvest refusé sur un contrôleur réservé par un autre).
function invaderReserved(name) {
  const i = get(name);
  return !!(i && i.reserved === defense.INVADER && !i.core);
}

// Vrai si le contrôleur est libre : ni possédé, ni réservé par un autre que nous (reste d'un cœur détruit admis).
function free(name) {
  const i = get(name);
  return !!(i && i.controller && !i.owner && (!i.reserved || i.reserved === me() || invaderReserved(name)));
}

// Vrai si la salle a un contrôleur libre (voir free) et pas d'hostiles récents.
function safe(name) {
  const room = Game.rooms[name];
  if (room && room.controller && room.controller.my) return false;
  return free(name) && Game.time - get(name).hostile > HOSTILE_COOLDOWN;
}

// Vrai si un remoteDefender doit y aller : cœur d'Invader (hors salle à keepers, où sont les forteresses à tours),
// ou salle qui serait sûre sans les Invaders passés depuis moins de HOSTILE_COOLDOWN ticks.
function invaded(name) {
  const i = get(name);
  if (!i || !i.controller || i.owner || keeperRoom(name)) return false;
  return !!i.core || (i.invader && free(name) && Game.time - i.hostile <= HOSTILE_COOLDOWN);
}

// Salle vue sans créep hostile par notre défenseur : elle redevient sûre tout de suite (le cœur reste noté à part).
function clear(name) {
  const i = get(name);
  if (i) Object.assign(i, { hostile: 0, invader: false });
}

module.exports = { get, record, watch, skip, safe, invaded, invaderReserved, core, clear, me, reservedByMe, keeperRoom, friendly, route };
