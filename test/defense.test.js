// Vérifie hors du jeu la détection des démanteleurs et de la coupe percée : node test/defense.test.js
const assert = require('assert');

// Constantes du jeu utilisées au chargement de src/defense.js.
Object.assign(global, {
  MOVE: 'move', WORK: 'work', CARRY: 'carry', ATTACK: 'attack', RANGED_ATTACK: 'ranged_attack', HEAL: 'heal', CLAIM: 'claim',
  RAMPART_DECAY_AMOUNT: 300, STRUCTURE_SPAWN: 'spawn', STRUCTURE_TOWER: 'tower', STRUCTURE_STORAGE: 'storage',
  STRUCTURE_TERMINAL: 'terminal', STRUCTURE_WALL: 'constructedWall', STRUCTURE_RAMPART: 'rampart', STRUCTURE_ROAD: 'road',
  STRUCTURE_CONTAINER: 'container',
});
const defense = require('../src/defense');

const creep = (owner, parts, x = 10, y = 10) => ({ owner: { username: owner }, body: parts.map((type) => ({ type })), pos: { x, y } });

// Démanteleur joueur (WORK sans CARRY) : dangereux. Mineur ou réparateur de passage (WORK et CARRY) : non.
assert.ok(defense.dangerous(creep('deadlydd', [WORK, WORK, MOVE])));
assert.ok(!defense.dangerous(creep('someone', [WORK, CARRY, MOVE])));
assert.ok(defense.dangerous(creep('Invader', [WORK, CARRY, MOVE])));
assert.ok(defense.dangerous(creep('someone', [RANGED_ATTACK, MOVE])));
assert.ok(!defense.dangerous(creep('someone', [MOVE])));

// Coupe percée : joueur à l'intérieur des murs ; Invader dedans, joueur dehors ou salle sans coupe : non.
const cells = new Set([10 * 50 + 10]);
assert.ok(defense.breached(cells, [creep('deadlydd', [WORK, MOVE])]));
assert.ok(!defense.breached(cells, [creep('Invader', [ATTACK, MOVE])]));
assert.ok(!defense.breached(cells, [creep('deadlydd', [WORK, MOVE], 1, 27)]));
assert.ok(!defense.breached(null, [creep('deadlydd', [WORK, MOVE])]));

console.log('defense : ok');
