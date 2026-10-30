const sources = require('./sources');
const defense = require('./defense');
const intel = require('./intel');
const expansion = require('./expansion');

const MAX_UNITS = 5;
const MAX_MINER_WORK = 5;
// ponytail: récolteurs distants par source sans réservation (5 énergie/tick), à revoir avec un rôle reserver.
const REMOTE_PER_SOURCE = 2;
// ponytail: un upgrader de plus par tranche d'énergie stockée, plafonné ; à revoir au RCL 8 (15 énergie/tick max).
const ENERGY_PER_UPGRADER = 100000;
const MAX_EXTRA_UPGRADERS = 3;

// Sources de la salle équipées d'un conteneur : récolte statique (miner + hauler).
function minedSources(room) {
  return sources.list(room).filter((s) => sources.container(s));
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
  const mined = minedSources(room).length;
  const expanding = Memory.expansion && Memory.expansion.from === room.name;
  return {
    defender: defense.threats(room).length ? 2 : 0,
    harvester: (total - mined) * 2,
    miner: mined,
    hauler: mined,
    upgrader: 2 + Math.min(MAX_EXTRA_UPGRADERS,
      Math.floor((room.storage ? room.storage.store[RESOURCE_ENERGY] : 0) / ENERGY_PER_UPGRADER)),
    builder: room.find(FIND_MY_CONSTRUCTION_SITES).length > 0 ? 2 : 0,
    // Un éclaireur suffit à tenir les renseignements à jour.
    scout: 1,
    claimer: expanding && !expansion.claimed() ? 1 : 0,
    pioneer: expanding && expansion.claimed() ? 2 : 0,
    remote: remoteRooms(room).reduce((sum, name) => sum + intel.get(name).sources * REMOTE_PER_SOURCE, 0),
  };
}

// Répète le motif autant que l'énergie le permet.
function repeat(unit, energy) {
  const cost = unit.reduce((sum, part) => sum + BODYPART_COST[part], 0);
  const units = Math.min(Math.floor(energy / cost), MAX_UNITS);
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
