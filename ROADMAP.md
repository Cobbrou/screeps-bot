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
- [x] Mise en cache des chemins des créeps (`reusePath` à 20 ticks)

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

## Phase 6 : expansion (fait)

- [x] Exploration des salles voisines (`scout`)
- [x] Choix d'une salle à revendiquer selon les sources et la distance
- [x] Rôle `claimer` et créeps d'amorçage de la nouvelle salle (`pioneer`)
- [x] Récolte dans les salles adjacentes non revendiquées (remote mining, rôle `remote`)
- [x] Gestion multi-salles : chaque salle possédée gérée indépendamment
- [x] Créeps inoccupés (source vide ou encombrée) envoyés récolter dans une salle voisine sûre
- [ ] Réservation des salles de remote mining (`reserver`), si le rendement le justifie

## Retravail des bases (RCL 1-3) (en cours)

Priorité actuelle, avant les phases avancées : tirer le maximum des premiers RCL.

- [x] Récolte statique dès le RCL 1 : mineurs au sol sans conteneur, haulers dès le départ
- [x] Effectifs calculés : 5 `WORK` par source plafonnés aux cases libres, haulers selon le débit réel
- [x] Ordre des chantiers : RCL 2 d'abord, puis extensions, conteneurs des sources, conteneur du contrôleur après les extensions
- [x] Upgraders selon le surplus d'énergie plutôt qu'en nombre fixe
- [ ] Corps par rôle (upgrader riche en `WORK`) et sans énergie inutilisée
- [ ] Planner relancé dès la montée de RCL

## Phase 7 : logistique avancée (RCL 5-6)

- [ ] Liens (`STRUCTURE_LINK`) : source → stockage → contrôleur, moins de transporteurs
- [ ] Remplacement des `harvester` par un `filler` dédié au spawn et aux extensions depuis le stockage
- [ ] Nombre d'`upgrader` et taille des corps selon l'énergie stockée
- [ ] Extracteur et mineur de minerai (RCL 6)
- [ ] Terminal (RCL 6) : équilibrage de l'énergie entre nos salles

## Phase 8 : économie et marché (RCL 6+)

- [ ] Vente des surplus de minerai sur le marché
- [ ] Achat d'énergie ou de minerais manquants quand les crédits le permettent
- [ ] Laboratoires : réactions de base

## Phase 9 : défense et attaque avancées (RCL 7+)

- [ ] Remparts autour des structures clés au lieu d'une simple ceinture
- [ ] Défense des salles de remote mining (créeps distants, tours de garde)
- [ ] Boosts des défenseurs depuis les laboratoires
- [ ] Escouades d'attaque (soin + attaque) contre les salles hostiles voisines

## Phase 10 : fin de partie (RCL 8)

- [ ] Power spawn et traitement de la puissance
- [ ] Récolte des power banks dans les couloirs
- [ ] Usines (`STRUCTURE_FACTORY`) et commodités
- [ ] Nouvelles expansions automatiques selon le GCL et le CPU disponible
