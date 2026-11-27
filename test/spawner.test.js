// Vérifie le rôle créé en urgence hors du jeu : node test/spawner.test.js
const assert = require('assert');

// Constantes du jeu utilisées au chargement de src/spawner.js.
Object.assign(global, {
  MOVE: 'move', WORK: 'work', CARRY: 'carry', BODYPART_COST: { move: 50, work: 100, carry: 50 },
  UPGRADE_CONTROLLER_POWER: 1, CREEP_LIFE_TIME: 1500,
  STRUCTURE_WALL: 'constructedWall', STRUCTURE_RAMPART: 'rampart', RESOURCE_ENERGY: 'energy',
});
// Modules qui chargent le reste du bot : remplacés par des modules vides.
for (const name of ['sources', 'defense', 'intel', 'expansion', 'roles/upgrader', 'roles/mineralMiner',
  'roles/mineralHauler', 'roles/carrier', 'roles/scout', 'remoteMining', 'boost']) {
  const path = require.resolve(`../src/${name}`);
  require.cache[path] = { id: path, filename: path, loaded: true, exports: {} };
}
const { emergencyRole, fortifying } = require('../src/spawner');

// Mineur et hauler, harvester, ou filler avec du stock : pas d'urgence.
assert.strictEqual(emergencyRole({ miner: 1, hauler: 1 }, { hauler: 1 }, false), undefined);
assert.strictEqual(emergencyRole({ harvester: 1 }, { hauler: 1 }, false), undefined);
assert.strictEqual(emergencyRole({ miner: 2 }, { hauler: 0 }, true), undefined);
// Salle vide, ou haulers sans mineur : harvester.
assert.strictEqual(emergencyRole({}, { hauler: 0 }, false), 'harvester');
assert.strictEqual(emergencyRole({ hauler: 2 }, { hauler: 2 }, false), 'harvester');
// Haulers morts, mineur vivant : hauler s'il est voulu ; sources toutes liées (aucun voulu), harvester.
assert.strictEqual(emergencyRole({ miner: 2 }, { hauler: 1 }, false), 'hauler');
assert.strictEqual(emergencyRole({ miner: 2 }, { hauler: 0 }, false), 'harvester');

// Builders d'entretien en renfort : mur de la coupe sous sa cible, RCL 7 et stockage au-dessus de FORTIFY_FLOOR.
const room = (level, energy) => ({ controller: { level }, storage: { store: { energy } } });
const wall = { structureType: 'constructedWall' };
assert.strictEqual(fortifying(room(7, 100000), wall), true);
assert.strictEqual(fortifying(room(7, 100000), { structureType: 'rampart' }), true);
assert.strictEqual(fortifying(room(7, 100000), { structureType: 'road' }), false);
assert.strictEqual(fortifying(room(7, 100000), null), false);
assert.strictEqual(fortifying(room(6, 100000), wall), false);
assert.strictEqual(fortifying(room(7, 20000), wall), false);

console.log('spawner : ok');
