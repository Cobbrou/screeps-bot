// Sous ce seuil de bucket, les modules non essentiels (planner) sont sautés.
const LOW_BUCKET = 2000;

// CPU consommé par module sur le tick en cours.
let modules = {};

// Exécute `fn` et note le CPU qu'il consomme sous `name`.
// Une erreur est affichée sans interrompre le reste du tick.
function measure(name, fn) {
  const start = Game.cpu.getUsed();
  try {
    fn();
  } catch (e) {
    console.log(`[${name}] ${e.stack || e}`);
  }
  modules[name] = Game.cpu.getUsed() - start;
}

// Vrai si le bucket est trop bas pour se permettre les modules non essentiels.
function lowBucket() {
  return Game.cpu.bucket < LOW_BUCKET;
}

// Fiche de stats de la salle, créée au besoin.
function roomStats(roomName) {
  if (!Memory.stats) Memory.stats = { rooms: {} };
  if (!Memory.stats.rooms[roomName]) Memory.stats.rooms[roomName] = { harvested: 0 };
  return Memory.stats.rooms[roomName];
}

// Ajoute au cumul de la salle l'énergie qu'une récolte réussie va extraire.
function recordHarvest(creep, source) {
  const amount = Math.min(creep.getActiveBodyparts(WORK) * HARVEST_POWER, source.energy);
  roomStats(source.room.name).harvested += amount;
}

// Écrit les indicateurs du tick dans Memory.stats, puis génère un pixel si le bucket est plein.
function run() {
  if (!Memory.stats) Memory.stats = { rooms: {} };
  for (const name in Game.rooms) {
    const room = Game.rooms[name];
    if (!room.controller || !room.controller.my) continue;
    const s = roomStats(name);
    s.rcl = room.controller.level;
    s.progress = room.controller.progress;
    s.progressTotal = room.controller.progressTotal;
    s.energyAvailable = room.energyAvailable;
    s.energyCapacity = room.energyCapacityAvailable;
    s.storedEnergy = room.storage ? room.storage.store[RESOURCE_ENERGY] : 0;
  }
  Memory.stats.time = Game.time;
  Memory.stats.cpu = { used: Game.cpu.getUsed(), limit: Game.cpu.limit, bucket: Game.cpu.bucket, modules };
  modules = {};

  // generatePixel n'existe que sur le serveur officiel. Pas de pixel pendant une expansion :
  // il viderait le bucket et ferait sauter planner et expansion.
  if (typeof Game.cpu.generatePixel === 'function' && Game.cpu.bucket >= PIXEL_CPU_COST && !Memory.expansion) {
    Game.cpu.generatePixel();
  }
}

module.exports = { measure, lowBucket, recordHarvest, run };
