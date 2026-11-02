const intel = require('./intel');
const move = require('./move');
const defense = require('./defense');

// Débit d'une source de salle non réservée (1 500 énergie par régénération) : 5 énergie/tick.
const NEUTRAL_RATE = SOURCE_ENERGY_NEUTRAL_CAPACITY / ENERGY_REGEN_TIME;
// WORK d'un mineur distant : 3 suffisent pour vider une source non réservée.
const MINER_WORK = Math.ceil(NEUTRAL_RATE / HARVEST_POWER);
// RCL minimal : au RCL 1, la salle n'a que son spawn et ses propres sources occupent le temps de spawn.
const MIN_RCL = 2;
const MAX_ROOMS = 2;

// Aller-retour d'un transporteur 1:1 entre le spawn et chaque source distante (vide : 1 tick par case ;
// chargé : 1 en plaine, 5 en marais), null si injoignable. Gardé jusqu'au reset du global.
// ponytail: chemin calculé sur le seul terrain (structures ignorées) : estimation, pas le trajet exact.
const trips = {};

// Salles voisines exploitées : sûres, explorées avec la position de leurs sources, hors cible d'expansion.
// Au plus MAX_ROOMS, celles qui ont le plus de sources.
function rooms(room) {
  if (room.controller.level < MIN_RCL) return [];
  const exp = Memory.expansion;
  return Object.values(Game.map.describeExits(room.name))
    .filter((name) => intel.safe(name) && intel.get(name).sourcePos && (!exp || exp.target !== name))
    .sort((a, b) => intel.get(b).sourcePos.length - intel.get(a).sourcePos.length)
    .slice(0, MAX_ROOMS);
}

// Aller-retour (en ticks) entre le spawn de la salle et la source distante, ou null.
function trip(room, source) {
  if (source.id in trips) return trips[source.id];
  const spawn = room.find(FIND_MY_SPAWNS)[0];
  if (!spawn) return null;
  const result = PathFinder.search(spawn.pos, { pos: new RoomPosition(source.x, source.y, source.room), range: 1 }, {
    plainCost: 1,
    swampCost: 5,
    maxRooms: 3,
    maxOps: 4000,
  });
  trips[source.id] = result.incomplete ? null : result.path.length + result.cost;
  return trips[source.id];
}

// Sources distantes joignables ({ id, x, y, room }), les plus proches d'abord : elles rapportent le plus par transporteur.
function list(room) {
  const all = [];
  for (const name of rooms(room)) {
    for (const s of intel.get(name).sourcePos) all.push(Object.assign({ room: name }, s));
  }
  return all.filter((s) => trip(room, s)).sort((a, b) => trip(room, a) - trip(room, b));
}

// Première source distante sans mineur vivant, et première dont les transporteurs portent moins que
// son débit réel sur l'aller-retour. `remote` : WORK et capacité CARRY vivants par source.
function missing(room, remote) {
  const result = {};
  for (const source of list(room)) {
    const r = remote[source.id] || { work: 0, carry: 0 };
    if (!result.miner && !r.work) result.miner = source;
    const rate = Math.min(r.work * HARVEST_POWER, NEUTRAL_RATE);
    if (!result.hauler && r.work && r.carry < trip(room, source) * rate) result.hauler = source;
  }
  return result;
}

// Vrai si la salle visée par le créep est sûre ; sur place, il signale lui-même les hostiles.
function safe(creep) {
  if (creep.room.name === creep.memory.target && defense.threats(creep.room).length) intel.record(creep.room);
  return intel.safe(creep.memory.target);
}

// Ramène le créep dans sa salle, où il attend que la salle visée redevienne sûre.
function retreat(creep) {
  if (creep.room.name !== creep.memory.room) {
    move.to(creep, new RoomPosition(25, 25, creep.memory.room), { range: 20 });
  }
}

module.exports = { MINER_WORK, missing, safe, retreat };
