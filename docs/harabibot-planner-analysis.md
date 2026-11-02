# Analyse du planner de harabibot v2

Comparaison entre notre `src/planner.js` et le planner de [sy-harabi/screeps-harabibot_v2](https://github.com/sy-harabi/screeps-harabibot_v2) : code `src/capabilities/basePlanning/` (environ 7 200 lignes de TypeScript) et `src/colony/build/construction.ts`, décisions `docs/decisions/0001`, `0002` et `0004`.

Les suites à donner sont dans [ROADMAP.md](../ROADMAP.md). L'analyse de l'économie early game est dans [harabibot-analysis.md](harabibot-analysis.md).

## Fonctionnement de harabibot

### Plan calculé une fois

Le plan complet de la salle (RCL 1 à 8) est calculé une seule fois (`planBase`), puis stocké dans un segment mémoire (`basePlanStore`, encodé par `basePlanCodec`). Chaque structure planifiée porte sa position, son type et le RCL à partir duquel la poser.

Étapes du calcul :

1. **Régions** : transformée de distance du terrain, découpage en régions, choix des régions de la base autour du contrôleur. Si le plan échoue, une région de plus est ajoutée et le calcul recommence.
2. **Remparts extérieurs** : coupe minimale (min-cut) entre la base et les sorties, le coût d'une case croissant avec sa distance au contrôleur (`planOuterRamparts`). Tout le reste du plan est placé à l'intérieur, hors des cases exposées.
3. **Zone du contrôleur** : stockage à portée 4 du contrôleur, avec trois cases adjacentes à portée 3 qui démarrent trois « chaînes d'upgrade » (jusqu'à 18 cases réservées aux upgraders fixes). Une zone est classée par nombre de cases d'upgrade (16 et plus, 13 à 15, 12 et moins).
4. **Noyau** : petit modèle autour du stockage (terminal, case du créep gestionnaire, premier spawn, lien, cinq routes), tourné vers la chaîne du milieu et essayé normal ou retourné. Le meilleur couple zone/noyau est choisi par classe de zone, puis par distance du spawn au centre de la base.
5. **Arbre des ressources** : un conteneur par source et par minerai, puis un arbre de routes minimal entre le noyau et ces conteneurs (Dijkstra et programmation dynamique sur masques de bits, `planResourceTree`).
6. **Routes des remparts** : accès des défenseurs et des réparateurs à chaque segment de rempart.
7. **Labs**, puis **emplacements** des 60 extensions, des spawns 2 et 3 et des autres structures, de part et d'autre de routes de service (`planStructureSlots`).
8. **Tours** : placement qui maximise les dégâts reçus par le rempart le moins couvert (`planTowers`).
9. **RCL des structures** : la n-ième structure d'un type reçoit le premier RCL qui l'autorise (`getStructureRcl`). Une route prend le RCL le plus bas des structures qu'elle dessert, jamais moins que 3 (`assignRoadRcls`). Les routes vers le minerai attendent le RCL 6.

Le premier spawn existant est pris en compte (`existingSpawn`) : sa région est ajoutée à la base.

### Construction

À chaque vérification, `runConstruction` compare le plan et la salle, puis pose ce qui manque pour le RCL actuel :

- **3 chantiers actifs au plus** par salle (`MAX_ACTIVE_SITES`) ;
- priorités : spawn manquant, puis extensions tant que la capacité est sous 650 (prix d'un `claimer`), puis tour, puis extensions sous 800, puis terminal, stockage, extensions, conteneurs, liens, routes, remparts et le reste ;
- aux RCL 2 et 3, un **conteneur provisoire sur la case du futur stockage** sert de dépôt ; il est détruit au moment de poser le stockage ;
- avant le RCL 4, les extensions sont classées par distance au stockage, avec un bonus quand elles touchent un chemin de source actif : les haulers les remplissent en passant. À partir du RCL 4, seule la distance au stockage compte ;
- un créep posé sur un chantier bloquant est poussé hors de la case ;
- la vérification complète n'a lieu qu'au changement de RCL, à la disparition d'un chantier, ou tous les 20 à 500 ticks selon le travail restant.

## Notre planner

`src/planner.js` recalcule tous les 100 ticks et à chaque changement de RCL :

- stockage, tours et extensions en damier autour du spawn, de portée 2 à 8 ;
- conteneurs au bout des routes spawn → sources et spawn → contrôleur (portée 2), routes à partir du RCL 3 ;
- ceinture de murs à 2 cases des sorties, avec remparts sur les routes ;
- tous les chantiers voulus posés d'un coup, dans la limite de `MAX_CONSTRUCTION_SITES - SITE_MARGIN` (80 sur le compte).

Les positions dépendent de ce qui existe déjà et de l'ordre de construction. Seules les routes sont gardées (`room.memory.routes`).

## Améliorations possibles, par priorité

### 1. Bug probable : le dépôt du contrôleur peut se déplacer

- `planAround` ignore les routes gardées dans `room.memory.routes`. `costMatrix` ne les connaît que lorsque les routes ou leurs chantiers existent (RCL 3, ou RCL 2 une fois la salle équipée).
- Les cases du damier (`(dx + dy) % 2 === 0`) sont justement celles d'un chemin en diagonale qui part du spawn. Une extension posée au RCL suivant peut donc tomber sur la route spawn → contrôleur.
- La route est alors jugée bloquée et recalculée, et son bout change. `sources.depot` (bout de la route tant que le conteneur n'existe pas) change de case, et le tas d'énergie reste à l'ancienne place. Les routes des sources, qui servent au dimensionnement des haulers, peuvent aussi dévier.
- Correction : dans `costMatrix`, mettre à 1 les cases des routes gardées, et faire sauter à `planAround` les cases dont le coût n'est pas 0.
- Non vérifié en jeu.

### 2. Chantiers concentrés

- Aujourd'hui, jusqu'à 80 chantiers sont posés d'un coup et les builders se dispersent.
- Proposition : 3 chantiers actifs au plus par salle, triés par priorité (spawn, extensions sous 650 de capacité, tour, extensions sous 800, conteneurs, routes).
- C'est le meilleur gain en early game pour l'effort demandé.

### 3. Plan calculé une fois et gardé

- Calculer le plan complet une fois, le garder en mémoire (cases codées `x * 50 + y`, comme les routes), puis ne poser que la différence avec la salle, filtrée par RCL.
- Supprime la dérive des positions (point 1) et sert de base aux points 4 à 6.
- Pas besoin de copier tout le pipeline de harabibot : un placement glouton simple suffit, à condition d'être fait une fois et stocké.

### 4. Hub près du contrôleur

- Stockage à portée 4 du contrôleur, avec des cases réservées aux upgraders fixes entre les deux.
- Aux RCL 2 et 3, conteneur provisoire sur la case du stockage. Il devient le dépôt unique des upgraders, à la place du conteneur à portée 2 en bout de route.
- Spawns suivants et liens à côté du stockage.
- Pour une nouvelle salle, `expansion` placerait le premier spawn d'après le plan, au lieu de prendre la case libre la plus proche du contrôleur et des sources.

### 5. Structures absentes à partir du RCL 5

Le planner ne pose aujourd'hui que le stockage, les tours, les extensions, les conteneurs, les routes et les murs. Il manque :

- les **liens** (RCL 5) : source, stockage, contrôleur ;
- le **2e et le 3e spawn** (RCL 7 et 8) : sans eux, nous perdons du temps de spawn à la fin de partie ;
- le **terminal** (RCL 6), l'**extracteur** et son conteneur (RCL 6), les **labs** (RCL 6 à 8) ;
- le **factory**, l'**observer**, le **power spawn** et le **nuker** (RCL 7 et 8).

### 6. Extensions le long des routes

- Le damier n'utilise qu'une case sur deux, et le remplissage se fait sans route, y compris sur les marais.
- Proposition : extensions de chaque côté de courtes routes en diagonale (3 cases) et des routes déjà prévues (noyau, sources).
- Avant le RCL 4, poser d'abord les extensions qui touchent un chemin de source.
- Routes posées au RCL des structures qu'elles desservent (au moins 3), comme `assignRoadRcls`.

### 7. Remparts par min-cut autour de la base

- Notre ceinture à 2 cases des sorties compte beaucoup de cases à construire et à entretenir.
- Une coupe minimale autour de la base en demande bien moins, mais l'algorithme fait environ 150 à 200 lignes.
- À faire une fois l'économie stable au RCL 5 ou plus, et une fois le plan gardé (point 3), pour que les structures restent à l'intérieur.

## À ne pas reprendre

- La programmation dynamique par masques de bits pour l'arbre de routes : un `PathFinder` qui réutilise les routes déjà prévues donne presque le même résultat.
- La certification du placement des tours : des tours proches du centre de la base suffisent.
- Le placement dynamique des labs : un motif fixe de 10 labs suffit.
- La libération des cases d'upgraders aux RCL 7 et 8.

Ces parties coûtent beaucoup de code pour un gain marginal à notre stade.
