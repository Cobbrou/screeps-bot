const sources = require('./sources');

// Le plan est recalculé tous les INTERVAL ticks : les chantiers manquants sont recréés.
const INTERVAL = 100;
const MAX_RADIUS = 8;
// Types placés par le plan de base, dans l'ordre d'attribution des cases à RCL égal.
const PLANNED = [STRUCTURE_STORAGE, STRUCTURE_TOWER, STRUCTURE_EXTENSION];
// Chantiers laissés libres sur le compte (MAX_CONSTRUCTION_SITES) pour le spawn d'expansion.
const SITE_MARGIN = 20;
// RCL à partir duquel les routes sont posées sans condition ; avant, seulement une fois la salle équipée.
const ROAD_MIN_RCL = 3;
// RCL à partir duquel les conteneurs sont posés.
const CONTAINER_MIN_RCL = 2;

// Chantier non entamé depuis ce nombre de ticks retiré (inaccessible, salle perdue, plan obsolète) :
// il libère une place sur MAX_CONSTRUCTION_SITES. Rien n'est perdu ; le planner le repose s'il est toujours voulu.
// ponytail: un chantier inaccessible mais encore voulu est reposé aussitôt, et ses builders restent ; à traiter si ça arrive.
const SITE_TTL = 5000;

// Chantiers actifs au plus par salle, hors murs et remparts (1 point chacun, finis en un tick) :
// les builders finissent chaque structure au plus vite au lieu de se disperser.
const MAX_ACTIVE_SITES = 3;

// Chantiers que le planner peut encore poser sur ce passage : sur le compte, et dans la salle en cours.
let budget = 0;
let slots = 0;
// Vrai si un chantier voulu a été refusé faute de place dans la salle en cours.
let blocked = false;
// RCL de chaque salle lors de sa dernière planification, gardé jusqu'au reset du global.
const plannedLevel = {};
// Salles dont un chantier attend une place : replanifiées dès qu'un chantier se termine.
const waiting = {};

function isBarrier(type) {
  return type === STRUCTURE_WALL || type === STRUCTURE_RAMPART;
}

// Ordre de construction (plus petit d'abord), partagé par le planner et les builders.
// Les premières extensions passent avant la tour : la capacité finance des corps complets.
function priority(room, type) {
  const capacity = room.energyCapacityAvailable;
  if (type === STRUCTURE_SPAWN) return 0;
  if (type === STRUCTURE_EXTENSION && capacity < 650) return 1;
  if (type === STRUCTURE_TOWER) return 2;
  if (type === STRUCTURE_EXTENSION && capacity < 800) return 3;
  if (type === STRUCTURE_STORAGE) return 4;
  if (type === STRUCTURE_EXTENSION) return 5;
  if (type === STRUCTURE_CONTAINER) return 6;
  if (type === STRUCTURE_ROAD) return 7;
  return isBarrier(type) ? 9 : 8;
}

// Chantiers actifs de la salle (hors murs et remparts).
function activeSites(room) {
  return room.find(FIND_MY_CONSTRUCTION_SITES, { filter: (s) => !isBarrier(s.structureType) }).length;
}

// Pose un chantier dans la limite du budget du compte et des places de la salle (le type est le dernier argument).
function place(room, ...args) {
  const barrier = isBarrier(args[args.length - 1]);
  if (budget <= 0) return ERR_FULL;
  if (!barrier && slots <= 0) {
    blocked = true;
    return ERR_FULL;
  }
  const result = room.createConstructionSite(...args);
  if (result === OK) {
    budget--;
    if (!barrier) slots--;
  }
  return result;
}

// Coûts pour tracer les routes : réutilise routes, chantiers de route et routes gardées (même sans route
// construite), contourne les autres structures et les cases du plan de base (même pas encore construites).
// Les cases à coût non nul sont interdites au plan (planCells) : une extension sur une route gardée la ferait
// recalculer et déplacerait son bout (dépôt du contrôleur).
function costMatrix(room) {
  const costs = new PathFinder.CostMatrix();
  for (const id in room.memory.routes) {
    for (const k of room.memory.routes[id]) costs.set(Math.floor(k / 50), k % 50, 1);
  }
  for (const type of PLANNED) {
    for (const k of (room.memory.plan && room.memory.plan[type]) || []) costs.set(Math.floor(k / 50), k % 50, 255);
  }
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

// Distance (en cases, diagonales comprises) entre deux cases codées x * 50 + y.
function range(a, b) {
  return Math.max(Math.abs(Math.floor(a / 50) - Math.floor(b / 50)), Math.abs(a % 50 - b % 50));
}

// Hub du contrôleur : case du conteneur provisoire (dépôt des upgraders aux RCL 1 à 3, tas au sol avant le RCL 2)
// et case voisine du stockage (RCL 4), toutes deux à portée 2 du contrôleur : les upgraders postés autour
// restent à portée d'amélioration (3) et puisent directement dans le stockage une fois construit.
// Le conteneur reste le dépôt pendant la construction du stockage, puis il est détruit (sa case devient un poste).
// Choix : le plus de postes d'upgraders (cases praticables voisines à portée 3), puis le plus près du spawn.
// Conteneur de contrôleur déjà construit : sa case est reprise. Stockage déjà construit ailleurs : pas de case
// de stockage, le conteneur reste le dépôt. Renvoie { container, storage } (storage absent), ou null.
// Portée 2 plutôt que la portée 4 de harabibot : sans chaîne d'upgraders, elle ne laisserait que 3 postes.
function planHub(room, spawn, costs) {
  const ctrl = room.controller.pos;
  const terrain = room.getTerrain();
  const open = (x, y) => x >= 1 && x <= 48 && y >= 1 && y <= 48
    && terrain.get(x, y) !== TERRAIN_MASK_WALL && costs.get(x, y) !== 255;
  const ring = [];
  for (let dx = -2; dx <= 2; dx++) {
    for (let dy = -2; dy <= 2; dy++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) === 2 && open(ctrl.x + dx, ctrl.y + dy)) ring.push((ctrl.x + dx) * 50 + ctrl.y + dy);
    }
  }
  // Postes d'upgraders autour de la case k, hors la case `except` (le stockage, qui bloque le passage).
  const posts = (k, except) => {
    let n = 0;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const x = Math.floor(k / 50) + dx;
        const y = k % 50 + dy;
        if ((dx || dy) && x * 50 + y !== except && open(x, y) && ctrl.getRangeTo(x, y) <= 3) n++;
      }
    }
    return n;
  };
  const existing = ctrl.findInRange(FIND_STRUCTURES, 2, { filter: (s) => s.structureType === STRUCTURE_CONTAINER })[0];
  let hub = null;
  let best = -Infinity;
  for (const container of existing ? [existing.pos.x * 50 + existing.pos.y] : ring) {
    const pairs = room.storage ? [] : ring.filter((s) => range(s, container) === 1);
    if (!pairs.length) pairs.push(undefined);
    for (const storage of pairs) {
      const score = (posts(container, storage) + (storage === undefined ? 0 : posts(storage))) * 100
        - spawn.pos.getRangeTo(Math.floor(container / 50), container % 50);
      if (score > best) {
        best = score;
        hub = storage === undefined ? { container } : { container, storage };
      }
    }
  }
  return hub;
}

// Cases libres (x * 50 + y) en damier autour du spawn, de la plus proche à la plus lointaine : les cases libres
// en diagonale laissent passer les créeps. Ni mur naturel, ni case à coût non nul (structure, route gardée),
// ni case à portée 2 d'une source ou du contrôleur, ni case voisine du hub (postes des upgraders).
function planCells(room, spawn, costs, hub) {
  const terrain = room.getTerrain();
  const avoid = [...sources.list(room), room.controller];
  const hubCells = hub ? [hub.container, hub.storage].filter((k) => k !== undefined) : [];
  const cells = [];
  for (let r = 2; r <= MAX_RADIUS; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || (dx + dy) % 2) continue;
        const x = spawn.pos.x + dx;
        const y = spawn.pos.y + dy;
        if (x < 2 || x > 47 || y < 2 || y > 47 || terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
        if (costs.get(x, y) !== 0) continue;
        if (avoid.some((o) => o.pos.getRangeTo(x, y) <= 2)) continue;
        if (hubCells.some((k) => range(k, x * 50 + y) <= 1)) continue;
        cells.push(x * 50 + y);
      }
    }
  }
  return cells;
}

// Premier RCL qui autorise n + 1 structures de ce type.
function rclFor(type, n) {
  for (let rcl = 1; rcl <= 8; rcl++) if (CONTROLLER_STRUCTURES[type][rcl] > n) return rcl;
  return Infinity;
}

// Plan de base : hub du contrôleur (planHub) et, pour chaque type de PLANNED, cases (x * 50 + y) de toutes
// ses structures jusqu'au RCL 8, calculés une fois et gardés dans room.memory.plan. Les positions ne dérivent plus
// au gré des constructions. Le stockage va sur la case du hub ; les structures et chantiers déjà présents font
// partie du plan d'emblée ; le reste prend les cases de planCells, les plus proches du spawn allant aux structures
// des plus bas RCL (à RCL égal, dans l'ordre de PLANNED).
// La n-ième case d'un type est posée dès que le RCL autorise n + 1 structures de ce type (rclFor).
// ponytail: jamais recalculé (spawn détruit, damier trop petit pour tout placer) ; delete room.memory.plan pour le refaire.
function basePlan(room, spawn, costs) {
  if (room.memory.plan) return room.memory.plan;
  const hub = planHub(room, spawn, costs);
  const plan = { hub };
  const wanted = [];
  for (const type of PLANNED) {
    const isType = { filter: (s) => s.structureType === type };
    plan[type] = [...room.find(FIND_MY_STRUCTURES, isType), ...room.find(FIND_MY_CONSTRUCTION_SITES, isType)]
      .map((s) => s.pos.x * 50 + s.pos.y);
    if (type === STRUCTURE_STORAGE && !plan[type].length && hub && hub.storage !== undefined) {
      plan[type].push(hub.storage);
      costs.set(Math.floor(hub.storage / 50), hub.storage % 50, 255);
    }
    for (let n = plan[type].length; n < CONTROLLER_STRUCTURES[type][8]; n++) wanted.push({ type, rcl: rclFor(type, n) });
  }
  // Tri stable : à RCL égal, l'ordre de PLANNED est conservé.
  wanted.sort((a, b) => a.rcl - b.rcl);
  const cells = planCells(room, spawn, costs, hub);
  wanted.forEach((w, i) => {
    if (i >= cells.length) return;
    plan[w.type].push(cells[i]);
    costs.set(Math.floor(cells[i] / 50), cells[i] % 50, 255);
  });
  room.memory.plan = plan;
  return plan;
}

// Pose les structures du plan de ce type que le RCL autorise et qui manquent (ni la structure ni un chantier
// sur la case). S'arrête dès que les places de chantier sont prises.
function buildPlan(room, plan, type) {
  for (const k of plan[type].slice(0, CONTROLLER_STRUCTURES[type][room.controller.level])) {
    const pos = new RoomPosition(Math.floor(k / 50), k % 50, room.name);
    if (pos.lookFor(LOOK_STRUCTURES).some((s) => s.structureType === type)) continue;
    if (pos.lookFor(LOOK_CONSTRUCTION_SITES).length) continue;
    if (place(room, pos, type) === ERR_FULL) return;
  }
}

// Retire les chantiers de ce type pas encore entamés sur ces cases.
function removeSites(positions, type) {
  for (const pos of positions) {
    for (const site of pos.lookFor(LOOK_CONSTRUCTION_SITES)) {
      if (site.my && site.structureType === type && !site.progress) site.remove();
    }
  }
}

// Un seul conteneur à portée `range` de la cible. Un chemin recalculé change de bout : sans ce contrôle,
// un second conteneur serait posé à côté du premier.
// Conteneur déjà construit (ou pas voulu) : les chantiers de conteneur non entamés autour sont retirés ;
// sinon on garde le chantier le plus avancé, ou on en pose un au bout du chemin.
function planContainer(room, target, range, end, wanted) {
  const isContainer = { filter: (s) => s.structureType === STRUCTURE_CONTAINER };
  const built = target.pos.findInRange(FIND_STRUCTURES, range, isContainer).length > 0;
  const sites = target.pos.findInRange(FIND_MY_CONSTRUCTION_SITES, range, isContainer)
    .sort((a, b) => b.progress - a.progress);
  const keep = wanted && !built ? sites.slice(0, 1) : [];
  for (const site of sites) if (!keep.includes(site) && !site.progress) site.remove();
  if (wanted && !built && !sites.length) place(room, end, STRUCTURE_CONTAINER);
}

// Chemin du spawn jusqu'à la cible, terminé par un conteneur si `withContainer`. Renvoie le chemin sans son bout
// (les cases de la route, posée ensuite par planRoad), ou undefined.
// Le chemin est gardé en mémoire (cases codées x * 50 + y) : le recalculer à chaque passage le ferait dévier
// au gré des nouvelles structures et laisserait des tronçons orphelins. Il n'est recalculé que s'il est bloqué.
// Il est calculé même sans conteneur ni route : le spawner s'en sert pour dimensionner les haulers.
function planRoute(room, spawn, target, range, costs, withContainer) {
  if (!room.memory.routes) room.memory.routes = {};
  const saved = room.memory.routes[target.id];
  let path = saved && saved.map((k) => new RoomPosition(Math.floor(k / 50), k % 50, room.name));
  // Recalculé aussi si son bout n'est plus à portée de la cible (cible déplacée : hub du contrôleur).
  if (!path || path.some((pos) => costs.get(pos.x, pos.y) === 255) || !path[path.length - 1].inRangeTo(target.pos, range)) {
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
  // Les routes suivantes réutilisent celle-ci.
  for (const pos of path) costs.set(pos.x, pos.y, 1);
  path = path.slice();
  const end = path.pop();
  planContainer(room, target, range, end, withContainer);
  return path;
}

// Route sur les cases du chemin ; sans route voulue, les chantiers de route pas encore entamés sont retirés.
function planRoad(room, path, withRoad) {
  if (!withRoad) removeSites(path, STRUCTURE_ROAD);
  else for (const pos of path) place(room, pos, STRUCTURE_ROAD);
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

// Retire les chantiers restés à 0 de progression plus de SITE_TTL ticks, sur tout le compte.
// Memory.sites garde le tick où chaque chantier a été vu sans progression pour la première fois.
function removeStaleSites() {
  const seen = Memory.sites = Memory.sites || {};
  for (const id in seen) {
    const site = Game.constructionSites[id];
    if (!site || site.progress) delete seen[id];
  }
  for (const id in Game.constructionSites) {
    const site = Game.constructionSites[id];
    if (site.progress) continue;
    if (!seen[id]) {
      seen[id] = Game.time;
    } else if (Game.time - seen[id] > SITE_TTL && site.remove() === OK) {
      delete seen[id];
    }
  }
}

module.exports.run = function () {
  // Tous les INTERVAL ticks, et dès qu'une salle change de RCL : ses nouvelles structures sont posées aussitôt.
  // Aussi dès qu'une place se libère dans une salle dont un chantier attend.
  // Après un reset du global, chaque salle est replanifiée une fois.
  const due = Game.time % INTERVAL === 0;
  if (due) removeStaleSites();
  const rooms = Object.values(Game.rooms).filter((room) => room.controller && room.controller.my
    && (due || plannedLevel[room.name] !== room.controller.level
      || (waiting[room.name] && activeSites(room) < MAX_ACTIVE_SITES)));
  if (!rooms.length) return;
  // Game.constructionSites ne compte pas les chantiers posés pendant le tick : décompte local.
  budget = MAX_CONSTRUCTION_SITES - SITE_MARGIN - Object.keys(Game.constructionSites).length;
  for (const room of rooms) {
    plannedLevel[room.name] = room.controller.level;
    slots = MAX_ACTIVE_SITES - activeSites(room);
    blocked = false;
    waiting[room.name] = false;
    const spawn = room.find(FIND_MY_SPAWNS)[0];
    if (!spawn) continue;

    // Plan d'avant le hub : refait (les structures construites sont reprises), avant costMatrix qui en bloquerait les cases.
    if (room.memory.plan && !('hub' in room.memory.plan)) delete room.memory.plan;
    const costs = costMatrix(room);
    const plan = basePlan(room, spawn, costs);
    // Dans l'ordre de priority : les places libres vont d'abord aux structures prioritaires.
    const types = PLANNED.slice().sort((a, b) => priority(room, a) - priority(room, b));
    for (const type of types) buildPlan(room, plan, type);
    // Pas de conteneur au RCL 1 : le passage au RCL 2 ne coûte que 200 énergie, un conteneur 5000.
    // Les mineurs posent l'énergie au sol en attendant.
    const containers = room.controller.level >= CONTAINER_MIN_RCL;
    const extensions = room.find(FIND_MY_STRUCTURES, { filter: (s) => s.structureType === STRUCTURE_EXTENSION });
    const extensionsDone = extensions.length >= CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][room.controller.level];
    // Routes dès le RCL ROAD_MIN_RCL, ou plus tôt une fois la salle équipée : extensions et conteneurs
    // (un par source et celui du contrôleur) construits, aucun autre chantier en cours.
    const builtContainers = room.find(FIND_STRUCTURES, { filter: (s) => s.structureType === STRUCTURE_CONTAINER });
    const otherSites = room.find(FIND_MY_CONSTRUCTION_SITES, { filter: (s) => s.structureType !== STRUCTURE_ROAD });
    const roads = room.controller.level >= ROAD_MIN_RCL || (containers && extensionsDone && !otherSites.length
      && builtContainers.length >= sources.list(room).length + 1);
    const paths = sources.list(room).map((source) => planRoute(room, spawn, source, 1, costs, containers));
    // Route jusqu'à la case du conteneur du hub (dépôt des upgraders), conteneur posé une fois toutes les extensions
    // du RCL construites : la capacité passe avant. Stockage du hub construit : il devient le dépôt et le conteneur
    // est détruit (l'énergie restante tombe dans sa ruine, que les haulers ramassent).
    const hub = plan.hub;
    if (hub) {
      const pos = new RoomPosition(Math.floor(hub.container / 50), hub.container % 50, room.name);
      const stored = !!room.storage && room.storage.pos.x * 50 + room.storage.pos.y === hub.storage;
      paths.push(planRoute(room, spawn, { id: room.controller.id, pos }, 0, costs, containers && extensionsDone && !stored));
      const box = stored && pos.lookFor(LOOK_STRUCTURES).find((s) => s.structureType === STRUCTURE_CONTAINER);
      if (box) box.destroy();
    }
    // Routes après tous les conteneurs : elles passent en dernier dans les places libres.
    for (const path of paths) if (path) planRoad(room, path, roads);
    // Murs seulement une fois une tour construite (elle seule les entretient) et le stockage aussi (RCL 4) :
    // avant, les remonter à leur plafond prendrait l'essentiel de l'énergie de la salle.
    if (room.storage
      && room.find(FIND_MY_STRUCTURES, { filter: (s) => s.structureType === STRUCTURE_TOWER }).length) {
      planWalls(room, costs);
    }
    waiting[room.name] = blocked;
  }
};

module.exports.priority = priority;
