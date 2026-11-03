const move = require('../move');
const sources = require('../sources');

// Se poste sur le conteneur de sa source et récolte sans fin : l'énergie tombe dans le conteneur.
// Conteneur occupé par un autre créep (le mineur qu'il remplace) : attend sans bouger sur une case voisine
// du conteneur et de la source, en récoltant, et prend la place dès qu'elle se libère.
// Sans case de ce genre (conteneur seule case libre de la source) : attend collé au conteneur.
module.exports.run = function (creep) {
  const source = Game.getObjectById(creep.memory.sourceId);
  if (!source) return;
  const container = sources.container(source);
  // Temps de trajet depuis le spawn, noté à l'arrivée : le spawner lance le successeur assez tôt
  // pour qu'il arrive quand ce mineur meurt. Arrivée = à côté de la source ou du conteneur : l'attente
  // derrière le mineur remplacé ne doit pas compter, sinon le successeur suivant part encore plus tôt.
  if (creep.memory.travel === undefined
    && (creep.pos.isNearTo(source) || (container && creep.pos.isNearTo(container.pos)))) {
    creep.memory.travel = CREEP_LIFE_TIME - creep.ticksToLive;
  }
  if (container && !creep.pos.isEqualTo(container.pos)) {
    const dest = container.pos.lookFor(LOOK_CREEPS).length ? sources.waitSpot(creep, source.pos, container) : container.pos;
    if (!dest) return creep.pos.isNearTo(container.pos) || move.to(creep, container.pos, { range: 1 });
    // Portée 0 : la case devient sa zone de travail, move.run ne le pousse plus.
    if (!creep.pos.isEqualTo(dest)) return move.to(creep, dest, { range: 0 });
  }
  sources.harvestSource(creep, source);
  feedLink(creep, source);
};

// Lien de la source (RCL 5) : le mineur (1 CARRY) y verse ce qu'il récolte, et le lien envoie au lien du hub
// dès qu'il peut en remettre LINK_SEND. Lien ou hub plein (upgraders en pause) : la récolte déborde
// dans le conteneur, que les haulers vident comme avant.
const LINK_SEND = LINK_CAPACITY / 2;
function feedLink(creep, source) {
  if (!creep.store.getCapacity()) return;
  const link = sources.sourceLink(source);
  if (!link) return;
  if (creep.store[RESOURCE_ENERGY] && link.store.getFreeCapacity(RESOURCE_ENERGY)) creep.transfer(link, RESOURCE_ENERGY);
  const hub = !link.cooldown && sources.hubLink(creep.room);
  const amount = hub ? Math.min(link.store[RESOURCE_ENERGY], hub.store.getFreeCapacity(RESOURCE_ENERGY)) : 0;
  if (amount >= LINK_SEND) link.transferEnergy(hub, amount);
}
