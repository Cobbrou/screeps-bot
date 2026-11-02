# Analyse de harabibot v2 : pourquoi son early game est meilleur

Comparaison avec [sy-harabi/screeps-harabibot_v2](https://github.com/sy-harabi/screeps-harabibot_v2) (docs `decisions/0009`, `0015`, `rewrite-log/2026-10-02-early-game-hauling-and-relaying.md`, code `src/colony/harvest/`, `upgrade/`, `build/`, `logistics/`, `capabilities/spawning/`).

**Idée centrale** : harabibot traite le temps de spawn comme la ressource rare et pilote tout sur un débit (énergie/tick soutenable). Notre bot pilotait sur des stocks et des effectifs fixes, et ses créeps de travail marchent pour chercher leur énergie.

Les points sont classés par impact estimé. Les suites à donner sont dans [ROADMAP.md](../ROADMAP.md) (section « Retravail des bases »).

## 1. Récolte distante dès le début (fait)

- **Avant** : aucune récolte distante sans stockage (RCL 4), avec un rôle `remote` qui récoltait puis faisait l'aller-retour.
- **harabibot** : toutes les salles normales à 4 salles ou moins sont assignées dès qu'elles sont explorées (`harvestRoomPlanner.ts`, `MAX_REMOTE_DEPTH = 4`), sans condition de RCL. Chaque source distante a un mineur et utilise le pool de haulers partagé. Le remote est en dernier dans `SPAWN_PRIORITY_ORDER` : il ne prend que le temps de spawn libre, et les remotes réellement tenus s'ajustent seuls à la charge du spawn (décision 0009 §4).
- **Pourquoi** : deux sources locales plafonnent à 20 énergie/tick, alors que le spawn est en partie inoccupé dès le RCL 2. Chaque source distante non réservée rapporte jusqu'à 5 énergie/tick de plus.
- **Fait chez nous** : `remoteMining`, `remoteMiner` et `remoteHauler`, dès le RCL 2, en dernière priorité du spawn.

## 2. Les créeps de travail ne marchent pas pour l'énergie

- **Chez nous** : builders et upgraders vont eux-mêmes chercher leur énergie (`sources.collect`). Le conteneur du contrôleur n'arrive qu'après toutes les extensions du RCL. Le corps polyvalent `WORK/CARRY/MOVE` ne compte qu'un tiers de `WORK`.
- **harabibot** :
  - Le stockage est planifié à portée 4 du contrôleur, avec trois « chaînes d'upgrade » qui partent de cases adjacentes (`docs/decisions/0001`).
  - Les upgraders restent fixes et se passent l'énergie de proche en proche (`creep.transfer(successor)`).
  - Le dépôt d'énergie est la case du stockage : un tas au sol au RCL 1, un conteneur provisoire aux RCL 2-3, puis le stockage.
  - Les builders sans stockage demandent leur énergie (`requestEnergy`) et un hauler la leur apporte.
  - Corps de l'upgrader : beaucoup de `WORK`, environ 1 `CARRY` pour 8 `WORK` et 1 `MOVE` pour 10 `WORK`.

## 3. Effectifs calculés sur le revenu net, pas sur un stock

- **Chez nous** : 2 upgraders et 2 builders fixes, plus 1 par tranche de 500 d'énergie en attente. C'est un stock instantané : ça oscille et ça réagit en retard.
- **harabibot** : le revenu net soutenable de chaque source vaut sa production moins l'entretien du mineur, des haulers et du conteneur, au prorata du transport réellement assuré (`runHarvestScheduler`, `sourceEconomyStats.ts`).
  - Upgraders : `WORK` voulus = revenu, 2 `WORK` fixes au RCL 1.
  - Builders : puissance de construction = revenu (`EFFECTIVE_BUILD_POWER = 4`).
- Aucun upgrader n'est créé tant qu'il y a des chantiers. Les chantiers finis, les builders deviennent des upgraders.

## 4. Corps et dimensionnement des haulers et des mineurs

- **Mineur** : chez nous, 5 `WORK` + 1 `MOVE`, soit 1 case tous les 5 ticks hors route. harabibot choisit le nombre de `MOVE` qui minimise `temps de spawn / vie productive` sur le chemin réel (`createMinerBody`).
- **Hauler** : chez nous, `[CARRY, CARRY, MOVE]`, soit une case tous les 2 ticks une fois chargé hors route. Pourtant `haulCapacity` suppose 1 case par tick dans les deux sens, ce qui sous-estime le besoin.
  - harabibot utilise des haulers 1:1 sans route. Il calcule séparément le trajet à vide et le trajet chargé (marais à 5, `haulerTravel.ts`). Il ne passe en 2:1 que si c'est rentable avec les routes (`updateHaulerProfile`).
- **Démarrage** : le premier mineur et les haulers sont créés avec `energyAvailable`, sans attendre la capacité pleine.

## 5. Un seul hub près du contrôleur et extensions sur le trajet des haulers

- **Chez nous** : extensions en damier autour du spawn, le contrôleur reste là où il est.
- **harabibot** : stockage et premier spawn dans un petit noyau près du contrôleur. Avant le RCL 4, les extensions sont classées par distance au stockage, avec un bonus si elles touchent un chemin de source (`rankExtensionPlans`). Les haulers les remplissent en passant.

## 6. Chantiers concentrés

- **harabibot** : 3 chantiers actifs au plus (`MAX_ACTIVE_SITES`), et tous les builders sur le premier.
- Ordre de priorité : spawn, puis extensions tant que la capacité est sous 650, puis tour, puis extensions sous 800, puis conteneur provisoire du stockage. Chaque extension est finie au plus vite.
- **Chez nous** : tous les chantiers sont posés d'un coup et les builders se dispersent (marge ×1,5).
- Les routes arrivent au RCL 3 dans les deux bots.

## 7. Trafic et répartition des haulers (fait)

- **Trafic** : harabibot a un gestionnaire global (`traffic.ts`). Les créeps déclarent leurs intentions de mouvement, puis le gestionnaire résout échanges de place et poussées. Les créeps fixes déclarent une zone de travail, et les cases des mineurs et upgraders sont pénalisées. Fait chez nous : `move.run` exécute les pas notés et pousse les créeps immobiles sans les sortir de leur zone.
- **Répartition** : un hauler n'est envoyé vers une source que si l'énergie prévue à son arrivée suffit. Le calcul part du stock, retire ce que les autres haulers en route ont réservé et ajoute la régénération pendant le trajet (`assignHauler`, `getExpectedEnergyDelta`). Après une livraison, il repart dans le même tick. Fait chez nous : `dispatch` dans `roles/hauler.js`, trajet estimé en ligne droite.

## Hors sujet pour l'early normal

- Le mode `speedrun` (relais entre haulers 3C3M, pas de routes) est désactivé par défaut.
- Points déjà communs aux deux bots : récolte statique dès le RCL 1, remplacement anticipé des mineurs selon leur trajet, haulers et mineurs créés en alternance au démarrage.
