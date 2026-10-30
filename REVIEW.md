# Review du bot (2026-10-30)

Relecture complète de `src/`. Aucun bug bloquant, mais plusieurs défauts coûtent de l'énergie ou du CPU. Classement par gain attendu.

Déjà suivis ailleurs (roadmap ou commentaires `ponytail:`) et non repris ici : remplacement anticipé des mineurs, réservation des salles de remote mining, distance à vol d'oiseau pour l'expansion.

## Bugs et inefficacités réels

- [x] **1. Les haulers font l'aller-retour entre les conteneurs** (`src/roles/hauler.js:19-21`)
  - Chaque tick, le hauler vise le conteneur le plus plein et ne livre qu'une fois plein.
  - Il vide le conteneur A, qui devient le moins plein, et il part vers B. Il revient ensuite vers A, et ainsi de suite.
  - Les deux haulers d'une salle visent aussi le même conteneur.
  - Pendant ce temps, le spawn peut manquer d'énergie.
  - Correctif : garder la cible en mémoire, comme le fait le harvester (`targetId`), ou partir livrer dès que la cible est vide et que le hauler porte déjà de l'énergie.

- [x] **2. Corps plafonnés à 1 000 énergie** (`src/spawner.js:6`, `MAX_UNITS = 5`)
  - Les corps s'arrêtent à 15 parties, alors qu'un créep peut en avoir 50.
  - Du RCL 5 au RCL 8, la capacité monte de 1 800 à 12 900 énergie, mais les corps restent identiques. L'économie plafonne donc à partir du RCL 5.
  - Correctif : `Math.floor(50 / unit.length)` comme plafond.

- [ ] **3. Un seul hauler par source, quelle que soit la distance** (`src/spawner.js:37`)
  - Une source lointaine produit plus qu'un hauler de 500 de capacité ne peut transporter, et le conteneur déborde.
  - La longueur du trajet est déjà enregistrée dans `room.memory.routes[source.id].length`.
  - Correctif : `ceil(2 × longueur × 10 / capacité)` haulers par source.

- [ ] **4. Les tours parcourent toutes les structures à chaque tick** (`src/defense.js:40`)
  - Quand aucun hostile ni aucun blessé n'est présent, les tours lancent `room.find(FIND_STRUCTURES)` et parcourent tout, ceinture de murs comprise.
  - Correctif : ne lancer ce calcul que tous les 10 ticks, avec l'`id` de la cible gardé en cache.

- [ ] **5. Le pixel vide le bucket** (`src/stats.js:62`)
  - `generatePixel` fait passer le bucket de 10 000 à 0. Il ne reste alors plus de réserve en cas de pic de CPU, par exemple pendant une attaque.
  - Le planner est aussi sauté tant que le bucket reste sous 2 000.
  - Correctif : ne générer un pixel que hors menace, ou accepter ce compromis en connaissance de cause.

## CPU et mémoire

- [x] **6. `reusePath` reste à 5 par défaut** (`src/move.js`)
  - Les chemins sont recalculés souvent.
  - Correctif en une ligne : `opts = Object.assign({ reusePath: 20 }, opts)`. La roadmap prévoit déjà ce point (phase 2).

- [ ] **7. `creep.memory._stuck` est écrit à chaque déplacement** (`src/move.js:13`)
  - `Memory` grossit et se parse plus lentement.
  - Correctif : un objet global indexé par nom de créep suffit.

- [ ] **8. Recherches sans cache dans `sources.collect`** (`src/sources.js:159`)
  - `findClosestByRange(FIND_STRUCTURES)` tourne à chaque tick pour chaque upgrader ou builder en collecte.
  - Correctif : garder la cible en mémoire, comme pour le point 1.

## Logique de jeu

- [ ] **9. Trop de créeps de remote mining** (`src/spawner.js:9`, `REMOTE_PER_SOURCE`)
  - 2 créeps par source dans chaque voisine sûre, soit jusqu'à environ 16 créeps de 15 parties.
  - Avec un seul spawn au RCL 4, le spawn est presque saturé.
  - Correctif : plafonner le nombre de salles distantes, par exemple 2.

- [ ] **10. Personne ne répare avant les tours** (`src/spawner.js:40`)
  - Les builders ne sont créés que s'il existe des chantiers. Au RCL 1-2, les routes et conteneurs s'usent sans entretien.
  - Un conteneur détruit est replanifié, mais son contenu est perdu.

- [ ] **11. Le claimer insiste sur une cible abandonnée** (`src/roles/claimer.js`)
  - Quand l'expansion change de cible, le claimer garde l'ancienne `memory.target` et réessaie jusqu'à sa mort. C'est mineur.

## Early game (RCL 1-3)

Déroulé actuel au RCL 1 avec 2 sources : 4 harvesters, 2 upgraders, 2 builders et 1 scout, tous en `[WORK, CARRY, MOVE]`. Le planner pose dès le RCL 1 les conteneurs et les routes vers les sources et le contrôleur.

- [x] **12. Les conteneurs des sources sont construits en dernier** (`src/roles/builder.js:10`)
  - Le builder prend le chantier avec le moins de travail restant : routes (300), puis extensions (3 000), puis conteneurs (5 000).
  - Or les conteneurs débloquent miners et haulers, le plus gros gain économique de l'early.
  - Correctif : les conteneurs des sources passent juste après le spawn dans `work`.

- [ ] **13. Les routes sont posées trop tôt** (`src/planner.js:135-137`)
  - Au RCL 1, les trois routes représentent environ 75 cases × 300 = ~22 500 énergie (1 500 par case de marais), alors que le RCL 2 ne demande que 200 points.
  - Un corps `[WORK, CARRY, MOVE]` vide avance déjà d'une case par tick en plaine ; la route ne sert qu'à vitesse pleine chargé.
  - Correctif : conteneurs dès le RCL 1, routes à partir du RCL 3 (ou une fois les extensions finies).

- [x] **14. Les créeps qui récoltent eux-mêmes partent dans la salle voisine** (`src/sources.js:117-124`)
  - 8 créeps se partagent 2 sources : les cases adjacentes sont souvent toutes prises.
  - Après 20 ticks bloqués, upgraders et builders partent récolter dans une salle voisine pour 50 énergie (1 CARRY), soit des centaines de ticks de trajet.
  - Correctif : n'activer `away` que si le créep porte assez (par exemple ≥ 300 de capacité), ou à partir du RCL 4.

- [x] **15. Corps du RCL 1 sous-dimensionné** (`src/spawner.js:68`)
  - Capacité 300 : `repeat` donne un seul `[WORK, CARRY, MOVE]` (200), 100 énergie inutilisées.
  - `[WORK, WORK, CARRY, MOVE]` (300) récolte deux fois plus vite pour la même place autour de la source.

- [x] **16. Miners créés avant d'avoir 550 de capacité** (`src/spawner.js:15`)
  - Dès qu'un conteneur existe, la source passe en récolte statique, même au RCL 1 (capacité 300 : miner à 2 WORK, 4 énergie/tick au lieu de 10).
  - Le miner garde ce petit corps pendant 1 500 ticks.
  - Correctif : ne compter une source comme minée que si `energyCapacityAvailable >= 550`.

- [x] **17. Le surplus d'énergie est perdu au RCL 3** (`src/spawner.js:38`, `src/roles/hauler.js:39-43`)
  - Les upgraders supplémentaires dépendent du stockage, qui n'existe qu'au RCL 4 : avant, toujours 2 upgraders.
  - Une fois le conteneur du contrôleur plein (2 000), le hauler n'a plus de cible et reste plein. Les conteneurs des sources débordent et l'énergie tombe au sol, où elle s'évapore.
  - Correctif : ajouter des upgraders quand le conteneur du contrôleur est presque plein (> 1 500 par exemple).

- [x] **18. La ceinture de murs ruine l'économie au RCL 3** (`src/planner.js:139`, `src/defense.js:4`)
  - Elle est planifiée dès la première tour. Les tours remontent chaque mur et rempart à 30 000 points (10 000 × RCL 3).
  - Pour ~100 pièces : 3 M points / 80 points par énergie = ~37 500 énergie, prise sur l'énergie que les haulers livrent aux tours en priorité.
  - Correctif : attendre le RCL 4 et le stockage, ou viser beaucoup moins de points au RCL 3.

- [x] **19. Tours jamais remplies sans haulers** (`src/roles/harvester.js:19`)
  - Le harvester ne remplit que le spawn et les extensions ; seuls les haulers livrent aux tours.
  - Au RCL 3 sans conteneur de source fini (voir point 12), la tour reste vide et ne défend pas.
  - Correctif : ajouter `STRUCTURE_TOWER` au filtre du harvester.

## Priorité recommandée

Corriger d'abord les points 1, 2 et 6 : ce sont de petits changements à fort gain.

Pour l'early game, en priorité : 12 (conteneurs d'abord), 14 (`away` trop tôt) et 18 (murs au RCL 3).
