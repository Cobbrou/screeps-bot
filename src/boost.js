const move = require('./move');
const defense = require('./defense');

// Boost au lab, un seul lab (le premier construit) pour un seul usage à la fois (mode) :
// - en paix, les upgraders : BOOSTS.work, GH 1,5, GH2O 1,8, XGH2O 2 sur upgradeController, sans énergie en plus ;
// - en guerre (Memory.war, voir expansion), les gardes : BOOSTS.ranged_attack, KO 2, KHO2 3, XKHO2 4 sur rangedAttack,
//   l'amélioration étant en pause ;
// - en vigilance (defense.vigil : mode sans échec indisponible), les gardiens (warden) : BOOSTS.attack, UH 2, UH2O 3,
//   XUH2O 4 sur attack, appliqués au premier raid (UH ~550 à 650 crédits l'unité le 2026-11-27, ~600 000 par gardien).
// Le composé de l'autre mode resté au lab est rendu au terminal (labJob).
// Achetés au marché (market.buy), portés au lab par le mineralHauler, appliqués au créep neuf avant son poste.
// Prix plafond par point gagné (prix / ((multiplicateur - 1) × vie de la partie / unités par partie)) :
// relevé du 2026-11-17 pour l'amélioration, GH ~160, GH2O ~110, XGH2O ~160 crédits par point de contrôleur.
// Tir sans plafond : la reprise d'E24S3 passe avant les crédits (KO ~675 l'unité le 2026-11-26, ~850 000 pour 3 gardes).
// Stock visé (lab et terminal) : 30 WORK (deux upgraders de 15), 42 RANGED_ATTACK (3 gardes à 14, spawner.MAX_GUARDS),
// 64 ATTACK (deux gardiens de 32 ; le marché de shard0 n'avait que ~2 200 UH le 2026-11-27).
// ponytail: plafond fixe de l'amélioration, à revoir si les prix bougent ou si les crédits fondent.
const MODES = {
  upgrade: {
    part: WORK, action: 'upgradeController', parts: 30, maxPrice: 250,
    compounds: [RESOURCE_GHODIUM_HYDRIDE, RESOURCE_GHODIUM_ACID, RESOURCE_CATALYZED_GHODIUM_ACID],
  },
  ranged: {
    part: RANGED_ATTACK, action: 'rangedAttack', parts: 42, maxPrice: Infinity,
    compounds: [RESOURCE_KEANIUM_OXIDE, RESOURCE_KEANIUM_ALKALIDE, RESOURCE_CATALYZED_KEANIUM_ALKALIDE],
  },
  attack: {
    part: ATTACK, action: 'attack', parts: 64, maxPrice: Infinity,
    compounds: [RESOURCE_UTRIUM_HYDRIDE, RESOURCE_UTRIUM_ACID, RESOURCE_CATALYZED_UTRIUM_ACID],
  },
};
// Tous les composés achetés : jamais revendus (market.sell).
const COMPOUNDS = [...MODES.upgrade.compounds, ...MODES.ranged.compounds, ...MODES.attack.compounds];
// Crédits gardés en caisse : aucun achat ni lab en dessous.
const CREDIT_RESERVE = 5000000;

// Stockage sous ce seuil : achats de boost, énergie du lab, du terminal et récolte du minerai attendent (scarce).
// Seuil propre, pas celui des upgraders (room.memory.storageLow, 100 000 dès le RCL 7) : sous lui, le minerai (H vendu
// ~500 crédits l'unité) et le boost s'arrêtaient aussi, pour quelques centaines d'énergie (2026-11-26).
const LOW_STORED = 5000;

// Mode du lab : tir des gardes pendant une guerre, attaque des gardiens en vigilance, amélioration sinon.
function mode() {
  if (Memory.war) return MODES.ranged;
  return Object.values(Game.rooms).some(defense.vigil) ? MODES.attack : MODES.upgrade;
}

// Vrai si le stockage de la salle est sous LOW_STORED (faux sans stockage).
function scarce(room) {
  return !!room.storage && room.storage.store[RESOURCE_ENERGY] < LOW_STORED;
}

// Lab de boost de la salle (le premier construit), ou undefined.
function lab(room) {
  return room.find(FIND_MY_STRUCTURES, { filter: (s) => s.structureType === STRUCTURE_LAB })[0];
}

// Multiplicateur du composé sur l'action de son mode.
function multiplier(m, compound) {
  return BOOSTS[m.part][compound][m.action];
}

// Gain par unité de composé : (multiplicateur - 1) par tick de vie de la partie, LAB_BOOST_MINERAL unités par partie.
function gainPerUnit(m, compound) {
  return (multiplier(m, compound) - 1) * CREEP_LIFE_TIME / LAB_BOOST_MINERAL;
}

// Stock du composé dans le lab et le terminal.
function stock(room, compound) {
  const l = lab(room);
  return (l ? l.store[compound] : 0) + (room.terminal ? room.terminal.store[compound] : 0);
}

// Composé du mode en stock (lab d'abord, puis terminal), ou undefined : on rachète le même pour ne pas mélanger dans le lab.
// Un reste trop petit pour booster une partie ne compte pas : le 2026-11-23, 7 GH2O au lab, que personne ne vendait plus,
// empêchaient tout achat (20 millions de crédits disponibles). labJob l'ôte du lab quand un autre composé arrive.
function held(room) {
  const l = lab(room);
  const usable = mode().compounds.filter((c) => stock(room, c) >= LAB_BOOST_MINERAL);
  return usable.find((c) => l && l.store[c] > 0) || usable[0];
}

// Vrai si la salle peut booster : terminal, crédits au-dessus de la réserve.
function wanted(room) {
  return !!room.terminal && Game.market.credits >= CREDIT_RESERVE;
}

// Achat à faire : { order, amount } sur l'ordre de vente le moins cher par point gagné (composé en stock imposé),
// sous le plafond du mode, ou undefined. Rien tant que le stockage est presque vide (scarce).
function purchase(room) {
  if (!lab(room) || !wanted(room) || scarce(room)) return undefined;
  const m = mode();
  const target = m.parts * LAB_BOOST_MINERAL;
  const current = held(room);
  const missing = target - (current ? stock(room, current) : 0);
  if (missing < target / 3) return undefined;
  const best = (current ? [current] : m.compounds)
    .flatMap((c) => Game.market.getAllOrders({ type: ORDER_SELL, resourceType: c })
      .filter((o) => o.amount > 0 && o.roomName)
      .map((order) => ({ order, cost: order.price / gainPerUnit(m, c) })))
    .filter((o) => o.cost <= m.maxPrice)
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
  const m = mode();
  const compound = held(room);
  const rest = compound && COMPOUNDS.find((c) => c !== compound && l.store[c] > 0);
  if (rest) return { from: l, resource: rest, to: room.terminal };
  if (compound && l.store[compound] < m.parts * LAB_BOOST_MINERAL && room.terminal.store[compound] > 0) {
    return { from: room.terminal, resource: compound, to: l };
  }
  if (compound && l.store[RESOURCE_ENERGY] < m.parts * LAB_BOOST_ENERGY && !scarce(room)) {
    return { from: room.storage, resource: RESOURCE_ENERGY, to: l };
  }
  return undefined;
}

// Composé du mode prêt au lab (de quoi booster une partie), ou undefined.
function ready(l) {
  return l && mode().compounds.find((c) => l.store[c] >= LAB_BOOST_MINERAL);
}

// Parties du mode (WORK ou RANGED_ATTACK) que le lab peut booster sur un corps qui en a `n` (composé et énergie du lab).
function parts(room, n) {
  const l = lab(room);
  const compound = ready(l);
  if (!compound) return 0;
  return Math.min(n, Math.floor(l.store[compound] / LAB_BOOST_MINERAL), Math.floor(l.store[RESOURCE_ENERGY] / LAB_BOOST_ENERGY));
}

// Multiplicateur que le lab donnerait aux `n` parties du mode d'un corps neuf : celui du composé s'il les couvre toutes, 1 sinon.
function factor(room, n) {
  const compound = ready(lab(room));
  return compound && parts(room, n) >= n ? multiplier(mode(), compound) : 1;
}

// Vrai si le lab est en mode attaque et peut booster les `n` ATTACK d'un gardien (au moins une partie).
function attackReady(room, n) {
  return mode() === MODES.attack && parts(room, n) > 0;
}

// Créep marqué au spawn (creep.memory.boost) : va au lab et s'y fait booster ses parties du mode. Vrai tant qu'il s'en occupe.
// Nombre de parties passé explicitement : la doc ne dit pas si boostCreep boosterait une partie du corps faute de stock.
function apply(creep) {
  const l = lab(creep.room);
  const n = parts(creep.room, creep.getActiveBodyparts(mode().part));
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

module.exports = { COMPOUNDS, CREDIT_RESERVE, scarce, lab, wanted, purchase, labJob, parts, factor, apply, attackReady };
