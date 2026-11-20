// Vérifie la récolte des salles à keepers hors du jeu : node test/keeper.test.js
const assert = require('assert');

// Constantes du jeu utilisées au chargement de src/remoteMining.js et src/intel.js.
Object.assign(global, {
  MOVE: 'move', WORK: 'work', CARRY: 'carry', ATTACK: 'attack', RANGED_ATTACK: 'ranged_attack', HEAL: 'heal', CLAIM: 'claim',
  BODYPART_COST: { move: 50, work: 100, carry: 50, attack: 80, ranged_attack: 150, heal: 250, claim: 600 },
  SOURCE_ENERGY_NEUTRAL_CAPACITY: 1500, SOURCE_ENERGY_CAPACITY: 3000, SOURCE_ENERGY_KEEPER_CAPACITY: 4000,
  ENERGY_REGEN_TIME: 300, HARVEST_POWER: 2, CONTROLLER_RESERVE_MAX: 5000, CARRY_CAPACITY: 50, CREEP_LIFE_TIME: 1500,
  CONTAINER_CAPACITY: 2000, RANGED_ATTACK_POWER: 10, HEAL_POWER: 12,
});
// Modules qui chargent le reste du bot : remplacés par des modules vides.
for (const name of ['move', 'sources', 'defense']) {
  const path = require.resolve(`../src/${name}`);
  require.cache[path] = { id: path, filename: path, loaded: true, exports: { threats: () => [] } };
}
const remoteMining = require('../src/remoteMining');
const intel = require('../src/intel');

// Tueur : payable au RCL 7 (5 600), 50 parties au plus, soin au moins égal au tir du keeper (10 RANGED_ATTACK),
// keeper (5 000 PV) tué bien avant sa réapparition, pour tenir les trois sources sur une régénération.
const body = remoteMining.KILLER_BODY;
const count = (part) => body.filter((p) => p === part).length;
assert.ok(body.reduce((sum, p) => sum + BODYPART_COST[p], 0) <= 5600);
assert.ok(body.length <= 50);
assert.ok(count(HEAL) * HEAL_POWER >= 10 * RANGED_ATTACK_POWER);
assert.ok(3 * 5000 / (count(RANGED_ATTACK) * RANGED_ATTACK_POWER) < ENERGY_REGEN_TIME / 2);
assert.ok(count(MOVE) * 2 >= body.length - 4, 'presque une case par tick hors route');

global.Game = { time: 100000, rooms: {}, spawns: {} };
global.Memory = { rooms: {
  E25S4: { intel: { time: 1, sourcePos: [{ id: 'a', x: 1, y: 1 }], controller: false, hostile: 0, core: false } },
  E25S2: { intel: { time: 1, sourcePos: [], controller: false, hostile: 0, core: false } },
} };

// Mineur chez les keepers : de quoi vider 4 000 en 240 ticks (fuites comprises).
assert.strictEqual(remoteMining.minerWork('E25S4'), 9);
// Salle à keepers explorée, sans forteresse : sûre ; forteresse ou hostiles récents : non.
assert.ok(intel.safe('E25S4'));
Memory.rooms.E25S4.intel.core = true;
assert.ok(!intel.safe('E25S4'));
Memory.rooms.E25S4.intel.core = false;
Memory.rooms.E25S4.intel.hostile = Game.time - 10;
assert.ok(!intel.safe('E25S4'));
// Fermée par des Invaders seulement : le tueur y va (keeperInvaded) ; par un joueur ou une forteresse : non.
Memory.rooms.E25S4.intel.invader = true;
assert.ok(intel.keeperInvaded('E25S4'));
Memory.rooms.E25S4.intel.core = true;
assert.ok(!intel.keeperInvaded('E25S4'));
Memory.rooms.E25S4.intel.core = false;
Memory.rooms.E25S4.intel.invader = false;
assert.ok(!intel.keeperInvaded('E25S4'));
// Invaders abattus (clear) : la salle rouvre sans attendre HOSTILE_COOLDOWN.
Memory.rooms.E25S4.intel.invader = true;
intel.clear('E25S4');
assert.ok(intel.safe('E25S4') && !intel.keeperInvaded('E25S4'));
// Salle normale sans contrôleur libre : toujours fermée.
assert.ok(!intel.safe('E25S2'));

console.log('keeper : ok');
