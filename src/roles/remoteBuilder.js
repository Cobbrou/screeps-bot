const move = require('../move');
const sources = require('../sources');
const remoteMining = require('../remoteMining');

const isRoad = (s) => s.structureType === STRUCTURE_ROAD;

// Énergie prise sur place : tas au sol, puis conteneur de source, sinon récolte de la source active la plus proche.
function refuel(creep) {
  const pile = creep.pos.findClosestByRange(FIND_DROPPED_RESOURCES, {
    filter: (r) => r.resourceType === RESOURCE_ENERGY && r.amount >= 50 && move.reachable(creep, r),
  });
  if (pile) {
    if (creep.pickup(pile) === ERR_NOT_IN_RANGE) move.to(creep, pile);
    return;
  }
  const box = creep.pos.findClosestByRange(FIND_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] >= 50,
  });
  if (box) {
    if (creep.withdraw(box, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) move.to(creep, box);
    return;
  }
  const source = creep.pos.findClosestByRange(FIND_SOURCES_ACTIVE);
  if (source) sources.harvestSource(creep, source);
}

// Route de nos chemins à réparer : celle en cours jusqu'à réparation complète, sinon la plus proche
// sous ROAD_REPAIR_RATIO.
function damagedRoad(creep, home) {
  const current = Game.getObjectById(creep.memory.repairId);
  if (current && current.hits < current.hitsMax) return current;
  const cells = remoteMining.roadCells(home, creep.room.name);
  const road = creep.pos.findClosestByRange(FIND_STRUCTURES, {
    filter: (s) => isRoad(s) && s.hits < s.hitsMax * remoteMining.ROAD_REPAIR_RATIO && cells.has(s.pos.x * 50 + s.pos.y),
  });
  creep.memory.repairId = road ? road.id : undefined;
  return road;
}

// Construit les chantiers de route d'une salle distante (creep.memory.target), puis répare nos routes abîmées,
// avec l'énergie prise sur place. Plus rien à faire : passe à une autre salle distante qui en a besoin,
// sinon rentre et devient builder. Salle devenue dangereuse : rentre et attend.
module.exports.run = function (creep) {
  const home = Game.rooms[creep.memory.room];
  if (!creep.memory.target) {
    if (creep.room.name === creep.memory.room) creep.memory.role = 'builder';
    else move.to(creep, new RoomPosition(25, 25, creep.memory.room), { range: 20 });
    return;
  }
  if (!remoteMining.safe(creep)) {
    remoteMining.retreat(creep);
    return;
  }
  if (creep.memory.working && creep.store[RESOURCE_ENERGY] === 0) creep.memory.working = false;
  if (!creep.memory.working && creep.store.getFreeCapacity() === 0) creep.memory.working = true;
  if (creep.room.name !== creep.memory.target) {
    move.to(creep, new RoomPosition(25, 25, creep.memory.target), { range: 22 });
    return;
  }
  if (!creep.memory.working) {
    refuel(creep);
    return;
  }
  const site = creep.pos.findClosestByRange(FIND_MY_CONSTRUCTION_SITES, { filter: isRoad });
  if (site) {
    if (creep.build(site) === ERR_NOT_IN_RANGE) move.to(creep, site, { range: 3 });
    return;
  }
  const road = home && damagedRoad(creep, home);
  if (road) {
    if (creep.repair(road) === ERR_NOT_IN_RANGE) move.to(creep, road, { range: 3 });
    return;
  }
  const next = home && remoteMining.roadWork(home);
  creep.memory.target = next !== creep.room.name ? next : undefined;
};
