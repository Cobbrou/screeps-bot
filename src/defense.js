// Parties qui rendent un créep hostile dangereux (les éclaireurs ne déclenchent rien).
const DANGEROUS = [ATTACK, RANGED_ATTACK, WORK, HEAL, CLAIM];
// ponytail: plafond fixe des murs et remparts, à ajuster selon le budget énergie de la salle.
const WALL_HITS_PER_RCL = 10000;
// Les tours ne réparent qu'en dessous de cette fraction de la cible : pas d'énergie gaspillée pour quelques points.
const REPAIR_RATIO = 0.8;
// Ticks entre deux recherches de la structure à réparer : parcourir toute la salle (murs compris) coûte cher.
const REPAIR_SCAN_INTERVAL = 10;

// Structure à réparer par salle et tick de la dernière recherche, gardés jusqu'au reset du global.
const repairCache = {};

// Hostiles dangereux présents dans la salle.
function threats(room) {
  return room.find(FIND_HOSTILE_CREEPS, {
    filter: (c) => c.body.some((p) => DANGEROUS.includes(p.type)),
  });
}

// Points de vie visés à la réparation : les murs et remparts sont plafonnés selon le RCL.
function repairTarget(s) {
  if (s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_RAMPART) return s.hitsMax;
  return Math.min(s.hitsMax, WALL_HITS_PER_RCL * s.room.controller.level);
}

// Structure la plus abîmée par rapport à sa cible (sous REPAIR_RATIO), ou null.
// Gardée jusqu'à réparation complète ; la salle n'est parcourue qu'une fois tous les REPAIR_SCAN_INTERVAL ticks.
function damagedStructure(room) {
  const cached = repairCache[room.name];
  if (cached && Game.time - cached.time < REPAIR_SCAN_INTERVAL) {
    if (!cached.id) return null;
    const target = Game.getObjectById(cached.id);
    if (target && target.hits < repairTarget(target)) return target;
  }
  let damaged = null;
  let worst = REPAIR_RATIO;
  for (const s of room.find(FIND_STRUCTURES)) {
    const ratio = s.hits / repairTarget(s);
    if (s.hitsMax && ratio < worst) {
      worst = ratio;
      damaged = s;
    }
  }
  repairCache[room.name] = { id: damaged && damaged.id, time: Game.time };
  return damaged;
}

// Tours : attaquent, sinon soignent, sinon réparent tant qu'elles gardent la moitié de leur énergie.
// Toutes les tours visent le même hostile, un soigneur en priorité : il annulerait sinon les dégâts.
function runTowers(room, hostiles) {
  const towers = room.find(FIND_MY_STRUCTURES, { filter: (s) => s.structureType === STRUCTURE_TOWER });
  if (!towers.length) return;
  const healers = hostiles.filter((c) => c.getActiveBodyparts(HEAL));
  const enemy = towers[0].pos.findClosestByRange(healers.length ? healers : hostiles);
  const wounded = room.find(FIND_MY_CREEPS, { filter: (c) => c.hits < c.hitsMax });
  let damaged;
  for (const tower of towers) {
    if (enemy) {
      tower.attack(enemy);
    } else if (wounded.length) {
      tower.heal(tower.pos.findClosestByRange(wounded));
    } else if (tower.store[RESOURCE_ENERGY] > tower.store.getCapacity(RESOURCE_ENERGY) / 2) {
      // Cherchée une fois pour toutes les tours.
      if (damaged === undefined) damaged = damagedStructure(room);
      if (damaged) tower.repair(damaged);
    }
  }
}

// Mode sans échec en dernier recours : un spawn ou une tour est tombé sous la moitié de ses points de vie.
function lastResort(room) {
  const c = room.controller;
  if (c.safeMode || c.safeModeCooldown || !c.safeModeAvailable) return;
  const critical = room.find(FIND_MY_STRUCTURES, {
    filter: (s) => (s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_TOWER)
      && s.hits < s.hitsMax / 2,
  });
  if (critical.length) c.activateSafeMode();
}

module.exports.run = function () {
  for (const name in Game.rooms) {
    const room = Game.rooms[name];
    if (!room.controller || !room.controller.my) continue;
    const hostiles = threats(room);
    runTowers(room, hostiles);
    if (hostiles.length) lastResort(room);
  }
};

module.exports.threats = threats;
