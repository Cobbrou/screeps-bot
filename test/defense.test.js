// Vérifie hors du jeu la détection des démanteleurs et de la coupe percée : node test/defense.test.js
const assert = require('assert');

// Constantes du jeu utilisées au chargement de src/defense.js.
Object.assign(global, {
  MOVE: 'move', WORK: 'work', CARRY: 'carry', ATTACK: 'attack', RANGED_ATTACK: 'ranged_attack', HEAL: 'heal', CLAIM: 'claim',
  RAMPART_DECAY_AMOUNT: 300, STRUCTURE_SPAWN: 'spawn', STRUCTURE_TOWER: 'tower', STRUCTURE_STORAGE: 'storage',
  STRUCTURE_TERMINAL: 'terminal', STRUCTURE_WALL: 'constructedWall', STRUCTURE_RAMPART: 'rampart', STRUCTURE_ROAD: 'road',
  STRUCTURE_CONTAINER: 'container', FIND_EXIT: 10, TOWER_OPTIMAL_RANGE: 5, TOWER_FALLOFF_RANGE: 20, TOWER_FALLOFF: 0.75,
  TOWER_POWER_ATTACK: 600, TOWER_ENERGY_COST: 10, HEAL_POWER: 12, RANGED_HEAL_POWER: 4, RESOURCE_ENERGY: 'energy',
  TOUGH: 'tough', BOOSTS: { tough: { XGHO2: { damage: 0.3 } }, heal: { LHO2: { heal: 3 } } },
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

// Raid du 2026-11-27 : démanteleur à 12 TOUGH XGHO2 et son soigneur à 20 HEAL LHO2 (720 soin/tick), 3 tours à 690 bruts.
// Avec les TOUGH (×0,3), 207 : jamais tuable. Deux gardiens sans boost (2 × 960) : (2 610 × 0,3) - 720 = 63 nets,
// 16 salves avant sa sortie, trop peu. Deux gardiens boostés UH (2 × 1 920) : 639 nets, tué.
const tough = { type: TOUGH, hits: 100, boost: 'XGHO2' };
const breaker = {
  hits: 5000, body: [...Array(12).fill(tough), ...Array(28).fill({ type: WORK, hits: 100 })],
  pos: { getRangeTo: (o) => (o === 'exit' ? 15 : 0), findClosestByRange: () => 'exit' },
};
const healer = { body: Array(20).fill({ type: HEAL, hits: 100, boost: 'LHO2' }), pos: { getRangeTo: () => 1 } };
const salvo690 = [390, 150, 150].map((d) => ({ pos: { getRangeTo: () => (d === 390 ? 12 : 30) }, store: { energy: 1000 } }));
assert.strictEqual(defense.toughFactor(breaker), 0.3);
assert.strictEqual(defense.toughFactor(creep('x', [TOUGH, MOVE])), 1);
assert.ok(!defense.killable(breaker, [breaker, healer], salvo690, 0));
assert.ok(!defense.killable(breaker, [breaker, healer], salvo690, 1920));
assert.ok(defense.killable(breaker, [breaker, healer], salvo690, 3840));

// Vigilance : RCL 7 et plus, recharge du mode sans échec ou plus aucun en réserve, ou fin dans moins de 1 000 ticks.
const room = (c) => ({ controller: Object.assign({ my: true, level: 7, safeModeAvailable: 3 }, c) });
assert.ok(!defense.vigil(room({})));
assert.ok(defense.vigil(room({ safeModeCooldown: 30000 })));
assert.ok(defense.vigil(room({ safeModeAvailable: 0 })));
assert.ok(!defense.vigil(room({ safeMode: 13000, safeModeCooldown: 43000 })));
assert.ok(defense.vigil(room({ safeMode: 900, safeModeCooldown: 30900 })));
assert.ok(!defense.vigil(room({ level: 6, safeModeCooldown: 30000 })));

console.log('defense : ok');
