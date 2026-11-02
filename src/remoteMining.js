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
function sourceList(room) {
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
  const sources = sourceList(room);
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
  return sourceList(room).reduce((sum, source) => {
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

// Sous cette part de ses points de vie, une route distante est réparée par le remoteBuilder (pas de tour hors de nos salles).
const ROAD_REPAIR_RATIO = 0.5;

// Coûts d'une salle distante visible : routes et chantiers de route réutilisés, structures bloquantes contournées.
function remoteCosts(room) {
  const costs = new PathFinder.CostMatrix();
  for (const o of [...room.find(FIND_STRUCTURES), ...room.find(FIND_MY_CONSTRUCTION_SITES)]) {
    if (o.structureType === STRUCTURE_ROAD) costs.set(o.pos.x, o.pos.y, 1);
    else if (OBSTACLE_OBJECT_TYPES.includes(o.structureType)) costs.set(o.pos.x, o.pos.y, 255);
  }
  return costs;
}

// Route du spawn jusqu'à une source distante dont le conteneur existe : { salle: [cases x * 50 + y] } dans l'ordre
// du trajet, conteneur exclu, gardée dans room.memory.remoteRoads[id].path. Elle ne passe que par la salle
// et la salle distante ; dans la salle, `homeCosts` (matrice du planner) lui fait éviter les cases du plan.
// Recalculée si une case est devenue bloquante. Renvoie le chemin, ou undefined.
function roadPath(room, source, homeCosts) {
  const memory = room.memory.remoteRoads = room.memory.remoteRoads || {};
  const saved = memory[source.id];
  const callback = (name) => {
    if (name === room.name) return homeCosts;
    if (name !== source.room) return false;
    return Game.rooms[name] ? remoteCosts(Game.rooms[name]) : new PathFinder.CostMatrix();
  };
  const blocked = saved && Object.keys(saved.path).some((name) => {
    const costs = Game.rooms[name] && callback(name);
    return costs && saved.path[name].some((k) => costs.get(Math.floor(k / 50), k % 50) === 255);
  });
  if (saved && !blocked) return saved.path;
  const spawn = room.find(FIND_MY_SPAWNS)[0];
  if (!spawn) return undefined;
  const result = PathFinder.search(spawn.pos, { pos: new RoomPosition(source.x, source.y, source.room), range: 1 }, {
    plainCost: 2, swampCost: 10, maxRooms: 2, maxOps: 6000, roomCallback: callback,
  });
  if (result.incomplete || result.path.length < 2) return undefined;
  const path = {};
  // Le dernier pas est la case du conteneur, où se tient le mineur. Les cases du bord (sorties) sont laissées nues.
  // ponytail: une route sur la sortie serait permise mais on n'y passe qu'un tick ; à ajouter si la fatigue s'y voit.
  for (const pos of result.path.slice(0, -1)) {
    if (pos.x < 1 || pos.x > 48 || pos.y < 1 || pos.y > 48) continue;
    (path[pos.roomName] = path[pos.roomName] || []).push(pos.x * 50 + pos.y);
  }
  memory[source.id] = { path, done: false };
  return path;
}

// Routes à poser pour la récolte distante : par source distante dont le conteneur est construit, son chemin.
// Note `done` quand toutes ses cases ont une route (salles visibles) : les transporteurs passent alors à 2 CARRY par MOVE.
// Les chemins des sources qui ne sont plus exploitées sont oubliés.
function roads(room, homeCosts) {
  const all = sourceList(room);
  const memory = room.memory.remoteRoads = room.memory.remoteRoads || {};
  for (const id in memory) if (!all.some((s) => s.id === id)) delete memory[id];
  const paths = [];
  for (const source of all.filter((s) => container(s))) {
    const path = roadPath(room, source, homeCosts);
    if (!path) continue;
    paths.push(path);
    const names = Object.keys(path);
    if (names.every((name) => Game.rooms[name])) {
      memory[source.id].done = names.every((name) => path[name].every((k) => Game.rooms[name]
        .lookForAt(LOOK_STRUCTURES, Math.floor(k / 50), k % 50).some((st) => st.structureType === STRUCTURE_ROAD)));
    }
  }
  return paths;
}

// Vrai si la route jusqu'à la source distante est entièrement construite.
function paved(room, sourceId) {
  const memory = room.memory.remoteRoads;
  return !!(memory && memory[sourceId] && memory[sourceId].done);
}

// Cases (x * 50 + y) de nos chemins de récolte distante dans la salle `name`.
function roadCells(room, name) {
  const cells = new Set();
  const memory = room.memory.remoteRoads || {};
  for (const id in memory) for (const k of memory[id].path[name] || []) cells.add(k);
  return cells;
}

// Salle distante où le remoteBuilder a du travail : chantier de route, ou route de nos chemins sous ROAD_REPAIR_RATIO.
// Seulement les salles visibles (un mineur distant y travaille), undefined sinon.
function roadWork(room) {
  for (const name of rooms(room)) {
    const remote = Game.rooms[name];
    if (!remote) continue;
    if (remote.find(FIND_MY_CONSTRUCTION_SITES, { filter: (s) => s.structureType === STRUCTURE_ROAD }).length) return name;
    const cells = roadCells(room, name);
    if (remote.find(FIND_STRUCTURES, {
      filter: (s) => s.structureType === STRUCTURE_ROAD && s.hits < s.hitsMax * ROAD_REPAIR_RATIO
        && cells.has(s.pos.x * 50 + s.pos.y),
    }).length) return name;
  }
  return undefined;
}

module.exports = {
  RESERVER_UNIT, RESERVER_UNITS, ROAD_REPAIR_RATIO, minerWork, container, missing, income, safe, retreat,
  roads, paved, roadWork, roadCells,
};

