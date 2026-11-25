// Vérifie la salle à soutenir hors du jeu : node test/expansion.test.js
const assert = require('assert');

for (const name of ['intel', 'sources']) {
  const path = require.resolve(`../src/${name}`);
  require.cache[path] = { id: path, filename: path, loaded: true, exports: {} };
}
const { supported } = require('../src/expansion');

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

console.log('expansion : ok');
