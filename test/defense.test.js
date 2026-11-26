// Vérifie hors du jeu la détection des démanteleurs et de la coupe percée : node test/defense.test.js
const assert = require('assert');

// Constantes du jeu utilisées au chargement de src/defense.js.
Object.assign(global, {
  MOVE: 'move', WORK: 'work', CARRY: 'carry', ATTACK: 'attack', RANGED_ATTACK: 'ranged_attack', HEAL: 'heal', CLAIM: 'claim',
  RAMPART_DECAY_AMOUNT: 300, STRUCTURE_SPAWN: 'spawn', STRUCTURE_TOWER: 'tower', STRUCTURE_STORAGE: 'storage',
  STRUCTURE_TERMINAL: 'terminal', STRUCTURE_WALL: 'constructedWall', STRUCTURE_RAMPART: 'rampart', STRUCTURE_ROAD: 'road',
  STRUCTURE_CONTAINER: 'container', FIND_EXIT: 10, TOWER_OPTIMAL_RANGE: 5, TOWER_FALLOFF_RANGE: 20, TOWER_FALLOFF: 0.75,
  TOWER_POWER_ATTACK: 600, TOWER_ENERGY_COST: 10, HEAL_POWER: 12, RANGED_HEAL_POWER: 4, RESOURCE_ENERGY: 'energy',
});
const defense = require('../src/defense');

const creep = (owner, parts, x = 10, y = 10) => ({ owner: { username: owner }, body: parts.map((type) => ({ type })), pos: { x, y } });

// Démanteleur joueur (WORK sans CARRY) : dangereux. Mineur ou réparateur de passage (WORK et CARRY) : non.
assert.ok(defense.dangerous(creep('deadlydd', [WORK, WORK, MOVE])));
assert.ok(!defense.dangerous(creep('someone', [WORK, CARRY, MOVE])));
assert.ok(defense.dangerous(creep('Invader', [WORK, CARRY, MOVE])));
assert.ok(defense.dangerous(creep('someone', [RANGED_ATTACK, MOVE])));
assert.ok(!defense.dangerous(creep('someone', [MOVE])));

// Coupe percée : joueur à l'intérieur des murs, ou dans une salle sans coupe ; Invader dedans ou joueur dehors : non.
const cells = new Set([10 * 50 + 10]);
assert.ok(defense.breached(cells, [creep('deadlydd', [WORK, MOVE])]));
assert.ok(!defense.breached(cells, [creep('Invader', [ATTACK, MOVE])]));
assert.ok(!defense.breached(cells, [creep('deadlydd', [WORK, MOVE], 1, 27)]));
assert.ok(defense.breached(null, [creep('deadlydd', [WORK, MOVE])]));
assert.ok(!defense.breached(null, [creep('Invader', [ATTACK, MOVE])]));

// Drainer (18 HEAL, 4 200 PV) à portée 25 de 3 tours (450 dégâts, 234 nets) : au bord de la salle, il ressort
// avant de tomber, les tours gardent leur énergie ; à 20 cases de toute sortie, elles le tuent.
const drainer = (exitRange) => ({
  hits: 4200, body: Array(18).fill({ type: HEAL, hits: 100 }),
  pos: { getRangeTo: (o) => (o === 'exit' ? exitRange : 0), findClosestByRange: () => 'exit' },
});
const towers = [1, 2, 3].map(() => ({ pos: { getRangeTo: () => 25 }, store: { energy: 1000 } }));
const d1 = drainer(1);
assert.ok(!defense.killable(d1, [d1], towers, 0));
const d20 = drainer(20);
assert.ok(defense.killable(d20, [d20], towers, 0));

console.log('defense : ok');
