const intel = require('./intel');
const sources = require('./sources');
const defense = require('./defense');

// Choix de la cible et pose du spawn tous les INTERVAL ticks.
const INTERVAL = 100;
// Salle d'origine : assez développée pour payer claimer (650) et pioneers.
const MIN_RCL = 4;
// Distance en salles du trajet sûr (intel.route : ni keepers, ni salles hostiles, ni autre zone).
const MAX_DISTANCE = 5;
// Enfermement : le GCL permet une salle de plus, mais aucune cible n'est trouvée depuis ENCLOSED_AFTER ticks
// (voisines prises ou dangereuses). On cherche alors jusqu'à ENCLOSED_DISTANCE salles, et `Memory.enclosed`
// pousse l'amélioration (spawner).
const ENCLOSED_AFTER = 20000;
const ENCLOSED_DISTANCE = 10;
// Abandon de la cible si elle n'est pas revendiquée, ou si son spawn n'est pas construit, dans ce délai.
const GIVE_UP = 5000;
// Cible abandonnée (délai dépassé) écartée pendant ce nombre de ticks : sans ça, choose() la reprenait aussitôt
// (même score) et claimers et pioneers s'enchaînaient sans fin vers un contrôleur inaccessible ou un spawn imposable.
// Délai et non exclusion définitive : l'échec peut venir d'un spawn d'origine trop occupé pour créer le claimer.
const RETRY_AFTER = 50000;

// Cible écartée à cette distance (salles, vol d'oiseau) ou moins d'une salle possédée ou réservée par un autre joueur.
// E24S3, prise le 2026-11-25 à 2 salles de E22S3 (réservée par deadlydd), a été rasée le lendemain.
// ponytail: tout joueur non ami compte, même pacifique ; à affiner (attaques vues) si plus aucune cible ne reste.
const PLAYER_RANGE = 2;

// Salles possédées ou réservées par un autre joueur (ni nous, ni ami, ni Invader) d'après l'intel.
function playerRooms() {
  const me = intel.me();
  return Object.keys(Memory.rooms || {}).filter((name) => {
    const i = intel.get(name);
    const who = i && (i.owner || i.reserved);
    return !!who && who !== me && who !== defense.INVADER && !defense.FRIENDS.includes(who);
  });
}

// Vrai si la salle est à PLAYER_RANGE ou moins d'une de ces salles de joueurs.
function exposed(name, players) {
  return players.some((p) => Game.map.getRoomLinearDistance(p, name) <= PLAYER_RANGE);
}

// Note l'abandon de la cible, hors de son intel (réécrit à chaque passage de l'éclaireur).
function fail(name) {
  if (!Memory.rooms) Memory.rooms = {};
  if (!Memory.rooms[name]) Memory.rooms[name] = {};
  Memory.rooms[name].expansionFailed = Game.time;
}

// Vrai si la salle a été abandonnée comme cible depuis moins de RETRY_AFTER ticks.
function failed(name) {
  const at = Memory.rooms[name].expansionFailed;
  return at !== undefined && Game.time - at < RETRY_AFTER;
}

function ownedRooms() {
  return Object.values(Game.rooms).filter((r) => r.controller && r.controller.my);
}

// Meilleure salle explorée à revendiquer : le plus de sources, puis la plus proche d'une salle d'origine
// par un trajet sûr (sans trajet sûr, claimer et pioneers seraient tués en route), loin des autres joueurs (exposed).
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
  const players = playerRooms();
  let best = null;
  let bestScore = -Infinity;
  for (const name in Memory.rooms) {
    if (!intel.safe(name) || !intel.get(name).sources || failed(name) || exposed(name, players)) continue;
    for (const home of homes) {
      // Vol d'oiseau d'abord : findRoute seulement pour les salles assez proches, et seulement si le score
      // optimiste (trajet aussi court que le vol d'oiseau) peut battre le meilleur.
      const linear = Game.map.getRoomLinearDistance(home.name, name);
      if (linear > maxDistance || intel.get(name).sources * 10 - linear <= bestScore) continue;
      const path = intel.route(home.name, name);
      if (!path || path.length > maxDistance) continue;
      const score = intel.get(name).sources * 10 - path.length;
      if (score > bestScore) {
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

// Guerre (Memory.war = { target }) : reprise d'une salle à nous tenue par un joueur, décidée le 2026-11-26 pour E24S3.
// Pendant ce temps, l'amélioration est en pause partout (upgrader.paused), le lab boost le tir des gardes (boost),
// les gardes attaquent dès que la salle est en mode sans échec (spawner.guards) et les carriers puisent jusqu'à leur
// réserve minimale (carrier.reserve). Finie (rien que la défense ensuite) dès que la salle a un spawn et toutes les tours
// de son RCL, ou si elle n'est plus à nous. Posée à la main : Memory.war = { target: 'E24S3' }.
function endWar() {
  const room = Game.rooms[Memory.war.target];
  const mine = room && room.controller && room.controller.my;
  const towers = mine && room.find(FIND_MY_STRUCTURES, { filter: (s) => s.structureType === STRUCTURE_TOWER }).length;
  if (mine && (!room.find(FIND_MY_SPAWNS).length || towers < CONTROLLER_STRUCTURES[STRUCTURE_TOWER][room.controller.level])) return;
  console.log(`[expansion] guerre finie : ${Memory.war.target} ${mine ? 'reprise' : 'perdue'}`);
  delete Memory.war;
}

module.exports.run = function () {
  if (Memory.war && Game.time % INTERVAL === 0) endWar();
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
      fail(exp.target);
      delete Memory.expansion;
      return;
    }
    if (Game.time % INTERVAL === 0) placeSpawn(room);
    return;
  }
  // Prise ou réservée par un autre joueur, trop longue à atteindre, ou plus de trajet sûr : on change de cible.
  const c = room && room.controller;
  const taken = c && (c.owner || (c.reservation && c.reservation.username !== intel.me()));
  const unreachable = Game.time % INTERVAL === 0 && !intel.route(exp.from, exp.target);
  const late = Game.time - exp.since > GIVE_UP;
  if (taken || unreachable || late) {
    if (room) intel.record(room);
    // Prise ou sans trajet : l'intel et intel.route l'écartent déjà. Délai dépassé : rien d'autre ne le retient.
    if (late) fail(exp.target);
    delete Memory.expansion;
    // Nouvelle cible dès ce tick : sans elle, le claimer en route se suiciderait en attendant le prochain INTERVAL.
    choose();
  }
};

// Salle voisine à nous encore sans stockage (avant le RCL 4) : soutenue par `home` (carrier, pioneer, guard), ou undefined.
// Son spawn seul (300 d'énergie par créep) mettrait des jours à atteindre la première tour (RCL 3).
// ponytail: voisines directes seulement ; plus loin, seulement les deux pioneers de l'amorçage.
function supported(home) {
  if (!home.storage || home.controller.level < MIN_RCL) return undefined;
  return Object.values(Game.map.describeExits(home.name) || {}).map((name) => Game.rooms[name])
    .find((r) => r && r.controller && r.controller.my && !r.storage);
}

// Salle à nous vue avec des hostiles armés depuis moins de RAID_COOLDOWN ticks (room.memory.raided) : son soutien attend.
// Pas en mode sans échec : les hostiles n'y peuvent rien contre nos créeps ni nos structures, la reconstruction y va.
// Armés : ATTACK, RANGED_ATTACK, HEAL ou démanteleur (intel.threats) ; un claimer seul ne compte pas (le 2026-11-25, un claimer
// déjà reparti fermait E24S3 aux pioneers). Juger sur les seuls hostiles visibles relançait carriers, pioneers et garde dès
// que deadlydd sortait se soigner, ~25 000 d'énergie pour une salle qu'il rase à volonté (2026-11-26).
const RAID_COOLDOWN = 1500;
function raided(room) {
  const armed = intel.threats(room).some((c) => c.body.some((p) => ![CLAIM, MOVE, TOUGH].includes(p.type)));
  if (armed) room.memory.raided = Game.time;
  if (room.controller && room.controller.safeMode) return false;
  return room.memory.raided !== undefined && Game.time - room.memory.raided < RAID_COOLDOWN;
}

module.exports.claimed = claimed;
module.exports.raided = raided;
module.exports.exposed = exposed;
module.exports.supported = supported;
