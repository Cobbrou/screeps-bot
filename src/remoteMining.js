const intel = require('./intel');
const move = require('./move');
const sources = require('./sources');

// Débit d'une source de salle non réservée (1 500 énergie par régénération) : 5 énergie/tick ; réservée : 10.
const NEUTRAL_RATE = SOURCE_ENERGY_NEUTRAL_CAPACITY / ENERGY_REGEN_TIME;
const RESERVED_RATE = SOURCE_ENERGY_CAPACITY / ENERGY_REGEN_TIME;
// Source d'une salle à keepers : 4 000 par régénération, ~13,3 énergie/tick.
const KEEPER_RATE = SOURCE_ENERGY_KEEPER_CAPACITY / ENERGY_REGEN_TIME;
// Ticks par régénération où le mineur fuit son keeper (alerte de l'antre, puis combat du tueur) : WORK en plus pour rattraper.
const KEEPER_DOWNTIME = 60;
// Tueur de keepers : à portée 3, un keeper ne frappe qu'à distance (10 RANGED_ATTACK, 100 PV/tick) et ne poursuit jamais.
// 9 HEAL (108 PV/tick) annulent ces dégâts, 14 RANGED_ATTACK (140/tick) tuent ses 5 000 PV en ~36 ticks.
// Corps de 5 500 : RCL 7 avec ses extensions (5 600). MOVE devant, les premières parties touchées.
const KILLER_BODY = [...Array(23).fill(MOVE), ...Array(14).fill(RANGED_ATTACK), ...Array(9).fill(HEAL)];
const KILLER_COST = KILLER_BODY.reduce((sum, part) => sum + BODYPART_COST[part], 0);
// Dégâts du tueur par tick (140) : des Invaders qui soignent au moins autant ne tombent jamais.
const KILLER_DAMAGE = KILLER_BODY.filter((part) => part === RANGED_ATTACK).length * RANGED_ATTACK_POWER;
// Soin du tueur sur lui-même par tick (108) et PV neufs (100 par partie : 4 600).
const KILLER_HEAL = KILLER_BODY.filter((part) => part === HEAL).length * HEAL_POWER;
const KILLER_HITS = KILLER_BODY.length * 100;
// Avance du tueur sur la réouverture d'une salle à keepers fermée par des Invaders qu'il n'abat pas : son spawn (138 ticks)
// plus le trajet. Demandé seulement à la réouverture, il arrivait ~180 ticks après, mineurs et transporteurs à l'attendre
// (E25S4, 2026-11-23). Spawné en avance, il attend chez lui qu'elle rouvre (keeperKiller : combat jugé perdu).
// ponytail: trajet fixe (39 ticks notés vers E25S4) ; lire memory.travel du dernier tueur si d'autres salles à keepers.
const KILLER_LEAD = KILLER_BODY.length * CREEP_SPAWN_TIME + 50;
// Un créep de la salle à keepers s'écarte d'un keeper, ou d'un antre qui le fait réapparaître dans moins de LAIR_WARN ticks,
// jusqu'à DODGE_RANGE cases : le keeper tire à portée 3 et ne s'approche que de sa source.
const LAIR_WARN = 20;
const DODGE_RANGE = 5;
// RCL minimal : au RCL 1, la salle n'a que son spawn et ses propres sources occupent le temps de spawn.
const MIN_RCL = 2;
const MAX_ROOMS = 2;
// Capacité sous laquelle aucun défenseur distant n'est créé : 4 RANGED_ATTACK, un corps plus petit se ferait tuer pour rien.
const MIN_DEFENSE_ENERGY = 800;
// Corps du reserver : 2 CLAIM, la réservation gagne 2 ticks par tick et en perd 1.
const RESERVER_UNIT = [CLAIM, MOVE];
const RESERVER_UNITS = 2;
const RESERVER_COST = RESERVER_UNITS * (BODYPART_COST[CLAIM] + BODYPART_COST[MOVE]);
// Reserver envoyé seulement si la réservation tombe sous ce seuil : au-dessus, il gaspillerait sa vie.
const RESERVE_REFILL = CONTROLLER_RESERVE_MAX - 2000;
// Énergie/tick d'entretien d'un transporteur [CARRY, MOVE] par énergie/tick transportée, par tick d'aller-retour.
const HAUL_UPKEEP = (BODYPART_COST[CARRY] + BODYPART_COST[MOVE]) / (CARRY_CAPACITY * CREEP_LIFE_TIME);
// Énergie dans le conteneur d'une source distante au-delà de laquelle on ajoute un transporteur.
const HAUL_BACKLOG = CONTAINER_CAPACITY / 2;
// Ce renfort s'arrête à ce multiple du besoin : sans plafond, chaque pic du conteneur (fuite devant un keeper, réouverture
// après une invasion) ajoutait un transporteur de 2 500 pour 1 500 ticks. Le 2026-11-22 sur E25S4, jusqu'à 11 pour
// 3 sources, et 4 (2,75 fois le besoin) sur la source la plus proche.
const HAUL_BACKLOG_RATIO = 2;

// Aller-retour d'un transporteur 1:1 entre le spawn et chaque source distante (vide : 1 tick par case ;
// chargé : 1 en plaine, 5 en marais), null si injoignable. Gardé jusqu'au reset du global. Route pavée : voir trip.
// ponytail: chemin calculé sur le seul terrain (structures ignorées) : estimation, pas le trajet exact.
const trips = {};

// Salles voisines exploitées : sûres, explorées avec la position de leurs sources, hors cible d'expansion.
// Salle à keepers seulement si la salle peut payer le tueur. Au plus MAX_ROOMS, celles qui ont le plus de sources.
function rooms(room) {
  if (room.controller.level < MIN_RCL) return [];
  const exp = Memory.expansion;
  return Object.values(Game.map.describeExits(room.name) || {})
    .filter((name) => intel.safe(name) && intel.get(name).sourcePos && (!exp || exp.target !== name)
      && (!intel.keeperRoom(name) || room.energyCapacityAvailable >= KILLER_COST))
    .sort((a, b) => intel.get(b).sourcePos.length - intel.get(a).sourcePos.length)
    .slice(0, MAX_ROOMS);
}

// Débit d'une source de la salle distante (énergie/tick), selon qu'on la réserve.
function rate(name) {
  if (intel.keeperRoom(name)) return KEEPER_RATE;
  return intel.reservedByMe(name) ? RESERVED_RATE : NEUTRAL_RATE;
}

// WORK d'un mineur distant : de quoi vider la source (3 non réservée, 5 réservée, 9 chez les keepers, fuites comprises).
function minerWork(name) {
  const uptime = intel.keeperRoom(name) ? (ENERGY_REGEN_TIME - KEEPER_DOWNTIME) / ENERGY_REGEN_TIME : 1;
  return Math.ceil(rate(name) / uptime / HARVEST_POWER);
}

// Tueurs envoyés ensemble au plus contre des Invaders : deux abattent le groupe boosté du 2026-11-21 (2 tireurs
// XKHO2, healer XLHO2 : 240 de soin et de tir) qui tuait un tueur seul en ~34 ticks (simulation : gagné en ~29 ticks).
const MAX_KILLERS = 2;

// Salle à keepers fermée par des Invaders que `n` tueurs peuvent abattre (intel `force`). Estimation prudente :
// ils tombent un à un, healers d'abord (le plus de soin en premier), sous le soin de tous les healers encore en vie,
// pendant que le tir de tous ceux qui restent vise un seul tueur, qui ne se soigne que lui-même, à partir de `hits`
// (tueur neuf par défaut ; en combat, le plus entamé). Vrai s'ils sont tous abattus avant qu'il meure.
// Force notée sans le détail par créep (intel d'avant) : un seul bloc, tous les PV sous tout le soin.
// Plus forts (raid boosté de 5) : personne n'y va, ils meurent seuls (1 500 ticks de vie) avant la fin de HOSTILE_COOLDOWN.
function huntable(name, hits = KILLER_HITS, n = 1) {
  if (!intel.keeperInvaded(name)) return false;
  const f = intel.get(name).force || { heal: 0, damage: 0, hits: 0 };
  const order = (f.creeps || [f]).slice().sort((a, b) => b.heal - a.heal || b.damage - a.damage);
  let left = hits;
  for (let k = 0; k < order.length; k++) {
    const rest = order.slice(k);
    const net = n * KILLER_DAMAGE - rest.reduce((sum, c) => sum + c.heal, 0);
    if (net <= 0) return false;
    left -= (order[k].hits / net) * Math.max(0, rest.reduce((sum, c) => sum + c.damage, 0) - KILLER_HEAL);
    if (left <= 0) return false;
  }
  return true;
}

// Vrai si la salle à keepers rouvrira d'elle-même dans moins de KILLER_LEAD ticks (mort des Invaders, intel.reopenIn).
function reopenSoon(name) {
  const left = intel.reopenIn(name);
  return intel.keeperRoom(name) && left > 0 && left <= KILLER_LEAD;
}

// Tueurs voulus pour la salle à keepers : 1 pour les keepers, contre des Invaders le plus petit nombre qui les abat
// (MAX_KILLERS au plus), sinon 1 s'ils meurent bientôt (reopenSoon), 0 avant.
function killers(name) {
  if (!intel.keeperInvaded(name)) return 1;
  for (let n = 1; n <= MAX_KILLERS; n++) if (huntable(name, KILLER_HITS, n)) return n;
  return reopenSoon(name) ? 1 : 0;
}

// Salles à keepers exploitées : chacune veut un tueur. Celle que des Invaders ferment (intel.keeperInvaded) aussi,
// si MAX_KILLERS tueurs peuvent les abattre (huntable) : rooms() l'écarte, mais les tueurs vont la rouvrir
// sans attendre HOSTILE_COOLDOWN ; sinon dès qu'elle rouvre bientôt (reopenSoon) : le tueur y sera à sa réouverture.
function keeperRooms(room) {
  const list = rooms(room).filter((name) => intel.keeperRoom(name));
  if (room.controller.level < MIN_RCL || room.energyCapacityAvailable < KILLER_COST) return list;
  const invaded = Object.values(Game.map.describeExits(room.name) || {})
    .filter((name) => (huntable(name, KILLER_HITS, MAX_KILLERS) || reopenSoon(name)) && !list.includes(name));
  return [...invaded, ...list];
}

// Tueurs voulus par la salle : ceux de sa première salle à keepers (spawner).
// ponytail: une seule salle à keepers servie (E25S3 n'en a qu'une voisine).
function killersWanted(room) {
  const name = keeperRooms(room)[0];
  return name ? killers(name) : 0;
}

// Vrai si un tueur de keepers vivant est affecté à la salle (en route compris).
function guarded(name) {
  return Object.values(Game.creeps).some((c) => c.memory.role === 'keeperKiller' && c.memory.target === name);
}

// Antres qui gardent une source de la salle (le keeper reste à portée 5 de sa ressource) : celui du minerai est ignoré.
function lairs(room) {
  const list = room.find(FIND_SOURCES);
  return room.find(FIND_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_KEEPER_LAIR && list.some((src) => s.pos.inRangeTo(src, 5)),
  });
}

// Dans une salle à keepers, écarte le créep d'un keeper ou d'un antre sur le point de le faire réapparaître.
// À portée DODGE_RANGE pile, il attend sur place sans avancer : repartir vers sa cible le ramenait à portée 4, il refuyait
// au tick suivant. Le 2026-11-22, 3 transporteurs oscillaient ainsi entre deux cases à chaque tick et barraient le passage
// au tueur, bloqué hors de portée du keeper qu'ils attendaient. Immobiles, ils sont poussés ou contournés (move).
// Salle fermée (Invaders) : pas d'attente, aucun tueur ne viendra abattre le keeper. Le rôle le fait rentrer ou recycler.
// Le 2026-11-23 sur E25S4, un transporteur arrêté à 5 cases du keeper de sa source y a attendu 1 300 ticks
// jusqu'à sa mort au lieu de se recycler (~2 000 d'énergie de vie restante perdus).
// Vrai s'il a dû fuir ou attendre ce tick (le rôle s'arrête là). La fuite contourne les créeps.
// ponytail: les chemins des transporteurs ne contournent pas les antres ; le tueur abat le keeper, ils repassent après.
// ponytail: le keeper du minerai n'est jamais abattu : un créep dont le chemin passe à 5 cases y attendrait sans fin
// (aucun de nos chemins d'E25S4 ne s'en approche) ; ne compter alors que les keepers des sources (lairs).
function dodge(creep) {
  if (!intel.keeperRoom(creep.room.name)) return false;
  const danger = [
    ...creep.room.find(FIND_HOSTILE_CREEPS, { filter: (c) => c.owner.username === intel.KEEPER }),
    ...creep.room.find(FIND_STRUCTURES, {
      filter: (s) => s.structureType === STRUCTURE_KEEPER_LAIR && s.ticksToSpawn !== undefined && s.ticksToSpawn <= LAIR_WARN,
    }),
  ].filter((o) => creep.pos.inRangeTo(o, DODGE_RANGE));
  if (!danger.length) return false;
  if (!danger.some((o) => creep.pos.inRangeTo(o, DODGE_RANGE - 1))) return intel.safe(creep.room.name);
  // Cases occupées par un créep évitées : la file des transporteurs sur la route bloquait le pas de fuite (move.run
  // ne pousse pas un créep qui a lui-même un pas), le mineur restait à portée du keeper jusqu'à sa mort.
  const roomCallback = (name) => {
    const costs = new PathFinder.CostMatrix();
    for (const c of Game.rooms[name].find(FIND_CREEPS)) if (c !== creep) costs.set(c.pos.x, c.pos.y, 255);
    return costs;
  };
  const goals = danger.map((o) => ({ pos: o.pos, range: DODGE_RANGE }));
  const result = PathFinder.search(creep.pos, goals, { flee: true, maxRooms: 1, plainCost: 2, swampCost: 10, roomCallback });
  if (result.path.length) move.step(creep, creep.pos.getDirectionTo(result.path[0]));
  return true;
}

// Pas d'un chemin de route non gardés dans remoteRoads : les deux cases de sortie et la case du conteneur.
const UNPAVED_STEPS = 3;

// Aller-retour (en ticks) entre le spawn de la salle et la source distante, ou null.
// Route pavée : le transporteur 2:1 fait une case par tick dans les deux sens, 2 fois la longueur du chemin.
// Sans ça, l'estimation sur le terrain (marais à 5) gardait le besoin 1,5 à 1,8 fois trop haut une fois la route
// construite : le 2026-11-23 sur E25S4, 11 transporteurs pour 3 sources au lieu de 4 à 5 (~10 énergie/tick d'entretien perdus).
// Recherche limitée aux deux salles, comme roadPath : avec maxRooms 3 seul, les autres voisines (E24S3, E26S3)
// prenaient le quota avant la salle de la source, chemin incomplet, source écartée et aucun mineur distant.
function trip(room, source) {
  if (paved(room, source.id)) {
    const path = room.memory.remoteRoads[source.id].path;
    return 2 * (Object.values(path).reduce((sum, cells) => sum + cells.length, 0) + UNPAVED_STEPS);
  }
  if (source.id in trips) return trips[source.id];
  const spawn = sources.mainSpawn(room);
  if (!spawn) return null;
  const result = PathFinder.search(spawn.pos, { pos: new RoomPosition(source.x, source.y, source.room), range: 1 }, {
    plainCost: 1,
    swampCost: 5,
    maxRooms: 2,
    maxOps: 4000,
    roomCallback: (name) => (name === room.name || name === source.room ? undefined : false),
  });
  trips[source.id] = result.incomplete ? null : result.path.length + result.cost;
  return trips[source.id];
}

// Sources distantes joignables ({ id, x, y, room }), les plus proches d'abord : elles rapportent le plus par transporteur.
function sourceList(room) {
  const all = [];
  for (const name of rooms(room)) {
    for (const s of intel.get(name).sourcePos) all.push(Object.assign({ room: name }, s));
  }
  return all.filter((s) => trip(room, s)).sort((a, b) => trip(room, a) - trip(room, b));
}

// Conteneur posé à côté de la source distante, ou undefined (salle non visible, pas encore construit).
function container(source) {
  if (!Game.rooms[source.room]) return undefined;
  return new RoomPosition(source.x, source.y, source.room).findInRange(FIND_STRUCTURES, 1, {
    filter: (s) => s.structureType === STRUCTURE_CONTAINER,
  })[0];
}

// Faux si la source d'une salle à keepers n'a qu'une case libre : son keeper s'y poste à chaque réapparition (~300 ticks)
// et détruit le chantier en marchant dessus, le mineur seul ne finit pas 5 000 points entre deux. Le 2026-11-23 sur E25S4,
// 16 chantiers détruits vers 2 650 en 7 600 ticks : 34 650 d'énergie perdus. Sa récolte reste au sol.
function containable(source) {
  return !intel.keeperRoom(source.room.name) || sources.spots(source) > 1;
}

// Vrai si réserver la salle rapporte plus que le reserver ne coûte : 5 énergie/tick de plus par source,
// moins l'entretien des transporteurs qui les rapportent, contre le corps du reserver sur sa vie utile
// (CREEP_CLAIM_LIFE_TIME moins l'aller). Il faut aussi pouvoir payer le corps (RCL 4).
function worthReserving(room, name, roomSources) {
  if (room.energyCapacityAvailable < RESERVER_COST) return false;
  const avgTrip = roomSources.reduce((sum, s) => sum + trip(room, s), 0) / roomSources.length;
  const gain = roomSources.length * (RESERVED_RATE - NEUTRAL_RATE) * (1 - avgTrip * HAUL_UPKEEP);
  return gain > RESERVER_COST / (CREEP_CLAIM_LIFE_TIME - avgTrip / 2);
}

// Vrai si la salle a besoin d'un reserver : réservation absente ou sous RESERVE_REFILL
// (salle non visible : réservation inconnue, on en envoie un).
function needsReserve(name) {
  const room = Game.rooms[name];
  if (!room || !room.controller) return true;
  const r = room.controller.reservation;
  return !r || r.username !== intel.me() || r.ticksToEnd < RESERVE_REFILL;
}

// Première source distante sans mineur vivant, première dont les transporteurs portent moins que son débit réel
// sur l'aller-retour (ou dont le conteneur déborde, jusqu'à HAUL_BACKLOG_RATIO fois ce besoin), et première salle à réserver sans reserver vivant.
// `remote` : WORK et capacité CARRY vivants par source ; `reservers` : reservers vivants par salle visée.
function missing(room, remote, reservers) {
  const result = {};
  const list = sourceList(room);
  for (const source of list) {
    // Réservation laissée par un cœur d'Invader : aucun mineur ni transporteur tant qu'elle tient.
    if (intel.invaderReserved(source.room)) continue;
    // Salle à keepers : personne avant le tueur.
    if (intel.keeperRoom(source.room) && !guarded(source.room)) continue;
    const r = remote[source.id] || { work: 0, carry: 0 };
    if (!result.miner && !r.work) result.miner = source;
    const flow = Math.min(r.work * HARVEST_POWER, rate(source.room));
    const box = container(source);
    const need = trip(room, source) * flow;
    if (!result.hauler && r.work && (r.carry < need
      || (box && box.store[RESOURCE_ENERGY] > HAUL_BACKLOG && r.carry < need * HAUL_BACKLOG_RATIO))) {
      result.hauler = source;
    }
  }
  for (const name of rooms(room)) {
    const roomSources = list.filter((s) => s.room === name);
    // Salle à keepers : pas de contrôleur à réserver.
    if (!roomSources.length || intel.keeperRoom(name) || reservers[name] || !needsReserve(name)) continue;
    // Reste d'un cœur d'Invader : reserver envoyé dès que son corps est payable, il rouvre la récolte.
    // ponytail: sous RESERVER_COST (RCL < 4), la salle attend le passage de l'éclaireur (SCOUT_REFRESH) qui note la fin de la réservation.
    const invader = intel.invaderReserved(name) && room.energyCapacityAvailable >= RESERVER_COST;
    if (invader || worthReserving(room, name, roomSources)) {
      result.reserver = name;
      break;
    }
  }
  return result;
}

// Énergie/tick rapportée par les sources distantes de la salle : production des mineurs vivants,
// au prorata du transport assuré (capacité CARRY / besoin sur l'aller-retour, comme dans missing).
function income(room, remote) {
  return sourceList(room).reduce((sum, source) => {
    const r = remote[source.id] || { work: 0, carry: 0 };
    const flow = Math.min(r.work * HARVEST_POWER, rate(source.room));
    const need = trip(room, source) * flow;
    return sum + (need ? flow * Math.min(1, r.carry / need) : 0);
  }, 0);
}

// Vrai si la salle visée par le créep est sûre ; sur place, il signale lui-même les hostiles
// et tout changement de propriétaire ou de réservation (intel.watch).
function safe(creep) {
  if (creep.room.name === creep.memory.target) intel.watch(creep.room);
  return intel.safe(creep.memory.target);
}

// Salle voisine à défendre contre des Invaders (intel.invaded), ou undefined.
function invaded(room) {
  if (room.controller.level < MIN_RCL || room.energyCapacityAvailable < MIN_DEFENSE_ENERGY) return undefined;
  return Object.values(Game.map.describeExits(room.name) || {}).find((name) => intel.invaded(name));
}

// Ramène le créep dans sa salle, où il attend que la salle visée redevienne sûre.
// Jusqu'à portée 20 du centre, pas seulement jusqu'à l'entrée : resté sur la case de sortie, il serait renvoyé
// par le moteur dans la salle dangereuse au tick suivant, et ainsi de suite.
function retreat(creep) {
  const center = new RoomPosition(25, 25, creep.memory.room);
  if (creep.room.name !== center.roomName || !creep.pos.inRangeTo(center, 20)) move.to(creep, center, { range: 20 });
}

// Mineur ou transporteur distant qui mourra avant la réouverture de sa salle (intel.reopenIn, plus le demi aller-retour
// pour retourner à sa source) : il se recycle au spawn le plus proche, qui rend l'énergie de sa vie restante dans
// une pierre tombale (ramassée par les haulers), au lieu de l'attendre en pure perte. Le 2026-11-21 sur E25S4,
// toute la flotte (7 transporteurs, 3 mineurs) est morte en attendant, ~14 k d'énergie de vie restante perdus.
// Pas si les tueurs peuvent abattre les Invaders (huntable) : ils rouvriront la salle bien avant. Vrai s'il va se recycler.
function recycle(creep) {
  const home = Game.rooms[creep.memory.room];
  const name = creep.memory.target;
  if (!home || huntable(name, KILLER_HITS, MAX_KILLERS)) return false;
  const back = (trip(home, { id: creep.memory.sourceId, x: creep.memory.x, y: creep.memory.y, room: name }) || 0) / 2;
  if (creep.ticksToLive >= intel.reopenIn(name) + back) return false;
  const spawn = creep.room.name === home.name ? creep.pos.findClosestByRange(FIND_MY_SPAWNS) : sources.mainSpawn(home);
  if (!spawn) return false;
  if (spawn.recycleCreep(creep) === ERR_NOT_IN_RANGE) move.to(creep, spawn, { range: 1 });
  return true;
}

// Sous cette part de ses points de vie, une route distante est réparée par le remoteBuilder (pas de tour hors de nos salles).
const ROAD_REPAIR_RATIO = 0.5;

// Coûts d'une salle distante visible : routes et chantiers de route réutilisés, structures bloquantes contournées.
function remoteCosts(room) {
  const costs = new PathFinder.CostMatrix();
  for (const o of [...room.find(FIND_STRUCTURES), ...room.find(FIND_MY_CONSTRUCTION_SITES)]) {
    if (o.structureType === STRUCTURE_ROAD) costs.set(o.pos.x, o.pos.y, move.PLAN_COSTS.road);
    else if (OBSTACLE_OBJECT_TYPES.includes(o.structureType)) costs.set(o.pos.x, o.pos.y, 255);
  }
  return costs;
}

// Route du spawn jusqu'à une source distante dont le conteneur existe : { salle: [cases x * 50 + y] } dans l'ordre
// du trajet, conteneur exclu, gardée dans room.memory.remoteRoads[id].path. Elle ne passe que par la salle
// et la salle distante ; dans la salle, `homeCosts` (matrice du planner) lui fait éviter les cases du plan.
// Recalculée si une case est devenue bloquante. Renvoie le chemin, ou undefined.
function roadPath(room, source, homeCosts) {
  const memory = room.memory.remoteRoads = room.memory.remoteRoads || {};
  const saved = memory[source.id];
  const callback = (name) => {
    if (name === room.name) return homeCosts;
    if (name !== source.room) return false;
    return Game.rooms[name] ? remoteCosts(Game.rooms[name]) : new PathFinder.CostMatrix();
  };
  const blocked = saved && Object.keys(saved.path).some((name) => {
    const costs = Game.rooms[name] && callback(name);
    return costs && saved.path[name].some((k) => costs.get(Math.floor(k / 50), k % 50) === 255);
  });
  if (saved && !blocked) return saved.path;
  const spawn = sources.mainSpawn(room);
  if (!spawn) return undefined;
  const result = PathFinder.search(spawn.pos, { pos: new RoomPosition(source.x, source.y, source.room), range: 1 }, {
    plainCost: move.PLAN_COSTS.plainCost, swampCost: move.PLAN_COSTS.swampCost, maxRooms: 2, maxOps: 6000,
    roomCallback: callback,
  });
  if (result.incomplete || result.path.length < 2) return undefined;
  const path = {};
  // Le dernier pas est la case du conteneur, où se tient le mineur. Les cases du bord (sorties) sont laissées nues.
  // ponytail: une route sur la sortie serait permise mais on n'y passe qu'un tick ; à ajouter si la fatigue s'y voit.
  for (const pos of result.path.slice(0, -1)) {
    if (pos.x < 1 || pos.x > 48 || pos.y < 1 || pos.y > 48) continue;
    (path[pos.roomName] = path[pos.roomName] || []).push(pos.x * 50 + pos.y);
  }
  memory[source.id] = { path, done: false };
  return path;
}

// Routes à poser pour la récolte distante : par source distante dont le conteneur est construit, son chemin.
// Note `done` quand toutes ses cases ont une route (salles visibles) : les transporteurs passent alors à 2 CARRY par MOVE.
// Les chemins des sources qui ne sont plus exploitées sont oubliés, pas ceux d'une salle seulement fermée.
function roads(room, homeCosts) {
  const all = sourceList(room);
  const memory = room.memory.remoteRoads = room.memory.remoteRoads || {};
  // Salle seulement fermée (Invaders, hostiles : sourceList l'écarte) : chemin et `done` gardés. Sans ça, chaque
  // invasion effaçait `done` et les transporteurs neufs repassaient en 1:1 (1 250 au lieu de 1 650 pour 2 500).
  for (const id in memory) {
    if (all.some((s) => s.id === id)) continue;
    const remote = Object.keys(memory[id].path).find((name) => name !== room.name);
    if (!remote || intel.safe(remote)) delete memory[id];
  }
  const paths = [];
  for (const source of all.filter((s) => container(s))) {
    const path = roadPath(room, source, homeCosts);
    if (!path) continue;
    paths.push(path);
    const names = Object.keys(path);
    if (names.every((name) => Game.rooms[name])) {
      memory[source.id].done = names.every((name) => path[name].every((k) => Game.rooms[name]
        .lookForAt(LOOK_STRUCTURES, Math.floor(k / 50), k % 50).some((st) => st.structureType === STRUCTURE_ROAD)));
    }
  }
  return paths;
}

// Vrai si la route jusqu'à la source distante est entièrement construite.
function paved(room, sourceId) {
  const memory = room.memory.remoteRoads;
  return !!(memory && memory[sourceId] && memory[sourceId].done);
}

// Cases (x * 50 + y) de nos chemins de récolte distante dans la salle `name`.
function roadCells(room, name) {
  const cells = new Set();
  const memory = room.memory.remoteRoads || {};
  for (const id in memory) for (const k of memory[id].path[name] || []) cells.add(k);
  return cells;
}

// Salle distante où le remoteBuilder a du travail : chantier de route, ou route de nos chemins sous ROAD_REPAIR_RATIO.
// Seulement les salles visibles (un mineur distant y travaille), undefined sinon.
function roadWork(room) {
  for (const name of rooms(room)) {
    const remote = Game.rooms[name];
    if (!remote) continue;
    if (remote.find(FIND_MY_CONSTRUCTION_SITES, { filter: (s) => s.structureType === STRUCTURE_ROAD }).length) return name;
    const cells = roadCells(room, name);
    if (remote.find(FIND_STRUCTURES, {
      filter: (s) => s.structureType === STRUCTURE_ROAD && s.hits < s.hitsMax * ROAD_REPAIR_RATIO
        && cells.has(s.pos.x * 50 + s.pos.y),
    }).length) return name;
  }
  return undefined;
}

module.exports = {
  RESERVER_UNIT, RESERVER_UNITS, ROAD_REPAIR_RATIO, KILLER_BODY, KILLER_DAMAGE, minerWork, keeperRooms, killersWanted, huntable, lairs, dodge, container, containable, missing, income, safe, invaded, retreat, recycle,
  roads, paved, roadWork, roadCells, trip,
};

