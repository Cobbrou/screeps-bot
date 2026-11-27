const move = require('../move');
const defense = require('../defense');
const boost = require('../boost');

// Gardien au contact (ATTACK) : tient la coupe quand le mode sans échec n'est pas disponible (defense.vigil).
// Le 2026-11-27, deadlydd a percé la coupe d'E25S3 avec deux démanteleurs et deux soigneurs boostés, sans aucune partie
// d'attaque : les tours seules (~200 dégâts nets contre 720 de soin) ne pouvaient rien, un gardien au contact si.
// Raid sans arme (defense.raiders sans ATTACK ni RANGED_ATTACK) : il sort par les remparts et frappe partout dans la salle
// (move.to interdit les cases de sortie). Raid armé : il ne frappe que les hostiles entrés dans les murs (defense.inBase),
// sous les tours ; dehors, il mourrait sans rien tuer (3 défenseurs perdus le 9 novembre).
// Au premier raid de sa vie, il passe au lab se faire booster (lab en mode attaque pendant la vigilance, voir boost).

// Hostile visé : la cible des tours si elle est permise, sinon le démanteleur (WORK) le plus proche, sinon le plus proche.
// Le démanteleur d'abord : c'est lui qui abat les murs, et il a le moins de TOUGH (12 contre 20 aux soigneurs le 2026-11-27).
function pick(creep, allowed) {
  if (!allowed.length) return null;
  const focus = defense.target(creep.room);
  if (focus && allowed.some((h) => h.id === focus.id)) return focus;
  const breakers = allowed.filter((h) => h.getActiveBodyparts(WORK));
  return creep.pos.findClosestByRange(breakers.length ? breakers : allowed);
}

module.exports.run = function (creep) {
  if (creep.memory.boost && boost.apply(creep)) return;
  const raiders = defense.raiders(creep.room);
  // Boost seulement face à un raid (pas pour un Invader ou un drainer) : chaque boost coûte ~600 000 crédits d'UH.
  if (raiders.length && !creep.memory.boosted && boost.attackReady(creep.room, creep.getActiveBodyparts(ATTACK))) {
    creep.memory.boost = true;
    creep.memory.boosted = true;
    if (boost.apply(creep)) return;
  }
  const armed = raiders.some((h) => h.getActiveBodyparts(ATTACK) || h.getActiveBodyparts(RANGED_ATTACK));
  const allowed = armed ? raiders.filter((h) => defense.inBase(creep.room, h.pos)) : raiders;
  const enemy = pick(creep, allowed);
  if (!enemy) {
    // Poste : le spawn le plus proche du centre de la salle, d'où il rejoint vite n'importe quel côté de la coupe.
    const post = new RoomPosition(25, 25, creep.room.name).findClosestByRange(FIND_MY_SPAWNS) || creep.room.controller;
    if (post && !creep.pos.inRangeTo(post, 3)) move.to(creep, post, { range: 3 });
    // Un hostile au contact est frappé quand même (raid armé collé à un rempart où il se tient).
    const near = creep.pos.findInRange(raiders, 1)[0];
    if (near) creep.attack(near);
    return;
  }
  if (!creep.pos.isNearTo(enemy)) move.to(creep, enemy, { range: 1 });
  const hit = creep.pos.isNearTo(enemy) ? enemy : creep.pos.findInRange(raiders, 1)[0];
  if (hit) creep.attack(hit);
};
