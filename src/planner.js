const sources = require('./sources');

// Le plan est recalculé tous les INTERVAL ticks : les chantiers manquants sont recréés.
const INTERVAL = 100;
const MAX_RADIUS = 8;

// Coûts pour tracer les routes : réutilise routes et chantiers de route, contourne les autres structures.
function costMatrix(room) {
  const costs = new PathFinder.CostMatrix();
  const objects = [...room.find(FIND_STRUCTURES), ...room.find(FIND_MY_CONSTRUCTION_SITES)];
  for (const o of objects) {
    if (o.structureType === STRUCTURE_ROAD) {
      costs.set(o.pos.x, o.pos.y, 1);
    } else if (o.structureType !== STRUCTURE_CONTAINER && o.structureType !== STRUCTURE_RAMPART) {
      costs.set(o.pos.x, o.pos.y, 255);
    }
  }
  return costs;
}

// Extensions en damier autour du spawn : les cases libres en diagonale laissent passer les créeps.
function planExtensions(room, spawn, costs) {
  const max = CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][room.controller.level];
  const isExtension = { filter: (s) => s.structureType === STRUCTURE_EXTENSION };
  let missing = max - room.find(FIND_MY_STRUCTURES, isExtension).length
    - room.find(FIND_MY_CONSTRUCTION_SITES, isExtension).length;
  const terrain = room.getTerrain();
  const avoid = [...sources.list(room), room.controller];

  for (let r = 2; r <= MAX_RADIUS && missing > 0; r++) {
    for (let dx = -r; dx <= r && missing > 0; dx++) {
      for (let dy = -r; dy <= r && missing > 0; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || (dx + dy) % 2) continue;
        const x = spawn.pos.x + dx;
        const y = spawn.pos.y + dy;
        if (x < 2 || x > 47 || y < 2 || y > 47 || terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
        if (avoid.some((o) => o.pos.getRangeTo(x, y) <= 2)) continue;
        if (room.createConstructionSite(x, y, STRUCTURE_EXTENSION) === OK) {
          costs.set(x, y, 255);
          missing--;
        }
      }
    }
  }
}

// Route du spawn jusqu'à la cible, terminée par un conteneur.
function planRoute(room, spawn, target, range, costs) {
  const result = PathFinder.search(spawn.pos, { pos: target.pos, range }, {
    plainCost: 2,
    swampCost: 10,
    maxRooms: 1,
    roomCallback: () => costs,
  });
  if (result.incomplete || !result.path.length) return;
  const end = result.path.pop();
  room.createConstructionSite(end, STRUCTURE_CONTAINER);
  for (const pos of result.path) {
    room.createConstructionSite(pos, STRUCTURE_ROAD);
    costs.set(pos.x, pos.y, 1);
  }
}

module.exports.run = function () {
  if (Game.time % INTERVAL) return;
  for (const name in Game.rooms) {
    const room = Game.rooms[name];
    if (!room.controller || !room.controller.my || room.controller.level < 2) continue;
    const spawn = room.find(FIND_MY_SPAWNS)[0];
    if (!spawn) continue;

    const costs = costMatrix(room);
    planExtensions(room, spawn, costs);
    for (const source of sources.list(room)) planRoute(room, spawn, source, 1, costs);
    // Portée 2 : le conteneur reste à portée d'amélioration (3) sans bloquer les abords du contrôleur.
    planRoute(room, spawn, room.controller, 2, costs);
  }
};
