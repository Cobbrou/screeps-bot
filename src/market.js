// Ticks entre deux ventes d'une salle : le double de TERMINAL_COOLDOWN laisse le terminal disponible à chaque passage.
const INTERVAL = 20;
// Stock de minerai au terminal sous lequel on ne vend pas.
const MIN_SALE = 100;
// Prix net minimal, en part du prix moyen de la ressource sur 14 jours : un acheteur isolé ne fixe pas le prix.
const FLOOR = 0.8;
// Équilibrage : une salle sous POOR d'énergie reçoit d'une salle au-dessus de RICH. L'écart évite les allers-retours,
// chaque envoi perd son coût de transport.
const POOR = 50000;
const RICH = 100000;
// Plus petit envoi : en dessous, le transfert ne vaut pas la recharge du terminal, prise sur les ventes.
const MIN_SEND = 1000;

// Prix moyen sur l'historique du marché (14 jours), 0 s'il est vide.
function meanPrice(resource) {
  const history = Game.market.getHistory(resource) || [];
  return history.length ? history.reduce((sum, day) => sum + day.avgPrice, 0) / history.length : 0;
}

// Ordre d'achat au meilleur prix net pour cette salle : prix moins l'énergie du transport, valorisée au prix moyen.
// `unit` : énergie payée par unité vendue. Undefined si aucun ordre n'atteint le prix plancher.
function bestOrder(resource, roomName) {
  const mean = meanPrice(resource);
  if (!mean) return undefined;
  const energyPrice = meanPrice(RESOURCE_ENERGY);
  return Game.market.getAllOrders({ type: ORDER_BUY, resourceType: resource })
    .filter((order) => order.amount > 0 && order.roomName)
    .map((order) => {
      const unit = Game.market.calcTransactionCost(1000, roomName, order.roomName) / 1000;
      return { order, unit, net: order.price - unit * energyPrice };
    })
    .filter((offer) => offer.net >= mean * FLOOR)
    .sort((a, b) => b.net - a.net)[0];
}

// Vend le minerai du terminal au meilleur ordre, dans la limite de l'énergie du terminal.
function sell(room) {
  const terminal = room.terminal;
  if (terminal.cooldown) return;
  const resource = Object.keys(terminal.store).find((r) => r !== RESOURCE_ENERGY && terminal.store[r] >= MIN_SALE);
  if (!resource) return;
  const best = bestOrder(resource, room.name);
  if (!best) return;
  const amount = Math.min(best.order.amount, terminal.store[resource], Math.floor(terminal.store[RESOURCE_ENERGY] / best.unit));
  if (amount <= 0) return;
  const result = Game.market.deal(best.order.id, amount, room.name);
  console.log(`[market] ${room.name} : ${amount} ${resource} à ${best.order.price} vers ${best.order.roomName} (${result})`);
}

// Énergie de la salle, terminal compris : un envoi pas encore rangé au stockage compte déjà.
const stored = (room) => room.terminal.store[RESOURCE_ENERGY] + (room.storage ? room.storage.store[RESOURCE_ENERGY] : 0);

// Envoie l'énergie du terminal de la salle la plus riche vers la plus pauvre, coût de transport compris.
// Rend la salle émettrice : son terminal est pris pour ce tick.
function balance(rooms) {
  if (rooms.length < 2) return undefined;
  const sorted = [...rooms].sort((a, b) => stored(a) - stored(b));
  const poor = sorted[0];
  const rich = sorted[sorted.length - 1];
  if (stored(poor) >= POOR || stored(rich) < RICH || rich.terminal.cooldown) return undefined;
  const unit = Game.market.calcTransactionCost(1000, rich.name, poor.name) / 1000;
  const amount = Math.floor(rich.terminal.store[RESOURCE_ENERGY] / (1 + unit));
  if (amount < MIN_SEND) return undefined;
  const result = rich.terminal.send(RESOURCE_ENERGY, amount, poor.name);
  console.log(`[market] ${rich.name} : ${amount} énergie vers ${poor.name} (${result})`);
  return rich;
}

module.exports.run = function () {
  if (Game.time % INTERVAL) return;
  const rooms = Object.values(Game.rooms).filter((room) => room.terminal && room.terminal.my);
  const sender = balance(rooms);
  for (const room of rooms) {
    if (room !== sender) sell(room);
  }
};
