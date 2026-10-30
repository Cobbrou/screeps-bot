# Aide-mémoire Screeps

Rappel des concepts de base. La référence reste la [documentation officielle](https://docs.screeps.com) et l'[API](https://docs.screeps.com/api/).

## Tick

Le jeu avance par ticks. À chaque tick, le serveur exécute `module.exports.loop` du module `main`. Les actions demandées (déplacement, récolte…) sont appliquées à la fin du tick. Voir [Game loop](https://docs.screeps.com/game-loop.html).

## CPU

- `Game.cpu.limit` : CPU alloué par tick.
- `Game.cpu.tickLimit` : plafond utilisable sur ce tick (peut dépasser `limit` grâce au bucket).
- `Game.cpu.bucket` : réserve de CPU non utilisé (10 000 au maximum).
- `Game.cpu.getUsed()` : CPU consommé depuis le début du tick.

Dépasser `tickLimit` interrompt le script. Voir [CPU limit](https://docs.screeps.com/cpu-limit.html).

## `Game`

Objet global reconstruit à chaque tick : `Game.creeps`, `Game.spawns`, `Game.rooms`, `Game.structures`, `Game.time`, `Game.getObjectById(id)`. Les objets du jeu ne survivent pas d'un tick à l'autre : conserver leur `id`. Voir [Game](https://docs.screeps.com/api/#Game).

## `Memory`

Objet global persistant, sérialisé en JSON entre les ticks. Raccourcis : `creep.memory`, `room.memory`, `spawn.memory`. Les entrées des créeps morts ne sont pas supprimées automatiquement. Voir [Global objects](https://docs.screeps.com/global-objects.html#Memory-object).

## `Creep`

Unité mobile composée de parties (`WORK`, `CARRY`, `MOVE`, `ATTACK`…), d'une durée de vie de 1 500 ticks. Méthodes courantes : `moveTo`, `harvest`, `transfer`, `build`, `upgradeController`. Elles renvoient un code (`OK`, `ERR_NOT_IN_RANGE`…). Voir [Creep](https://docs.screeps.com/api/#Creep) et [Creeps](https://docs.screeps.com/creeps.html).

## `Room`

Salle de 50×50 cases. `room.find(FIND_*)` liste des objets (coûteux : mettre en cache) ; `room.controller` donne le contrôleur et son niveau (RCL). Voir [Room](https://docs.screeps.com/api/#Room).

## `StructureSpawn`

Crée les créeps : `spawn.spawnCreep(body, name, { memory })`. Le coût dépend des parties du corps et de l'énergie disponible (`room.energyAvailable`). Voir [StructureSpawn](https://docs.screeps.com/api/#StructureSpawn).

## Liens utiles

- [Introduction](https://docs.screeps.com/introduction.html)
- [Référence de l'API](https://docs.screeps.com/api/)
- [Modules](https://docs.screeps.com/modules.html)
- [Contrôle des salles (RCL)](https://docs.screeps.com/control.html)
