const sources = require('./sources');
const defense = require('./defense');
const intel = require('./intel');
const expansion = require('./expansion');
const upgraders = require('./roles/upgrader');
const remoteMining = require('./remoteMining');

const MAX_MINER_WORK = 5;
// Sans tour, un builder est créé dès qu'une structure passe sous cette part de ses points de vie (comme l'urgence du builder).
const REPAIR_RATIO = 0.5;
// Avec un stockage, 1 énergie/tick de revenu en plus par tranche stockée : le stock se dépense en upgraders.
// ponytail: à revoir au RCL 8 (15 énergie/tick d'amélioration au plus).
const STORED_PER_ENERGY = 10000;
// Énergie/tick consommée par WORK, entretien du corps compris (coût / durée de vie) :
// upgrader 1 (UPGRADE_CONTROLLER_POWER) et un demi-MOVE par WORK ; builder ~4 sur BUILD_POWER 5, une fois retirés
// les temps morts (EFFECTIVE_BUILD_POWER de harabibot), corps polyvalent WORK/CARRY/MOVE.
const UPGRADE_SPEND = UPGRADE_CONTROLLER_POWER + (BODYPART_COST[WORK] + BODYPART_COST[MOVE] / 2) / CREEP_LIFE_TIME;
const BUILD_SPEND = 4 + (BODYPART_COST[WORK] + BODYPART_COST[CARRY] + BODYPART_COST[MOVE]) / CREEP_LIFE_TIME;
// Rôles dont l'entretien est déduit du revenu : ceux qui récoltent et transportent.
const ECONOMY_ROLES = ['miner', 'hauler', 'remoteMiner', 'remoteHauler'];
// Renseignements sur une salle voisine jugés périmés après ce nombre de ticks : un éclaireur va les rafraîchir.
const SCOUT_REFRESH = 5000;
// Garde-fou de rétrogradation : priorité à l'amélioration sous DOWNGRADE_LOW de CONTROLLER_DOWNGRADE,
// levée au-dessus de DOWNGRADE_HIGH (hystérésis : chaque amélioration ne rend que 100 ticks).
const DOWNGRADE_LOW = 0.1;
const DOWNGRADE_HIGH = 0.2;
// Énergie dans un conteneur de source au-delà de laquelle on ajoute un hauler : l'estimation de haulCapacity ne suit pas.
// ponytail: stock instantané, un hauler de plus par spawn tant que ça dure ; peut en créer un ou deux de trop.
const HAUL_BACKLOG = CONTAINER_CAPACITY / 2;

// Récolte statique dès le RCL 1 : même un mineur à 2 WORK posé sur la source (4 énergie/tick en continu)
// rapporte bien plus qu'un harvester qui fait l'aller-retour. Sans conteneur, il pose l'énergie au sol.
// Vrai s'il manque un mineur sur la source : moins de MAX_MINER_WORK au total et une case libre pour un de plus.
// `count` ignore les mineurs en fin de vie (leur successeur est lancé à l'avance), `total` les compte :
// au plus un mineur de plus que de cases, le temps que le mourant laisse sa place.
function needsMiner(source, miners) {
  const m = miners[source.id] || { work: 0, count: 0, total: 0 };
  const spots = sources.spots(source);
  return m.work < MAX_MINER_WORK && m.count < spots && m.total <= spots;
}

// Capacité de transport (CARRY × 50) nécessaire pour suivre la production réelle des mineurs de la source
// (2 énergie/tick par WORK, 10 au plus) sur l'aller-retour spawn ↔ source. Comparée à la capacité des haulers
// vivants, et non à leur nombre : ceux nés avant les extensions portent moins qu'un corps neuf.
// ponytail: distance de la route du planner, alors que les haulers livrent aussi aux tours et au contrôleur.
function haulCapacity(room, source, work) {
  if (!work) return 0;
  const rate = Math.min(work, MAX_MINER_WORK) * HARVEST_POWER;
  const route = room.memory.routes && room.memory.routes[source.id];
  // Sans route connue : la capacité d'un hauler neuf.
  if (!route) return buildBody('hauler', room.energyCapacityAvailable).filter((p) => p === CARRY).length * CARRY_CAPACITY;
  return 2 * route.length * rate;
}

// Revenu net soutenable de la salle (énergie/tick) : production des mineurs locaux (2 par WORK, 10 au plus par source)
// au prorata du transport assuré (capacité des haulers / besoin), plus les sources distantes, plus le bonus du stockage,
// moins l'entretien des mineurs et transporteurs (`upkeep`). Contrairement à un stock instantané, il ne suit pas
// les pics passagers : les créeps qu'il finance vivent 1 500 ticks.
// ponytail: pertes au sol (decay) et entretien des conteneurs ignorés.
function netIncome(room, miners, carry, remote, upkeep) {
  const list = sources.list(room);
  const work = (s) => (miners[s.id] || { work: 0 }).work;
  const need = list.reduce((sum, s) => sum + haulCapacity(room, s, work(s)), 0);
  const ratio = need ? Math.min(1, (carry || 0) / need) : 1;
  const local = list.reduce((sum, s) => sum + Math.min(work(s), MAX_MINER_WORK) * HARVEST_POWER, 0) * ratio;
  const stored = room.storage ? Math.floor(room.storage.store[RESOURCE_ENERGY] / STORED_PER_ENERGY) : 0;
  return local + remoteMining.income(room, remote) + stored - (upkeep || 0);
}

// Vrai si une structure (hors murs et remparts) est sous REPAIR_RATIO de ses points de vie et qu'aucune tour
// ne l'entretiendra : un builder vient alors la réparer.
function needsRepair(room) {
  if (room.find(FIND_MY_STRUCTURES, { filter: (s) => s.structureType === STRUCTURE_TOWER }).length) return false;
  return room.find(FIND_STRUCTURES, {
    filter: (s) => s.hits < s.hitsMax * REPAIR_RATIO
      && s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_RAMPART,
  }).length > 0;
}


// Vrai si un éclaireur sert encore : une voisine est sûre (récolte distante), inconnue ou pas revue depuis
// SCOUT_REFRESH ticks, ou une expansion est possible (il cherche alors des cibles plus loin).
// Sinon toutes les voisines sont dangereuses ou prises : l'éclaireur y mourrait pour rien.
function needsScout(room) {
  const owned = Object.values(Game.rooms).filter((r) => r.controller && r.controller.my).length;
  if (owned < Game.gcl.level) return true;
  return Object.values(Game.map.describeExits(room.name)).some((name) => {
    const i = intel.get(name);
    return !i || Game.time - i.time > SCOUT_REFRESH || intel.safe(name);
  });
}

// Vrai si le contrôleur risque de rétrograder. L'état est gardé dans room.memory.downgrade
// (lu aussi par les builders) pour ne pas osciller autour du seuil.
function downgrading(room) {
  const ratio = room.controller.ticksToDowngrade / CONTROLLER_DOWNGRADE[room.controller.level];
  if (ratio < DOWNGRADE_LOW) room.memory.downgrade = true;
  else if (ratio > DOWNGRADE_HIGH) delete room.memory.downgrade;
  return !!room.memory.downgrade;
}

// Effectifs voulus par rôle, dans l'ordre de priorité. Les harvesters ne servent plus qu'en urgence (voir run).
// Haulers avant mineurs : ils suivent les WORK déjà posés, ce qui alterne mineur et hauler au démarrage
// au lieu de payer tous les mineurs avant de pouvoir transporter.
// `remoteNeed` : sources distantes à qui il manque un mineur ou du transport (remoteMining.missing).
// `net` : revenu net (netIncome) ; `work` : WORK vivants des upgraders et des builders.
// Upgraders et builders se partagent le revenu sans se le disputer : pendant les chantiers (hors murs et remparts,
// trop longs), tout va aux builders et aucun upgrader n'est créé ; ensuite les builders deviennent upgraders.
// Un créep de plus tant que les WORK vivants restent sous revenu / consommation par WORK.
// ponytail: le dernier créep peut dépasser le revenu d'un corps entier ; dimensionner le corps au manque si ça gaspille.
function targets(room, roomCounts, miners, carry, remoteNeed, net, work) {
  const list = sources.list(room);
  const expanding = Memory.expansion && Memory.expansion.from === room.name;
  // downgrading avant paused : il pose le drapeau qui lève la pause.
  const urgent = downgrading(room);
  const sites = room.find(FIND_MY_CONSTRUCTION_SITES);
  const building = sites.some((s) => s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_RAMPART);
  const up = roomCounts.upgrader || 0;
  // Rétrogradation proche : au moins un upgrader, même pendant les chantiers.
  const moreUp = !upgraders.paused(room) && up < upgraders.spots(room)
    && ((urgent && !up) || (!building && (work.upgrader || 0) < net / UPGRADE_SPEND));
  const upgrader = up + (moreUp ? 1 : 0);
  const bd = roomCounts.builder || 0;
  // Au moins un builder par chantier en cours, même à revenu nul ; murs et remparts seuls ou réparation : un seul.
  const builder = building ? bd + (!bd || (work.builder || 0) < net / BUILD_SPEND ? 1 : 0)
    : (sites.length || needsRepair(room) ? 1 : 0);
  return {
    // En mode sans échec, les hostiles ne peuvent rien contre la salle : pas de défenseur.
    defender: !room.controller.safeMode && defense.threats(room).length ? 2 : 0,
    // Rétrogradation proche : les upgraders passent avant l'économie (une clé déjà posée garde sa place).
    // ponytail: tous les upgraders voulus passent en tête, pas seulement le premier ; l'urgence harvester couvre la famine.
    ...(urgent ? { upgrader } : {}),
    // Un hauler de plus tant que la capacité des haulers vivants reste sous le besoin, ou qu'un conteneur
    // de source s'engorge (trajets plus lents ou plus longs que prévu : fatigue hors route, livraisons au contrôleur).
    hauler: (roomCounts.hauler || 0)
      + (list.reduce((sum, s) => sum + haulCapacity(room, s, (miners[s.id] || {}).work), 0) > (carry || 0)
        || list.some((s) => { const box = sources.container(s); return box && box.store[RESOURCE_ENERGY] > HAUL_BACKLOG; })
        ? 1 : 0),
    miner: (roomCounts.miner || 0) + (list.some((s) => needsMiner(s, miners)) ? 1 : 0),
    // Builders avant upgraders : chaque structure (extensions d'abord) améliore la salle plus tôt.
    builder,
    upgrader,
    // Un éclaireur suffit à tenir les renseignements à jour, et seulement s'il a encore une utilité.
    scout: needsScout(room) ? 1 : 0,
    claimer: expanding && !expansion.claimed() ? 1 : 0,
    pioneer: expanding && expansion.claimed() ? 2 : 0,
    // Récolte distante dès le RCL 2, en dernier : elle ne prend que le temps de spawn laissé libre par le reste.
    // Transporteur avant mineur, comme dans la salle : les deux alternent source par source.
    remoteHauler: (roomCounts.remoteHauler || 0) + (remoteNeed.hauler ? 1 : 0),
    remoteMiner: (roomCounts.remoteMiner || 0) + (remoteNeed.miner ? 1 : 0),
  };
}

const cost = (parts) => parts.reduce((sum, part) => sum + BODYPART_COST[part], 0);

// Répète le motif autant que l'énergie et la taille maximale d'un créep (50 parties) le permettent,
// puis complète avec le premier reste de `rest` qui rentre encore : pas d'énergie inutilisée.
function repeat(unit, energy, rest = []) {
  const units = Math.min(Math.floor(energy / cost(unit)), Math.floor(MAX_CREEP_SIZE / unit.length));
  const body = [];
  for (let i = 0; i < units; i++) body.push(...unit);
  const left = energy - units * cost(unit);
  const extra = rest.find((parts) => cost(parts) <= left && body.length + parts.length <= MAX_CREEP_SIZE);
  if (body.length && extra) body.push(...extra);
  return body;
}

// Corps du rôle pour `energy` ; `room` sert à adapter l'upgrader à sa salle.
function buildBody(role, energy, room) {
  if (role === 'miner') {
    // Un seul MOVE : le mineur ne se déplace qu'une fois jusqu'à son conteneur.
    const work = Math.min(Math.floor((energy - BODYPART_COST[MOVE]) / BODYPART_COST[WORK]), MAX_MINER_WORK);
    return work > 0 ? [...Array(work).fill(WORK), MOVE] : [];
  }
  if (role === 'hauler') return repeat([CARRY, CARRY, MOVE], energy, [[CARRY, MOVE]]);
  // Rôles distants, hors route : un MOVE par partie, une case par tick (chargé pour le transporteur).
  // Mineur plafonné à MINER_WORK, assez pour une source non réservée (300 → 2 WORK, 450 → 3 WORK).
  if (role === 'remoteMiner') return repeat([WORK, MOVE], Math.min(energy, remoteMining.MINER_WORK * cost([WORK, MOVE])));
  if (role === 'remoteHauler') return repeat([CARRY, MOVE], energy);
  if (role === 'defender') return repeat([ATTACK, MOVE], energy);
  if (role === 'scout') return [MOVE];
  if (role === 'claimer') return energy >= BODYPART_COST[CLAIM] + BODYPART_COST[MOVE] ? [CLAIM, MOVE] : [];
  // Upgrader nourri au dépôt du contrôleur (tas puis conteneur) : il ne bouge plus une fois posté,
  // donc surtout des WORK, un seul CARRY et un MOVE pour deux WORK (300 → 2 WORK, 550 → 4 WORK, 800 → 6 WORK).
  if (role === 'upgrader' && room && sources.depot(room) && energy >= BODYPART_COST[CARRY] + 250) {
    return [CARRY, ...repeat([WORK, WORK, MOVE], energy - BODYPART_COST[CARRY], [[WORK, MOVE]])].slice(0, MAX_CREEP_SIZE);
  }
  // Polyvalent : le reste devient un WORK de plus (300 → 2 WORK, 550 → 3 WORK).
  return repeat([WORK, CARRY, MOVE], energy, [[WORK, MOVE], [WORK]]);
}

module.exports.run = function () {
  // Effectifs actuels par salle puis par rôle, WORK et nombre de mineurs par source, capacité des haulers par salle.
  const counts = {};
  const carry = {};
  const addCarry = (room, body) => {
    carry[room] = (carry[room] || 0) + body.filter((p) => (p.type || p) === CARRY).length * CARRY_CAPACITY;
  };
  const miners = {};
  // Par source distante : WORK des remoteMiner et capacité CARRY des remoteHauler vivants (hors fin de vie).
  const remote = {};
  const addRemote = (role, sourceId, body) => {
    const r = remote[sourceId] = remote[sourceId] || { work: 0, carry: 0 };
    const count = (part) => body.filter((p) => (p.type || p) === part).length;
    if (role === 'remoteMiner') r.work += count(WORK);
    else r.carry += count(CARRY) * CARRY_CAPACITY;
  };
  const addMiner = (sourceId, body, dying) => {
    const m = miners[sourceId] = miners[sourceId] || { work: 0, count: 0, total: 0 };
    m.total++;
    if (dying) return;
    m.work += body.filter((p) => (p.type || p) === WORK).length;
    m.count++;
  };
  // Par salle : entretien (énergie/tick) des mineurs et transporteurs, WORK vivants des upgraders et des builders.
  const upkeep = {};
  const addUpkeep = (room, body) => {
    upkeep[room] = (upkeep[room] || 0) + cost(body.map((p) => p.type || p)) / CREEP_LIFE_TIME;
  };
  const work = {};
  const addWork = (room, role, body) => {
    const w = work[room] = work[room] || {};
    w[role] = (w[role] || 0) + body.filter((p) => (p.type || p) === WORK).length;
  };
  for (const name in Game.creeps) {
    const creep = Game.creeps[name];
    const room = creep.memory.room || creep.room.name;
    counts[room] = counts[room] || {};
    // Créep en fin de vie (il lui reste moins que le trajet plus la durée de spawn) : déjà compté comme absent,
    // pour que son successeur arrive quand il meurt au lieu de laisser son poste vide.
    // Trajet noté à l'arrivée par les mineurs et l'upgrader ; les transporteurs n'ont pas de poste fixe,
    // seule la durée de spawn compte.
    const remoteRole = creep.memory.role === 'remoteMiner' || creep.memory.role === 'remoteHauler';
    const lead = creep.memory.role === 'hauler' || creep.memory.role === 'remoteHauler' ? 0 : creep.memory.travel;
    const dying = lead !== undefined && creep.ticksToLive <= lead + creep.body.length * CREEP_SPAWN_TIME;
    if (!(dying && creep.memory.role === 'upgrader')) {
      counts[room][creep.memory.role] = (counts[room][creep.memory.role] || 0) + 1;
    }
    if (creep.memory.role === 'miner') addMiner(creep.memory.sourceId, creep.body, dying);
    if (creep.memory.role === 'hauler' && !dying) addCarry(room, creep.body);
    if (remoteRole && !dying) addRemote(creep.memory.role, creep.memory.sourceId, creep.body);
    if (ECONOMY_ROLES.includes(creep.memory.role)) addUpkeep(room, creep.body);
    if (creep.memory.role === 'builder' || (creep.memory.role === 'upgrader' && !dying)) {
      addWork(room, creep.memory.role, creep.body);
    }
  }

  for (const name in Game.spawns) {
    const spawn = Game.spawns[name];
    if (spawn.spawning) continue;
    const room = spawn.room;
    const roomCounts = counts[room.name] = counts[room.name] || {};

    // Personne pour remplir spawn et extensions (ou haulers sans mineur pour les alimenter) :
    // récolteur avec l'énergie disponible.
    const emergency = !roomCounts.harvester && (!roomCounts.hauler || !roomCounts.miner);
    const remoteNeed = remoteMining.missing(room, remote);
    const net = netIncome(room, miners, carry[room.name], remote, upkeep[room.name]);
    const wanted = targets(room, roomCounts, miners, carry[room.name], remoteNeed, net, work[room.name] || {});
    const role = emergency ? 'harvester' : Object.keys(wanted).find((r) => (roomCounts[r] || 0) < wanted[r]);
    if (!role) continue;

    const body = buildBody(role, emergency ? room.energyAvailable : room.energyCapacityAvailable, room);
    if (!body.length) continue;

    const memory = { role, room: room.name };
    if (role === 'miner') {
      // Source la moins équipée d'abord : sinon la première source de la liste prend tous les mineurs
      // (jusqu'à MAX_MINER_WORK ou ses cases libres) avant que la seconde n'en reçoive un.
      const work = (s) => (miners[s.id] || { work: 0 }).work;
      const free = sources.list(room).filter((s) => needsMiner(s, miners)).sort((a, b) => work(a) - work(b))[0];
      if (!free) continue;
      memory.sourceId = free.id;
    }
    if (role === 'claimer' || role === 'pioneer') memory.target = Memory.expansion.target;
    if (role === 'remoteMiner' || role === 'remoteHauler') {
      const source = role === 'remoteMiner' ? remoteNeed.miner : remoteNeed.hauler;
      Object.assign(memory, { target: source.room, sourceId: source.id, x: source.x, y: source.y });
    }
    if (spawn.spawnCreep(body, `${role}-${spawn.name}-${Game.time}`, { memory }) === OK) {
      roomCounts[role] = (roomCounts[role] || 0) + 1;
      if (role === 'miner') addMiner(memory.sourceId, body);
      if (role === 'hauler') addCarry(room.name, body);
      if (role === 'remoteMiner' || role === 'remoteHauler') addRemote(role, memory.sourceId, body);
      if (ECONOMY_ROLES.includes(role)) addUpkeep(room.name, body);
      if (role === 'builder' || role === 'upgrader') addWork(room.name, role, body);
    }
  }
};
