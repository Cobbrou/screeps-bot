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

- [ ] `planner` : placement automatique des extensions autour du spawn
- [ ] Routes entre spawn, sources et contrôleur
- [ ] Conteneurs au pied des sources et du contrôleur
- [ ] Mise en cache des chemins et des résultats de `find` (objet `global`)

## Phase 3 : récolte statique et logistique (RCL 3-4)

- [ ] Rôle `miner` : 5 `WORK`, posé sur le conteneur de sa source
- [ ] Rôle `hauler` : transporte l'énergie des conteneurs vers spawn, extensions et tours
- [ ] Construction du stockage (`STRUCTURE_STORAGE`) au RCL 4
- [ ] Ramassage de l'énergie au sol et des pierres tombales

## Phase 4 : défense (RCL 3+)

- [ ] `defense` : tours qui attaquent les hostiles, soignent, puis réparent
- [ ] Murs et remparts aux sorties de la salle
- [ ] Activation du mode sans échec (`safeMode`) en dernier recours
- [ ] Défenseurs créés quand des hostiles sont présents

## Phase 5 : suivi et optimisation

- [ ] `stats` : CPU par module, bucket, énergie récoltée, progression du RCL
- [ ] Désactivation des modules non essentiels quand le bucket est bas
- [ ] Génération de pixels quand le bucket est plein (serveur officiel)

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
