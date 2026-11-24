const move = require('../move');
const sources = require('../sources');
const defense = require('../defense');
const boost = require('../boost');

// Sous ce stock d'énergie dans le stockage, l'amélioration s'arrête : l'énergie va au spawn et aux tours.
// Elle ne reprend qu'au-dessus de STORAGE_HIGH (hystérésis : sans elle, upgraders créés puis mis en pause
// en boucle autour du seuil). Seuils bas avant le RCL 7 : l'amélioration repart vite après un chantier qui a vidé
// le stockage (lab du RCL 6). Dès le RCL 7, seuils relevés (RESERVE_*) : une réserve reste au stockage en cas de besoin.
const STORAGE_LOW = 2000;
const STORAGE_HIGH = 5000;
const RESERVE_RCL = 7;
const RESERVE_LOW = 50000;
const RESERVE_HIGH = 55000;

// Seuils du stockage bas de la salle : [bas, reprise].
function thresholds(room) {
  return room.controller && room.controller.level >= RESERVE_RCL ? [RESERVE_LOW, RESERVE_HIGH] : [STORAGE_LOW, STORAGE_HIGH];
}

// Seuil de reprise de l'amélioration de la salle (le spawner ne compte comme revenu que le stock au-dessus).
function storageHigh(room) {
  return thresholds(room)[1];
}

// Vrai si le stockage est bas (drapeau room.memory.storageLow, avec hystérésis). Sans stockage : faux.
function storageLow(room) {
  if (!room.storage) return false;
  const energy = room.storage.store[RESOURCE_ENERGY];
  const [low, high] = thresholds(room);
  if (energy < low) room.memory.storageLow = true;
  else if (energy > high) delete room.memory.storageLow;
  return !!room.memory.storageLow;
}

// Vrai si l'amélioration doit attendre : stockage bas, hostiles hors mode sans échec ou chantiers en cours
// (voir defense.secure). Les réparations ne la bloquent pas.
// Jamais en cas de rétrogradation proche (drapeau room.memory.downgrade posé par le spawner).
function paused(room) {
  if (room.memory.downgrade) return false;
  if (storageLow(room)) return true;
  return !defense.secure(room);
}

// Vrai si la salle a du travail de builder : chantier, structure que les tours entretiennent (murs et remparts
// de la coupe compris) ou barrière à remplacer. Un ancien builder devenu upgrader reprend alors son rôle :
// sans ça, le spawner ne voit aucun builder et en crée un neuf (2 300 d'énergie) à chaque rempart à remonter.
function builderWork(room) {
  return room.find(FIND_MY_CONSTRUCTION_SITES).length > 0 || !!defense.damagedStructure(room)
    || !!room.memory.swapBarrier;
}

// Sans dépôt (route du planner pas encore tracée) : alterne collecte et amélioration.
function roam(creep) {
  if (creep.memory.working && creep.store[RESOURCE_ENERGY] === 0) creep.memory.working = false;
  if (!creep.memory.working && creep.store.getFreeCapacity() === 0) creep.memory.working = true;
  if (!creep.memory.working) {
    // En pause, il dépense ce qu'il porte déjà au lieu de rester planté avec.
    if (paused(creep.room)) {
      if (creep.store[RESOURCE_ENERGY]) creep.memory.working = true;
      return;
    }
    sources.collect(creep);
  } else if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
    move.to(creep, creep.room.controller);
  }
}

// Postes des upgraders autour du dépôt : cases voisines praticables (portée 2 du contrôleur, donc portée 3),
// la case du dépôt comprise s'il est un conteneur (pas pour le tas, où les haulers se posent). Les cases de la route
// du hub voisines du dépôt sont laissées aux haulers : sans elles, les upgraders entassés n'importe où autour
// pouvaient fermer l'accès au conteneur. Sans route connue, la case la plus proche du spawn leur est laissée.
// Recalculés une fois par tick et par dépôt (le planner les demande aussi pour un stockage pas encore construit).
const postCache = {};
function posts(room, depot) {
  const depotKey = depot.pos.x * 50 + depot.pos.y;
  const cached = postCache[room.name];
  if (cached && cached.time === Game.time && cached.depotKey === depotKey) return cached.list;
  const terrain = room.getTerrain();
  const route = new Set((room.memory.routes && room.memory.routes[room.controller.id]) || []);
  const cells = [];
  const roads = new Set();
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const x = depot.pos.x + dx;
      const y = depot.pos.y + dy;
      if (x < 1 || x > 48 || y < 1 || y > 48 || terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
      if (!dx && !dy && !depot.container) continue;
      if (room.controller.pos.getRangeTo(x, y) > 3) continue;
      const structures = room.lookForAt(LOOK_STRUCTURES, x, y);
      if (structures.some((st) => OBSTACLE_OBJECT_TYPES.includes(st.structureType))) continue;
      if (structures.some((st) => st.structureType === STRUCTURE_ROAD)) roads.add(x * 50 + y);
      cells.push(x * 50 + y);
    }
  }
  // Routes construites exclues aussi : un upgrader posé dessus ne cède pas sa case (poste exact), et les haulers,
  // tenus à la route, piétinaient derrière lui. Sur E25S3, celui de (43,24) fermait la seule route vers Spawn2 :
  // spawn vide jusqu'à 680 ticks, énergie bloquée à 5 300 sous les 5 500 du tueur de keepers.
  let list = cells.filter((k) => k === depotKey || (!route.has(k) && !roads.has(k)));
  if (list.length === cells.length) {
    const spawn = sources.mainSpawn(room);
    const lane = spawn && cells.filter((k) => k !== depotKey)
      .sort((a, b) => spawn.pos.getRangeTo(Math.floor(a / 50), a % 50) - spawn.pos.getRangeTo(Math.floor(b / 50), b % 50))[0];
    list = cells.filter((k) => k !== lane);
  }
  postCache[room.name] = { time: Game.time, depotKey, list };
  return list;
}

// Poste attribué à l'upgrader (creep.memory.post, case x * 50 + y) : gardé tant qu'il reste un poste
// et qu'aucun autre upgrader de la salle ne l'a, quitté aussi si un poste qui touche le lien du hub se libère (lui seul
// le vide) ; sinon un poste libre, ceux qui touchent ce lien d'abord, puis le plus proche. undefined si tout est pris.
function post(creep, depot) {
  const list = posts(creep.room, depot);
  const taken = new Set(Object.values(Game.creeps)
    .filter((c) => c !== creep && c.memory.role === 'upgrader' && c.memory.room === creep.memory.room)
    .map((c) => c.memory.post));
  let k = creep.memory.post;
  const link = sources.hubLink(creep.room);
  const far = (cell) => (link && link.pos.getRangeTo(Math.floor(cell / 50), cell % 50) > 1 ? 50 : 0);
  if (!list.includes(k) || taken.has(k) || (far(k) && list.some((cell) => !far(cell) && !taken.has(cell)))) {
    const range = (cell) => creep.pos.getRangeTo(Math.floor(cell / 50), cell % 50);
    k = list.filter((cell) => !taken.has(cell)).sort((a, b) => far(a) + range(a) - far(b) - range(b))[0];
    creep.memory.post = k;
  }
  return k === undefined ? undefined : new RoomPosition(Math.floor(k / 50), k % 50, creep.room.name);
}

// Pause : l'upgrader qui touche le lien du hub et le stockage verse l'un dans l'autre, un retrait puis un dépôt.
// Le lien ne reste pas plein et la source liée continue d'envoyer sa récolte, qui remonte le stockage.
function drainLink(creep, link) {
  if (creep.store[RESOURCE_ENERGY]) creep.transfer(creep.room.storage, RESOURCE_ENERGY);
  else creep.withdraw(link, RESOURCE_ENERGY);
}

// Poste fixe à côté du dépôt : les haulers y apportent l'énergie, l'upgrader ne marche plus. À chaque tick
// il améliore avec ce qu'il porte et reprend au dépôt ce qui lui manque (permis au même tick ; l'énergie prise
// ne sert qu'au tick suivant). En pause, il finit ce qu'il porte sans en reprendre, sauf s'il peut vider le lien.
// Sans poste libre (plus d'upgraders que de postes), il se contente de rester à portée du contrôleur.
function run(creep) {
  const room = creep.room;
  // Ancien builder (converti faute de travail, voir builder.run) : il reprend son rôle dès que du travail revient
  // (builderWork). Sans ça, le spawner ne voit aucun builder et en crée un neuf.
  if (creep.name.startsWith('builder-') && creep.memory.room === room.name && builderWork(room)) {
    creep.memory.role = 'builder';
    return;
  }
  // Temps de trajet depuis le spawn, noté à la première arrivée au contrôleur : le spawner lance le successeur
  // assez tôt pour qu'il arrive quand cet upgrader meurt.
  // Pas pendant le détour par le lab de boost : il fausserait le trajet.
  if (creep.memory.travel === undefined && !creep.memory.boost && creep.pos.inRangeTo(room.controller, 3)) {
    creep.memory.travel = CREEP_LIFE_TIME - creep.ticksToLive;
  }
  if (sources.goBack(creep)) return;
  // Upgrader neuf marqué par le spawner : passe au lab de boost avant son poste.
  if (creep.memory.boost && boost.apply(creep)) return;
  const depot = room.controller && room.controller.my && sources.depot(room);
  if (!depot) {
    roam(creep);
    return;
  }

  const spot = post(creep, depot);
  if (spot && !creep.pos.isEqualTo(spot)) move.to(creep, spot, { range: 0 });
  else if (!spot && !creep.pos.inRangeTo(room.controller, 3)) move.to(creep, room.controller, { range: 3 });
  // Lien du hub (RCL 5) d'abord : l'énergie des sources liées y arrive sans hauler.
  const link = sources.hubLink(room);
  if (link && room.storage && depot.container === room.storage && paused(room)
    && creep.pos.isNearTo(link) && creep.pos.isNearTo(room.storage)) {
    drainLink(creep, link);
    return;
  }
  const fromLink = link && link.store[RESOURCE_ENERGY] && creep.pos.isNearTo(link);
  if ((fromLink || creep.pos.isNearTo(depot.pos)) && !paused(room) && creep.store.getFreeCapacity(RESOURCE_ENERGY)) {
    const pile = !depot.container && sources.depotPile(depot);
    if (fromLink) creep.withdraw(link, RESOURCE_ENERGY);
    else if (pile) creep.pickup(pile);
    else if (depot.container && depot.container.store[RESOURCE_ENERGY]) creep.withdraw(depot.container, RESOURCE_ENERGY);
  }
  if (creep.store[RESOURCE_ENERGY]) creep.upgradeController(room.controller);
}

// Upgraders postés au plus : un par poste (posts). Sans dépôt, pas de plafond.
function spots(room) {
  const d = sources.depot(room);
  if (!d) return Infinity;
  return Math.max(1, posts(room, d).length);
}

module.exports = { run, paused, posts, spots, builderWork, storageHigh };
