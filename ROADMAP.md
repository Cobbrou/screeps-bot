# Roadmap

Étapes prévues pour amener le bot de la survie de la première salle à l'expansion. Chaque phase doit tourner de façon stable sur le serveur avant de passer à la suivante. L'ordre suit la progression du contrôleur (RCL).

## Phase 0 : socle (fait)

- [x] Chaîne de build Rollup et déploiement via `secrets.json`
- [x] Nettoyage de `Memory` (créeps morts)
- [x] Spawner à effectifs fixes : 2 `harvester`, 2 `upgrader`, corps `[WORK, CARRY, MOVE]`
- [x] Rôles `harvester` et `upgrader`

## Phase 1 : économie de base (RCL 1-2) (fait)

- [x] Corps des créeps adaptés à `room.energyCapacityAvailable`
- [x] Rôle `builder` : construit les chantiers, répare sinon
- [x] Effectifs calculés selon la salle (nombre de sources, chantiers en cours)
- [x] Récupération d'urgence : si aucun `harvester`, spawn d'un créep minimal avec l'énergie disponible
- [x] Répartition des récolteurs entre les sources (`sources`)

## Phase 2 : planification des structures (RCL 2-3)

- [x] `planner` : placement automatique des extensions autour du spawn
- [x] Routes entre spawn, sources et contrôleur
- [x] Conteneurs au pied des sources et du contrôleur
- [x] Mise en cache des sources (portée du module, conservée jusqu'au reset du global)
- [ ] Mise en cache des chemins des créeps (`reusePath`), si le CPU le justifie

## Phase 3 : récolte statique et logistique (RCL 3-4)

- [x] Rôle `miner` : 5 `WORK`, posé sur le conteneur de sa source
- [x] Rôle `hauler` : transporte l'énergie des conteneurs vers spawn, extensions et tours
- [x] Construction du stockage (`STRUCTURE_STORAGE`) au RCL 4
- [x] Ramassage de l'énergie au sol et des pierres tombales
- [ ] Remplacement anticipé des mineurs avant leur mort, si la perte de récolte le justifie

## Phase 4 : défense (RCL 3+) (fait)

- [x] `defense` : tours qui attaquent les hostiles, soignent, puis réparent
- [x] Murs et remparts aux sorties de la salle, une fois une tour construite
- [x] Activation du mode sans échec (`safeMode`) en dernier recours
- [x] Défenseurs créés quand des hostiles sont présents

## Phase 5 : suivi et optimisation (fait)

- [x] `stats` : CPU par module, bucket, énergie récoltée, progression du RCL
- [x] Désactivation des modules non essentiels quand le bucket est bas
- [x] Génération de pixels quand le bucket est plein (serveur officiel)

## Phase 6 : expansion

- [ ] Exploration des salles voisines (`scout`)
- [ ] Choix d'une salle à revendiquer selon les sources et la distance
- [ ] Rôle `claimer` et créeps d'amorçage de la nouvelle salle
- [ ] Récolte dans les salles adjacentes non revendiquées (remote mining)
- [ ] Gestion multi-salles : chaque salle possédée gérée indépendamment

## Plus tard

- Liens (`STRUCTURE_LINK`), laboratoires et terminal (RCL 5+)
- Marché et échanges entre salles
- Minerais, boosts et puissance
