const defense = require('./defense');

// Salle évitée pendant ce nombre de ticks après y avoir vu des hostiles dangereux (Invaders seuls : jusqu'à leur mort, voir record).
const HOSTILE_COOLDOWN = 1500;
// Propriétaire des Source Keepers : toujours là, ils ne rendent pas leur salle dangereuse (voir remoteMining.dodge).
const KEEPER = 'Source Keeper';

// Hostiles dangereux de la salle, Source Keepers exclus.
function threats(room) {
  return defense.threats(room).filter((c) => c.owner.username !== KEEPER);
}

// Puissance par tick des parties `part` actives de ces créeps, boosts compris (`action` : clé de BOOSTS).
function power(creeps, part, base, action) {
  return creeps.reduce((sum, c) => sum + c.body.reduce((s, p) => s + (p.type === part && p.hits
    ? base * (p.boost ? BOOSTS[part][p.boost][action] : 1) : 0), 0), 0);
}

// PV à abattre d'un créep : une partie TOUGH boostée ne prend qu'une part des dégâts (XGHO2 : 30 %), ses PV comptent d'autant plus.
function effectiveHits(creep) {
  return creep.body.reduce((sum, p) => sum + p.hits / (p.type === TOUGH && p.boost ? BOOSTS[TOUGH][p.boost].damage : 1), 0);
}

// Force d'un groupe d'hostiles : soin s'ils soignent tous la même cible (au contact), tir à distance cumulé, PV à abattre,
// et le détail par créep (`creeps`), qui laisse remoteMining.huntable les abattre un à un, healers d'abord.
// ponytail: ATTACK ignoré (le tueur tire à portée 3 et s'écarte au contact).
function force(creeps) {
  const one = (c) => ({
    heal: power([c], HEAL, HEAL_POWER, 'heal'),
    damage: power([c], RANGED_ATTACK, RANGED_ATTACK_POWER, 'rangedAttack'),
    hits: Math.round(effectiveHits(c)),
  });
  const list = creeps.map(one);
  const sum = (key) => list.reduce((s, c) => s + c[key], 0);
  return { heal: sum('heal'), damage: sum('damage'), hits: sum('hits'), creeps: list };
}

// Renseignements sur une salle déjà explorée (`room.memory.intel`), ou undefined.
function get(name) {
  return Memory.rooms && Memory.rooms[name] && Memory.rooms[name].intel;
}

// Date notée du passage d'hostiles (`intel.hostile`) : la salle reste fermée HOSTILE_COOLDOWN ticks après.
// Que des Invaders : ils ne partent pas et meurent à la fin de leur vie, la fermeture s'arrête à la mort du dernier.
// Le 2026-11-22 sur E25S4, sans personne pour les voir partir, la salle restait fermée 1 500 ticks après le dernier
// passage, jusqu'à 1h30 après leur mort.
function hostileTime(hostiles) {
  if (!hostiles.every((c) => c.owner.username === defense.INVADER)) return Game.time;
  return Game.time + Math.max(...hostiles.map((c) => c.ticksToLive || 0)) - HOSTILE_COOLDOWN;
}

// Note ce que la salle contient : sources (nombre et positions), contrôleur, propriétaire, réservation
// et dernier passage d'hostiles. Les positions servent aux mineurs distants, envoyés sans visibilité sur la salle.
function record(room) {
  const c = room.controller;
  const previous = room.memory.intel;
  const sources = room.find(FIND_SOURCES);
  const hostiles = threats(room);
  room.memory.intel = {
    time: Game.time,
    sources: sources.length,
    sourcePos: sources.map((s) => ({ id: s.id, x: s.pos.x, y: s.pos.y })),
    controller: !!c,
    owner: c && c.owner ? c.owner.username : null,
    reserved: c && c.reservation ? c.reservation.username : null,
    hostile: hostiles.length ? hostileTime(hostiles) : (previous && previous.hostile) || 0,
    // Vrai si les derniers hostiles vus n'étaient que des Invaders : seuls ceux-là sont chassés (remoteDefender).
    invader: hostiles.length ? hostiles.every((c) => c.owner.username === defense.INVADER) : !!(previous && previous.invader),
    // Force des derniers hostiles vus (soin, tir, PV) : le tueur de keepers ne les attaque que s'il gagne (remoteMining.huntable).
    force: hostiles.length ? force(hostiles) : (previous && previous.force) || null,
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
  if (!i || i.owner !== owner || i.reserved !== reserved || !!i.core !== !!core(room) || threats(room).length) record(room);
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

// Vrai si la salle a un contrôleur libre (voir free) et pas d'hostiles récents. Salle à keepers (sans contrôleur) :
// explorée et sans cœur d'Invader, celui des forteresses qui y apparaissent avec leurs tours ; les keepers ne comptent pas.
// Des Invaders y sont tirés par le tueur de keepers (keeperInvaded), qui la rouvre dès qu'il n'en voit plus (clear).
function safe(name) {
  return reopenIn(name) === 0;
}

// Ticks avant que la salle redevienne sûre (voir safe) : 0 si elle l'est, la fin de HOSTILE_COOLDOWN après des hostiles,
// Infinity si elle ne le redeviendra pas d'elle-même (à nous, prise, réservée, cœur d'Invader, inconnue).
function reopenIn(name) {
  const room = Game.rooms[name];
  if (room && room.controller && room.controller.my) return Infinity;
  const i = get(name);
  const open = keeperRoom(name) ? !!(i && i.sourcePos && !i.core) : free(name);
  return open ? Math.max(0, i.hostile + HOSTILE_COOLDOWN + 1 - Game.time) : Infinity;
}

// Vrai si un remoteDefender doit y aller : cœur d'Invader (hors salle à keepers, où sont les forteresses à tours),
// ou salle qui serait sûre sans les Invaders passés depuis moins de HOSTILE_COOLDOWN ticks.
function invaded(name) {
  const i = get(name);
  if (!i || !i.controller || i.owner || keeperRoom(name)) return false;
  return !!i.core || (i.invader && free(name) && Game.time - i.hostile <= HOSTILE_COOLDOWN);
}

// Salle à keepers explorée, sans forteresse, fermée seulement par des Invaders vus depuis moins de HOSTILE_COOLDOWN ticks :
// le tueur de keepers y va quand même et les abat (le remoteDefender, sans soin ni fuite, n'y tiendrait pas face aux keepers).
// Leur force (`force` : soin, tir, PV) est comparée à celle du tueur par remoteMining.huntable.
function keeperInvaded(name) {
  const i = get(name);
  return keeperRoom(name) && !!(i && i.sourcePos && !i.core && i.invader) && Game.time - i.hostile <= HOSTILE_COOLDOWN;
}

// Salle vue sans créep hostile par notre défenseur : elle redevient sûre tout de suite (le cœur reste noté à part).
function clear(name) {
  const i = get(name);
  if (i) Object.assign(i, { hostile: 0, invader: false, force: null });
}

module.exports = { KEEPER, threats, get, record, watch, skip, safe, reopenIn, invaded, keeperInvaded, invaderReserved, core, clear, me, reservedByMe, keeperRoom, friendly, route };
