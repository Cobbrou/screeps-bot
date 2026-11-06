const move = require('../move');
const sources = require('../sources');

// Au-delà de ce stock (stockage et terminal), plus de nouveau mineur : les ventes ne suivent pas.
const MINERAL_STOCK = 100000;

const extractor = (mineral) => mineral.pos.lookFor(LOOK_STRUCTURES).find((s) => s.structureType === STRUCTURE_EXTRACTOR);

// Vrai s'il faut un mineur de minerai : extracteur et conteneur construits, gisement non épuisé, stock d'énergie sain.
function wanted(room) {
  const mineral = room.find(FIND_MINERALS)[0];
  return !!mineral && mineral.mineralAmount > 0 && !!room.storage && !room.memory.storageLow
    && !!extractor(mineral) && !!sources.container(mineral)
    && (room.storage.store[mineral.mineralType] || 0)
      + ((room.terminal && room.terminal.store[mineral.mineralType]) || 0) < MINERAL_STOCK;
}

// Se poste sur le conteneur du minerai et récolte à chaque fin de recharge de l'extracteur.
// Gisement épuisé (il se régénère en 50 000 ticks) : se suicide au lieu de coûter son entretien.
function run(creep) {
  const mineral = creep.room.find(FIND_MINERALS)[0];
  const box = mineral && sources.container(mineral);
  if (!box) return;
  if (!mineral.mineralAmount) return creep.suicide();
  if (!creep.pos.isEqualTo(box.pos)) return move.to(creep, box.pos, { range: 0 });
  const site = extractor(mineral);
  // Conteneur plein : la récolte tomberait au sol.
  if (site && !site.cooldown && box.store.getFreeCapacity() >= creep.getActiveBodyparts(WORK)) creep.harvest(mineral);
}

module.exports = { run, wanted };
