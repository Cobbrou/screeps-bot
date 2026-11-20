const move = require('../move');
const sources = require('../sources');
const mineralMiner = require('./mineralMiner');
const boost = require('../boost');

// Charge d'un voyage (corps du spawner) et stock du conteneur qui justifie un voyage.
const LOAD = 500;
// Énergie gardée dans le terminal pour payer le transport des ventes (Game.market.deal). Sans transporteur vivant,
// il n'en est créé un que sous la moitié : pas de créep pour quelques points.
const TERMINAL_ENERGY = 5000;

const box = (room) => {
  const mineral = room.find(FIND_MINERALS)[0];
  return mineral && sources.container(mineral);
};
// Première ressource présente : un Store peut garder des clés à 0.
const carried = (object) => Object.keys(object.store).find((r) => object.store[r] > 0);

// Voyage au conteneur du minerai : LOAD au moins, ou le reste si `alive` et que plus aucun mineur n'est voulu.
// Sert aussi aux haulers inoccupés. Undefined sans stockage (où décharger).
function boxJob(room, alive) {
  if (!room.storage) return undefined;
  const source = box(room);
  const stock = source ? source.store.getUsedCapacity() : 0;
  if (stock >= LOAD || (alive && stock && !mineralMiner.wanted(room))) return { from: source, resource: carried(source) };
  return undefined;
}

// Minerai au sol, dans une pierre tombale ou une ruine (créep mort chargé) : les haulers ne ramassent que l'énergie.
// Le plus proche joignable, ou undefined ; undefined aussi sans stockage ni terminal (où décharger).
// Pas compté dans ready : les haulers inoccupés suffisent, pas de transporteur créé pour un tas.
function leftover(creep) {
  const room = creep.room;
  if (!room.storage && !room.terminal) return undefined;
  const mineral = (o) => Object.keys(o.store).find((r) => r !== RESOURCE_ENERGY && o.store[r] > 0);
  const found = [
    ...room.find(FIND_DROPPED_RESOURCES, { filter: (r) => r.resourceType !== RESOURCE_ENERGY }),
    ...room.find(FIND_TOMBSTONES, { filter: mineral }),
    ...room.find(FIND_RUINS, { filter: mineral }),
  ].filter((o) => move.reachable(creep, o));
  const from = creep.pos.findClosestByRange(found);
  return from ? { from, resource: from.store ? mineral(from) : from.resourceType } : undefined;
}

// Prend le chargement `next` (job, boxJob ou leftover) : withdraw d'un Store, pickup d'un tas au sol.
// Destination imposée (`next.to`, lab de boost) gardée dans creep.memory.to pour unload.
function take(creep, next) {
  if (next.to) creep.memory.to = next.to.id;
  else delete creep.memory.to;
  const result = next.from.store ? creep.withdraw(next.from, next.resource) : creep.pickup(next.from);
  if (result === ERR_NOT_IN_RANGE) move.to(creep, next.from);
}

// Prochain chargement de la salle, ou undefined : conteneur du minerai, puis lab de boost (boost.labJob), puis énergie reçue en trop au terminal,
// puis minerai du stockage vers le terminal, puis énergie du terminal. `alive` : le transporteur existe déjà, il finit aussi les restes et les petits appoints.
function job(room, alive) {
  const { storage, terminal } = room;
  if (!storage) return undefined;
  // Terminal sous la moitié de sa réserve : rechargé avant le minerai. Le conteneur du minerai a toujours LOAD
  // à chaque retour, il passait devant à chaque voyage et le terminal restait à 0, sans plus aucune vente.
  if (terminal && terminal.store[RESOURCE_ENERGY] < TERMINAL_ENERGY / 2 && !room.memory.storageLow) {
    return { from: storage, resource: RESOURCE_ENERGY };
  }
  const fromBox = boxJob(room, alive);
  if (fromBox) return fromBox;
  if (!terminal) return undefined;
  const toLab = boost.labJob(room);
  if (toLab) return toLab;
  if (terminal.store[RESOURCE_ENERGY] >= TERMINAL_ENERGY + LOAD) return { from: terminal, resource: RESOURCE_ENERGY };
  const mineral = Object.keys(storage.store).find((r) => r !== RESOURCE_ENERGY && storage.store[r] > 0);
  if (mineral) return { from: storage, resource: mineral };
  const low = alive ? TERMINAL_ENERGY : TERMINAL_ENERGY / 2;
  if (terminal.store[RESOURCE_ENERGY] < low && !room.memory.storageLow) return { from: storage, resource: RESOURCE_ENERGY };
  return undefined;
}

// Vrai si la salle a besoin d'un transporteur.
const ready = (room) => !!job(room, false);

// Dépose `held` au terminal : au stockage sans terminal, et pour l'énergie dont le terminal n'a plus besoin.
// Destination imposée au chargement (creep.memory.to) d'abord ; pleine ou disparue, retour au cas général.
function unload(creep, held) {
  const to = creep.memory.to && Game.getObjectById(creep.memory.to);
  if (to) {
    const result = creep.transfer(to, held);
    if (result === ERR_NOT_IN_RANGE) move.to(creep, to);
    if (result === ERR_NOT_IN_RANGE || result === OK) return;
  }
  delete creep.memory.to;
  const { storage, terminal } = creep.room;
  const dest = !terminal || (held === RESOURCE_ENERGY && terminal.store[RESOURCE_ENERGY] >= TERMINAL_ENERGY) ? storage : terminal;
  if (dest && creep.transfer(dest, held) === ERR_NOT_IN_RANGE) move.to(creep, dest);
}

// Livre au terminal ce qu'il porte, puis prend le chargement suivant. Au stockage sans terminal, et pour l'énergie
// dont le terminal n'a plus besoin (envoi reçu d'une autre salle).
// Sans chargement, ramasse le minerai abandonné (leftover).
// Rien à prendre : attend le prochain voyage tant qu'un mineur est voulu, sinon se suicide.
function run(creep) {
  const room = creep.room;
  const held = carried(creep);
  if (held) return unload(creep, held);
  const next = job(room, true) || leftover(creep);
  if (next) {
    take(creep, next);
  } else if (!mineralMiner.wanted(room)) {
    creep.suicide();
  }
}

module.exports = { run, ready, boxJob, leftover, take, unload, LOAD };
