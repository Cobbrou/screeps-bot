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

## Phase 3 : récolte statique et logistique (RCL 3-4) (fait)

- [x] Rôle `miner` : 5 `WORK`, posé sur le conteneur de sa source
- [x] Rôle `hauler` : transporte l'énergie des conteneurs vers spawn, extensions et tours
- [x] Construction du stockage (`STRUCTURE_STORAGE`) au RCL 4
- [x] Ramassage de l'énergie au sol et des pierres tombales
- [x] Remplacement anticipé des mineurs : temps de trajet noté à l'arrivée, successeur lancé pour arriver à la mort du précédent

## Phase 4 : défense (RCL 3+)

- [x] `defense` : tours qui attaquent les hostiles, soignent, puis réparent
- [x] Murs et remparts aux sorties de la salle, une fois une tour construite
- [x] Activation du mode sans échec (`safeMode`) en dernier recours
- [x] Défenseurs créés quand des hostiles sont présents
- [ ] Priorité de tir des tours : soigneur, puis claimer hostile (`attackController` bloque l'amélioration), puis cible presque morte, puis la plus proche
- [ ] Protection contre le vidage des tours : ne tirer que si les dégâts estimés (selon la portée) dépassent le soin hostile
- [ ] Défenseurs selon la menace : aucun si les tours suffisent, sinon selon les parties `ATTACK`/`RANGED_ATTACK`/`HEAL` hostiles (aujourd'hui 2 fixes)
- [ ] Défenseur posté sur le rempart le plus proche de l'ennemi, à distance (`RANGED_ATTACK`), au lieu de l'attendre près du spawn
- [ ] Mode sans échec aussi quand un claimer hostile attaque le contrôleur

## Phase 5 : suivi et optimisation (fait)

- [x] `stats` : CPU par module, bucket, énergie récoltée, progression du RCL
- [x] Désactivation des modules non essentiels quand le bucket est bas
- [x] Génération de pixels quand le bucket est plein (serveur officiel)

## Phase 6 : expansion (fait)

- [x] Exploration des salles voisines (`scout`)
- [x] Choix d'une salle à revendiquer selon les sources et la distance
- [x] Rôle `claimer` et créeps d'amorçage de la nouvelle salle (`pioneer`)
- [x] Récolte dans les salles adjacentes non revendiquées (remote mining : `remoteMiner` posé au sol et `remoteHauler`, dès le RCL 2)
- [x] Gestion multi-salles : chaque salle possédée gérée indépendamment
- [x] Créeps inoccupés (source vide ou encombrée) envoyés récolter dans une salle voisine sûre
- [ ] Réservation des salles de remote mining (`reserver`), si le rendement le justifie
- [ ] Mineur distant avec 1 `CARRY` qui construit et entretient son conteneur, transporteurs appelés selon le stock
- [ ] Détection d'enfermement : une seule salle depuis longtemps, voisines hostiles ; adapter la stratégie

## Retravail des bases (RCL 1-3)

Priorité actuelle, avant les phases avancées : tirer le maximum des premiers RCL.

- [x] Récolte statique dès le RCL 1 : mineurs au sol sans conteneur, haulers dès le départ
- [x] Effectifs calculés : 5 `WORK` par source plafonnés aux cases libres, haulers selon le débit réel
- [x] Ordre des chantiers : RCL 2 d'abord, puis extensions, conteneurs des sources, conteneur du contrôleur après les extensions
- [x] Upgraders selon le surplus d'énergie plutôt qu'en nombre fixe
- [x] Corps par rôle (upgrader riche en `WORK`) et sans énergie inutilisée
- [x] Haulers qui ne visent une tour que s'il lui manque assez d'énergie (~200), sauf hostiles présents : pas de détour pour quelques points
- [x] Planner relancé dès la montée de RCL
- [x] Routes dès le RCL 2 une fois extensions et conteneurs construits
- [x] Éclaireur seulement s'il reste une voisine utile à explorer
- [x] Garde-fou de rétrogradation : sous 10 % de `CONTROLLER_DOWNGRADE`, priorité à l'amélioration (avec hystérésis pour ne pas osciller)
- [x] Transporteurs qui remplissent les structures adjacentes en passant et ramassent l'énergie croisée en chemin
- [x] Upgraders en pause quand le stockage est bas ou la salle attaquée, sauf risque de rétrogradation
- [x] Remplacement anticipé étendu aux upgraders (trajet noté au contrôleur) et aux haulers (durée de spawn)
- [x] Chantiers non entamés depuis 5 000 ticks retirés (`Memory.sites`)
- [x] Récolte distante dès le RCL 2 (mineur et transporteurs, dernière priorité du spawn) au lieu d'attendre le stockage
- [ ] Conteneurs et routes dans les salles distantes (builder distant)

Pistes tirées de l'[analyse de harabibot v2](docs/harabibot-analysis.md), par impact estimé :

- [x] Énergie livrée aux upgraders : dépôt fixe près du contrôleur dès le RCL 1 (tas, puis conteneur), alimenté par les haulers ; upgraders fixes riches en `WORK`, plus de `sources.collect`
- [x] Énergie livrée aux builders par les haulers (sans stockage), au lieu de `sources.collect`
- [x] Effectifs sur le revenu net soutenable (énergie/tick, entretien des créeps déduit) : `WORK` des upgraders = revenu, puissance des builders = revenu, aucun upgrader pendant les chantiers, builders convertis en upgraders ensuite
- [x] Haulers 1:1 avant les routes, trajet chargé compté à part dans `haulCapacity` (marais à 5) ; passage en 2:1 seulement avec routes
- [x] `MOVE` des mineurs choisis selon le trajet (minimiser temps de spawn / vie productive)
- [x] Premier mineur et haulers créés avec `energyAvailable` au démarrage, sans attendre la capacité pleine
- [ ] Gestionnaire de trafic global (intentions, échanges, zones de travail des créeps fixes) au lieu de `moveTo` et contournement
- [ ] Haulers envoyés selon l'énergie prévue à l'arrivée (stock − réservé + régénération en route), nouveau trajet dans le même tick après livraison

Pistes tirées de l'[analyse du planner de harabibot v2](docs/harabibot-planner-analysis.md), par priorité :

- [x] Correction : extensions jamais posées sur les routes gardées (`room.memory.routes`), sinon la route est recalculée et le dépôt du contrôleur change de case
- [x] Chantiers concentrés : 3 actifs au plus par salle, triés par priorité (spawn, extensions sous 650 de capacité, tour, extensions sous 800, conteneurs, routes), tous les builders sur le prioritaire
- [x] Plan de base calculé une fois et gardé en mémoire (cases codées `x * 50 + y`, RCL par structure) ; le planner ne pose que la différence avec la salle (damier glouton autour du spawn, structures existantes reprises)
- [ ] Hub près du contrôleur : stockage à portée 4, cases réservées aux upgraders fixes, conteneur provisoire sur la case du stockage aux RCL 2-3 comme dépôt unique ; premier spawn d'une expansion placé d'après le plan
- [ ] Extensions de part et d'autre de routes de service (courtes diagonales, routes du noyau et des sources) au lieu du damier sans route ; avant le RCL 4, d'abord celles qui touchent un chemin de source ; routes posées au RCL des structures qu'elles desservent (au moins 3)

## Phase 7 : logistique avancée (RCL 5-6)

- [ ] Plan de base : `filler` fixe au stockage, spawns suivants et liens à côté du stockage
- [ ] Créeps sur chemins pré-calculés et mis en cache dans la salle : moins de pathfinding

- [ ] Planner : liens (RCL 5), terminal, extracteur et son conteneur, labs (RCL 6) ajoutés au plan
- [ ] Liens (`STRUCTURE_LINK`) : source → stockage → contrôleur, moins de transporteurs ; un lien de source plein (80 %, sans cooldown) envoie vers le lien puits le plus vide
- [ ] Remplacement des `harvester` par un `filler` dédié au spawn et aux extensions depuis le stockage
- [ ] Nombre d'`upgrader` et taille des corps selon l'énergie stockée
- [ ] Extracteur et mineur de minerai (RCL 6)
- [ ] Terminal (RCL 6) : équilibrage de l'énergie entre nos salles

## Phase 8 : économie et marché (RCL 6+)

- [ ] Vente des surplus de minerai sur le marché
- [ ] Achat d'énergie ou de minerais manquants quand les crédits le permettent
- [ ] Laboratoires : réactions de base

## Phase 9 : défense et attaque avancées (RCL 7+)

- [ ] Planner : 2e spawn (RCL 7), factory, observer, puis 3e spawn, power spawn et nuker (RCL 8) ajoutés au plan
- [ ] Remparts par coupe minimale (min-cut) autour de la base au lieu de la ceinture aux sorties, une fois le plan gardé
- [ ] Défense des salles de remote mining (créeps distants, tours de garde)
- [ ] Boosts des défenseurs depuis les laboratoires
- [ ] Escouades d'attaque (soin + attaque) contre les salles hostiles voisines

## Phase 10 : fin de partie (RCL 8)

- [ ] Power spawn et traitement de la puissance
- [ ] Récolte des power banks dans les couloirs
- [ ] Usines (`STRUCTURE_FACTORY`) et commodités
- [ ] Nouvelles expansions automatiques selon le GCL et le CPU disponible
