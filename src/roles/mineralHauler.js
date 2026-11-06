const move = require('../move');
const sources = require('../sources');
const mineralMiner = require('./mineralMiner');

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

// Prochain chargement de la salle, ou undefined : conteneur du minerai, puis minerai du stockage vers le terminal,
// puis énergie du terminal. `alive` : le transporteur existe déjà, il finit aussi les restes et les petits appoints.
function job(room, alive) {
  const { storage, terminal } = room;
  if (!storage) return undefined;
  const source = box(room);
  const stock = source ? source.store.getUsedCapacity() : 0;
  if (stock >= LOAD || (alive && stock && !mineralMiner.wanted(room))) return { from: source, resource: carried(source) };
  if (!terminal) return undefined;
  const mineral = Object.keys(storage.store).find((r) => r !== RESOURCE_ENERGY && storage.store[r] > 0);
  if (mineral) return { from: storage, resource: mineral };
  const low = alive ? TERMINAL_ENERGY : TERMINAL_ENERGY / 2;
  if (terminal.store[RESOURCE_ENERGY] < low && !room.memory.storageLow) return { from: storage, resource: RESOURCE_ENERGY };
  return undefined;
}

// Vrai si la salle a besoin d'un transporteur.
const ready = (room) => !!job(room, false);

// Livre au terminal (au stockage sans terminal) ce qu'il porte, puis prend le chargement suivant.
// Rien à prendre : attend le prochain voyage tant qu'un mineur est voulu, sinon se suicide.
function run(creep) {
  const room = creep.room;
  const held = carried(creep);
  if (held) {
    const dest = room.terminal || room.storage;
    if (dest && creep.transfer(dest, held) === ERR_NOT_IN_RANGE) move.to(creep, dest);
    return;
  }
  const next = job(room, true);
  if (next) {
    if (creep.withdraw(next.from, next.resource) === ERR_NOT_IN_RANGE) move.to(creep, next.from);
  } else if (!mineralMiner.wanted(room)) {
    creep.suicide();
  }
}

module.exports = { run, ready, LOAD };
