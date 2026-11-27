// Vérifie le boost des upgraders et des gardes hors du jeu : node test/boost.test.js
const assert = require('assert');

// Constantes et objets du jeu utilisés par src/boost.js et src/move.js.
Object.assign(global, {
  RESOURCE_ENERGY: 'energy',
  RESOURCE_GHODIUM_HYDRIDE: 'GH',
  RESOURCE_GHODIUM_ACID: 'GH2O',
  RESOURCE_CATALYZED_GHODIUM_ACID: 'XGH2O',
  RESOURCE_KEANIUM_OXIDE: 'KO',
  RESOURCE_KEANIUM_ALKALIDE: 'KHO2',
  RESOURCE_CATALYZED_KEANIUM_ALKALIDE: 'XKHO2',
  RESOURCE_UTRIUM_HYDRIDE: 'UH',
  RESOURCE_UTRIUM_ACID: 'UH2O',
  RESOURCE_CATALYZED_UTRIUM_ACID: 'XUH2O',
  WORK: 'work',
  ATTACK: 'attack',
  RANGED_ATTACK: 'ranged_attack',
  LAB_BOOST_MINERAL: 30,
  LAB_BOOST_ENERGY: 20,
  LAB_MINERAL_CAPACITY: 3000,
  LAB_ENERGY_CAPACITY: 2000,
  CREEP_LIFE_TIME: 1500,
  ORDER_SELL: 'sell',
  FIND_MY_STRUCTURES: 108,
  STRUCTURE_LAB: 'lab',
  BOOSTS: {
    work: { GH: { upgradeController: 1.5 }, GH2O: { upgradeController: 1.8 }, XGH2O: { upgradeController: 2 } },
    ranged_attack: { KO: { rangedAttack: 2 }, KHO2: { rangedAttack: 3 }, XKHO2: { rangedAttack: 4 } },
    attack: { UH: { attack: 2 }, UH2O: { attack: 3 }, XUH2O: { attack: 4 } },
  },
  Memory: {},
});
// move charge tout le reste du bot (intel, defense) : remplacé par un module vide.
const movePath = require.resolve('../src/move');
require.cache[movePath] = { id: movePath, filename: movePath, loaded: true, exports: { to() {} } };
// defense : vigilance pilotée par le test (salle dont le nom est dans `vigilant`).
const vigilant = new Set();
const defensePath = require.resolve('../src/defense');
require.cache[defensePath] = { id: defensePath, filename: defensePath, loaded: true, exports: { vigil: (r) => vigilant.has(r.name) } };
const boost = require('../src/boost');

const store = (o) => new Proxy(o, { get: (t, k) => t[k] || 0 });
const orders = [
  { id: 'gh', resourceType: 'GH', price: 3732, amount: 10000, roomName: 'E7S36' },
  { id: 'gh2o', resourceType: 'GH2O', price: 4087, amount: 2000, roomName: 'W69S63' },
  { id: 'x', resourceType: 'XGH2O', price: 7355, amount: 5747, roomName: 'E16S58' },
];
global.Game = {
  rooms: {},
  market: { credits: 55e6, getAllOrders: ({ resourceType }) => orders.filter((o) => o.resourceType === resourceType) },
};
const room = (lab, terminal, memory = {}) => ({
  memory,
  terminal: { store: store(terminal) },
  storage: { store: store({ energy: 20000 }) },
  find: () => (lab ? [{ structureType: 'lab', store: store(lab) }] : []),
});

// Rien en stock : le moins cher par point (GH2O, ~110 crédits), pour tout le stock visé.
let r = room({}, { energy: 5000 });
assert.deepStrictEqual(boost.purchase(r), { order: orders[1], amount: 900 });
// GH en stock : on rachète du GH, pas un autre composé.
r = room({ GH: 300 }, { energy: 5000 });
assert.strictEqual(boost.purchase(r).order.id, 'gh');
assert.strictEqual(boost.purchase(r).amount, 600);
// Reste inutilisable au lab (7 GH2O, le 2026-11-23) : il n'impose plus son composé. Une partie boostable (30), si.
const gh2o = orders.splice(1, 1)[0];
assert.strictEqual(boost.purchase(room({ GH2O: 7 }, { energy: 5000 })).order.id, 'x');
assert.strictEqual(boost.purchase(room({ GH2O: 30 }, { energy: 5000 })), undefined);
orders.splice(1, 0, gh2o);
// Stock presque plein, stockage presque vide (sous 5 000), crédits sous la réserve ou pas de lab : aucun achat.
// La pause des upgraders (storageLow, 100 000 au RCL 7) ne l'arrête pas.
const poor = (r) => Object.assign(r, { storage: { store: store({ energy: 4000 }) } });
assert.strictEqual(boost.purchase(room({ GH2O: 700 }, {})), undefined);
assert.strictEqual(boost.purchase(poor(room({}, {}))), undefined);
assert.ok(boost.purchase(room({}, {}, { storageLow: true })));
assert.strictEqual(boost.purchase(room(undefined, {})), undefined);
Game.market.credits = 1e6;
assert.strictEqual(boost.purchase(room({}, {})), undefined);
Game.market.credits = 55e6;
// Prix trop haut : aucun ordre retenu.
orders.forEach((o) => { o.price *= 3; });
assert.strictEqual(boost.purchase(room({}, {})), undefined);

// Parties boostables : limitées par le corps, le composé (30/partie) et l'énergie (20/partie).
assert.strictEqual(boost.parts(room({ GH: 900, energy: 2000 }, {}), 15), 15);
assert.strictEqual(boost.parts(room({ GH: 200, energy: 2000 }, {}), 15), 6);
assert.strictEqual(boost.parts(room({ GH: 900, energy: 100 }, {}), 15), 5);
assert.strictEqual(boost.parts(room({ energy: 2000 }, {}), 15), 0);

// Travail du transporteur : composé du terminal vers le lab, puis énergie du stockage.
r = room({ energy: 2000 }, { GH: 500 });
assert.strictEqual(boost.labJob(r).resource, 'GH');
assert.strictEqual(boost.labJob(r).from, r.terminal);
r = room({ GH: 900, energy: 100 }, {});
assert.strictEqual(boost.labJob(r).resource, 'energy');
assert.strictEqual(boost.labJob(poor(room({ GH: 900, energy: 100 }, {}))), undefined);
assert.strictEqual(boost.labJob(room({ GH: 900, energy: 100 }, {}, { storageLow: true })).resource, 'energy');
assert.strictEqual(boost.labJob(room({ GH: 900, energy: 2000 }, { GH: 500 })), undefined);
// Reste d'un autre composé au lab : rendu au terminal d'abord. Sans rien à mettre à la place, il y reste.
r = room({ GH2O: 7, energy: 2000 }, { XGH2O: 900 });
assert.strictEqual(boost.labJob(r).resource, 'GH2O');
assert.strictEqual(boost.labJob(r).to, r.terminal);
assert.strictEqual(boost.labJob(room({ GH2O: 7, energy: 2000 }, {})), undefined);

// Guerre (Memory.war) : composé de tir au moins cher par point, 42 RANGED_ATTACK visés (1 260), sans plafond de prix.
Memory.war = { target: 'E24S3' };
orders.push({ id: 'ko', resourceType: 'KO', price: 675, amount: 5000, roomName: 'E1S1' },
  { id: 'kho2', resourceType: 'KHO2', price: 2281, amount: 8000, roomName: 'E2S2' });
assert.deepStrictEqual(boost.purchase(room({}, { energy: 5000 })), { order: orders[3], amount: 1260 });
// GH resté au lab : rendu au terminal dès que le KO est là, puis KO porté au lab.
r = room({ GH: 910, energy: 180 }, { KO: 1260 });
assert.strictEqual(boost.labJob(r).resource, 'GH');
r = room({ energy: 840 }, { KO: 1260 });
assert.strictEqual(boost.labJob(r).resource, 'KO');
// Garde de 14 RANGED_ATTACK : boosté ×2 si le lab couvre ses 14 parties, ×1 sinon ; le GH ne compte plus.
assert.strictEqual(boost.factor(room({ KO: 1260, energy: 840 }, {}), 14), 2);
assert.strictEqual(boost.factor(room({ KO: 300, energy: 840 }, {}), 14), 1);
assert.strictEqual(boost.parts(room({ GH: 900, energy: 840 }, {}), 14), 0);
delete Memory.war;

// Vigilance (mode sans échec indisponible) : le lab passe en attaque, achat pour 128 ATTACK (3 840 unités).
Game.rooms = { E25S3: { name: 'E25S3' } };
vigilant.add('E25S3');
orders.push({ id: 'uh', resourceType: 'UH', price: 643, amount: 1000, roomName: 'E20S5' });
assert.deepStrictEqual(boost.purchase(room({}, { energy: 5000 })), { order: orders[orders.length - 1], amount: 1000 });
// Marché du 2026-11-27 : UH trop rare pour tout le stock, le composé qui le couvre au meilleur prix par point (XUH2O).
// Aucune réserve de crédits : 2 M de crédits paient 783 XUH2O.
orders.push({ id: 'uh2o', resourceType: 'UH2O', price: 1863, amount: 38176, roomName: 'E7S24' },
  { id: 'xuh2o', resourceType: 'XUH2O', price: 2554, amount: 5577, roomName: 'E15S51' });
Game.market.credits = 2e6;
assert.deepStrictEqual(boost.purchase(room({}, { energy: 5000 })), { order: orders[orders.length - 1], amount: 783 });
// UH déjà en stock : on rachète de l'UH, même rare.
assert.strictEqual(boost.purchase(room({ UH: 300 }, {})).order.id, 'uh');
Game.market.credits = 55e6;
// Lab rempli jusqu'à sa capacité, pas jusqu'aux 128 parties : plein, il ne réclame plus rien.
assert.strictEqual(boost.labJob(room({ UH: 3000, energy: 2000 }, { UH: 840 })), undefined);
assert.strictEqual(boost.labJob(room({ UH: 2900, energy: 2000 }, { UH: 840 })).resource, 'UH');
assert.ok(boost.attackReady(room({ UH: 960, energy: 1280 }, {}), 32));
assert.ok(!boost.attackReady(room({ GH: 960, energy: 1280 }, {}), 32));
vigilant.clear();
assert.ok(!boost.attackReady(room({ UH: 960, energy: 1280 }, {}), 32));

console.log('boost : OK');
