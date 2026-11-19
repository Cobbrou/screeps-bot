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

## Ouverture de la zone de respawn (2026-12-01 13:07 UTC)

La zone de respawn de E25S3 (avec E24S3, E25S4 et E24S2) prend fin le 2026-12-01 à 13:07 UTC. Les 19 murs de zone de E25S3 disparaissent alors : au nord en y = 0, x 24 à 39, et à l'est en x = 49, y 25 à 27. La coupe min-cut est déjà construite en face : murs et remparts en y = 2 et en x = 47, à ~120 000 PV. Relevé du 2026-11-17 : aucune récolte distante (E25S2 et E26S3, voisines nord et est, jamais explorées), `Memory.enclosed` vrai depuis 330 000 ticks.

- [ ] Vérifier après l'ouverture que l'éclaireur explore E25S2 et E26S3 et que la récolte distante y démarre : 2 salles au plus, environ +10 énergie/tick par source réservée, pour un revenu actuel de ~20
- [ ] Vérifier que l'expansion trouve une cible et lève `Memory.enclosed` : GCL 4 pour une seule salle possédée
- [ ] Surveiller E27S4 et E27S5, qui deviennent joignables : premiers passages de créeps de joueurs, tenue des remparts de la coupe

## Phase 7 : logistique avancée (RCL 5-6)

- [x] Plan de base : spawns suivants à côté du stockage (lien du hub déjà à portée 2)
- [ ] `filler` : lien près du premier spawn (RCL 7, 4e lien) pour raccourcir ses trajets. Filler fixe au stockage écarté : le stockage est au hub du contrôleur, à 16 cases du spawn sur E25S3, hors de portée des extensions
- [ ] Créeps sur chemins pré-calculés et mis en cache dans la salle : moins de pathfinding (pas urgent : 3 CPU sur 20 au 2026-11-06)

- [x] Planner : terminal (portée 2 à 4 du stockage), extracteur et conteneur du minerai au bout de son chemin, 10 labs en bloc 4 × 4 (labs d'entrée au centre, diagonale libre) ajoutés au plan (RCL 6), cases réservées sans rien poser tant que leur code n'existe pas (extracteur et conteneur du minerai posés depuis)
- [x] Liens (`STRUCTURE_LINK`) : plan `room.memory.plan.link` (hub à portée 2 du stockage puis sources, route la plus longue d'abord, sauf la source la plus proche du spawn) ; mineur à 1 `CARRY` qui remplit le lien de sa source, envoi au lien du hub par 400 au moins, upgraders qui y puisent avant le stockage ; lien plein : la récolte déborde dans le conteneur
- [x] Haulers dimensionnés sans les sources liées (besoin nul tant que les upgraders ne sont pas en pause), corps à la part d'une source non liée
- [x] `filler` dédié au spawn, aux extensions et aux tours depuis le stockage, quand les sources sont toutes liées (plus de hauler voulu) : sinon le dernier hauler mort déclenchait l'urgence `harvester`
- [x] Nombre d'`upgrader` et taille des corps selon l'énergie stockée : stock compté dans le revenu net, corps limité au manque de `WORK` (4 au moins), upgrader créé seulement si son corps entre dans le revenu
- [x] Extracteur et mineur de minerai (RCL 6) : `mineralMiner` sur le conteneur du minerai, `mineralHauler` vers le stockage (100 000 au plus)
- [x] Terminal (RCL 6) : posé dès que du minerai attend au stockage, rempli par le `mineralHauler` (minerai, 5 000 d'énergie)
- [x] Terminal : équilibrage de l'énergie entre nos salles (`market` : de la plus riche, 100 000 au moins, vers la plus pauvre, sous 50 000 ; le `mineralHauler` range l'envoi au stockage)
- [x] Récolte de E25S4 (salle à keepers voisine, dans notre zone, 3 sources et un minerai) au RCL 7 : `keeperKiller` à distance (14 `RANGED_ATTACK`, 9 `HEAL`, 5 500 d'énergie : au contact, le keeper frappe à 300 et riposte à 300, un tueur en `ATTACK` mourrait), mineurs et transporteurs distants derrière lui, qui s'écartent des keepers. Estimation du 2026-11-19 : ~40 énergie/tick brute, ~13 d'entretien (tueur, mineurs, transporteurs, conteneurs, routes), soit ~+25 net pour ~20 de revenu actuel. Keeper du minerai et Invaders de passage ignorés
- [x] Correction : `room.memory.upgradeWork` n'est recalculé que lorsque le spawn est libre. Relevé du 2026-11-17 : il est resté à -2 pendant tout le spawn d'un hauler, calculé au tick où le hauler mourant ne comptait plus et où son successeur n'existait pas encore. Le builder ne peut pas redevenir upgrader pendant ce temps (~100 ticks à chaque spawn de hauler). Recalculé désormais à chaque tick pour chaque salle possédée, spawn libre ou non
- [x] Nettoyage : `Memory._dbg`, clé de débogage que le code n'écrit plus, supprimée de la mémoire en console (2026-11-17)

## Phase 8 : économie et marché (RCL 6+)

- [x] Vente du minerai sur le marché (`market`) : meilleur ordre d'achat net du transport, au moins 80 % du prix moyen sur 14 jours
- [ ] Achat d'énergie ou de minerais manquants quand les crédits le permettent
- [ ] Laboratoires : réactions de base

En attente du marché : relevé du 2026-11-06 sur shard0, ordres réels (les prix moyens sur 14 jours sont trompeurs, énergie à 10 de moyenne). Énergie vendue à 3 000 au moins, soit aucun achat possible. H acheté à ~550, GH à 225 et KH à 67 : un produit de nos labs rapporterait moins que H brut. À revoir si ces ordres changent, ou pour les boosts.

- [x] Boost des upgraders au GH (+50 % de progression du contrôleur pour la même énergie) : 1 lab du plan posé au RCL 6, rempli depuis le terminal avec du GH acheté au marché, upgrader neuf boosté avant de rejoindre son poste. Relevé du 2026-11-17 : GH vendu à ~3 700 crédits l'unité, 30 par `WORK`, soit ~1,7 million par vie d'upgrader à 15 `WORK`, pour 55 millions de crédits qui ne servent à rien. Gain : ~7,5 points de contrôleur par tick sur un revenu de ~15 ; il reste 1,36 million de points avant le RCL 7. Fait (`boost`) : composé choisi parmi GH, GH2O et XGH2O au meilleur prix par point (GH2O le 2026-11-17, ~110 crédits par point), 250 crédits par point au plus, 5 millions de crédits gardés, rien acheté pendant la pause du stockage bas
- [x] Upgrade relancé vite après le lab : avant le RCL 7, pause du stockage bas sous 2 000 et reprise à 5 000 (au lieu de 10 000 et 15 000). Relevé du 2026-11-17 : chantier du lab à 1 150/50 000 avec 12 108 au stockage, que les builders allaient vider ; sans ça, ~700 ticks sans upgrade après le lab

## Phase 9 : défense et attaque avancées (RCL 7+)

- [x] Planner : 2e spawn (RCL 7), factory, observer, puis 3e spawn, power spawn et nuker (RCL 8) ajoutés au plan (cases réservées près du stockage ; seuls les spawns sont posés)
- [x] Réserve d'énergie au RCL 7 : seuil du stockage bas (`room.memory.storageLow`) relevé de 10 000 à 50 000, reprise à 55 000 au lieu de 15 000 ; le spawner ne compte plus comme revenu que le stock au-dessus de 55 000
- [x] Remparts par coupe minimale (min-cut) autour de la base au lieu de la ceinture aux sorties : `plan.cut`, murs existants repris, ancienne ceinture laissée sans réparation (remparts compris, sauf sur une structure) ; portes réduites au minimum par côté de salle (`plan.doors`), barrière du mauvais type remplacée par le builder une fois sur place (`room.memory.swapBarrier`)
- [x] Défense des salles de remote mining : `remoteDefender` contre les Invaders, salle rendue aux mineurs dès qu'elle est vide (actif quand la récolte distante reprendra : zone de respawn de E25S3 jusqu'au 2026-12-01)
- [x] Cœurs d'Invader dans les salles distantes : noté par l'intel, `remoteDefender` en `[ATTACK, MOVE]` qui le frappe au contact, puis `reserver` qui retire la réservation restante (`attackController`) avant le retour des mineurs
- [ ] Boosts des défenseurs depuis les laboratoires
- [ ] Escouades d'attaque (soin + attaque) contre les salles hostiles voisines

En attente, d'après un relevé du 2026-11-17 sur shard0. Boosts des défenseurs : abordables (KO à ~630 crédits l'unité, ~190 000 pour un défenseur à 10 `RANGED_ATTACK`, sur 55 millions en caisse d'après `Game.market.credits`), mais seuls des Invaders sont venus jusqu'ici, que les tours tuent seules. À faire avec le boost des upgraders (phase 8), qui pose le premier lab, si un joueur attaque. Escouades : voisins hostiles E27S4 (Franz, RCL 7, 14 créeps) et E27S5 (explicit, RCL 6, 35 remparts), en zone normale et séparés de notre zone de respawn jusqu'au 2026-12-01. En face, une seule salle RCL 6 avec 14 500 d'énergie stockée. À revoir après l'expansion (GCL 4 pour une seule salle possédée).

## Phase 10 : fin de partie (RCL 8)

- [ ] Power spawn et traitement de la puissance
- [ ] Récolte des power banks dans les couloirs
- [ ] Usines (`STRUCTURE_FACTORY`) et commodités
- [ ] Nouvelles expansions automatiques selon le GCL et le CPU disponible
