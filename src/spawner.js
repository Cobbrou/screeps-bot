const sources = require('./sources');
const defense = require('./defense');
const intel = require('./intel');
const expansion = require('./expansion');

const MAX_MINER_WORK = 5;
// ponytail: récolteurs distants par source sans réservation (5 énergie/tick), à revoir avec un rôle reserver.
const REMOTE_PER_SOURCE = 2;
const MAX_REMOTE_ROOMS = 2;
// Sans tour, un builder est créé dès qu'une structure passe sous cette part de ses points de vie (comme l'urgence du builder).
const REPAIR_RATIO = 0.5;
// ponytail: un upgrader de plus par tranche d'énergie stockée, plafonné ; à revoir au RCL 8 (15 énergie/tick max).
const ENERGY_PER_UPGRADER = 100000;
// Avant le stockage : un upgrader de plus par tranche d'énergie en attente dans le conteneur du contrôleur.
const CONTAINER_ENERGY_PER_UPGRADER = 1000;
const MAX_EXTRA_UPGRADERS = 3;

// Récolte statique dès le RCL 1 : même un mineur à 2 WORK posé sur la source (4 énergie/tick en continu)
// rapporte bien plus qu'un harvester qui fait l'aller-retour. Sans conteneur, il pose l'énergie au sol.
// Vrai s'il manque un mineur sur la source : moins de MAX_MINER_WORK au total et une case libre pour un de plus.
function needsMiner(source, miners) {
  const m = miners[source.id] || { work: 0, count: 0 };
  return m.work < MAX_MINER_WORK && m.count < sources.spots(source);
}

// Haulers nécessaires pour suivre la production réelle des mineurs de la source (2 énergie/tick par WORK,
// 10 au plus) sur l'aller-retour spawn ↔ source.
// ponytail: distance de la route du planner, alors que les haulers livrent aussi aux tours et au contrôleur.
function haulersFor(room, source, work) {
  if (!work) return 0;
  const rate = Math.min(work, MAX_MINER_WORK) * HARVEST_POWER;
  const route = room.memory.routes && room.memory.routes[source.id];
  const carry = buildBody('hauler', room.energyCapacityAvailable).filter((p) => p === CARRY).length * CARRY_CAPACITY;
  if (!route || !carry) return 1;
  return Math.ceil((2 * route.length * rate) / carry);
}

// Nombre de chantiers d'extension dans la salle.
function extensionSites(room) {
  return room.find(FIND_MY_CONSTRUCTION_SITES, { filter: (s) => s.structureType === STRUCTURE_EXTENSION }).length;
}

// Upgraders en plus des 2 de base, selon l'énergie stockée ou en attente au contrôleur.
function extraUpgraders(room) {
  const stored = room.storage ? room.storage.store[RESOURCE_ENERGY] : 0;
  const waiting = sources.container(room.controller, 2);
  const extra = Math.floor(stored / ENERGY_PER_UPGRADER)
    + Math.floor((waiting ? waiting.store[RESOURCE_ENERGY] : 0) / CONTAINER_ENERGY_PER_UPGRADER);
  return Math.min(MAX_EXTRA_UPGRADERS, extra);
}

// Vrai si une structure (hors murs et remparts) est sous REPAIR_RATIO de ses points de vie et qu'aucune tour
// ne l'entretiendra : un builder vient alors la réparer.
function needsRepair(room) {
  if (room.find(FIND_MY_STRUCTURES, { filter: (s) => s.structureType === STRUCTURE_TOWER }).length) return false;
  return room.find(FIND_STRUCTURES, {
    filter: (s) => s.hits < s.hitsMax * REPAIR_RATIO
      && s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_RAMPART,
  }).length > 0;
}

// Salles voisines où récolter : seulement depuis une salle qui a un stockage pour recevoir l'énergie.
// Au plus MAX_REMOTE_ROOMS, celles qui ont le plus de sources, pour ne pas saturer le spawn.
function remoteRooms(room) {
  if (!room.storage) return [];
  const exp = Memory.expansion;
  return Object.values(Game.map.describeExits(room.name))
    .filter((name) => intel.safe(name) && intel.get(name).sources && (!exp || exp.target !== name))
    .sort((a, b) => intel.get(b).sources - intel.get(a).sources)
    .slice(0, MAX_REMOTE_ROOMS);
}

// Effectifs voulus par rôle, dans l'ordre de priorité. Les harvesters ne servent plus qu'en urgence (voir run).
// Haulers avant mineurs : ils suivent les WORK déjà posés, ce qui alterne mineur et hauler au démarrage
// au lieu de payer tous les mineurs avant de pouvoir transporter.
function targets(room, roomCounts, miners) {
  const list = sources.list(room);
  const expanding = Memory.expansion && Memory.expansion.from === room.name;
  return {
    defender: defense.threats(room).length ? 2 : 0,
    hauler: list.reduce((sum, s) => sum + haulersFor(room, s, (miners[s.id] || {}).work), 0),
    miner: (roomCounts.miner || 0) + (list.some((s) => needsMiner(s, miners)) ? 1 : 0),
    // Un seul upgrader de base tant que des extensions sont en chantier : l'énergie va d'abord à la capacité.
    upgrader: (extensionSites(room) ? 1 : 2) + extraUpgraders(room),
    builder: room.find(FIND_MY_CONSTRUCTION_SITES).length > 0 ? 2 : (needsRepair(room) ? 1 : 0),
    // Un éclaireur suffit à tenir les renseignements à jour.
    scout: 1,
    claimer: expanding && !expansion.claimed() ? 1 : 0,
    pioneer: expanding && expansion.claimed() ? 2 : 0,
    remote: remoteRooms(room).reduce((sum, name) => sum + intel.get(name).sources * REMOTE_PER_SOURCE, 0),
  };
}

// Répète le motif autant que l'énergie et la taille maximale d'un créep (50 parties) le permettent.
function repeat(unit, energy) {
  const cost = unit.reduce((sum, part) => sum + BODYPART_COST[part], 0);
  const units = Math.min(Math.floor(energy / cost), Math.floor(MAX_CREEP_SIZE / unit.length));
  const body = [];
  for (let i = 0; i < units; i++) body.push(...unit);
  return body;
}

function buildBody(role, energy) {
  if (role === 'miner') {
    // Un seul MOVE : le mineur ne se déplace qu'une fois jusqu'à son conteneur.
    const work = Math.min(Math.floor((energy - BODYPART_COST[MOVE]) / BODYPART_COST[WORK]), MAX_MINER_WORK);
    return work > 0 ? [...Array(work).fill(WORK), MOVE] : [];
  }
  if (role === 'hauler') return repeat([CARRY, CARRY, MOVE], energy);
  if (role === 'defender') return repeat([ATTACK, MOVE], energy);
  if (role === 'scout') return [MOVE];
  if (role === 'claimer') return energy >= BODYPART_COST[CLAIM] + BODYPART_COST[MOVE] ? [CLAIM, MOVE] : [];
  // Entre 300 et 399 (RCL 1) : un second WORK plutôt que 100 énergie inutilisées.
  if (energy >= 300 && energy < 400) return [WORK, WORK, CARRY, MOVE];
  return repeat([WORK, CARRY, MOVE], energy);
}

module.exports.run = function () {
  // Effectifs actuels par salle puis par rôle, et WORK et nombre de mineurs par source.
  const counts = {};
  const miners = {};
  const remoteCounts = {};
  const addMiner = (sourceId, body) => {
    const m = miners[sourceId] = miners[sourceId] || { work: 0, count: 0 };
    m.work += body.filter((p) => (p.type || p) === WORK).length;
    m.count++;
  };
  for (const name in Game.creeps) {
    const creep = Game.creeps[name];
    const room = creep.memory.room || creep.room.name;
    counts[room] = counts[room] || {};
    counts[room][creep.memory.role] = (counts[room][creep.memory.role] || 0) + 1;
    if (creep.memory.role === 'miner') addMiner(creep.memory.sourceId, creep.body);
    if (creep.memory.role === 'remote') remoteCounts[creep.memory.target] = (remoteCounts[creep.memory.target] || 0) + 1;
  }

  for (const name in Game.spawns) {
    const spawn = Game.spawns[name];
    if (spawn.spawning) continue;
    const room = spawn.room;
    const roomCounts = counts[room.name] = counts[room.name] || {};

    // Personne pour remplir spawn et extensions (ou haulers sans mineur pour les alimenter) :
    // récolteur avec l'énergie disponible.
    const emergency = !roomCounts.harvester && (!roomCounts.hauler || !roomCounts.miner);
    const wanted = targets(room, roomCounts, miners);
    const role = emergency ? 'harvester' : Object.keys(wanted).find((r) => (roomCounts[r] || 0) < wanted[r]);
    if (!role) continue;

    const body = buildBody(role, emergency ? room.energyAvailable : room.energyCapacityAvailable);
    if (!body.length) continue;

    const memory = { role, room: room.name };
    if (role === 'miner') {
      // ponytail: pas de remplacement anticipé, la source chôme le temps du trajet du successeur.
      const free = sources.list(room).find((s) => needsMiner(s, miners));
      if (!free) continue;
      memory.sourceId = free.id;
    }
    if (role === 'claimer' || role === 'pioneer') memory.target = Memory.expansion.target;
    if (role === 'remote') {
      // Salle voisine la moins pourvue par rapport à son nombre de sources.
      const load = (name) => (remoteCounts[name] || 0) / intel.get(name).sources;
      memory.target = remoteRooms(room).reduce((a, b) => (load(b) < load(a) ? b : a));
    }
    if (spawn.spawnCreep(body, `${role}-${spawn.name}-${Game.time}`, { memory }) === OK) {
      roomCounts[role] = (roomCounts[role] || 0) + 1;
      if (memory.sourceId) addMiner(memory.sourceId, body);
      if (memory.target && role === 'remote') remoteCounts[memory.target] = (remoteCounts[memory.target] || 0) + 1;
    }
  }
};
