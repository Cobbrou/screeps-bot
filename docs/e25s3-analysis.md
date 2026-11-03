# Analyse de E25S3 (shard0)

Relevé du tick 78 771 302 (2026-11-03), fait par lecture de l'API Screeps (room-objects, mémoire, statut des salles, stats du compte) et du code de `src/`.

## Résumé

L'amélioration du contrôleur est presque à l'arrêt : `energyControl` vaut 60 puis 204 sur les deux dernières tranches de 3 h. Dans le même temps, la tour dépense environ 10 énergie/tick sur les murs, et le stockage reste bloqué sous 15 000. La salle est enfermée : le revenu plafonne à 20 énergie/tick.

## État de la salle

- **Contrôleur** : RCL 4, 25 133 / 405 000 (6 %). Rétrogradation dans 37 522 / 40 000 ticks, aucun risque. Safe mode : 3 disponibles, pas de cooldown.
- **Énergie** : spawn et extensions pleins (1300/1300). Stockage `6ae93903f896d331d38ae03f` à 11 545. Tour `6ae875622cb4a76d11a3d009` à 670/1000.
- **Sources** :
  - `55db3473efa8e3fe66e05e61` (21,6) et `55db3473efa8e3fe66e05e63` (33,28) : chacune a 1 mineur de 5 WORK et un conteneur. Elles sont exploitées à 100 % (énergie restante ÷ ticks avant régénération = 10/tick pile).
  - Minerai H, 35 000, en (27,41) : il faut un extracteur, disponible au RCL 6.
- **Structures** : 20/20 extensions, 1/1 tour, stockage, 2 conteneurs de source, 44 routes saines (minimum 4700 PV). Ceinture de 54 murs et 4 remparts. Aucun chantier, `Memory.sites` vide. Ni ruine, ni tombstone, ni énergie au sol.
- **Créeps (6)** :
  - 2 miners : `miner-Spawn1-78770043` (TTL 258) et `miner-Spawn1-78770724` (TTL 939).
  - 2 haulers de 17 CARRY et 9 MOVE : TTL 135 et 431.
  - 1 ancien builder converti en upgrader (`builder-Spawn1-78769964`) : 7 WORK, 6 CARRY, 6 MOVE, TTL 218.
  - 1 claimer `claimer-Spawn1-78771143`, TTL 446, inactif.
- **Voisines** :
  - **Nord (E25S2) et est (E26S3)** : fermées par les murs de la zone de respawn (16 cases en haut, 3 à droite) jusqu'au **2026-12-01 13:07 UTC**. Ensuite, elles restent réservées et minées par GT500 (container miners de 12 WORK).
  - **Ouest (E24S3)** : appartient à vKDeath, RCL 5, 2 tours, 8 créeps.
  - **Sud (E25S4)** : salle à keepers (4 keepers, 3 sources de 4000).
  - Conséquence : aucune salle à miner à distance, aujourd'hui comme après le 1er décembre.
- **CPU** : 2,6 / 20 au dernier tick. Le bucket est à **32**, vidé par `generatePixel`. `Memory` pèse 7,5 Ko.
- **Stats sur 24 h** : 441 k récoltés, dont 152 k en construction et réparation, 162 k en créeps et 114 k en amélioration. La quasi-totalité de l'amélioration date d'avant les 6 dernières heures.

## 1. Bugs et erreurs

1. **[Critique] La tour finance les murs pendant que l'amélioration est en pause.**
   - Le stockage est sous `STORAGE_HIGH` et `room.memory.storageLow = true` (`src/roles/upgrader.js:8-17`). Les upgraders ne puisent plus et le spawner n'en crée pas (`src/spawner.js:166-167`).
   - Pendant ce temps, `runTowers` répare dès que la tour dépasse 50 % (`src/defense.js:150-153`), et les haulers la remplissent dès qu'il lui manque 200 (`src/roles/hauler.js:10,190-193`).
   - Mesure : 38 des 58 barrières sont sous 32 000. Il manque **environ 1,05 M PV, soit environ 49 000 énergie** au rendement réel de la tour : elle est en (29,11), à 9-36 cases des barrières.
   - Correction : ne réparer les murs et remparts que si `!storageLow`, sauf pour un rempart sous `RAMPART_DYING`.
2. **[Haute] Le claimer orphelin attend sa mort.** `src/roles/claimer.js:7` fait `if (!exp) return;`. Or `Memory.expansion` n'existe plus et `claimer-Spawn1-78771143` (cible E27S3) attend sans rien faire : 650 énergie perdues. Correction : `creep.suicide()` (ou recyclage au spawn) quand il n'y a plus d'expansion ou que la cible a changé.
3. **[Moyenne] `threats()` compte WORK et CLAIM** (`src/defense.js:2`). Un mineur ou un réparateur de vKDeath (4 WORK) qui traverse la salle :
   - prend les tirs de la tour, ce qui risque une guerre avec un RCL 5 qui a 2 tours ;
   - met l'amélioration en pause (`src/roles/upgrader.js:25`) ;
   - bloque les pixels ;
   - et, dans les renseignements, E24S3 est déjà marquée hostile en permanence pour cette raison.

   Correction : ne compter WORK que pour le joueur `Invader`, ou seulement pour un créep au contact de nos structures.
4. **[Basse] Commentaire faux** dans `src/defense.js:38-39` : il dit « gardée jusqu'à réparation complète ». En réalité, une nouvelle recherche a lieu tous les 10 ticks et prend la pire barrière. Les murs s'arrêtent donc à environ 32 001 PV (80 % de la cible), comme on l'observe. Le comportement est plutôt bon, c'est le commentaire qu'il faut corriger.
5. **À vérifier, sans conclusion possible** : `intel.avoid` repère les zones par `getRoomStatus().status`.
   - L'API web renvoie `normal` pour toutes ces salles, mais avec un `respawnArea` différent.
   - En jeu, notre salle devrait être en `respawn`. C'est ce que suppose le correctif `54c585b`.
   - Pour confirmer, dans la console : `Game.map.getRoomStatus('E26S3')`. Si la réponse est `normal`, E27S3 sera de nouveau choisie, sans trajet possible, et un nouveau claimer partira tous les 5000 ticks.

## 2. Performance CPU

- Le CPU n'est pas un problème : 2,6/20 au total (`creeps` 1,6, `spawner` 0,5, `defense` 0,3). La mémoire est nettoyée (`src/memory.js`).
- **Bucket** : `generatePixel` (`src/stats.js:67-70`) le vide environ toutes les 590 ticks. Il reste sous `LOW_BUCKET` (2000) pendant environ 118 ticks par cycle. Le planner et l'expansion sont alors sautés (`src/main.js:46`), soit environ 20 % des passages prévus tous les 100 ticks, et il n'y a aucune réserve après un reset du global. C'est acceptable. Baisser `LOW_BUCKET` à environ 500 suffit.
- **Boucles O(n²) sur `Game.creeps`**, appelées par créep :
  - `src/roles/hauler.js:27-33` (`mineRate`, par source), `:40-46` et `:199-204` ;
  - `src/roles/builder.js:65-68` ;
  - `src/roles/upgrader.js:83-85` ;
  - `src/sources.js:76-80`.

  C'est négligeable à 6 créeps. Un comptage par tick deviendra utile au-delà d'environ 30 créeps.
- Pas de `findClosestByPath` répété : seuls `builder.repair` et `harvester` l'utilisent, et ils gardent leur cible en cache.

## 3. Économie d'énergie

- La récolte est optimale (20/tick). Le transport est **surdimensionné** :
  - besoin calculé : (5+5)×10 + (13+13)×10 = **360** ;
  - capacité réelle : **1700** (2 × 850) ;
  - coût d'entretien : 1,73 énergie/tick, contre environ 0,5 nécessaire ;
  - cause : `buildBody('hauler')` (`src/spawner.js:246`) remplit toute la capacité de la salle ;
  - correction : plafonner le corps au besoin (gain d'environ 1,2/tick, 6 % du revenu). Le nombre de haulers se corrige déjà seul quand l'un d'eux meurt.
- **Les murs absorbent l'économie** : 49 k à finir au RCL 4, puis **environ 24 k au RCL 5**, ou **environ 145 k au RCL 5** si `Memory.enclosed` passe à vrai (`ENCLOSED_WALL_FACTOR`, `src/defense.js:6`). Ce cas est probable : `choose()` ne trouvera aucune cible pendant 20 000 ticks. Avec 20/tick, c'est environ 7 000 ticks d'amélioration perdus. Garder le bonus d'amélioration de `enclosed`, mais pas le doublement des murs.
- Le remote mining est structurellement impossible : `remoteMining.rooms` ne regarde que les salles adjacentes (`src/remoteMining.js:29-36`), et elles sont toutes inexploitables.
- Aucune énergie qui traîne, aucune dépense parasite, à part le claimer et les murs.

## 4. Spawn et population

- L'ordre de priorité est cohérent : defender, hauler, miner, builder, upgrader, scout, claimer… Les corps correspondent à la capacité de 1300.
- Le remplacement anticipé marche pour miner et upgrader. Anomalie : `miner-Spawn1-78770043` a noté `travel: 213` sur une route de 14 cases presque toute construite (environ 60 ticks attendus). Son successeur sera lancé environ 150 ticks trop tôt. La cause est inconnue (bouchon près du spawn, ou mesure prise avant la fin des routes) : à surveiller.
- Pas de blocage de file observé. `if (!body.length) continue;` (`src/spawner.js:378`) bloquerait les rôles suivants si un rôle prioritaire n'avait pas de corps possible, mais ce n'est pas le cas au RCL 4.
- 0 upgrader voulu tant que `storageLow` est vrai : c'est la conséquence directe du bug n° 1.

## 5. Construction

- Le RCL 4 est complet. Plan de base complet : 60 extensions, 6 tours, 1 stockage.
- **Manque pour le RCL 5** : `PLANNED` (`src/planner.js:8`) ne contient pas les liens. Un lien près de la source `55db3473efa8e3fe66e05e63` (route de 14 cases) et un près du stockage (43,25) supprimeraient le trajet de hauler le plus long.
- **Aucun rempart** sur le spawn (27,13), la tour (29,11) ou le stockage (43,25).
- Le rempart ouest `6ae9d440c4cfb249c64db84b` (2,15) n'a que **5101 PV**. Il est face à vKDeath, à 27 cases de la tour : la réparation n'y rapporte que 25 % du rendement maximal.

## 6. Défense

- Une seule tour, pleine aux deux tiers. `lastResort` est correct : spawn ou tour sous 50 %, ou claimer hostile à 5 cases ou moins du contrôleur.
- Les défenseurs ne sont créés que si la tour ne suffit pas.
- Le risque principal est diplomatique (point 1.3), pas les invaders.

## 7. Contrôleur et progression

- À environ 15-17 énergie/tick d'amélioration continue, le RCL 5 arrive dans environ 23 000 ticks (environ 25 h à 3,9 s/tick). Avec les pauses actuelles, l'échéance n'est pas estimable.
- Il n'y a aucun risque de rétrogradation : le garde-fou `downgrading` (`src/spawner.js:139-144`) est en place.

## Données manquantes

- Pas de logs console ni d'historique d'erreurs : l'API REST ne les donne pas.
- Pas d'historique CPU : seul le dernier tick est dans `Memory.stats`.
- Le sens exact de `creepsLost` (485 sur 24 h) n'est pas documenté : aucune conclusion n'en est tirée.

## Ordre de correction recommandé

1. Ne pas réparer les barrières quand `storageLow` est vrai (`src/defense.js`).
2. Faire se suicider le claimer orphelin (`src/roles/claimer.js`).
3. Sortir WORK de `threats()` pour les joueurs autres que l'Invader.
4. Ne pas doubler les murs avec `enclosed`, plafonner le corps des haulers.
5. Au RCL 5 : liens, et remparts sur spawn, tour et stockage.
