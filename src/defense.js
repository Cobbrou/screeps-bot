// Parties qui rendent un créep hostile dangereux (les éclaireurs ne déclenchent rien).
// WORK seulement chez l'Invader : chez un joueur, c'est presque toujours un mineur ou un réparateur de passage,
// et le viser risque une guerre (tours, amélioration en pause, pixels bloqués).
// ponytail: un démanteleur joueur sans ATTACK est ignoré ; le compter au contact de nos structures s'il en vient un.
const DANGEROUS = [ATTACK, RANGED_ATTACK, HEAL, CLAIM];
const INVADER = 'Invader';
// Joueurs amis : nos créeps n'entrent pas dans leurs salles (voir intel). Leurs créeps armés restent des menaces chez nous.
const FRIENDS = ['vKDeath'];
// ponytail: plafond fixe des murs et remparts, à ajuster selon le budget énergie de la salle.
const WALL_HITS_PER_RCL = 10000;
// Les tours ne réparent qu'en dessous de cette fraction de la cible : pas d'énergie gaspillée pour quelques points.
const REPAIR_RATIO = 0.8;
// Défenseurs au plus par salle : au-delà, le mode sans échec prend le relais.
const MAX_DEFENDERS = 4;
// Un claimer hostile à cette portée du contrôleur déclenche le mode sans échec : marge pour l'activer avant qu'il frappe.
const CLAIMER_ALERT_RANGE = 5;
// Ticks entre deux recherches de la structure à réparer : parcourir toute la salle (murs compris) coûte cher.
const REPAIR_SCAN_INTERVAL = 10;
// Rempart à ce nombre de PV ou moins : réparé avant tout le reste, sinon le decay le détruit (un rempart neuf
// n'a que 1 PV) pendant que la tour fait la tournée des murs au même ratio.
const RAMPART_DYING = 2 * RAMPART_DECAY_AMOUNT;

// Structure à réparer par salle et tick de la dernière recherche, gardés jusqu'au reset du global.
const repairCache = {};
// Cible commune des tours et des défenseurs, par salle, recalculée à chaque tick.
const targetCache = {};

// Hostiles dangereux présents dans la salle.
function threats(room) {
  return room.find(FIND_HOSTILE_CREEPS, {
    filter: (c) => c.body.some((p) => DANGEROUS.includes(p.type) || (p.type === WORK && c.owner.username === INVADER)),
  });
}

// Points de vie visés à la réparation : les murs et remparts sont plafonnés selon le RCL.
function repairTarget(s) {
  if (s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_RAMPART) return s.hitsMax;
  return Math.min(s.hitsMax, WALL_HITS_PER_RCL * s.room.controller.level);
}

// Structure la plus abîmée par rapport à sa cible (sous REPAIR_RATIO), ou null ; un rempart sous RAMPART_DYING d'abord.
// Murs hors de la coupe (room.memory.plan.cut) ignorés : ils ne s'usent pas, l'ancienne ceinture reste telle quelle.
// Stockage bas (drapeau room.memory.storageLow, voir upgrader) : murs et remparts attendent, sauf rempart mourant,
// pour que l'énergie aille d'abord à l'amélioration.
// La cible est reprise jusqu'à la prochaine recherche, qui a lieu tous les REPAIR_SCAN_INTERVAL ticks et prend
// la pire structure : un mur s'arrête donc vers REPAIR_RATIO de sa cible, dès qu'un autre est plus abîmé.
function damagedStructure(room) {
  const cached = repairCache[room.name];
  if (cached && Game.time - cached.time < REPAIR_SCAN_INTERVAL) {
    if (!cached.id) return null;
    const target = Game.getObjectById(cached.id);
    if (target && target.hits < repairTarget(target)) return target;
  }
  let damaged = null;
  let worst = REPAIR_RATIO;
  const saving = room.memory.storageLow;
  const cut = new Set(room.memory.plan && room.memory.plan.cut);
  for (const s of room.find(FIND_STRUCTURES)) {
    if (s.structureType === STRUCTURE_WALL && !cut.has(s.pos.x * 50 + s.pos.y)) continue;
    const dying = s.structureType === STRUCTURE_RAMPART && s.hits <= RAMPART_DYING;
    if (saving && !dying && (s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART)) continue;
    const ratio = dying ? -1 : s.hits / repairTarget(s);
    if (s.hitsMax && ratio < worst) {
      worst = ratio;
      damaged = s;
    }
  }
  repairCache[room.name] = { id: damaged && damaged.id, time: Game.time };
  return damaged;
}

// Dégâts d'une tour à `range` : TOWER_POWER_ATTACK jusqu'à TOWER_OPTIMAL_RANGE, puis baisse linéaire
// jusqu'à TOWER_FALLOFF (75 %) de perte à TOWER_FALLOFF_RANGE et au-delà.
function towerDamage(range) {
  const r = Math.min(Math.max(range, TOWER_OPTIMAL_RANGE), TOWER_FALLOFF_RANGE);
  return TOWER_POWER_ATTACK * (1 - TOWER_FALLOFF * (r - TOWER_OPTIMAL_RANGE) / (TOWER_FALLOFF_RANGE - TOWER_OPTIMAL_RANGE));
}

// Tours qui ont de quoi tirer.
function loadedTowers(room) {
  return room.find(FIND_MY_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_TOWER && s.store[RESOURCE_ENERGY] >= TOWER_ENERGY_COST,
  });
}

// Dégâts estimés de toutes les tours sur `creep` à ce tick.
function salvo(towers, creep) {
  return towers.reduce((sum, t) => sum + towerDamage(t.pos.getRangeTo(creep)), 0);
}

// Soin par tick que les hostiles peuvent rendre à `target` : HEAL_POWER au contact (lui-même compris),
// RANGED_HEAL_POWER à portée 3, boosts compris.
// ponytail: les TOUGH boostés de la cible (dégâts réduits) sont ignorés ; les compter si les tours se vident quand même.
function hostileHeal(target, hostiles) {
  let heal = 0;
  for (const h of hostiles) {
    const range = h.pos.getRangeTo(target);
    if (range > 3) continue;
    for (const p of h.body) {
      if (p.type !== HEAL || !p.hits) continue;
      const boost = p.boost ? BOOSTS[HEAL][p.boost].heal : 1;
      heal += (range <= 1 ? HEAL_POWER : RANGED_HEAL_POWER) * boost;
    }
  }
  return heal;
}

// Hostile visé par les tours (et en priorité par les défenseurs), ou null.
// Seuls comptent ceux dont les dégâts estimés des tours dépassent le soin hostile : sinon les tours se vident pour rien.
// Priorité : soigneur, puis claimer (attackController bloque l'amélioration), puis cible tuée par cette salve,
// puis celle qui prend le plus de dégâts (la plus proche des tours).
function target(room) {
  const cached = targetCache[room.name];
  if (cached && cached.time === Game.time) return Game.getObjectById(cached.id);
  const hostiles = threats(room);
  const towers = loadedTowers(room);
  let best = null;
  let bestKey = Infinity;
  for (const h of hostiles) {
    const damage = salvo(towers, h);
    if (damage <= hostileHeal(h, hostiles)) continue;
    const rank = h.getActiveBodyparts(HEAL) ? 0 : h.getActiveBodyparts(CLAIM) ? 1 : h.hits <= damage ? 2 : 3;
    const key = rank * 1e6 - damage;
    if (key < bestKey) {
      bestKey = key;
      best = h;
    }
  }
  targetCache[room.name] = { time: Game.time, id: best && best.id };
  return best;
}

// Défenseurs voulus : aucun si les tours peuvent entamer chaque hostile, sinon assez de RANGED_ATTACK
// pour égaler les parties ATTACK, RANGED_ATTACK et HEAL hostiles (au moins 1, au plus MAX_DEFENDERS).
// Aucun en mode sans échec : les hostiles ne peuvent rien contre la salle.
function defenders(room) {
  if (room.controller.safeMode) return 0;
  const hostiles = threats(room);
  if (!hostiles.length) return 0;
  const towers = loadedTowers(room);
  if (towers.length && hostiles.every((h) => salvo(towers, h) > hostileHeal(h, hostiles))) return 0;
  const parts = hostiles.reduce((sum, h) => sum + h.getActiveBodyparts(ATTACK)
    + h.getActiveBodyparts(RANGED_ATTACK) + h.getActiveBodyparts(HEAL), 0);
  // RANGED_ATTACK d'un défenseur à la capacité de la salle (corps [RANGED_ATTACK, MOVE] répété, voir spawner).
  const unit = BODYPART_COST[RANGED_ATTACK] + BODYPART_COST[MOVE];
  const perDefender = Math.max(1, Math.min(Math.floor(room.energyCapacityAvailable / unit), MAX_CREEP_SIZE / 2));
  return Math.min(MAX_DEFENDERS, Math.max(1, Math.ceil(parts / perDefender)));
}

// Tours : tirent sur la cible commune, sinon soignent, sinon réparent tant qu'elles gardent la moitié de leur énergie.
function runTowers(room) {
  const towers = room.find(FIND_MY_STRUCTURES, { filter: (s) => s.structureType === STRUCTURE_TOWER });
  if (!towers.length) return;
  const enemy = target(room);
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

// Mode sans échec en dernier recours : un spawn ou une tour est tombé sous la moitié de ses points de vie,
// ou un claimer hostile approche du contrôleur. Activé avant son premier attackController : un contrôleur
// `upgradeBlocked` peut refuser le mode sans échec (la doc le confirme pour les nukes) ; l'appel est tenté quand même.
function lastResort(room, hostiles) {
  const c = room.controller;
  if (c.safeMode || c.safeModeCooldown || !c.safeModeAvailable) return;
  const claimer = hostiles.some((h) => h.getActiveBodyparts(CLAIM) && h.pos.inRangeTo(c, CLAIMER_ALERT_RANGE));
  if (claimer || room.find(FIND_MY_STRUCTURES, {
    filter: (s) => (s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_TOWER)
      && s.hits < s.hitsMax / 2,
  }).length) c.activateSafeMode();
}

module.exports.run = function () {
  for (const name in Game.rooms) {
    const room = Game.rooms[name];
    if (!room.controller || !room.controller.my) continue;
    runTowers(room);
    const hostiles = threats(room);
    if (hostiles.length) lastResort(room, hostiles);
  }
};

module.exports.threats = threats;
module.exports.FRIENDS = FRIENDS;
module.exports.INVADER = INVADER;
module.exports.target = target;
module.exports.defenders = defenders;
