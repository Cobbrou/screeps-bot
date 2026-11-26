// Vérifie la salle à soutenir hors du jeu : node test/expansion.test.js
const assert = require('assert');

for (const name of ['intel', 'sources']) {
  const path = require.resolve(`../src/${name}`);
  require.cache[path] = { id: path, filename: path, loaded: true, exports: {} };
}
const { supported, raided } = require('../src/expansion');
const intel = require('../src/intel');
Object.assign(global, { CLAIM: 'claim', MOVE: 'move', TOUGH: 'tough', WORK: 'work' });

const room = (name, level, storage, my = true) => ({ name, storage, controller: { my, level } });
const home = room('A', 7, {});
global.Game = { map: { describeExits: () => ({ 3: 'B', 5: 'C', 7: 'D' }) }, rooms: {} };

// Voisines inconnues, d'un autre joueur ou déjà équipées d'un stockage : personne à soutenir.
assert.strictEqual(supported(home), undefined);
Game.rooms = { B: room('B', 3, undefined, false), C: room('C', 4, {}), D: { name: 'D' } };
assert.strictEqual(supported(home), undefined);
// Voisine à nous sans stockage : soutenue, seulement par une salle qui en a un.
Game.rooms.D = room('D', 1);
assert.strictEqual(supported(home).name, 'D');
assert.strictEqual(supported(room('A', 7)), undefined);

// Salle passée par des hostiles armés : soutien suspendu 1 500 ticks après leur départ ; un claimer seul ne compte pas.
const young = { memory: {} };
const hostile = (...types) => ({ body: types.map((type) => ({ type })) });
intel.threats = () => [hostile(CLAIM, MOVE)];
Game.time = 1000;
assert.ok(!raided(young));
intel.threats = () => [hostile(WORK, MOVE)];
assert.ok(raided(young));
intel.threats = () => [];
Game.time = 2499;
assert.ok(raided(young));
Game.time = 2500;
assert.ok(!raided(young));

console.log('expansion : ok');
