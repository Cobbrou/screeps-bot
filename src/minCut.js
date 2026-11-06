// Coupe minimale entre la base et les sorties d'une salle (flot maximal de Dinic).
// Chaque case praticable est dédoublée (entrée → sortie, capacité 1) : couper cette arête revient à y poser un rempart.
// Pur (aucun objet du jeu), pour être vérifié hors du jeu : voir test/minCut.test.js.

const SIZE = 50;
const INF = 1e6;
const NEIGHBORS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

// Arêtes en tableaux parallèles : `to`, `cap` et `next`, l'arête i et son inverse étant i ^ 1.
function graph(nodes) {
  const g = { head: new Int32Array(nodes).fill(-1), to: [], cap: [], next: [] };
  g.add = (a, b, c) => {
    for (const [from, dest, cap] of [[a, b, c], [b, a, 0]]) {
      g.to.push(dest);
      g.cap.push(cap);
      g.next.push(g.head[from]);
      g.head[from] = g.to.length - 1;
    }
  };
  return g;
}

// Niveaux depuis `s` dans le graphe résiduel.
function levels(g, s) {
  const level = new Int32Array(g.head.length).fill(-1);
  const queue = [s];
  level[s] = 0;
  for (let i = 0; i < queue.length; i++) {
    for (let e = g.head[queue[i]]; e !== -1; e = g.next[e]) {
      if (g.cap[e] > 0 && level[g.to[e]] < 0) {
        level[g.to[e]] = level[queue[i]] + 1;
        queue.push(g.to[e]);
      }
    }
  }
  return level;
}

function push(g, node, sink, flow, level, cursor) {
  if (node === sink) return flow;
  for (; cursor[node] !== -1; cursor[node] = g.next[cursor[node]]) {
    const e = cursor[node];
    if (g.cap[e] <= 0 || level[g.to[e]] !== level[node] + 1) continue;
    const pushed = push(g, g.to[e], sink, Math.min(flow, g.cap[e]), level, cursor);
    if (pushed) {
      g.cap[e] -= pushed;
      g.cap[e ^ 1] += pushed;
      return pushed;
    }
  }
  return 0;
}

// Cases (x * 50 + y) à couper pour séparer `base` des sorties, de coût total minimal.
// `walkable(x, y)` : case sans mur naturel. `cost(x, y)` : coût entier (au moins 1) d'une barrière sur cette case.
// Les sorties sont les cases praticables du bord ; on ne peut rien bâtir à portée 1 d'elles (createConstructionSite).
// Une case de `base` à portée 2 d'une sortie est ignorée : aucune barrière ne pourrait la séparer de cette sortie.
// La coupe renvoyée est celle au plus près de la base. Coûte quelques dizaines de ms : à garder en mémoire.
function minCut(walkable, base, cost) {
  const exits = [];
  for (let i = 0; i < SIZE; i++) {
    for (const [x, y] of [[i, 0], [i, SIZE - 1], [0, i], [SIZE - 1, i]]) if (walkable(x, y)) exits.push([x, y]);
  }
  const nearExit = (r) => (x, y) => exits.some((e) => Math.max(Math.abs(e[0] - x), Math.abs(e[1] - y)) <= r);
  const forbidden = nearExit(1);
  const close = nearExit(2);
  const sourceNode = 2 * SIZE * SIZE;
  const sinkNode = sourceNode + 1;
  const g = graph(sinkNode + 1);
  for (let x = 0; x < SIZE; x++) {
    for (let y = 0; y < SIZE; y++) {
      if (!walkable(x, y)) continue;
      const k = x * SIZE + y;
      const blocked = forbidden(x, y);
      const inBase = base.has(k) && !close(x, y);
      g.add(2 * k, 2 * k + 1, blocked || inBase ? INF : cost(x, y));
      if (inBase) g.add(sourceNode, 2 * k, INF);
      if (blocked) g.add(2 * k + 1, sinkNode, INF);
      for (const [dx, dy] of NEIGHBORS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < SIZE && ny >= 0 && ny < SIZE && walkable(nx, ny)) g.add(2 * k + 1, 2 * (nx * SIZE + ny), INF);
      }
    }
  }
  for (;;) {
    const level = levels(g, sourceNode);
    if (level[sinkNode] < 0) {
      const cut = [];
      for (let k = 0; k < SIZE * SIZE; k++) if (level[2 * k] >= 0 && level[2 * k + 1] < 0) cut.push(k);
      return cut;
    }
    const cursor = g.head.slice();
    while (push(g, sourceNode, sinkNode, INF, level, cursor));
  }
}

// Portes de la coupe : le moins de cases qui relient toutes les zones qu'elle sépare, les zones qui donnent sur un même
// côté de la salle comptant pour une seule (même voisine). `preferred` : cases essayées avant le reste de la coupe.
function gates(walkable, cut, preferred = []) {
  const closed = new Set(cut);
  const zone = new Map();
  // Union-find : un groupe par zone, 0 à 3 pour les côtés de la salle.
  const parent = [0, 1, 2, 3];
  const find = (a) => {
    while (parent[a] !== a) a = parent[a] = parent[parent[a]];
    return a;
  };
  const join = (a, b) => {
    const [ra, rb] = [find(a), find(b)];
    parent[ra] = rb;
    return ra !== rb;
  };
  const near = (k) => NEIGHBORS.map(([dx, dy]) => [Math.floor(k / SIZE) + dx, k % SIZE + dy])
    .filter(([x, y]) => x >= 0 && x < SIZE && y >= 0 && y < SIZE && walkable(x, y))
    .map(([x, y]) => x * SIZE + y);
  for (let k = 0; k < SIZE * SIZE; k++) {
    if (zone.has(k) || closed.has(k) || !walkable(Math.floor(k / SIZE), k % SIZE)) continue;
    const id = parent.length;
    parent.push(id);
    zone.set(k, id);
    const stack = [k];
    while (stack.length) {
      const cell = stack.pop();
      const x = Math.floor(cell / SIZE);
      const y = cell % SIZE;
      if (x === 0) join(id, 0);
      if (y === 0) join(id, 1);
      if (x === SIZE - 1) join(id, 2);
      if (y === SIZE - 1) join(id, 3);
      for (const n of near(cell)) {
        if (zone.has(n) || closed.has(n)) continue;
        zone.set(n, id);
        stack.push(n);
      }
    }
  }
  const doors = [];
  for (const k of new Set([...preferred.filter((c) => closed.has(c)), ...cut])) {
    const zones = near(k).filter((n) => zone.has(n)).map((n) => zone.get(n));
    // filter et non some : la case relie toutes les zones qu'elle touche.
    if (zones.filter((z) => join(z, zones[0])).length) doors.push(k);
  }
  return doors;
}

module.exports = minCut;
module.exports.gates = gates;
