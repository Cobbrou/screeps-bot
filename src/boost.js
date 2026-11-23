const move = require('./move');

// Boost des upgraders : composés qui multiplient la progression de upgradeController sans coût d'énergie en plus
// (BOOSTS.work : GH 1,5, GH2O 1,8, XGH2O 2). Achetés au marché (market.buy), portés au lab par le mineralHauler,
// appliqués à l'upgrader neuf avant qu'il rejoigne son poste.
const COMPOUNDS = [RESOURCE_GHODIUM_HYDRIDE, RESOURCE_GHODIUM_ACID, RESOURCE_CATALYZED_GHODIUM_ACID];
// Crédits gardés en caisse : aucun achat ni lab en dessous.
const CREDIT_RESERVE = 5000000;
// Prix maximal d'un point de contrôleur gagné : prix du composé / points en plus sur la vie de la partie boostée.
// Relevé du 2026-11-17 : GH ~160, GH2O ~110, XGH2O ~160 crédits par point.
// ponytail: plafond fixe, à revoir si les prix bougent ou si les crédits fondent.
const MAX_PRICE_PER_POINT = 250;
// Stock visé (lab et terminal) : de quoi booster 30 WORK, deux upgraders de 15.
const STOCK = 30 * LAB_BOOST_MINERAL;
// Énergie gardée dans le lab : de quoi booster 30 WORK.
const LAB_ENERGY = 30 * LAB_BOOST_ENERGY;

// Lab de boost de la salle (le premier construit), ou undefined.
function lab(room) {
  return room.find(FIND_MY_STRUCTURES, { filter: (s) => s.structureType === STRUCTURE_LAB })[0];
}

// Points de contrôleur gagnés par unité de composé : (multiplicateur - 1) par tick de vie de la partie,
// LAB_BOOST_MINERAL unités par partie.
function pointsPerUnit(compound) {
  return (BOOSTS.work[compound].upgradeController - 1) * CREEP_LIFE_TIME / LAB_BOOST_MINERAL;
}

// Stock du composé dans le lab et le terminal.
function stock(room, compound) {
  const l = lab(room);
  return (l ? l.store[compound] : 0) + (room.terminal ? room.terminal.store[compound] : 0);
}

// Composé en stock (lab d'abord, puis terminal), ou undefined : on rachète le même pour ne pas mélanger dans le lab.
// Un reste trop petit pour booster une partie ne compte pas : le 2026-11-23, 7 GH2O au lab, que personne ne vendait plus,
// empêchaient tout achat (20 millions de crédits disponibles). labJob l'ôte du lab quand un autre composé arrive.
function held(room) {
  const l = lab(room);
  const usable = COMPOUNDS.filter((c) => stock(room, c) >= LAB_BOOST_MINERAL);
  return usable.find((c) => l && l.store[c] > 0) || usable[0];
}

// Vrai si la salle peut booster : terminal, crédits au-dessus de la réserve.
function wanted(room) {
  return !!room.terminal && Game.market.credits >= CREDIT_RESERVE;
}

// Achat à faire : { order, amount } sur l'ordre de vente le moins cher par point (composé en stock imposé),
// sous MAX_PRICE_PER_POINT, ou undefined. Rien tant que le stockage est bas (upgraders en pause).
function purchase(room) {
  if (!lab(room) || !wanted(room) || room.memory.storageLow) return undefined;
  const current = held(room);
  const missing = STOCK - (current ? stock(room, current) : 0);
  if (missing < STOCK / 3) return undefined;
  const best = (current ? [current] : COMPOUNDS)
    .flatMap((c) => Game.market.getAllOrders({ type: ORDER_SELL, resourceType: c })
      .filter((o) => o.amount > 0 && o.roomName)
      .map((order) => ({ order, cost: order.price / pointsPerUnit(c) })))
    .filter((o) => o.cost <= MAX_PRICE_PER_POINT)
    .sort((a, b) => a.cost - b.cost)[0];
  if (!best) return undefined;
  // Achat plafonné pour que la caisse reste au-dessus de la réserve après paiement ; rien sous une partie boostée.
  const affordable = Math.floor((Game.market.credits - CREDIT_RESERVE) / best.order.price);
  const amount = Math.min(best.order.amount, missing, affordable);
  if (amount < LAB_BOOST_MINERAL) return undefined;
  return { order: best.order, amount };
}

// Chargement à porter au lab pour le mineralHauler ({ from, resource, to }), ou undefined :
// reste d'un autre composé rendu au terminal (un lab n'en garde qu'un), composé du terminal, puis énergie du stockage.
function labJob(room) {
  const l = lab(room);
  if (!l || !room.terminal || !room.storage) return undefined;
  const compound = held(room);
  const rest = compound && COMPOUNDS.find((c) => c !== compound && l.store[c] > 0);
  if (rest) return { from: l, resource: rest, to: room.terminal };
  if (compound && l.store[compound] < STOCK && room.terminal.store[compound] > 0) {
    return { from: room.terminal, resource: compound, to: l };
  }
  if (compound && l.store[RESOURCE_ENERGY] < LAB_ENERGY && !room.memory.storageLow) {
    return { from: room.storage, resource: RESOURCE_ENERGY, to: l };
  }
  return undefined;
}

// Parties WORK que le lab peut booster sur un corps de `work` WORK (composé et énergie du lab).
function parts(room, work) {
  const l = lab(room);
  const compound = l && COMPOUNDS.find((c) => l.store[c] >= LAB_BOOST_MINERAL);
  if (!compound) return 0;
  return Math.min(work, Math.floor(l.store[compound] / LAB_BOOST_MINERAL), Math.floor(l.store[RESOURCE_ENERGY] / LAB_BOOST_ENERGY));
}

// Upgrader marqué au spawn (creep.memory.boost) : va au lab et s'y fait booster. Vrai tant qu'il s'en occupe.
// Nombre de parties passé explicitement : la doc ne dit pas si boostCreep boosterait une partie du corps faute de stock.
function apply(creep) {
  const l = lab(creep.room);
  const n = parts(creep.room, creep.getActiveBodyparts(WORK));
  if (!l || !n) {
    delete creep.memory.boost;
    return false;
  }
  if (!creep.pos.isNearTo(l)) {
    move.to(creep, l);
    return true;
  }
  l.boostCreep(creep, n);
  delete creep.memory.boost;
  return true;
}

module.exports = { COMPOUNDS, CREDIT_RESERVE, lab, wanted, purchase, labJob, parts, apply };
