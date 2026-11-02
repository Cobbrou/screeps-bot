# Analyse de TooAngel : ce qui marche, comparé à notre bot

Comparaison avec [TooAngel/screeps](https://github.com/TooAngel/screeps) (commit `77e4bfa` du 31/10/2026, environ 16 700 lignes dans `src/`, docs `doc/Design.md`, `BaseBuilding.md`, `Defense.md`).

**Idée centrale** : TooAngel n'est pas le bot le plus efficace en début de partie. Sa force, c'est de **survivre seul pendant des années** sur le serveur officiel et les serveurs privés. Chaque erreur reste isolée, le CPU est protégé, les salles s'entraident, une salle tombée se relance, et l'expansion se règle sur les ressources mesurées. Notre bot calcule mieux son économie (revenu net, capacité de transport, trafic). En revanche, il n'a presque rien pour l'entraide entre salles et pour sa propre robustesse.

Les points sont classés par impact estimé sur notre bot. Ils ne sont pas encore reportés dans [ROADMAP.md](../ROADMAP.md).

## 1. Relance d'une salle qui a perdu ses spawns

- **TooAngel** (`prototype_room_my.js`, `reviveRoom`, `reviveMyNow`) :
  - Une salle sans spawn, ou en démarrage (`isRampingUp` : pas de stockage, capacité < 1 000), est marquée « en difficulté » (`isStruggling`).
  - Tous les 400 ticks, chaque salle saine à 10 salles au plus envoie un `nextroomer`. Une salle saine a du temps de spawn libre (`spawnIdle`), assez de stockage et un chemin réel (`findRoute`). S'il y a des hostiles, elle envoie aussi un `defender`.
  - Le `nextroomer` reconstruit le spawn, améliore le contrôleur s'il va rétrograder (< 1 500 ticks), construit tours et remparts pendant un siège, et démonte ce qui bloque son chemin.
  - Les salles saines envoient aussi de l'énergie avec des `carry` qui vident leur stockage dans la salle aidée (`handleReviveRoomSendCarry`).
  - Au RCL 1 avec moins de 100 ticks avant rétrogradation, la salle est abandonnée (`clearRoom`).
- **Chez nous** : `spawner.run` parcourt `Game.spawns`. Une salle sans spawn ne reçoit donc plus aucun créep. Les `pioneer` ne servent qu'à la cible de `Memory.expansion`. Une salle dont le spawn est détruit meurt, même si une autre salle voisine est en pleine santé.
- **Piste** : dans `expansion` (ou un petit module `revive`), repérer chaque salle à nous sans spawn. La salle saine la plus proche lui envoie alors 2 `pioneer`, avec la même `placeSpawn` et le même `GIVE_UP`. Cela reprend le code de l'expansion. Impact nul tant qu'on n'a qu'une salle, critique dès la deuxième.

## 2. Isolation des erreurs par salle

- **TooAngel** : `Room.prototype.execute` met un `try/catch` autour de chaque salle et de ses créeps. Il envoie aussi un `Game.notify` (limité à un toutes les 30 min). La boucle principale sépare la logique et les tâches de fin de tick (stats, pixels) : un plantage n'empêche pas les stats.
- **Chez nous** : un `try/catch` par créep et un par module (`stats.measure`). Mais `defense.run`, `spawner.run` et `planner.run` parcourent toutes les salles dans un seul bloc. Une exception dans une salle bloque donc ce module pour **toutes** les salles : plus de tours, ou plus de spawn nulle part.
- **Piste** : un `try/catch` dans la boucle par salle de ces trois modules, plus un `Game.notify(message, 60)` pour être prévenu hors ligne. Quelques lignes.

## 3. Défense des salles distantes et cœurs d'invader

- **TooAngel** :
  - Une salle réservée par un autre joueur ou par un cœur d'invader (`HostileReserved`) reçoit tous les 1 600 ticks un `attackunreserve` (corps `MMMMRRHH` + `AM`), envoyé depuis une salle à nous de RCL 5 au moins à portée 1.
  - Le `reserver` appelle un `defender` dès qu'il voit des hostiles ou un cœur d'invader (`callDefender`).
  - Un `sourcer` qui perd ses `WORK` (`ERR_NO_BODYPART`) demande 2 défenseurs et son remplaçant.
- **Chez nous** : `intel.safe` exclut les salles réservées par un autre (`Invader` compris) et celles qui ont vu des hostiles il y a moins de 1 500 ticks. Les créeps distants rentrent (`remoteMining.retreat`) et attendent. Un cœur d'invader qui réserve une salle distante nous la fait donc perdre tant qu'il reste là, et une incursion d'invaders coupe la récolte au moins 1 500 ticks.
- **Piste** : quand une salle distante est réservée par `Invader` ou abrite des invaders, envoyer un créep `RANGED_ATTACK`/`HEAL` depuis la salle d'origine si elle peut le payer, au lieu d'abandonner. Le cœur d'invader de niveau 0 n'a pas de tours : un petit créep suffit.

## 4. Taux d'inactivité du spawn (`spawnIdle`)

- **TooAngel** : chaque salle tient une moyenne glissante de l'inactivité de ses spawns : `spawnIdle = 0,999 × spawnIdle + 0,001 × (spawn libre ? 1 : 0)`. Ce taux décide de tout ce qui est facultatif :
  - nouvelle réservation seulement si `spawnIdle ≥ 0,2` ;
  - réservation **abandonnée** si le taux retombe, ou si la salle d'origine n'est plus saine ;
  - aide aux autres salles seulement si `spawnIdle ≥ 0,05` ;
  - `carry` supplémentaires seulement avec du temps de spawn libre (`hasSpawnCapacity`).
- **Chez nous** : la récolte distante est en dernier dans `targets`. Elle ne prend donc que le temps libre, ce qui marche bien pour une salle. Mais rien ne dit quand le spawn est saturé. On démarre alors des salles distantes qu'on ne peut pas tenir (un mineur sans assez de transporteurs, un reserver payé pour rien), et on ne sait pas quand un 2e spawn ou une salle de plus est utile.
- **Piste** : mesurer `room.memory.spawnIdle` (une ligne dans `spawner.run`) puis s'en servir dans `remoteMining.rooms` : n'ajouter une salle distante que si `spawnIdle` dépasse un seuil. Le même taux servira au choix de la salle qui aide (point 1).

## 5. Expansion réglée sur le CPU, le heap et la mémoire mesurés

- **TooAngel** (`brain_nextroom.js`, `haveEnoughSystemResources`) : moyennes glissantes sur 10 000 ticks du CPU utilisé et libre, du heap et de `RawMemory`. Une nouvelle salle n'est revendiquée que si `CPU utilisé / salle < CPU libre`, et de même pour le heap et la mémoire.
- **Chez nous** : seul le GCL compte (`owned.length >= Game.gcl.level`). Sur le serveur officiel avec un petit `Game.cpu.limit`, le GCL peut permettre une salle que le CPU ne peut pas faire tourner. Le bucket fond alors et `stats.lowBucket` coupe planner et expansion en boucle.
- **Piste** : `Memory.stats.cpu` existe déjà. Y ajouter une moyenne glissante de `Game.cpu.getUsed()` et refuser `choose()` tant que `moyenne × (salles + 1) / salles > Game.cpu.limit × 0,9`.

## 6. Travaux périodiques étalés entre les salles

- **TooAngel** : `room.executeEveryTicks(n)` décale la période de chaque salle selon la position de son contrôleur : `(Game.time + x + y) % n === 0`. Les salles ne recalculent jamais toutes au même tick. Le long calcul de la disposition de base (`room.setup`) est découpé en étapes (`stepExecute`) qui reprennent au tick suivant si `Game.cpu.getUsed() >= Game.cpu.limit`.
- **Chez nous** : `planner.run` traite toutes les salles au même tick (`Game.time % 100 === 0`). Avec plusieurs salles, ce tick fait un pic de CPU (pathfinding des routes, `find`).
- **Piste** : remplacer `due` par un test par salle, `(Game.time + room.controller.pos.x + room.controller.pos.y) % INTERVAL === 0`. Une ligne.

## 7. Tick sauté quand le bucket est vide

- **TooAngel** (`brain_main.execute`) : après le tick 1 000, si `bucket < 1,5 × tickLimit` et `bucket < 10 × limit`, tout le tick est sauté. Le bucket se recharge au lieu de risquer un arrêt du script en plein tick.
- **Chez nous** : sous 2 000 de bucket, seuls planner et expansion sont sautés. Si les créeps seuls dépassent la limite, le bucket tombe à zéro et le runtime coupe le script au milieu du tick, à un endroit imprévisible.
- **Piste** : sous un seuil très bas (par exemple `bucket < 2 × Game.cpu.limit`), ne garder que `defense.run` (tours) et sauter le reste. Le reste du bot tient l'état en mémoire et reprend au tick suivant.

## 8. Diagnostic des morts imprévues

- **TooAngel** (`brain_memory.js`, `handleUnexpectedDeadCreeps`) : quand un créep disparaît avant la fin de sa vie, le nettoyage de la mémoire le signale, avec ou sans hostiles dans sa dernière salle (« I guess killed by hostile »). Un rôle peut aussi réagir à sa mort par un crochet `died`.
- **Chez nous** : `memory.cleanup` supprime la mémoire sans rien dire. Les pertes en salle distante passent inaperçues.
- **Piste** : dans `memory.cleanup`, si la mémoire du créep porte sa date de naissance et qu'il meurt avant `CREEP_LIFE_TIME - 50`, afficher un `console.log` avec son rôle et sa salle. Il faut pour cela noter `born` au spawn.

## 9. Tests sur un serveur privé

- **TooAngel** (`utils/test.js`, `doc/Testing.md`, `docker-compose.yml`) : la CI déploie le bot sur un serveur privé en Docker. Elle vérifie ensuite que le contrôleur atteint des RCL dans des délais attendus. Les pull requests sont fusionnées automatiquement si la CI passe (World Driven).
- **Chez nous** : seule `npm run build` vérifie le code. Une régression de l'économie (effectifs, corps, ordre des chantiers) ne se voit qu'en jeu, après déploiement.
- **Piste** : script qui lance un serveur privé local, y charge `dist/main.js` et relève le tick d'arrivée aux RCL 2, 3 et 4. Gros chantier, mais c'est le seul moyen de comparer deux réglages sans attendre des jours sur le serveur officiel.

## 10. Choix de la salle à revendiquer

- **TooAngel** (`brain_nextroom.js`) :
  - Il faut 2 sources, une salle ni possédée ni réservée par un autre, et une salle à nous qui l'atteint par un vrai chemin (`findRoomsWithinReach`).
  - Score : `2 × distance + valeur du minerai`, la valeur étant divisée par 2 pour chaque minerai déjà possédé. Le bot préfère varier ses minerais (labs, boosts) et s'étendre loin, avec au moins 2 salles d'écart (`minNewRoomDistance`).
  - Toutes les salles proches « en difficulté » envoient aussi un `nextroomer` pour accélérer le démarrage.
- **Chez nous** : `sources × 10 − distance` à vol d'oiseau, sans vérifier le chemin (déjà noté `ponytail:` dans `expansion.js`), et 2 `pioneer` depuis la seule salle d'origine.
- **Piste** : quand les labs arriveront (phase 8), ajouter un bonus pour un minerai pas encore possédé. Vérifier le chemin avec `Game.map.findRoute` dans `choose()`.

## Repères pour les phases avancées

TooAngel couvre déjà tout ce que prévoient nos phases 7 à 10. Fichiers à lire le moment venu :

| Sujet | Fichiers | Ce qu'on peut reprendre |
|-------|----------|-------------------------|
| Liens | `prototype_room_my.js` (`handleLinks`) | Lien du stockage fixé dans le plan, liens des sources vidés tour à tour (un tous les 12 ticks), seulement si le lien du stockage a 400 de place libre |
| Filler | `role_storagefiller.js`, `prototype_room_init.js` (`setFillerArea`) | Case du filler à côté du stockage, entourée du lien, d'une tour et du power spawn |
| Minerais, labs, boosts | `prototype_room_mineral.js`, `role_mineral.js`, `doc/Mineral.md` | Réactions et préparation des boosts au spawn (`prepareBoosting`) |
| Marché | `prototype_room_market.js` | Vente au-delà de 50 000 par minerai, équilibrage de l'énergie entre nos terminaux |
| Power banks, commodités | `prototype_room_external.js` (`harvestPower`, `harvestCommodities`) | Escouade attaquant + soigneur, transporteurs envoyés vers la fin |
| Nukes | `prototype_room_defense.js` (`handleNukeAttack`) | Remparts renforcés sur les cases visées |
| Enfermement | `brain_trapped.js` | Équivalent de notre `Memory.enclosed` : GCL ≥ 3, une seule salle depuis 50 000 ticks, voisines hostiles |

## Ce que notre bot fait mieux (à ne pas reprendre)

- **Économie** : TooAngel règle ses effectifs avec des seuils fixes. Par exemple 1 builder, 6 avec un chantier de stockage, et des `universal` selon le stockage. Notre revenu net soutenable, `haulCapacity` et les `MOVE` des mineurs calculés sur le trajet sont plus justes.
- **Spawn** : TooAngel tient une file persistante (`room.memory.queue`) triée par priorité, avec un terme d'âge et une durée de vie de 250 ticks. Ses doublons sont filtrés par `inQueue`/`inRoom`. Notre `targets`, recalculé à chaque tick et sans état, ne peut ni se désynchroniser ni garder une demande périmée.
- **Déplacement** : TooAngel fait suivre des chemins précalculés (`pathStart-*`), et les `carry` se passent l'énergie de créep en créep. C'est économe en CPU mais fragile. Il faut un rôle `structurer` pour démonter ce qui bloque, `isStuck` sur 7 positions, et un spawn orienté vers le haut (`directions = [TOP]`) pour coller à la disposition. Notre gestionnaire de trafic (`move.run`) est plus simple et plus souple.
- **Tours** : TooAngel répartit le tir entre plusieurs cibles (`hostileOffset`), ce qui laisse un soigneur réparer. Notre cible commune, avec priorité au soigneur et protection contre le vidage des tours, est meilleure.
- **Défense** : un seul défenseur tous les 250 ticks, à partir de 15 ticks d'attaque, et le mode sans échec après 100 ticks. Leur propre doc (`doc/Defense.md`, « Limitations ») le juge trop lent. Notre dimensionnement selon les parties hostiles et notre mode sans échec sur dégâts ou claimer sont plus réactifs.
- **Taille** : 16 700 lignes de prototypes globaux (`Room.prototype.*`, `Creep.prototype.*`) et un `config.js` de 370 lignes. Le code de création des corps porte lui-même `// TODO this needs to be rethought and rebuild (more simple)`. Nos modules courts en CommonJS restent plus faciles à faire évoluer.

## Hors sujet

- Diplomatie et réputation (`diplomacy.js`), quêtes entre joueurs (`quests_*.js`), signature des contrôleurs : utiles à un PNJ public, pas à notre objectif.
- Intégrations Grafana et screepsplus, profiler : notre `Memory.stats` suffit pour l'instant.
