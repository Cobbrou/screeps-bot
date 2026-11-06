const sources = require('./sources');
const defense = require('./defense');
const intel = require('./intel');
const expansion = require('./expansion');
const upgraders = require('./roles/upgrader');
const mineralMiner = require('./roles/mineralMiner');
const mineralHauler = require('./roles/mineralHauler');
const scout = require('./roles/scout');
const remoteMining = require('./remoteMining');

const MAX_MINER_WORK = 5;
// Plus petit upgrader créé : au-dessous, il occupe un poste et du temps de spawn pour presque rien.
const MIN_UPGRADER_WORK = 4;
// Sans tour, un builder est créé dès qu'une structure passe sous cette part de ses points de vie (comme l'urgence du builder).
const REPAIR_RATIO = 0.5;
// Avec un stockage, 1 énergie/tick de revenu en plus par tranche stockée au-dessus du seuil de reprise des upgraders
// (STORAGE_HIGH) : le stock se dépense en upgraders, sans ramener la salle à la pause du stockage bas.
// ponytail: à revoir au RCL 8 (15 énergie/tick d'amélioration au plus).
const STORED_PER_ENERGY = 10000;
// Salle enfermée (`Memory.enclosed`, voir expansion) : sans expansion possible, le stock part deux fois plus vite
// dans l'amélioration (GCL et RCL).
const ENCLOSED_STORED_PER_ENERGY = STORED_PER_ENERGY / 2;
// Énergie/tick consommée par WORK, entretien du corps compris (coût / durée de vie) :
// upgrader 1 (UPGRADE_CONTROLLER_POWER) et un demi-MOVE par WORK ; builder ~4 sur BUILD_POWER 5, une fois retirés
// les temps morts (EFFECTIVE_BUILD_POWER de harabibot), corps polyvalent WORK/CARRY/MOVE.
const UPGRADE_SPEND = UPGRADE_CONTROLLER_POWER + (BODYPART_COST[WORK] + BODYPART_COST[MOVE] / 2) / CREEP_LIFE_TIME;
const BUILD_SPEND = 4 + (BODYPART_COST[WORK] + BODYPART_COST[CARRY] + BODYPART_COST[MOVE]) / CREEP_LIFE_TIME;
// Rôles dont l'entretien est déduit du revenu : ceux qui récoltent et transportent.
const ECONOMY_ROLES = ['miner', 'hauler', 'filler', 'remoteMiner', 'remoteHauler', 'reserver', 'mineralMiner', 'mineralHauler'];
// Renseignements sur une salle voisine jugés périmés après ce nombre de ticks : un éclaireur va les rafraîchir.
const SCOUT_REFRESH = 5000;
// Garde-fou de rétrogradation : priorité à l'amélioration sous DOWNGRADE_LOW de CONTROLLER_DOWNGRADE,
// levée au-dessus de DOWNGRADE_HIGH (hystérésis : chaque amélioration ne rend que 100 ticks).
const DOWNGRADE_LOW = 0.1;
const DOWNGRADE_HIGH = 0.2;
const { HAUL_BACKLOG } = sources;
// Plafond de ce renfort : capacité des haulers au plus HAUL_BACKLOG_RATIO fois le besoin estimé. Sans lui, quand
// spawn et extensions sont pleins, les haulers restent pleins, les conteneurs s'engorgent et les renforts s'enchaînent.
const HAUL_BACKLOG_RATIO = 3;
// Marge sur le besoin d'une source pour la taille d'un hauler : haulCapacity ne compte que le chemin du planner,
// pas les livraisons au contrôleur, aux tours et aux extensions éloignées, ni les ticks de ramassage et de livraison.
const HAUL_SHARE_MARGIN = 1.5;
// Ticks entre deux relevés du terrain et des routes sur le chemin d'une source.
const ROUTE_SCAN_INTERVAL = 100;

// Relevé du chemin spawn → source gardé par le planner, par source, gardé jusqu'au reset du global.
const routeScans = {};

// Facteur de fatigue de chaque case du chemin de la source (sans la case du bout, celle du conteneur) :
// 1 sur route, 2 en plaine, 10 en marais ; `roads` vrai si toutes ont leur route. Undefined sans chemin connu.
// Relevé tous les ROUTE_SCAN_INTERVAL ticks, et dès que le planner recalcule le chemin.
function routeTerrain(room, sourceId) {
  const route = room.memory.routes && room.memory.routes[sourceId];
  if (!route) return undefined;
  const cached = routeScans[sourceId];
  if (cached && Game.time - cached.time < ROUTE_SCAN_INTERVAL && cached.route === route.join()) return cached;
  const terrain = room.getTerrain();
  const factors = route.slice(0, -1).map((k) => {
    const x = Math.floor(k / 50);
    const y = k % 50;
    if (room.lookForAt(LOOK_STRUCTURES, x, y).some((s) => s.structureType === STRUCTURE_ROAD)) return 1;
    return terrain.get(x, y) === TERRAIN_MASK_SWAMP ? 10 : 2;
  });
  routeScans[sourceId] = { time: Game.time, route: route.join(), factors, roads: factors.every((f) => f === 1) };
  return routeScans[sourceId];
}

// Ticks pour parcourir ces cases avec `heavy` parties qui fatiguent (WORK, CARRY plein…) et `moves` MOVE :
// chaque MOVE retire 2 de fatigue par tick, une case coûte facteur × parties lourdes.
function travelTime(factors, heavy, moves) {
  return factors.reduce((sum, f) => sum + Math.max(1, Math.ceil(heavy * f / (2 * moves))), 0);
}

// CARRY par MOVE des haulers : 2 seulement quand toutes les routes des sources sont construites ;
// avant, 1:1 pour garder une case par tick chargé en plaine (2:1 hors route : une case tous les 2 ticks).
function haulerRatio(room) {
  const scans = sources.list(room).map((s) => routeTerrain(room, s.id));
  return scans.length && scans.every((s) => s && s.roads) ? 2 : 1;
}

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
// (2 énergie/tick par WORK, 10 au plus) sur l'aller-retour spawn ↔ source : aller à vide à une case par tick,
// retour chargé selon le terrain et le profil des haulers (haulerRatio). Comparée à la capacité des haulers
// vivants, et non à leur nombre : ceux nés avant les extensions portent moins qu'un corps neuf.
// Avec un stockage, le surplus y part une fois spawn et extensions pleins : si le stockage est plus loin que le spawn,
// l'écart compte à l'aller et au retour (une case par tick, sur route).
// ponytail: écart en ligne droite, sous le trajet réel (21 cases pour environ 28 ticks) ; HAUL_SHARE_MARGIN le couvre.
function haulCapacity(room, source, work) {
  if (!work) return 0;
  if (sources.linked(source)) return 0;
  const rate = Math.min(work, MAX_MINER_WORK) * HARVEST_POWER;
  const scan = routeTerrain(room, source.id);
  // Sans route connue : la capacité d'un hauler neuf.
  if (!scan) return buildBody('hauler', room.energyCapacityAvailable, room).filter((p) => p === CARRY).length * CARRY_CAPACITY;
  const far = room.storage ? Math.max(0, source.pos.getRangeTo(room.storage) - scan.factors.length) : 0;
  return (scan.factors.length + travelTime(scan.factors, haulerRatio(room), 1) + 2 * far) * rate;
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
  const perEnergy = Memory.enclosed ? ENCLOSED_STORED_PER_ENERGY : STORED_PER_ENERGY;
  const stored = room.storage ? Math.floor(Math.max(room.storage.store[RESOURCE_ENERGY] - upgraders.STORAGE_HIGH, 0) / perEnergy) : 0;
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


// Vrai si une voisine où l'éclaireur peut aller (scout.exits) est inconnue ou pas revue depuis SCOUT_REFRESH ticks :
// un éclaireur part la rafraîchir (et erre plus loin pendant sa vie, ce qui alimente aussi l'expansion).
// Sinon aucun : il ne ferait que coûter. Les voisines où il ne va jamais resteraient inconnues pour toujours.
function needsScout(room) {
  return scout.exits(room.name).some((name) => {
    const i = intel.get(name);
    return !i || Game.time - i.time > SCOUT_REFRESH;
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
// Un upgrader de plus seulement si son corps entre dans le revenu (revenu / consommation par WORK) : sans ça,
// un dernier corps de MIN_UPGRADER_WORK fait dépasser le revenu et vide le stockage jusqu'à la pause.
// Builders : un créep de plus tant que les WORK vivants restent sous revenu / consommation par WORK.
function targets(room, roomCounts, miners, carry, remoteNeed, net, work) {
  const list = sources.list(room);
  const expanding = Memory.expansion && Memory.expansion.from === room.name;
  // downgrading avant paused : il pose le drapeau qui lève la pause.
  const urgent = downgrading(room);
  const sites = room.find(FIND_MY_CONSTRUCTION_SITES);
  const building = sites.some((s) => s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_RAMPART);
  const up = roomCounts.upgrader || 0;
  // Plus petit corps d'upgrader possible ici : avant les extensions, la capacité ne permet pas MIN_UPGRADER_WORK.
  const step = Math.min(MIN_UPGRADER_WORK, buildBody('upgrader', room.energyCapacityAvailable, room).filter((p) => p === WORK).length);
  const funded = up ? (work.upgrader || 0) + step <= net / UPGRADE_SPEND : net > 0;
  // Rétrogradation proche : au moins un upgrader, même pendant les chantiers.
  // Pendant les chantiers, l'effectif voulu avant eux (room.memory.upgraders) est maintenu : les upgraders
  // en fin de vie sont remplacés, seule l'augmentation attend la fin des chantiers.
  const moreUp = !upgraders.paused(room) && up < upgraders.spots(room)
    && ((urgent && !up) || (building ? up < (room.memory.upgraders || 0) : funded));
  const upgrader = up + (moreUp ? 1 : 0);
  if (!building) room.memory.upgraders = upgrader;
  const need = list.reduce((sum, s) => sum + haulCapacity(room, s, (miners[s.id] || {}).work), 0);
  const bd = roomCounts.builder || 0;
  // Au moins un builder par chantier en cours, même à revenu nul ; murs et remparts seuls ou réparation : un seul.
  const builder = building ? bd + (!bd || (work.builder || 0) < net / BUILD_SPEND ? 1 : 0)
    : (sites.length || room.memory.swapBarrier || needsRepair(room) ? 1 : 0);
  return {
    // Selon la menace que les tours ne couvrent pas (voir defense.defenders).
    defender: defense.defenders(room),
    // Rétrogradation proche : les upgraders passent avant l'économie (une clé déjà posée garde sa place).
    // ponytail: tous les upgraders voulus passent en tête, pas seulement le premier ; l'urgence harvester couvre la famine.
    ...(urgent ? { upgrader } : {}),
    // Sources toutes liées (aucun hauler voulu) : un filler remplit spawn, extensions et tours depuis le stockage.
    // Lien du hub et de chaque source exigés : sinon un besoin nul veut dire « pas de mineur actif » (mineur en fin de vie
    // sur une source sans lien), et c'est le mineur qui doit passer, pas 81 ticks de spawn de filler.
    filler: room.storage && sources.hubLink(room) && !need && list.every((s) => sources.sourceLink(s)) ? 1 : 0,
    // Un hauler de plus tant que la capacité des haulers vivants reste sous le besoin, ou qu'un conteneur
    // de source s'engorge (trajets plus lents ou plus longs que prévu : fatigue hors route, livraisons au contrôleur),
    // dans la limite de HAUL_BACKLOG_RATIO fois le besoin.
    hauler: (roomCounts.hauler || 0)
      + (need > (carry || 0)
        || ((carry || 0) < need * HAUL_BACKLOG_RATIO
          && list.some((s) => { const box = sources.container(s); return box && box.store[RESOURCE_ENERGY] > HAUL_BACKLOG; }))
        ? 1 : 0),
    miner: (roomCounts.miner || 0) + (list.some((s) => needsMiner(s, miners)) ? 1 : 0),
    // Après la récolte locale : il rend ses sources à la salle distante envahie.
    remoteDefender: remoteMining.invaded(room) ? 1 : 0,
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
    // Un constructeur distant tant qu'une salle distante a des chantiers de route ou des routes abîmées.
    remoteBuilder: remoteMining.roadWork(room) ? 1 : 0,
    // Réservation en tout dernier : elle double le débit des sources distantes déjà tenues.
    reserver: (roomCounts.reserver || 0) + (remoteNeed.reserver ? 1 : 0),
    // Minerai après toute l'économie d'énergie : un mineur, et un transporteur quand le conteneur vaut un voyage.
    mineralMiner: mineralMiner.wanted(room) ? 1 : 0,
    mineralHauler: mineralHauler.ready(room) ? 1 : 0,
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

// Corps du rôle pour `energy` ; `room` adapte l'upgrader et le hauler à leur salle, `sourceId` le mineur à son chemin,
// `target` le mineur distant à sa salle (réservée ou non).
function buildBody(role, energy, room, sourceId, target) {
  if (role === 'miner') {
    // Un CARRY pour verser la récolte dans le lien de la source, s'il est construit.
    const source = sourceId && Game.getObjectById(sourceId);
    const carry = source && sources.sourceLink(source) ? [CARRY] : [];
    energy -= carry.length * BODYPART_COST[CARRY];
    const work = Math.min(Math.floor((energy - BODYPART_COST[MOVE]) / BODYPART_COST[WORK]), MAX_MINER_WORK);
    if (work <= 0) return [];
    // Le mineur ne se déplace qu'une fois jusqu'à son conteneur : MOVE choisis, dans l'énergie restante,
    // pour minimiser temps de spawn / vie productive (durée de vie moins le trajet) sur le chemin réel.
    // Sans chemin connu, un seul MOVE.
    const scan = room && sourceId && routeTerrain(room, sourceId);
    const maxMoves = Math.min(work, Math.floor((energy - work * BODYPART_COST[WORK]) / BODYPART_COST[MOVE]));
    let moves = 1;
    let best = Infinity;
    for (let m = 1; m <= maxMoves; m++) {
      const travel = scan ? travelTime(scan.factors, work, m) : 0;
      const score = (work + m) / (CREEP_LIFE_TIME - travel);
      if (score < best) {
        best = score;
        moves = m;
      }
    }
    return [...Array(work).fill(WORK), ...carry, ...Array(moves).fill(MOVE)];
  }
  if (role === 'hauler' || role === 'filler') {
    return room && haulerRatio(room) === 2 ? repeat([CARRY, CARRY, MOVE], energy, [[CARRY, MOVE]]) : repeat([CARRY, MOVE], energy);
  }
  // Rôles distants, hors route : un MOVE par partie, une case par tick (chargé pour le transporteur).
  // Mineur distant : un CARRY pour construire et réparer son conteneur, plus de quoi vider la source
  // (3 WORK non réservée, 5 réservée : 550 → 3 WORK, 850 → 5 WORK).
  if (role === 'remoteMiner') {
    const carry = cost([CARRY, MOVE]);
    const work = repeat([WORK, MOVE], Math.min(energy - carry, remoteMining.minerWork(target) * cost([WORK, MOVE])));
    return work.length ? [CARRY, MOVE, ...work] : [];
  }
  if (role === 'reserver') {
    const unit = remoteMining.RESERVER_UNIT;
    return energy >= remoteMining.RESERVER_UNITS * cost(unit) ? [].concat(...Array(remoteMining.RESERVER_UNITS).fill(unit)) : [];
  }
  // Transporteur distant : 2 CARRY par MOVE une fois la route jusqu'à sa source entièrement construite.
  if (role === 'remoteHauler') {
    return room && remoteMining.paved(room, sourceId)
      ? repeat([CARRY, CARRY, MOVE], energy, [[CARRY, MOVE]]) : repeat([CARRY, MOVE], energy);
  }
  // Constructeur distant : corps polyvalent, 4 motifs au plus (les chantiers de route sont posés 5 par 5).
  // Minerai, hors route : le mineur ne fait qu'un trajet (2 WORK par MOVE), le transporteur avance d'une case par tick chargé.
  if (role === 'mineralMiner') return repeat([WORK, WORK, MOVE], energy);
  if (role === 'mineralHauler') return repeat([CARRY, MOVE], Math.min(energy, mineralHauler.LOAD / CARRY_CAPACITY * cost([CARRY, MOVE])));
  if (role === 'remoteBuilder') return repeat([WORK, CARRY, MOVE], Math.min(energy, 4 * cost([WORK, CARRY, MOVE])));
  if (role === 'defender' || role === 'remoteDefender') return repeat([RANGED_ATTACK, MOVE], energy);
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
  // Reservers vivants (hors fin de vie) par salle visée.
  const reservers = {};
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
    const parts = body.map((p) => p.type || p);
    // Un créep avec CLAIM ne vit que CREEP_CLAIM_LIFE_TIME ticks.
    upkeep[room] = (upkeep[room] || 0) + cost(parts) / (parts.includes(CLAIM) ? CREEP_CLAIM_LIFE_TIME : CREEP_LIFE_TIME);
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
    const lead = ['hauler', 'remoteHauler', 'filler'].includes(creep.memory.role) ? 0 : creep.memory.travel;
    const dying = lead !== undefined && creep.ticksToLive <= lead + creep.body.length * CREEP_SPAWN_TIME;
    // Upgrader et filler en fin de vie ne comptent plus : leur successeur prend la relève sans trou.
    if (!(dying && (creep.memory.role === 'upgrader' || creep.memory.role === 'filler'))) {
      counts[room][creep.memory.role] = (counts[room][creep.memory.role] || 0) + 1;
    }
    if (creep.memory.role === 'miner') addMiner(creep.memory.sourceId, creep.body, dying);
    if (creep.memory.role === 'hauler' && !dying) addCarry(room, creep.body);
    if (remoteRole && !dying) addRemote(creep.memory.role, creep.memory.sourceId, creep.body);
    if (creep.memory.role === 'reserver' && !dying) reservers[creep.memory.target] = (reservers[creep.memory.target] || 0) + 1;
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

    // Personne pour remplir spawn et extensions (ou haulers sans mineur pour les alimenter, filler sans stock) :
    // récolteur avec l'énergie disponible.
    const fed = roomCounts.filler && room.storage && room.storage.store[RESOURCE_ENERGY] > 0;
    const emergency = !roomCounts.harvester && !fed && (!roomCounts.hauler || !roomCounts.miner);
    const remoteNeed = remoteMining.missing(room, remote, reservers);
    const net = netIncome(room, miners, carry[room.name], remote, upkeep[room.name]);
    const wanted = targets(room, roomCounts, miners, carry[room.name], remoteNeed, net, work[room.name] || {});
    const role = emergency ? 'harvester' : Object.keys(wanted).find((r) => (roomCounts[r] || 0) < wanted[r]);
    if (!role) continue;

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
    if (role === 'reserver') memory.target = remoteNeed.reserver;
    if (role === 'remoteBuilder') memory.target = remoteMining.roadWork(room);
    if (role === 'remoteDefender') memory.target = remoteMining.invaded(room);
    if (role === 'remoteMiner' || role === 'remoteHauler') {
      const source = role === 'remoteMiner' ? remoteNeed.miner : remoteNeed.hauler;
      Object.assign(memory, { target: source.room, sourceId: source.id, x: source.x, y: source.y });
    }
    // Premier mineur ou premier hauler de la salle : créé avec l'énergie disponible au lieu d'attendre la capacité
    // pleine, la récolte démarre plus tôt. Au moins l'énergie que le spawn régénère seul (300) : pas de corps minuscule.
    const startup = ['miner', 'hauler', 'filler'].includes(role) && !roomCounts[role];
    let energy = emergency ? room.energyAvailable
      : startup ? Math.min(room.energyCapacityAvailable, Math.max(SPAWN_ENERGY_CAPACITY, room.energyAvailable))
        : room.energyCapacityAvailable;
    // Hauler plafonné au besoin de la source la plus exigeante, avec la marge HAUL_SHARE_MARGIN : à la capacité
    // pleine de la salle, il porte plusieurs fois la production et paie son entretien pour rien. Le renfort
    // HAUL_BACKLOG couvre les écarts. Les sources liées (besoin nul) ne comptent pas.
    if (role === 'hauler' && !emergency) {
      const share = HAUL_SHARE_MARGIN
        * Math.max(0, ...sources.list(room).map((s) => haulCapacity(room, s, (miners[s.id] || {}).work)));
      const ratio = haulerRatio(room);
      const units = Math.max(1, Math.ceil(share / (ratio * CARRY_CAPACITY)));
      energy = Math.min(energy, units * (ratio * BODYPART_COST[CARRY] + BODYPART_COST[MOVE]));
    }
    // Filler : de quoi remplir la moitié de la capacité de la salle par trajet.
    if (role === 'filler') {
      const ratio = haulerRatio(room);
      const units = Math.ceil(room.energyCapacityAvailable / 2 / (ratio * CARRY_CAPACITY));
      energy = Math.min(energy, units * (ratio * BODYPART_COST[CARRY] + BODYPART_COST[MOVE]));
    }
    // Upgrader : corps au manque de WORK, pas à la capacité de la salle (deux corps pleins de 14 WORK dépensaient 28/tick
    // pour ~20 de revenu, jusqu'à la pause du stockage bas).
    if (role === 'upgrader' && !emergency) {
      const lack = Math.floor(net / UPGRADE_SPEND - ((work[room.name] || {}).upgrader || 0));
      const parts = Math.max(lack, MIN_UPGRADER_WORK);
      energy = Math.min(energy, BODYPART_COST[CARRY] + parts * BODYPART_COST[WORK] + Math.ceil(parts / 2) * BODYPART_COST[MOVE]);
    }
    const body = buildBody(role, energy, room, memory.sourceId, memory.target);
    if (!body.length) continue;
    if (spawn.spawnCreep(body, `${role}-${spawn.name}-${Game.time}`, { memory }) === OK) {
      roomCounts[role] = (roomCounts[role] || 0) + 1;
      if (role === 'miner') addMiner(memory.sourceId, body);
      if (role === 'hauler') addCarry(room.name, body);
      if (role === 'remoteMiner' || role === 'remoteHauler') addRemote(role, memory.sourceId, body);
      if (role === 'reserver') reservers[memory.target] = (reservers[memory.target] || 0) + 1;
      if (ECONOMY_ROLES.includes(role)) addUpkeep(room.name, body);
      if (role === 'builder' || role === 'upgrader') addWork(room.name, role, body);
    }
  }
};
