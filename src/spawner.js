const sources = require('./sources');

// Motif de corps répété autant que l'énergie le permet (200 énergie par motif).
const BODY_UNIT = [WORK, CARRY, MOVE];
const BODY_UNIT_COST = 200;
const MAX_UNITS = 5;

// Effectifs voulus par rôle, dans l'ordre de priorité.
// ponytail: 2 récolteurs par source, à calculer selon les WORK et les cases libres quand les corps grossissent.
function targets(room) {
  return {
    harvester: sources.list(room).length * 2,
    upgrader: 2,
    builder: room.find(FIND_MY_CONSTRUCTION_SITES).length > 0 ? 2 : 0,
  };
}

function buildBody(energy) {
  const units = Math.min(Math.floor(energy / BODY_UNIT_COST), MAX_UNITS);
  const body = [];
  for (let i = 0; i < units; i++) body.push(...BODY_UNIT);
  return body;
}

module.exports.run = function () {
  // Effectifs actuels par salle puis par rôle.
  const counts = {};
  for (const name in Game.creeps) {
    const creep = Game.creeps[name];
    const room = creep.memory.room || creep.room.name;
    counts[room] = counts[room] || {};
    counts[room][creep.memory.role] = (counts[room][creep.memory.role] || 0) + 1;
  }

  for (const name in Game.spawns) {
    const spawn = Game.spawns[name];
    if (spawn.spawning) continue;
    const room = spawn.room;
    const roomCounts = counts[room.name] = counts[room.name] || {};
    const wanted = targets(room);
    const role = Object.keys(wanted).find((r) => (roomCounts[r] || 0) < wanted[r]);
    if (!role) continue;

    // Sans récolteur, la salle ne se remplit plus : on spawn avec l'énergie disponible.
    const emergency = role === 'harvester' && !roomCounts.harvester;
    const body = buildBody(emergency ? room.energyAvailable : room.energyCapacityAvailable);
    if (!body.length) continue;

    const memory = { role, room: room.name };
    if (spawn.spawnCreep(body, `${role}-${Game.time}`, { memory }) === OK) {
      roomCounts[role] = (roomCounts[role] || 0) + 1;
    }
  }
};
