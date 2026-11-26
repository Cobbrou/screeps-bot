// Parties qui rendent un créep hostile dangereux (les éclaireurs ne déclenchent rien).
// WORK chez l'Invader, et chez un joueur seulement sans CARRY (démanteleur) : avec CARRY, c'est presque toujours
// un mineur ou un réparateur de passage, et le viser risque une guerre (tours, amélioration en pause, pixels bloqués).
// Le 2026-11-26, 6 démanteleurs de deadlydd (25 WORK, 25 MOVE) ont rasé E24S3 sans que la tour les vise.
const DANGEROUS = [ATTACK, RANGED_ATTACK, HEAL, CLAIM];
const INVADER = 'Invader';
// Joueurs amis : nos créeps n'entrent pas dans leurs salles, sauf l'éclaireur (voir intel). Leurs créeps armés restent des menaces chez nous.
const FRIENDS = ['vKDeath'];
// ponytail: plafond fixe des murs et remparts, à ajuster selon le budget énergie de la salle.
// 50 000 par RCL, plafonné à 150 000 dès le RCL 3 : un casseur Invader (4 WORK, 2 ATTACK, ~260 PV/tick) hors de portée
// utile des tours met ~580 ticks à percer un mur (280 à 60 000) ; 300 000 coûtaient ~64 k d'énergie de plus au RCL 6.
const WALL_HITS_PER_RCL = 50000;
const WALL_HITS_MAX = 150000;
// Sous cette énergie au stockage, murs et remparts attendent (sauf rempart mourant) : de quoi remplir les tours
// plusieurs fois pendant une attaque. La sécurité passe avant l'amélioration : au-dessus, ils sont réparés.
const DEFENSE_RESERVE = 5000;
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
// Rempart d'une structure vitale ou de la coupe sous ce plancher : réparé par les tours à toute portée, avant le reste
// (sinon un rempart de la coupe hors de TOWER_OPTIMAL_RANGE reste vers RAMPART_DYING, au gré du decay).
// Le decay retire autant de PV à tout niveau : tenir ce plancher ne coûte que sa montée initiale.
// Un attaquant qui passe la coupe ne le perce pas d'emblée (~550 ticks pour un Invader hybride à ~90 dégâts/tick).
const VITAL_RAMPART_FLOOR = 50000;

// Structures dont la perte déclenche le mode sans échec (lastResort).
const VITAL = [STRUCTURE_SPAWN, STRUCTURE_TOWER, STRUCTURE_STORAGE, STRUCTURE_TERMINAL];

// Structures qui ne justifient pas un rempart sur leur case.
const UNCOVERED = [STRUCTURE_WALL, STRUCTURE_RAMPART, STRUCTURE_ROAD, STRUCTURE_CONTAINER];

// Portée de RANGED_ATTACK : un défenseur posté sur un rempart tire sur un hostile à cette portée.
const DEFENDER_RANGE = 3;

// Intérieur de la coupe par salle ({ cut, cells }), gardé jusqu'au reset du global, recalculé si plan.cut change.
const insideCache = {};
// Structure à réparer par salle et tick de la dernière recherche, gardés jusqu'au reset du global.
const repairCache = {};
// Cible commune des tours et des défenseurs, par salle, recalculée à chaque tick.
const targetCache = {};

// Vrai si le créep hostile est dangereux (voir DANGEROUS).
function dangerous(c) {
  const types = c.body.map((p) => p.type);
  if (types.some((t) => DANGEROUS.includes(t))) return true;
  return types.includes(WORK) && (c.owner.username === INVADER || !types.includes(CARRY));
}

// Hostiles dangereux présents dans la salle.
function threats(room) {
  return room.find(FIND_HOSTILE_CREEPS, { filter: dangerous });
}

// Points de vie visés à la réparation : les murs et remparts sont plafonnés selon le RCL, puis à WALL_HITS_MAX.
function repairTarget(s) {
  if (s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_RAMPART) return s.hitsMax;
  return Math.min(s.hitsMax, WALL_HITS_PER_RCL * s.room.controller.level, WALL_HITS_MAX);
}

// Structure la plus abîmée par rapport à sa cible (sous REPAIR_RATIO), ou null ; un rempart sous RAMPART_DYING d'abord,
// puis les autres structures, puis les remparts, puis les murs, qui ne s'usent pas.
// Remparts après les structures : loin de leur plafond (150 000 PV dès le RCL 3), ils ont toujours le pire ratio, et les tours
// ne les réparent qu'à TOWER_OPTIMAL_RANGE : un rempart lointain bloquait toute réparation des routes, que les builders
// devaient alors rattraper au lieu de construire. Un mur n'est renvoyé que si rien d'autre n'est à réparer (voir secure).
// Murs hors de la coupe (room.memory.plan.cut) ignorés : ils ne s'usent pas, l'ancienne ceinture reste telle quelle.
// Remparts hors de la coupe ignorés aussi, s'ils ne couvrent pas une structure : ils disparaissent avec le decay.
// Stockage sous DEFENSE_RESERVE : murs et remparts attendent, sauf rempart mourant, pour garder l'énergie des tours.
// La cible est reprise jusqu'à la prochaine recherche, qui a lieu tous les REPAIR_SCAN_INTERVAL ticks et prend
// la pire structure : un mur s'arrête donc vers REPAIR_RATIO de sa cible, dès qu'un autre est plus abîmé.
function damagedStructure(room) {
  const cached = repairCache[room.name];
  if (cached && Game.time - cached.time < REPAIR_SCAN_INTERVAL) {
    if (!cached.id) return null;
    const target = Game.getObjectById(cached.id);
    if (target && target.hits < repairTarget(target)) return target;
  }
  // Pire structure hors murs, et pire mur : chacun sous REPAIR_RATIO de sa cible.
  const worst = {
    other: { ratio: REPAIR_RATIO, s: null },
    rampart: { ratio: REPAIR_RATIO, s: null },
    wall: { ratio: REPAIR_RATIO, s: null },
  };
  const saving = room.storage && room.storage.store[RESOURCE_ENERGY] < DEFENSE_RESERVE;
  const planned = room.memory.plan && room.memory.plan.cut;
  const cut = new Set(planned);
  const structures = room.find(FIND_STRUCTURES);
  const key = (s) => s.pos.x * 50 + s.pos.y;
  const covered = new Set(structures.filter((s) => !UNCOVERED.includes(s.structureType)).map(key));
  for (const s of structures) {
    if (s.structureType === STRUCTURE_WALL && !cut.has(key(s))) continue;
    if (planned && s.structureType === STRUCTURE_RAMPART && !cut.has(key(s)) && !covered.has(key(s))) continue;
    const dying = s.structureType === STRUCTURE_RAMPART && s.hits <= RAMPART_DYING;
    if (saving && !dying && (s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART)) continue;
    const ratio = dying ? -1 : s.hits / repairTarget(s);
    let slot = worst.other;
    if (s.structureType === STRUCTURE_WALL) slot = worst.wall;
    else if (s.structureType === STRUCTURE_RAMPART && !dying) slot = worst.rampart;
    if (s.hitsMax && ratio < slot.ratio) {
      slot.ratio = ratio;
      slot.s = s;
    }
  }
  const damaged = worst.other.s || worst.rampart.s || worst.wall.s;
  repairCache[room.name] = { id: damaged && damaged.id, time: Game.time };
  return damaged;
}

// Vrai si la salle est sûre et ses chantiers finis : aucun hostile dangereux (hors mode sans échec), aucun chantier.
// Sinon l'amélioration attend (voir upgrader.paused) : l'énergie va d'abord aux builders et aux tours.
// Les réparations ne la bloquent pas : murs et remparts restent presque toujours sous leur cible, la salle ne serait
// jamais prête ; les tours et un builder les montent en parallèle de l'amélioration.
function secure(room) {
  if (!room.controller.safeMode && threats(room).length) return false;
  return !room.find(FIND_MY_CONSTRUCTION_SITES).length;
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

// Dégâts à distance des défenseurs à portée de `creep` : comptés avec la salve, sinon les tours restent muettes
// face à un soigneur que tours et défenseurs ensemble pourraient battre.
function defenderDamage(creep) {
  return creep.pos.findInRange(FIND_MY_CREEPS, 3, { filter: (c) => c.memory.role === 'defender' })
    .reduce((sum, c) => sum + c.getActiveBodyparts(RANGED_ATTACK) * RANGED_ATTACK_POWER, 0);
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

// Vrai si les tours (et `extra` dégâts/tick sans coût d'énergie, ceux des défenseurs) tuent `h` avant de se vider :
// dégâts moins soin hostile, multipliés par le nombre de salves que l'énergie moyenne des tours permet, au moins ses PV.
// Dépasser le soin ne suffit pas : une paire d'Invaders au bord de la salle, à portée 30 des tours, prend 12 PV
// nets par tick et vide les tours avant d'arriver au contact, où elles l'auraient tuée.
function killable(h, hostiles, towers, extra) {
  const net = salvo(towers, h) + extra - hostileHeal(h, hostiles);
  const energy = towers.reduce((sum, t) => sum + t.store[RESOURCE_ENERGY], 0);
  const shots = towers.length ? energy / (TOWER_ENERGY_COST * towers.length) : Infinity;
  return net > 0 && net * shots >= h.hits;
}

// Hostile visé par les tours (et en priorité par les défenseurs), ou null.
// Seuls comptent ceux que tours et défenseurs à portée peuvent tuer (killable) : sinon les tours se vident pour rien.
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
    const damage = salvo(towers, h) + defenderDamage(h);
    if (!killable(h, hostiles, towers, defenderDamage(h))) continue;
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

// Cases (x * 50 + y) à l'intérieur de la coupe (plan.cut) : atteintes depuis un spawn sans traverser la coupe,
// cases de la coupe exclues. null sans coupe ou sans spawn : toute la salle compte comme l'intérieur.
function insideCells(room) {
  const cut = room.memory.plan && room.memory.plan.cut;
  const spawn = room.find(FIND_MY_SPAWNS)[0];
  if (!cut || !spawn) return null;
  const id = cut.join();
  const cached = insideCache[room.name];
  if (cached && cached.cut === id) return cached.cells;
  const terrain = room.getTerrain();
  const closed = new Set(cut);
  const start = spawn.pos.x * 50 + spawn.pos.y;
  const cells = new Set([start]);
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const x = Math.floor(queue[i] / 50);
    const y = queue[i] % 50;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const k = (x + dx) * 50 + y + dy;
        if (x + dx < 0 || x + dx > 49 || y + dy < 0 || y + dy > 49 || cells.has(k) || closed.has(k)) continue;
        if (terrain.get(x + dx, y + dy) === TERRAIN_MASK_WALL) continue;
        cells.add(k);
        queue.push(k);
      }
    }
  }
  insideCache[room.name] = { cut: id, cells };
  return cells;
}

// Vrai si `pos` est à l'intérieur des murs (voir insideCells).
function inBase(room, pos) {
  const cells = insideCells(room);
  return !cells || cells.has(pos.x * 50 + pos.y);
}

// Rempart où un créep peut se tenir (aucune structure bloquante dessous) : un défenseur dessus ne prend aucun coup
// tant que le rempart tient.
function standable(rampart) {
  return rampart.pos.lookFor(LOOK_STRUCTURES).every((s) => !OBSTACLE_OBJECT_TYPES.includes(s.structureType));
}

// Vrai si un défenseur peut tirer sur `h` sans sortir des murs : hostile à l'intérieur, ou à portée d'un rempart
// où se tenir.
function engageable(room, h) {
  if (inBase(room, h.pos)) return true;
  return h.pos.findInRange(FIND_MY_STRUCTURES, DEFENDER_RANGE, {
    filter: (s) => s.structureType === STRUCTURE_RAMPART && standable(s),
  }).length > 0;
}

// Défenseurs voulus : aucun si les tours peuvent tuer chaque hostile (killable), sinon assez de RANGED_ATTACK
// pour égaler les parties ATTACK, RANGED_ATTACK et HEAL des hostiles que les défenseurs peuvent atteindre sans sortir
// des murs (engageable ; au moins 1, au plus MAX_DEFENDERS). Hostiles tous dehors, loin des remparts : aucun. Ils
// cassent les murs à portée des tours, qui les achèvent en approchant ; envoyés au-devant d'eux, hors de portée utile
// des tours, les défenseurs mouraient un à un (3 morts pour une mise à mort le 9 novembre).
// Aucun en mode sans échec : les hostiles ne peuvent rien contre la salle.
// Aucun non plus si un défenseur et les tours ne dépassent le soin d'aucun hostile : arrivés un à un, ils meurent
// sans rien tuer et vident la salle de son énergie. Les tours attendent que les hostiles approchent, le mode sans
// échec reste le dernier recours.
function defenders(room) {
  if (room.controller.safeMode) return 0;
  const hostiles = threats(room);
  if (!hostiles.length) return 0;
  const towers = loadedTowers(room);
  if (towers.length && hostiles.every((h) => killable(h, hostiles, towers, 0))) return 0;
  const reachable = hostiles.filter((h) => engageable(room, h));
  if (!reachable.length) return 0;
  const parts = reachable.reduce((sum, h) => sum + h.getActiveBodyparts(ATTACK)
    + h.getActiveBodyparts(RANGED_ATTACK) + h.getActiveBodyparts(HEAL), 0);
  // RANGED_ATTACK d'un défenseur à la capacité de la salle (corps [RANGED_ATTACK, MOVE] répété, voir spawner).
  const unit = BODYPART_COST[RANGED_ATTACK] + BODYPART_COST[MOVE];
  const perDefender = Math.max(1, Math.min(Math.floor(room.energyCapacityAvailable / unit), MAX_CREEP_SIZE / 2));
  const hopeless = reachable.every((h) => salvo(towers, h) + perDefender * RANGED_ATTACK_POWER <= hostileHeal(h, hostiles));
  if (hopeless) return 0;
  return Math.min(MAX_DEFENDERS, Math.max(1, Math.ceil(parts / perDefender)));
}

// Rempart le plus bas posé sur une structure vitale (VITAL) ou sur la coupe (plan.cut) sous VITAL_RAMPART_FLOOR,
// ou undefined.
function weakRampart(room) {
  const mine = room.find(FIND_MY_STRUCTURES);
  const key = (s) => s.pos.x * 50 + s.pos.y;
  const vital = new Set(mine.filter((s) => VITAL.includes(s.structureType)).map(key));
  for (const k of (room.memory.plan && room.memory.plan.cut) || []) vital.add(k);
  return mine.filter((s) => s.structureType === STRUCTURE_RAMPART && s.hits < VITAL_RAMPART_FLOOR && vital.has(key(s)))
    .sort((a, b) => a.hits - b.hits)[0];
}

// Tours : tirent sur la cible commune, sinon soignent (seulement sans hostile dangereux : soigner un défenseur
// face à un ennemi que les tours ne peuvent pas tuer les vide pour rien, elles gardent leur énergie pour tirer),
// sinon réparent tant qu'elles gardent la moitié de leur énergie : d'abord le rempart d'une structure vitale
// ou de la coupe sous VITAL_RAMPART_FLOOR, à toute portée, puis la structure de damagedStructure.
// Une seule tour répare, la plus proche : une réparation coûte le même prix à toute portée et rend 4 fois moins de loin.
// Murs et remparts seulement à TOWER_OPTIMAL_RANGE, ou rempart mourant : plus loin, un builder rend 5 fois plus
// par énergie (100 PV contre 20 à portée 20) ; les tours gardent la leur pour tirer.
function runTowers(room) {
  const towers = room.find(FIND_MY_STRUCTURES, { filter: (s) => s.structureType === STRUCTURE_TOWER });
  if (!towers.length) return;
  const enemy = target(room);
  const wounded = room.find(FIND_MY_CREEPS, { filter: (c) => c.hits < c.hitsMax });
  if (enemy) {
    for (const tower of towers) tower.attack(enemy);
    return;
  }
  if (wounded.length && !threats(room).length) {
    for (const tower of towers) tower.heal(tower.pos.findClosestByRange(wounded));
    return;
  }
  const ready = towers.filter((t) => t.store[RESOURCE_ENERGY] > t.store.getCapacity(RESOURCE_ENERGY) / 2);
  if (!ready.length) return;
  const weak = weakRampart(room);
  if (weak) {
    weak.pos.findClosestByRange(ready).repair(weak);
    return;
  }
  const damaged = damagedStructure(room);
  const tower = damaged && damaged.pos.findClosestByRange(ready);
  if (!tower) return;
  const barrier = damaged.structureType === STRUCTURE_WALL || damaged.structureType === STRUCTURE_RAMPART;
  if (!barrier || damaged.hits <= RAMPART_DYING || tower.pos.inRangeTo(damaged, TOWER_OPTIMAL_RANGE)) tower.repair(damaged);
}

// Vrai si un hostile joueur est à l'intérieur de la coupe (`cells`, voir insideCells) ; faux sans coupe.
// Invaders exclus : les tours les achèvent, la règle des structures vitales reste pour eux.
function breached(cells, hostiles) {
  return !!cells && hostiles.some((h) => h.owner.username !== INVADER && cells.has(h.pos.x * 50 + h.pos.y));
}

// Mode sans échec en dernier recours : un spawn, une tour, le stockage ou le terminal est tombé sous la moitié
// de ses points de vie (le rempart qui le couvrait est tombé),
// ou un claimer hostile approche du contrôleur. Activé avant son premier attackController : un contrôleur
// `upgradeBlocked` peut refuser le mode sans échec (la doc le confirme pour les nukes) ; l'appel est tenté quand même.
// Salle sans tour : activé dès qu'un joueur armé ou un claimer y entre, rien d'autre ne l'arrêterait (pioneers et
// carriers meurent avant la première structure vitale) ; 20 000 ticks, de quoi atteindre la tour du RCL 3.
// Coupe percée (breached) : un joueur armé ou démanteleur à l'intérieur des murs. La moitié des PV ne suffit pas :
// 6 démanteleurs à 25 WORK (7 500 PV/tick, E24S3 le 2026-11-26) abattent spawn, tour ou terminal en un tick une fois
// leur rempart tombé, sans jamais passer sous la moitié.
// Un seul mode sans échec à la fois sur le compte : pendant ce temps, les autres salles n'ont plus le leur.
function lastResort(room, hostiles) {
  const c = room.controller;
  if (c.safeMode || c.safeModeCooldown || !c.safeModeAvailable) return;
  const claimer = hostiles.some((h) => h.getActiveBodyparts(CLAIM) && h.pos.inRangeTo(c, CLAIMER_ALERT_RANGE));
  const bare = !room.find(FIND_MY_STRUCTURES, { filter: (s) => s.structureType === STRUCTURE_TOWER }).length
    && hostiles.some((h) => h.owner.username !== INVADER);
  if (claimer || bare || breached(insideCells(room), hostiles) || room.find(FIND_MY_STRUCTURES, {
    filter: (s) => VITAL.includes(s.structureType) && s.hits < s.hitsMax / 2,
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
module.exports.dangerous = dangerous;
module.exports.breached = breached;
module.exports.FRIENDS = FRIENDS;
module.exports.INVADER = INVADER;
module.exports.target = target;
module.exports.towerDamage = towerDamage;
module.exports.defenders = defenders;
module.exports.damagedStructure = damagedStructure;
module.exports.secure = secure;
module.exports.inBase = inBase;
module.exports.standable = standable;
