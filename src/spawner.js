const sources = require('./sources');
const defense = require('./defense');
const intel = require('./intel');
const expansion = require('./expansion');

const MAX_MINER_WORK = 5;
// ponytail: récolteurs distants par source sans réservation (5 énergie/tick), à revoir avec un rôle reserver.
const REMOTE_PER_SOURCE = 2;
// ponytail: un upgrader de plus par tranche d'énergie stockée, plafonné ; à revoir au RCL 8 (15 énergie/tick max).
const ENERGY_PER_UPGRADER = 100000;
// Avant le stockage : un upgrader de plus par tranche d'énergie en attente dans le conteneur du contrôleur.
const CONTAINER_ENERGY_PER_UPGRADER = 1000;
const MAX_EXTRA_UPGRADERS = 3;
// Coût d'un mineur complet : en dessous, les harvesters récoltent plus qu'un petit mineur.
const MINER_MIN_ENERGY = MAX_MINER_WORK * BODYPART_COST[WORK] + BODYPART_COST[MOVE];

// Sources de la salle équipées d'un conteneur, une fois un mineur complet finançable : récolte statique (miner + hauler).
function minedSources(room) {
  if (room.energyCapacityAvailable < MINER_MIN_ENERGY) return [];
  return sources.list(room).filter((s) => sources.container(s));
}

// Haulers nécessaires pour suivre la production d'une source (10 énergie/tick) sur l'aller-retour spawn ↔ conteneur.
// ponytail: distance de la route du planner, alors que les haulers livrent aussi aux tours et au contrôleur.
function haulersFor(room, source) {
  const route = room.memory.routes && room.memory.routes[source.id];
  const carry = buildBody('hauler', room.energyCapacityAvailable).filter((p) => p === CARRY).length * CARRY_CAPACITY;
  if (!route || !carry) return 1;
  return Math.ceil((2 * route.length * SOURCE_ENERGY_CAPACITY) / ENERGY_REGEN_TIME / carry);
}

// Upgraders en plus des 2 de base, selon l'énergie stockée ou en attente au contrôleur.
function extraUpgraders(room) {
  const stored = room.storage ? room.storage.store[RESOURCE_ENERGY] : 0;
  const waiting = sources.container(room.controller, 2);
  const extra = Math.floor(stored / ENERGY_PER_UPGRADER)
    + Math.floor((waiting ? waiting.store[RESOURCE_ENERGY] : 0) / CONTAINER_ENERGY_PER_UPGRADER);
  return Math.min(MAX_EXTRA_UPGRADERS, extra);
}

// Salles voisines où récolter : seulement depuis une salle qui a un stockage pour recevoir l'énergie.
function remoteRooms(room) {
  if (!room.storage) return [];
  const exp = Memory.expansion;
  return Object.values(Game.map.describeExits(room.name))
    .filter((name) => intel.safe(name) && intel.get(name).sources && (!exp || exp.target !== name));
}

// Effectifs voulus par rôle, dans l'ordre de priorité.
// ponytail: 2 récolteurs par source, à calculer selon les WORK et les cases libres quand les corps grossissent.
function targets(room) {
  const total = sources.list(room).length;
  const mined = minedSources(room);
  const expanding = Memory.expansion && Memory.expansion.from === room.name;
  return {
    defender: defense.threats(room).length ? 2 : 0,
    harvester: (total - mined.length) * 2,
    miner: mined.length,
    hauler: mined.reduce((sum, s) => sum + haulersFor(room, s), 0),
    upgrader: 2 + extraUpgraders(room),
    builder: room.find(FIND_MY_CONSTRUCTION_SITES).length > 0 ? 2 : 0,
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
  // Effectifs actuels par salle puis par rôle, et sources déjà occupées par un mineur.
  const counts = {};
  const minerSources = new Set();
  const remoteCounts = {};
  for (const name in Game.creeps) {
    const creep = Game.creeps[name];
    const room = creep.memory.room || creep.room.name;
    counts[room] = counts[room] || {};
    counts[room][creep.memory.role] = (counts[room][creep.memory.role] || 0) + 1;
    if (creep.memory.role === 'miner') minerSources.add(creep.memory.sourceId);
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
    const wanted = targets(room);
    const role = emergency ? 'harvester' : Object.keys(wanted).find((r) => (roomCounts[r] || 0) < wanted[r]);
    if (!role) continue;

    const body = buildBody(role, emergency ? room.energyAvailable : room.energyCapacityAvailable);
    if (!body.length) continue;

    const memory = { role, room: room.name };
    if (role === 'miner') {
      // ponytail: pas de remplacement anticipé, la source chôme le temps du trajet du successeur.
      const free = minedSources(room).find((s) => !minerSources.has(s.id));
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
      if (memory.sourceId) minerSources.add(memory.sourceId);
      if (memory.target && role === 'remote') remoteCounts[memory.target] = (remoteCounts[memory.target] || 0) + 1;
    }
  }
};
