// Vérifie le boost des upgraders hors du jeu : node test/boost.test.js
const assert = require('assert');

// Constantes et objets du jeu utilisés par src/boost.js et src/move.js.
Object.assign(global, {
  RESOURCE_ENERGY: 'energy',
  RESOURCE_GHODIUM_HYDRIDE: 'GH',
  RESOURCE_GHODIUM_ACID: 'GH2O',
  RESOURCE_CATALYZED_GHODIUM_ACID: 'XGH2O',
  LAB_BOOST_MINERAL: 30,
  LAB_BOOST_ENERGY: 20,
  CREEP_LIFE_TIME: 1500,
  ORDER_SELL: 'sell',
  FIND_MY_STRUCTURES: 108,
  STRUCTURE_LAB: 'lab',
  BOOSTS: { work: { GH: { upgradeController: 1.5 }, GH2O: { upgradeController: 1.8 }, XGH2O: { upgradeController: 2 } } },
});
// move charge tout le reste du bot (intel, defense) : remplacé par un module vide.
const movePath = require.resolve('../src/move');
require.cache[movePath] = { id: movePath, filename: movePath, loaded: true, exports: { to() {} } };
const boost = require('../src/boost');

const store = (o) => new Proxy(o, { get: (t, k) => t[k] || 0 });
const orders = [
  { id: 'gh', resourceType: 'GH', price: 3732, amount: 10000, roomName: 'E7S36' },
  { id: 'gh2o', resourceType: 'GH2O', price: 4087, amount: 2000, roomName: 'W69S63' },
  { id: 'x', resourceType: 'XGH2O', price: 7355, amount: 5747, roomName: 'E16S58' },
];
global.Game = {
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
// Stock presque plein, stockage bas, crédits sous la réserve ou pas de lab : aucun achat.
assert.strictEqual(boost.purchase(room({ GH2O: 700 }, {})), undefined);
assert.strictEqual(boost.purchase(room({}, {}, { storageLow: true })), undefined);
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
assert.strictEqual(boost.labJob(room({ GH: 900, energy: 100 }, {}, { storageLow: true })), undefined);
assert.strictEqual(boost.labJob(room({ GH: 900, energy: 2000 }, { GH: 500 })), undefined);

console.log('boost : OK');
