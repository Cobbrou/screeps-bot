// Vérifie la case du lien du hub hors du jeu : node test/planner.test.js
const assert = require('assert');

// Constantes du jeu utilisées au chargement de src/planner.js.
for (const type of ['STORAGE', 'TOWER', 'EXTENSION', 'SPAWN', 'FACTORY', 'POWER_SPAWN', 'NUKER', 'OBSERVER', 'LINK',
  'TERMINAL', 'EXTRACTOR', 'LAB']) global[`STRUCTURE_${type}`] = type.toLowerCase();
// Modules qui chargent le reste du bot : remplacés par des modules vides.
for (const name of ['sources', 'remoteMining', 'minCut', 'defense', 'boost', 'roles/upgrader', 'move']) {
  const path = require.resolve(`../src/${name}`);
  require.cache[path] = { id: path, filename: path, loaded: true, exports: {} };
}
const { hubLinkCell } = require('../src/planner');
const key = (x, y) => x * 50 + y;

// E25S3 : stockage (43,25), postes hors route (43,26) et (44,26). Le lien doit toucher l'un d'eux.
const posts = [key(43, 26), key(44, 26)];
const walls = [key(42, 27), key(43, 27), key(44, 27), key(41, 27)];
assert.strictEqual(hubLinkCell(key(43, 25), posts, (k) => !walls.includes(k)), key(45, 25));
// Case prise : la voisine suivante ; aucun poste à toucher : aucune case.
assert.strictEqual(hubLinkCell(key(43, 25), posts, (k) => ![...walls, key(45, 25)].includes(k)), key(45, 26));
assert.strictEqual(hubLinkCell(key(43, 25), [], () => true), undefined);

console.log('planner : ok');
