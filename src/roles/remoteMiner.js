const move = require('../move');
const sources = require('../sources');
const remoteMining = require('../remoteMining');

// Le conteneur n'est réparé que sous cette part de ses points de vie : il perd 5 000 points par 100 ticks hors de nos salles.
const REPAIR_RATIO = 0.5;

// Rejoint sa source dans une salle voisine et la récolte sans fin. Son CARRY sert au conteneur :
// à l'arrivée, il pose le chantier sur sa case (à côté de la source, du côté de la maison) et le construit
// dès que son CARRY est plein ; ensuite il se tient dessus et le répare quand il est abîmé.
// Le reste de la récolte tombe dans le conteneur (au sol tant qu'il n'existe pas), où les remoteHauler le ramassent.
// Salle devenue dangereuse : rentre et attend.
module.exports.run = function (creep) {
  if (!remoteMining.safe(creep)) {
    remoteMining.retreat(creep);
    return;
  }
  const source = { x: creep.memory.x, y: creep.memory.y, room: creep.memory.target };
  const pos = new RoomPosition(source.x, source.y, source.room);
  const box = remoteMining.container(source);
  if (box ? !creep.pos.isEqualTo(box.pos) : !creep.pos.isNearTo(pos)) {
    move.to(creep, box || pos, { range: box ? 0 : 1 });
    return;
  }
  // Temps de trajet noté à l'arrivée : le spawner lance le successeur pour qu'il arrive à la mort de celui-ci.
  if (creep.memory.travel === undefined) creep.memory.travel = CREEP_LIFE_TIME - creep.ticksToLive;
  const carrying = creep.store[RESOURCE_ENERGY];
  if (!box) {
    const site = pos.findInRange(FIND_CONSTRUCTION_SITES, 1, {
      filter: (s) => s.structureType === STRUCTURE_CONTAINER,
    })[0];
    if (!site) {
      creep.room.createConstructionSite(creep.pos, STRUCTURE_CONTAINER);
    } else if (creep.store.getCapacity() && !creep.store.getFreeCapacity()) {
      // Un mineur sans CARRY (né avant ce changement) ne fait que récolter.
      creep.build(site);
      return;
    }
  } else if (carrying && box.hits < box.hitsMax * REPAIR_RATIO) {
    creep.repair(box);
    return;
  }
  const target = Game.getObjectById(creep.memory.sourceId);
  if (target) sources.harvestSource(creep, target);
};
