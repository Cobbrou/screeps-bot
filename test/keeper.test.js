// Vérifie la récolte des salles à keepers hors du jeu : node test/keeper.test.js
const assert = require('assert');

// Constantes du jeu utilisées au chargement de src/remoteMining.js et src/intel.js.
Object.assign(global, {
  MOVE: 'move', WORK: 'work', CARRY: 'carry', ATTACK: 'attack', RANGED_ATTACK: 'ranged_attack', HEAL: 'heal', CLAIM: 'claim',
  BODYPART_COST: { move: 50, work: 100, carry: 50, attack: 80, ranged_attack: 150, heal: 250, claim: 600 },
  SOURCE_ENERGY_NEUTRAL_CAPACITY: 1500, SOURCE_ENERGY_CAPACITY: 3000, SOURCE_ENERGY_KEEPER_CAPACITY: 4000,
  ENERGY_REGEN_TIME: 300, HARVEST_POWER: 2, CONTROLLER_RESERVE_MAX: 5000, CARRY_CAPACITY: 50, CREEP_LIFE_TIME: 1500,
  CONTAINER_CAPACITY: 2000, RANGED_ATTACK_POWER: 10, HEAL_POWER: 12, CREEP_SPAWN_TIME: 3,
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
// Force notée inconnue : il y va.
assert.ok(remoteMining.huntable('E25S4'));
// Combat du 2026-11-20 (gagné) : 2 healers à 5 HEAL (120), 2 tireurs à 3 RANGED_ATTACK (60, sous son soin), 4 000 PV.
const force = { heal: 2 * 5 * HEAL_POWER, damage: 2 * 3 * RANGED_ATTACK_POWER, hits: 4000 };
Memory.rooms.E25S4.intel.force = force;
assert.ok(remoteMining.huntable('E25S4'));
// Un healer boosté en plus (LO, x2 : 120 de plus, 2026-11-21) : soin au-dessus de ses dégâts, il n'y va pas.
Memory.rooms.E25S4.intel.force = Object.assign({}, force, { heal: force.heal + 5 * HEAL_POWER * 2 });
assert.ok(!remoteMining.huntable('E25S4'));
// Sans healer, 3 tireurs boostés (XKHO2, x4 : 360/tick) : 3 000 PV abattus en ~21 ticks, il tient ~18 ticks : non.
Memory.rooms.E25S4.intel.force = { heal: 0, damage: 3 * 3 * RANGED_ATTACK_POWER * 4, hits: 3000 };
assert.ok(!remoteMining.huntable('E25S4'));
// Mêmes tireurs non boostés (90/tick, sous son soin) : oui ; boostés x2 (180) : il tient ~64 ticks, oui ;
// mais pas avec 1 000 PV restants (~14 ticks).
Memory.rooms.E25S4.intel.force.damage = 3 * 3 * RANGED_ATTACK_POWER;
assert.ok(remoteMining.huntable('E25S4'));
Memory.rooms.E25S4.intel.force.damage *= 2;
assert.ok(remoteMining.huntable('E25S4'));
assert.ok(!remoteMining.huntable('E25S4', 1000));
// Groupe du 2026-11-21 détaillé par créep : healer XLHO2 (240 de soin, 1 000 PV), 2 tireurs XKHO2 (120 chacun ;
// 2 TOUGH XGHO2 : 200 / 0,3 + 800 PV à abattre). Un tueur seul : non ; deux, healer abattu d'abord : oui.
const shooter = { heal: 0, damage: 120, hits: 1467 };
Memory.rooms.E25S4.intel.force = { heal: 240, damage: 240, hits: 3934, creeps: [shooter, { heal: 240, damage: 0, hits: 1000 }, shooter] };
assert.ok(!remoteMining.huntable('E25S4'));
assert.ok(remoteMining.huntable('E25S4', undefined, 2));
// Deux tueurs déjà entamés (le plus touché à 3 000 PV) : le tir les use trop pendant le healer, ils rentrent.
assert.ok(!remoteMining.huntable('E25S4', 3000, 2));
Memory.rooms.E25S4.intel.force = null;
Memory.rooms.E25S4.intel.invader = false;
assert.ok(!intel.keeperInvaded('E25S4'));
// Invaders abattus (clear) : la salle rouvre sans attendre HOSTILE_COOLDOWN.
Memory.rooms.E25S4.intel.invader = true;
intel.clear('E25S4');
assert.ok(intel.safe('E25S4') && !intel.keeperInvaded('E25S4'));
// Salle normale sans contrôleur libre : toujours fermée.
assert.ok(!intel.safe('E25S2'));
// Réouverture (recyclage des créeps distants) : 0 si sûre, fin de HOSTILE_COOLDOWN après des hostiles, jamais sinon.
assert.strictEqual(intel.reopenIn('E25S4'), 0);
Memory.rooms.E25S4.intel.hostile = Game.time - 500;
assert.strictEqual(intel.reopenIn('E25S4'), 1001);
assert.strictEqual(intel.reopenIn('E25S2'), Infinity);
// Invaders qu'aucun groupe de tueurs n'abat (2026-11-23 : 300 de soin) : pas de tueur, sauf à moins de son spawn
// et de son trajet de leur mort, pour qu'il soit là à la réouverture.
Game.map = { describeExits: () => ({ 5: 'E25S4' }) };
const e25s3 = { name: 'E25S3', controller: { level: 7 }, energyCapacityAvailable: 5600 };
Memory.rooms.E25S4.intel.invader = true;
Memory.rooms.E25S4.intel.force = { heal: 300, damage: 60, hits: 4000, creeps: [
  { heal: 0, damage: 30, hits: 1000 }, { heal: 0, damage: 30, hits: 1000 },
  { heal: 240, damage: 0, hits: 1000 }, { heal: 60, damage: 0, hits: 1000 }] };
assert.strictEqual(remoteMining.killersWanted(e25s3), 0);
Memory.rooms.E25S4.intel.hostile = Game.time - 1400;
assert.strictEqual(remoteMining.killersWanted(e25s3), 1);
assert.strictEqual(remoteMining.keeperRooms(e25s3)[0], 'E25S4');
Memory.rooms.E25S4.intel.hostile = Game.time - 500;
Memory.rooms.E25S4.intel.invader = false;
Memory.rooms.E25S4.intel.force = null;

// Route pavée : aller-retour = 2 fois le chemin gardé, plus les sorties et le conteneur (sans pathfinding).
const home = { memory: { remoteRoads: { a: { path: { E25S3: [1, 2, 3], E25S4: [4, 5] }, done: true } } } };
assert.strictEqual(remoteMining.trip(home, { id: 'a', x: 1, y: 1, room: 'E25S4' }), 2 * (5 + 3));

// Source d'une salle à keepers à une seule case libre : pas de conteneur (chantier détruit par le keeper) ; ailleurs, oui.
const sources = require('../src/sources');
sources.spots = () => 1;
assert.ok(!remoteMining.containable({ room: { name: 'E25S4' } }));
assert.ok(remoteMining.containable({ room: { name: 'E25S2' } }));
sources.spots = () => 2;
assert.ok(remoteMining.containable({ room: { name: 'E25S4' } }));

console.log('keeper : ok');
