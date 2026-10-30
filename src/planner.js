const sources = require('./sources');

// Le plan est recalculé tous les INTERVAL ticks : les chantiers manquants sont recréés.
const INTERVAL = 100;
const MAX_RADIUS = 8;
// Chantiers laissés libres sur le compte (MAX_CONSTRUCTION_SITES) pour le spawn d'expansion.
const SITE_MARGIN = 20;

// Chantiers que le planner peut encore poser sur ce passage.
let budget = 0;

// Pose un chantier dans la limite du budget.
function place(room, ...args) {
  if (budget <= 0) return ERR_FULL;
  const result = room.createConstructionSite(...args);
  if (result === OK) budget--;
  return result;
}

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

// Structures (extensions, stockage) en damier autour du spawn : les cases libres en diagonale laissent passer les créeps.
function planAround(room, spawn, type, costs) {
  const max = CONTROLLER_STRUCTURES[type][room.controller.level];
  const isType = { filter: (s) => s.structureType === type };
  let missing = max - room.find(FIND_MY_STRUCTURES, isType).length
    - room.find(FIND_MY_CONSTRUCTION_SITES, isType).length;
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
        if (place(room, x, y, type) === OK) {
          costs.set(x, y, 255);
          missing--;
        }
      }
    }
  }
}

// Route du spawn jusqu'à la cible, terminée par un conteneur.
// Le chemin est gardé en mémoire (cases codées x * 50 + y) : le recalculer à chaque passage le ferait dévier
// au gré des nouvelles structures et laisserait des tronçons orphelins. Il n'est recalculé que s'il est bloqué.
function planRoute(room, spawn, target, range, costs) {
  if (!room.memory.routes) room.memory.routes = {};
  const saved = room.memory.routes[target.id];
  let path = saved && saved.map((k) => new RoomPosition(Math.floor(k / 50), k % 50, room.name));
  if (!path || path.some((pos) => costs.get(pos.x, pos.y) === 255)) {
    const result = PathFinder.search(spawn.pos, { pos: target.pos, range }, {
      plainCost: 2,
      swampCost: 10,
      maxRooms: 1,
      roomCallback: () => costs,
    });
    if (result.incomplete || !result.path.length) return;
    path = result.path;
    room.memory.routes[target.id] = path.map((pos) => pos.x * 50 + pos.y);
  }
  path = path.slice();
  const end = path.pop();
  place(room, end, STRUCTURE_CONTAINER);
  for (const pos of path) {
    place(room, pos, STRUCTURE_ROAD);
    costs.set(pos.x, pos.y, 1);
  }
}

// Ceinture de murs à 2 cases des sorties : tout chemin depuis une sortie la traverse.
// Remparts sur les routes et au milieu de chaque côté pour laisser passer nos créeps.
function planWalls(room, costs) {
  const terrain = room.getTerrain();
  const near = new Set();
  for (const e of room.find(FIND_EXIT)) {
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) near.add((e.x + dx) * 50 + e.y + dy);
  }
  for (const side of [FIND_EXIT_TOP, FIND_EXIT_RIGHT, FIND_EXIT_BOTTOM, FIND_EXIT_LEFT]) {
    const exits = room.find(side);
    if (!exits.length) continue;
    const ring = new Map();
    for (const e of exits) {
      for (let dx = -2; dx <= 2; dx++) {
        for (let dy = -2; dy <= 2; dy++) {
          const x = e.x + dx;
          const y = e.y + dy;
          const key = x * 50 + y;
          if (x < 1 || x > 48 || y < 1 || y > 48 || near.has(key) || ring.has(key)) continue;
          if (terrain.get(x, y) !== TERRAIN_MASK_WALL) ring.set(key, new RoomPosition(x, y, room.name));
        }
      }
    }
    const gate = exits[Math.floor(exits.length / 2)].findClosestByRange([...ring.values()]);
    for (const pos of ring.values()) {
      const cost = costs.get(pos.x, pos.y);
      if (cost === 255) continue;
      place(room, pos, cost === 1 || pos.isEqualTo(gate) ? STRUCTURE_RAMPART : STRUCTURE_WALL);
    }
  }
}

module.exports.run = function () {
  if (Game.time % INTERVAL) return;
  // Game.constructionSites ne compte pas les chantiers posés pendant le tick : décompte local.
  budget = MAX_CONSTRUCTION_SITES - SITE_MARGIN - Object.keys(Game.constructionSites).length;
  for (const name in Game.rooms) {
    const room = Game.rooms[name];
    // Dès le RCL 1 : routes et conteneurs sont autorisés, extensions et stockage attendent leur RCL.
    if (!room.controller || !room.controller.my) continue;
    const spawn = room.find(FIND_MY_SPAWNS)[0];
    if (!spawn) continue;

    const costs = costMatrix(room);
    // Le stockage (RCL 4) passe avant les extensions pour rester au plus près du spawn.
    planAround(room, spawn, STRUCTURE_STORAGE, costs);
    planAround(room, spawn, STRUCTURE_TOWER, costs);
    planAround(room, spawn, STRUCTURE_EXTENSION, costs);
    for (const source of sources.list(room)) planRoute(room, spawn, source, 1, costs);
    // Portée 2 : le conteneur reste à portée d'amélioration (3) sans bloquer les abords du contrôleur.
    planRoute(room, spawn, room.controller, 2, costs);
    // Murs seulement une fois une tour construite : elle seule les entretient.
    if (room.find(FIND_MY_STRUCTURES, { filter: (s) => s.structureType === STRUCTURE_TOWER }).length) {
      planWalls(room, costs);
    }
  }
};
