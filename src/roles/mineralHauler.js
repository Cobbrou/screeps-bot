const move = require('../move');
const sources = require('../sources');
const mineralMiner = require('./mineralMiner');

// Charge d'un voyage (corps du spawner) et stock du conteneur qui justifie de créer ce transporteur.
const LOAD = 500;

const box = (room) => {
  const mineral = room.find(FIND_MINERALS)[0];
  return mineral && sources.container(mineral);
};
// Première ressource présente : un Store peut garder des clés à 0.
const carried = (object) => Object.keys(object.store).find((r) => object.store[r] > 0);

// Vrai si le conteneur du minerai vaut un voyage.
function ready(room) {
  const target = box(room);
  return !!target && !!room.storage && target.store.getUsedCapacity() >= LOAD;
}

// Vide le conteneur du minerai dans le stockage par voyages pleins, et finit les restes une fois le mineur parti.
// Plus rien à transporter ni à attendre : se suicide.
function run(creep) {
  const target = box(creep.room);
  const storage = creep.room.storage;
  if (!target || !storage) return;
  const held = carried(creep);
  const loot = carried(target);
  if (held && !(loot && creep.store.getFreeCapacity() && creep.pos.isNearTo(target))) {
    if (creep.transfer(storage, held) === ERR_NOT_IN_RANGE) move.to(creep, storage);
    return;
  }
  if (!held && target.store.getUsedCapacity() < creep.store.getCapacity()) {
    if (mineralMiner.wanted(creep.room)) return;
    if (!loot) return creep.suicide();
  }
  if (loot && creep.withdraw(target, loot) === ERR_NOT_IN_RANGE) move.to(creep, target);
}

module.exports = { run, ready, LOAD };
