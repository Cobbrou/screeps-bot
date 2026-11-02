const intel = require('./intel');
const move = require('./move');
const defense = require('./defense');

// Débit d'une source de salle non réservée (1 500 énergie par régénération) : 5 énergie/tick ; réservée : 10.
const NEUTRAL_RATE = SOURCE_ENERGY_NEUTRAL_CAPACITY / ENERGY_REGEN_TIME;
const RESERVED_RATE = SOURCE_ENERGY_CAPACITY / ENERGY_REGEN_TIME;
// RCL minimal : au RCL 1, la salle n'a que son spawn et ses propres sources occupent le temps de spawn.
const MIN_RCL = 2;
const MAX_ROOMS = 2;
// Corps du reserver : 2 CLAIM, la réservation gagne 2 ticks par tick et en perd 1.
const RESERVER_UNIT = [CLAIM, MOVE];
const RESERVER_UNITS = 2;
const RESERVER_COST = RESERVER_UNITS * (BODYPART_COST[CLAIM] + BODYPART_COST[MOVE]);
// Reserver envoyé seulement si la réservation tombe sous ce seuil : au-dessus, il gaspillerait sa vie.
const RESERVE_REFILL = CONTROLLER_RESERVE_MAX - 2000;
// Énergie/tick d'entretien d'un transporteur [CARRY, MOVE] par énergie/tick transportée, par tick d'aller-retour.
const HAUL_UPKEEP = (BODYPART_COST[CARRY] + BODYPART_COST[MOVE]) / (CARRY_CAPACITY * CREEP_LIFE_TIME);
// Énergie dans le conteneur d'une source distante au-delà de laquelle on ajoute un transporteur.
const HAUL_BACKLOG = CONTAINER_CAPACITY / 2;

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

// Débit d'une source de la salle distante (énergie/tick), selon qu'on la réserve.
function rate(name) {
  return intel.reservedByMe(name) ? RESERVED_RATE : NEUTRAL_RATE;
}

// WORK d'un mineur distant : de quoi vider la source (3 non réservée, 5 réservée).
function minerWork(name) {
  return Math.ceil(rate(name) / HARVEST_POWER);
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

// Conteneur posé à côté de la source distante, ou undefined (salle non visible, pas encore construit).
function container(source) {
  if (!Game.rooms[source.room]) return undefined;
  return new RoomPosition(source.x, source.y, source.room).findInRange(FIND_STRUCTURES, 1, {
    filter: (s) => s.structureType === STRUCTURE_CONTAINER,
  })[0];
}

// Vrai si réserver la salle rapporte plus que le reserver ne coûte : 5 énergie/tick de plus par source,
// moins l'entretien des transporteurs qui les rapportent, contre le corps du reserver sur sa vie utile
// (CREEP_CLAIM_LIFE_TIME moins l'aller). Il faut aussi pouvoir payer le corps (RCL 4).
function worthReserving(room, name, roomSources) {
  if (room.energyCapacityAvailable < RESERVER_COST) return false;
  const avgTrip = roomSources.reduce((sum, s) => sum + trip(room, s), 0) / roomSources.length;
  const gain = roomSources.length * (RESERVED_RATE - NEUTRAL_RATE) * (1 - avgTrip * HAUL_UPKEEP);
  return gain > RESERVER_COST / (CREEP_CLAIM_LIFE_TIME - avgTrip / 2);
}

// Vrai si la salle a besoin d'un reserver : réservation absente ou sous RESERVE_REFILL
// (salle non visible : réservation inconnue, on en envoie un).
function needsReserve(name) {
  const room = Game.rooms[name];
  if (!room || !room.controller) return true;
  const r = room.controller.reservation;
  return !r || r.ticksToEnd < RESERVE_REFILL;
}

// Première source distante sans mineur vivant, première dont les transporteurs portent moins que son débit réel
// sur l'aller-retour (ou dont le conteneur déborde), et première salle à réserver sans reserver vivant.
// `remote` : WORK et capacité CARRY vivants par source ; `reservers` : reservers vivants par salle visée.
function missing(room, remote, reservers) {
  const result = {};
  const sources = list(room);
  for (const source of sources) {
    const r = remote[source.id] || { work: 0, carry: 0 };
    if (!result.miner && !r.work) result.miner = source;
    const flow = Math.min(r.work * HARVEST_POWER, rate(source.room));
    const box = container(source);
    if (!result.hauler && r.work
      && (r.carry < trip(room, source) * flow || (box && box.store[RESOURCE_ENERGY] > HAUL_BACKLOG))) {
      result.hauler = source;
    }
  }
  for (const name of rooms(room)) {
    const roomSources = sources.filter((s) => s.room === name);
    if (!roomSources.length || reservers[name] || !needsReserve(name)) continue;
    if (worthReserving(room, name, roomSources)) {
      result.reserver = name;
      break;
    }
  }
  return result;
}

// Énergie/tick rapportée par les sources distantes de la salle : production des mineurs vivants,
// au prorata du transport assuré (capacité CARRY / besoin sur l'aller-retour, comme dans missing).
function income(room, remote) {
  return list(room).reduce((sum, source) => {
    const r = remote[source.id] || { work: 0, carry: 0 };
    const flow = Math.min(r.work * HARVEST_POWER, rate(source.room));
    const need = trip(room, source) * flow;
    return sum + (need ? flow * Math.min(1, r.carry / need) : 0);
  }, 0);
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

module.exports = {
  RESERVER_UNIT, RESERVER_UNITS, minerWork, container, missing, income, safe, retreat,
};
