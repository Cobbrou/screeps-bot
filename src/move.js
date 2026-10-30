// Ticks consécutifs sans bouger (hors fatigue) avant de recalculer le chemin en contournant les créeps.
const STUCK_TICKS = 2;
// Ticks pendant lesquels un chemin calculé est réutilisé (5 par défaut dans `moveTo`) : moins de pathfinding.
const REUSE_PATH = 20;

// Remplace `creep.moveTo` : même signature et même code de retour.
// Par défaut, `moveTo` ignore les autres créeps ; un créep bloqué derrière l'un d'eux piétine.
// On détecte ce blocage et on force un nouveau chemin qui les contourne.
function to(creep, target, opts = {}) {
  opts = Object.assign({ reusePath: REUSE_PATH }, opts);
  const here = `${creep.pos.roomName}:${creep.pos.x}:${creep.pos.y}`;
  const last = creep.memory._stuck;
  // Ne compte que les appels de ticks consécutifs : un créep qui travaille sur place n'est pas bloqué.
  const stuck = last && last.pos === here && last.time === Game.time - 1 && creep.fatigue === 0
    ? last.n + 1 : 0;
  creep.memory._stuck = { pos: here, time: Game.time, n: stuck };
  if (stuck >= STUCK_TICKS) {
    // Oublie le chemin en cache, qui traverse le créep gênant.
    delete creep.memory._move;
    opts = Object.assign({}, opts, { ignoreCreeps: false });
  }
  return creep.moveTo(target, opts);
}

module.exports = { to };
