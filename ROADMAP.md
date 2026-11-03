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
- [x] Priorité de tir des tours : soigneur, puis claimer hostile (`attackController` bloque l'amélioration), puis cible presque morte, puis la plus proche
- [x] Protection contre le vidage des tours : ne tirer que si les dégâts estimés (selon la portée) dépassent le soin hostile
- [x] Défenseurs selon la menace : aucun si les tours suffisent, sinon selon les parties `ATTACK`/`RANGED_ATTACK`/`HEAL` hostiles (aujourd'hui 2 fixes)
- [x] Défenseur posté sur le rempart le plus proche de l'ennemi, à distance (`RANGED_ATTACK`), au lieu de l'attendre près du spawn
- [x] Mode sans échec aussi quand un claimer hostile approche du contrôleur (avant qu'il frappe : `upgradeBlocked` peut empêcher l'activation)

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
- [x] Réservation des salles de remote mining (`reserver`), si le rendement le justifie
- [x] Mineur distant avec 1 `CARRY` qui construit et entretient son conteneur, transporteurs appelés selon le stock
- [x] Détection d'enfermement : aucune cible d'expansion depuis 20 000 ticks ; recherche à 10 salles, murs doublés, stock poussé dans l'amélioration

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
- [x] Routes dans les salles distantes (`remoteBuilder`) ; les conteneurs sont posés par les mineurs distants ; transporteurs distants à 2 `CARRY` par `MOVE` sur route finie
- [x] Upgraders sur des postes fixes autour du dépôt, cases de la route du hub laissées libres pour les haulers

Pistes tirées de l'[analyse de harabibot v2](docs/harabibot-analysis.md), par impact estimé :

- [x] Énergie livrée aux upgraders : dépôt fixe près du contrôleur dès le RCL 1 (tas, puis conteneur), alimenté par les haulers ; upgraders fixes riches en `WORK`, plus de `sources.collect`
- [x] Énergie livrée aux builders par les haulers (sans stockage), au lieu de `sources.collect`
- [x] Effectifs sur le revenu net soutenable (énergie/tick, entretien des créeps déduit) : `WORK` des upgraders = revenu, puissance des builders = revenu, aucun upgrader pendant les chantiers, builders convertis en upgraders ensuite
- [x] Haulers 1:1 avant les routes, trajet chargé compté à part dans `haulCapacity` (marais à 5) ; passage en 2:1 seulement avec routes
- [x] `MOVE` des mineurs choisis selon le trajet (minimiser temps de spawn / vie productive)
- [x] Premier mineur et haulers créés avec `energyAvailable` au démarrage, sans attendre la capacité pleine
- [x] Gestionnaire de trafic global (intentions, échanges, zones de travail des créeps fixes) au lieu de `moveTo` et contournement
- [x] Haulers envoyés selon l'énergie prévue à l'arrivée (stock − réservé + régénération en route), nouveau trajet dans le même tick après livraison

Pistes tirées de l'[analyse du planner de harabibot v2](docs/harabibot-planner-analysis.md), par priorité :

- [x] Correction : extensions jamais posées sur les routes gardées (`room.memory.routes`), sinon la route est recalculée et le dépôt du contrôleur change de case
- [x] Chantiers concentrés : 3 actifs au plus par salle, triés par priorité (spawn, extensions sous 650 de capacité, tour, extensions sous 800, conteneurs, routes), tous les builders sur le prioritaire
- [x] Plan de base calculé une fois et gardé en mémoire (cases codées `x * 50 + y`, RCL par structure) ; le planner ne pose que la différence avec la salle (damier glouton autour du spawn, structures existantes reprises)
- [x] Hub près du contrôleur : stockage et conteneur provisoire voisins à portée 2 (la portée 4 de harabibot ne laisse que 3 postes sans chaîne d'upgraders), postes des upgraders réservés, conteneur dépôt unique jusqu'au stockage puis détruit ; premier spawn d'une expansion à portée 5 au moins du contrôleur
- [ ] Chaînes d'upgraders (harabibot) pour éloigner le stockage à portée 4, si les 7-8 postes autour du hub ne suffisent plus
- [x] Routes de service dans le damier : diagonales libres `dx - dy ≡ 1 (mod 4)` autour du spawn, que touche par un côté chaque case du damier (plan existant gardé) ; route posée à côté des extensions et tours construites, quand les routes sont voulues (RCL 3, ou salle équipée)
- [x] Avant le RCL 4, extensions qui touchent un chemin de source d'abord : chemins des sources tracés avant le damier pour un nouveau plan (salles déjà planifiées inchangées)

## Corrections tirées de l'analyse de E25S3

Priorité immédiate, d'après l'[analyse de E25S3](docs/e25s3-analysis.md) : l'amélioration est presque à l'arrêt pendant que la tour finance les murs.

- [x] Tours : murs et remparts non réparés tant que le stockage est bas (`room.memory.storageLow`), sauf rempart près de disparaître
- [x] `claimer` sans expansion en cours : suicide au lieu d'attendre sa mort
- [x] `WORK` compté comme menace seulement chez l'`Invader` : un mineur de passage n'est plus visé, ne met plus l'amélioration en pause et ne bloque plus les pixels
- [x] Commentaire de `damagedStructure` corrigé (nouvelle recherche tous les 10 ticks, pas de cible gardée jusqu'au bout)
- [x] Enfermement (`Memory.enclosed`) : plus de doublement des murs, seul le bonus d'amélioration reste
- [x] Corps des haulers plafonné à leur part du besoin (une source chacun) au lieu de la capacité pleine de la salle
- [x] `LOW_BUCKET` à 500 : la génération de pixels ne fait plus sauter planner et expansion
- [x] Statut des zones vérifié en console : E25S3 et E27S3 en `respawn`, E26S3 en `normal` (évitée). Le seul trajet en `respawn` vers E27S3 passe par E25S4 et E26S4 (keepers, évitées) : `intel.route` ne trouve rien, aucun claimer n'y part
- [x] Trajet noté par les mineurs (`travel: 213`, puis 220, pour 14 cases) : la source `…e63` n'a que la case du conteneur, le successeur attendait loin et comptait l'attente. Trajet noté dès qu'il touche la source ou le conteneur, attente collée au conteneur (mineurs locaux et distants)
- [x] Remparts sur les spawns, tours et stockage (avec la ceinture de murs) ; liens au RCL 5 : lien du hub et lien de la source à la route la plus longue

## Phase 7 : logistique avancée (RCL 5-6)

- [ ] Plan de base : `filler` fixe au stockage, spawns suivants et liens à côté du stockage
- [ ] Créeps sur chemins pré-calculés et mis en cache dans la salle : moins de pathfinding

- [x] Planner : terminal (portée 2 à 4 du stockage), extracteur et conteneur du minerai au bout de son chemin, 10 labs en bloc 4 × 4 (labs d'entrée au centre, diagonale libre) ajoutés au plan (RCL 6)
- [x] Liens (`STRUCTURE_LINK`) : plan `room.memory.plan.link` (hub à portée 2 du stockage puis sources, route la plus longue d'abord) ; mineur à 1 `CARRY` qui remplit le lien de sa source, envoi au lien du hub par 400 au moins, upgraders qui y puisent avant le stockage ; lien plein : la récolte déborde dans le conteneur
- [x] Haulers dimensionnés sans les sources liées (besoin nul tant que les upgraders ne sont pas en pause), corps à la part d'une source non liée
- [x] `filler` dédié au spawn, aux extensions et aux tours depuis le stockage, quand les sources sont toutes liées (plus de hauler voulu) : sinon le dernier hauler mort déclenchait l'urgence `harvester`
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
