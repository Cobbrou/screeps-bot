// Ticks consécutifs sans bouger (hors fatigue) avant de recalculer le chemin en contournant les créeps.
const STUCK_TICKS = 2;
// Ticks pendant lesquels un chemin calculé est réutilisé (5 par défaut dans `moveTo`) : moins de pathfinding.
const REUSE_PATH = 20;

// Dernière position connue de chaque créep, par nom, gardée hors de `Memory` : écrite à chaque déplacement,
// elle alourdirait la sérialisation. Perdue au reset du global, ce qui remet juste le compteur à zéro.
const lastSeen = {};
// Dernière destination demandée par chaque créep : sa zone de travail. Un créep poussé ne s'en éloigne jamais.
const goals = {};
// Intentions de déplacement du tick (nom → { creep, dir }), exécutées ensemble par `run`.
let intents = {};
let intentTick = -1;

function intend(creep, dir) {
  if (intentTick !== Game.time) {
    intents = {};
    intentTick = Game.time;
  }
  intents[creep.name] = { creep, dir };
}

// Remplace `creep.moveTo` : même signature et même code de retour.
// Le chemin est calculé par `moveTo`, mais le pas est seulement noté : `run` l'exécute en fin de tick,
// en poussant les créeps immobiles qui barrent la route.
// Par défaut, `moveTo` ignore les autres créeps ; un créep bloqué malgré tout (créep qui ne peut pas céder sa case)
// piétine : on détecte ce blocage et on force un nouveau chemin qui les contourne.
function to(creep, target, opts = {}) {
  // Plaine à 2 et marais à 10 (1 et 5 par défaut) : la route (1) devient moins chère que la plaine, les créeps la suivent.
  opts = Object.assign({ reusePath: REUSE_PATH, plainCost: 2, swampCost: 10 }, opts);
  const here = `${creep.pos.roomName}:${creep.pos.x}:${creep.pos.y}`;
  const last = lastSeen[creep.name];
  // Ne compte que les appels de ticks consécutifs : un créep qui travaille sur place n'est pas bloqué.
  const stuck = last && last.pos === here && last.time === Game.time - 1 && creep.fatigue === 0
    ? last.n + 1 : 0;
  lastSeen[creep.name] = { pos: here, time: Game.time, n: stuck };
  if (stuck >= STUCK_TICKS) {
    // Oublie le chemin en cache, qui traverse le créep gênant.
    delete creep.memory._move;
    opts = Object.assign({}, opts, { ignoreCreeps: false });
  }
  const pos = target.pos || target;
  goals[creep.name] = { x: pos.x, y: pos.y, roomName: pos.roomName };
  // `moveTo` (et `moveByPath` qu'il appelle) finit toujours par `this.move(direction)` : on intercepte ce pas.
  creep.move = (dir) => {
    intend(creep, dir);
    return OK;
  };
  try {
    return creep.moveTo(target, opts);
  } finally {
    delete creep.move;
  }
}

// Pas d'une case dans une direction, à la place de `creep.move`.
function step(creep, dir) {
  intend(creep, dir);
  return OK;
}

const key = (roomName, x, y) => `${roomName}:${x}:${y}`;
const DX = [0, 0, 1, 1, 1, 0, -1, -1, -1];
const DY = [0, -1, -1, 0, 1, 1, 1, 0, -1];

// Case voisine dans la direction `dir`, hors de la salle si elle sort de la grille.
function offset(pos, dir) {
  return { x: pos.x + DX[dir], y: pos.y + DY[dir], roomName: pos.roomName };
}

// Case où un créep poussé peut aller : hors bord (une sortie le changerait de salle), praticable, sans créep.
function free(room, p, at, dests) {
  if (p.x < 1 || p.x > 48 || p.y < 1 || p.y > 48) return false;
  const k = key(p.roomName, p.x, p.y);
  if (at[k] || dests.has(k)) return false;
  if (room.getTerrain().get(p.x, p.y) === TERRAIN_MASK_WALL) return false;
  return !room.lookForAt(LOOK_STRUCTURES, p.x, p.y).some((s) => OBSTACLE_OBJECT_TYPES.includes(s.structureType)
    || (s.structureType === STRUCTURE_RAMPART && !s.my && !s.isPublic));
}

// Pousse un créep immobile hors de la case `from` voulue par un autre : d'abord en échangeant leurs places,
// sinon vers une case libre voisine, sans jamais s'éloigner de sa zone de travail (`goals`).
// Un créep fixe (mineur sur son conteneur) ne bouge donc pas. Vrai si un pas a été donné.
function push(creep, swap, at, dests) {
  if (creep.fatigue > 0 || !creep.getActiveBodyparts(MOVE)) return false;
  const goal = goals[creep.name];
  const zoned = goal && goal.roomName === creep.pos.roomName;
  const limit = zoned ? creep.pos.getRangeTo(goal.x, goal.y) : Infinity;
  const near = (p) => !zoned || Math.max(Math.abs(p.x - goal.x), Math.abs(p.y - goal.y)) <= limit;
  const swapDir = creep.pos.getDirectionTo(swap.x, swap.y);
  if (swap.x >= 1 && swap.x <= 48 && swap.y >= 1 && swap.y <= 48 && near(swap)) {
    creep.move(swapDir);
    return true;
  }
  for (let dir = 1; dir <= 8; dir++) {
    const p = offset(creep.pos, dir);
    if (near(p) && free(creep.room, p, at, dests)) {
      creep.move(dir);
      dests.add(key(p.roomName, p.x, p.y));
      return true;
    }
  }
  return false;
}

// Exécute les pas du tick. Un créep qui avance sur la case d'un de nos créeps immobile le pousse
// (échange ou pas de côté) : le moteur accepte les échanges et les files de créeps qui avancent ensemble.
// À appeler une fois par tick, après les rôles.
function run() {
  if (intentTick !== Game.time) return;
  const at = {};
  for (const name in Game.creeps) {
    const c = Game.creeps[name];
    if (!c.spawning) at[key(c.pos.roomName, c.pos.x, c.pos.y)] = c;
  }
  const movers = Object.values(intents);
  const dests = new Set(movers.map(({ creep, dir }) => {
    const p = offset(creep.pos, dir);
    return key(p.roomName, p.x, p.y);
  }));
  for (const { creep, dir } of movers) {
    creep.move(dir);
    const p = offset(creep.pos, dir);
    const other = at[key(p.roomName, p.x, p.y)];
    // Poussé une seule fois : il a désormais son propre pas.
    if (other && !intents[other.name] && push(other, creep.pos, at, dests)) intents[other.name] = { creep: other };
  }
  intents = {};
}

// Oublie un créep mort.
function forget(name) {
  delete lastSeen[name];
  delete goals[name];
}

module.exports = { to, step, run, forget };
