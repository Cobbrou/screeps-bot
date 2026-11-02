const intel = require('./intel');
const sources = require('./sources');

// Choix de la cible et pose du spawn tous les INTERVAL ticks.
const INTERVAL = 100;
// Salle d'origine : assez développée pour payer claimer (650) et pioneers.
const MIN_RCL = 4;
// ponytail: distance à vol d'oiseau, sans vérifier le trajet réel (Game.map.findRoute si les claimers se perdent).
const MAX_DISTANCE = 5;
// Enfermement : le GCL permet une salle de plus, mais aucune cible n'est trouvée depuis ENCLOSED_AFTER ticks
// (voisines prises ou dangereuses). On cherche alors jusqu'à ENCLOSED_DISTANCE salles, et `Memory.enclosed`
// renforce murs et remparts (defense) et pousse l'amélioration (spawner).
const ENCLOSED_AFTER = 20000;
const ENCLOSED_DISTANCE = 10;
// Abandon de la cible si elle n'est pas revendiquée, ou si son spawn n'est pas construit, dans ce délai.
const GIVE_UP = 5000;

function ownedRooms() {
  return Object.values(Game.rooms).filter((r) => r.controller && r.controller.my);
}

// Meilleure salle explorée à revendiquer : le plus de sources, puis la plus proche d'une salle d'origine.
function choose() {
  const owned = ownedRooms();
  if (owned.length >= Game.gcl.level) {
    // Pas de salle de plus permise : l'absence de cible ne veut rien dire.
    delete Memory.enclosedSince;
    delete Memory.enclosed;
    return;
  }
  const homes = owned.filter((r) => r.controller.level >= MIN_RCL && r.storage);
  const maxDistance = Memory.enclosed ? ENCLOSED_DISTANCE : MAX_DISTANCE;
  let best = null;
  let bestScore = -Infinity;
  for (const name in Memory.rooms) {
    if (!intel.safe(name) || !intel.get(name).sources) continue;
    for (const home of homes) {
      const distance = Game.map.getRoomLinearDistance(home.name, name);
      const score = intel.get(name).sources * 10 - distance;
      if (distance <= maxDistance && score > bestScore) {
        bestScore = score;
        best = { target: name, from: home.name, since: Game.time };
      }
    }
  }
  if (best) {
    Memory.expansion = best;
    delete Memory.enclosedSince;
    delete Memory.enclosed;
  } else if (homes.length) {
    // Sans salle d'origine prête (RCL 4 et stockage), l'absence de cible ne dit rien de l'entourage.
    if (!Memory.enclosedSince) Memory.enclosedSince = Game.time;
    if (Game.time - Memory.enclosedSince > ENCLOSED_AFTER) Memory.enclosed = true;
  }
}

// Distance minimale entre le premier spawn et le contrôleur : le hub du planner (portée 2) et les postes
// des upgraders autour (portée 3) restent libres, le spawn et ses extensions juste à côté.
const SPAWN_CONTROLLER_RANGE = 5;

// Chantier du premier spawn : case dont les abords (3x3) sont libres, au plus près du contrôleur et des sources,
// à SPAWN_CONTROLLER_RANGE au moins du contrôleur et 3 des sources.
function placeSpawn(room) {
  if (room.find(FIND_MY_CONSTRUCTION_SITES, { filter: (s) => s.structureType === STRUCTURE_SPAWN }).length) return;
  const terrain = room.getTerrain();
  const anchors = [room.controller, ...sources.list(room)];
  let best = null;
  let bestCost = Infinity;
  for (let x = 3; x <= 46; x++) {
    for (let y = 3; y <= 46; y++) {
      let blocked = false;
      for (let dx = -1; dx <= 1 && !blocked; dx++) {
        for (let dy = -1; dy <= 1 && !blocked; dy++) blocked = terrain.get(x + dx, y + dy) === TERRAIN_MASK_WALL;
      }
      if (blocked || room.controller.pos.getRangeTo(x, y) < SPAWN_CONTROLLER_RANGE
        || anchors.some((o) => o.pos.getRangeTo(x, y) < 3)) continue;
      const cost = anchors.reduce((sum, o) => sum + o.pos.getRangeTo(x, y), 0);
      if (cost < bestCost) {
        bestCost = cost;
        best = { x, y };
      }
    }
  }
  if (best) room.createConstructionSite(best.x, best.y, STRUCTURE_SPAWN);
}

// Vrai si la salle visée est revendiquée par nous (les pioneers prennent alors le relais du claimer).
function claimed() {
  const room = Memory.expansion && Game.rooms[Memory.expansion.target];
  return !!(room && room.controller && room.controller.my);
}

module.exports.run = function () {
  const exp = Memory.expansion;
  if (!exp) {
    if (Game.time % INTERVAL === 0) choose();
    return;
  }
  const room = Game.rooms[exp.target];
  if (claimed()) {
    // Spawn construit : la salle se gère seule, l'expansion est terminée.
    if (room.find(FIND_MY_SPAWNS).length) {
      delete Memory.expansion;
      return;
    }
    if (!exp.claimedAt) exp.claimedAt = Game.time;
    // Spawn jamais construit (pioneers tués) : la salle est rendue pour ne pas produire des pioneers sans fin.
    if (Game.time - exp.claimedAt > GIVE_UP) {
      room.controller.unclaim();
      delete Memory.expansion;
      return;
    }
    if (Game.time % INTERVAL === 0) placeSpawn(room);
    return;
  }
  // Prise ou réservée par un autre joueur, ou trop longue à atteindre : on change de cible.
  const c = room && room.controller;
  const taken = c && (c.owner || (c.reservation && c.reservation.username !== intel.me()));
  if (taken || Game.time - exp.since > GIVE_UP) {
    if (room) intel.record(room);
    delete Memory.expansion;
  }
};

module.exports.claimed = claimed;
