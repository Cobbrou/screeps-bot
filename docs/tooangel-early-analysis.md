# Analyse de TooAngel : le début de partie (RCL 1 à 4)

Suite de l'[analyse générale de TooAngel](tooangel-analysis.md), limitée à la phase qui va jusqu'au stockage. Code lu : `role_universal.js`, `role_sourcer.js`, `role_carry.js`, `role_builder.js`, `role_upgrader.js`, `prototype_creep_resources.js` (`universalBeforeStorage`, `getEnergy`), `prototype_creep_harvest.js` (`spawnCarry`), `prototype_creep.js` (`buildRoad`, `spawnReplacement`), `prototype_room_basebuilder.js`, `prototype_room_controller.js`, `prototype_room_init.js`, `utils/testConfig.js` (commit `77e4bfa`).

**Conclusion** : sur le papier, le début de partie de TooAngel est moins bon que le nôtre. Ses builders vont récolter eux-mêmes, il n'a pas d'upgrader avant le stockage et pas de récolte distante avant 100 000 d'énergie stockée. Il a pourtant deux atouts. D'abord, ses effectifs suivent l'énergie **réellement accumulée** (rétroaction), là où les nôtres reposent sur une estimation. Ensuite, des **jalons chiffrés** (tick du RCL 2, du RCL 3…) vérifient chaque changement. Ce sont les pistes à reprendre.

## Comment TooAngel joue le début de partie

- **Créeps** : deux rôles font presque tout. Les `universal` (corps `MWC`) remplissent spawn et extensions, construisent et améliorent. Les `sourcer` (`MW` puis `W` répété, 5 `WORK` à 550 de capacité) récoltent sur place. Les `carry` (`CM` répété, avec 1 `WORK` dès 550 de capacité) ramènent l'énergie. Un `builder` (`MCW`, 2 `MOVE` par `WORK`) s'ajoute s'il y a un chantier.
- **Répartition des universals** (`universalBeforeStorage`) : chacun suit la même liste de tâches, dans l'ordre : chercher de l'énergie, améliorer en cas d'urgence de rétrogradation, remplir le spawn (les 2 premiers universals seulement), construire, améliorer.
- **Récolte** : pas de conteneur aux sources de la salle avant les liens (RCL 5 et plus), l'énergie tombe au sol. Un universal à côté d'un sourcer reçoit son énergie directement (`sourcer.transfer`).
- **Dépôt près du contrôleur** : la disposition place l'upgrader contre le contrôleur, le futur stockage contre l'upgrader, et le point de départ des chemins (`pathStart`) contre le stockage. Sans stockage, les `carry` remplissent les structures en passant et déposent le reste au sol sur `pathStart`. Les universals le ramassent (portée 10) pour améliorer. C'est le même principe que notre dépôt.
- **Constructions** (`buildStructures`) : **un seul chantier de bâtiment à la fois**, dans l'ordre spawn, tour, stockage, lien, extensions. Routes posées à part, sous les pieds des créeps (voir plus bas).

## 1. Relever le tick d'arrivée à chaque RCL

- **TooAngel** (`utils/testConfig.js`) : la CI lance le bot sur un serveur privé et exige des jalons, par exemple :

  | Jalon | Tick maximal |
  |-------|--------------|
  | 1re structure construite | 500 |
  | RCL 2 | 1 000 |
  | 6 structures | 4 900 |
  | RCL 3 | 14 100 |
  | 11 structures | 15 700 |
  | RCL 4 (facultatif) | 30 000 |

  Une pull request qui ralentit le début de partie est refusée.
- **Chez nous** : `Memory.stats.rooms[*]` donne le RCL et la progression **du moment**, sans historique. Impossible de savoir si un réglage (corps, effectifs, ordre des chantiers) fait gagner ou perdre du temps, ni de comparer avec TooAngel.
- **Piste** : dans `stats.run`, noter `s.rclAt[rcl] = Game.time` à la première apparition de chaque RCL, et le tick où la capacité d'énergie atteint son maximum pour le RCL. Quelques lignes. On compare ensuite avec le tableau ci-dessus après chaque respawn ou sur un serveur privé.

## 2. Effectifs corrigés par le stock du dépôt

- **TooAngel** :
  - Quand un `carry` dépose au sol sur `pathStart` (sans stockage), le nombre d'universals voulus augmente de 1 par tranche de 100 d'énergie déjà en tas (`checkForUniversalSpawn`, `config.carry.callUniversalPerResources`).
  - Côté sources, un `carry` de plus est demandé quand le tas ou le conteneur dépasse ce qu'un `carry` emporte (`spawnCarry`). Ce contrôle a lieu tous les `trajet + 160` ticks.
  - L'effectif suit donc ce qui s'accumule réellement, quelle que soit la justesse de l'estimation.
- **Chez nous** : les haulers ont déjà cette correction (`HAUL_BACKLOG`, plafonnée par `HAUL_BACKLOG_RATIO`). Pas les upgraders, fixés par `work.upgrader < net / UPGRADE_SPEND`. Si `netIncome` sous-estime le revenu (fatigue, livraisons, pertes ignorées : voir ses commentaires `ponytail:`), l'énergie s'entasse au dépôt sans upgrader de plus. Au RCL 1, ce dépôt est un tas au sol, qui perd `ceil(quantité / 1000)` par tick.
- **Piste** : dans `targets`, ajouter un upgrader (dans la limite de `upgraders.spots`) tant que le dépôt dépasse un seuil (par exemple 500 en tas, ou la moitié du conteneur). Même forme que `HAUL_BACKLOG`, hors chantiers comme aujourd'hui.

## 3. Haulers en trop recyclés

- **TooAngel** (`spawnCarry`) : quand le tas d'une source passe sous 50 et que plus de 2 `carry` attendent autour, l'un d'eux est envoyé au recyclage (`memory.recycle`, puis `spawn.recycleCreep`). Le recyclage rend une partie du coût du corps, selon la vie restante.
- **Chez nous** : un renfort `HAUL_BACKLOG` peut porter la capacité des haulers à 3 fois le besoin estimé. Une fois l'engorgement résorbé, ces haulers vivent leurs 1 500 ticks. Leur entretien est bien déduit de `netIncome`, mais il réduit d'autant les upgraders et les builders.
- **Piste** : quand la capacité vivante dépasse nettement le besoin (par exemple 1,5 fois) et que les conteneurs sont presque vides, envoyer le hauler le plus ancien au recyclage. Gain modeste. À faire seulement si le relevé du point 1 montre des haulers inactifs.

## 4. Extensions le long du trajet de remplissage (confirmation)

- **TooAngel** (`setupStructures`, `setExtensionPos`) : spawns et extensions sont posés de part et d'autre du plus long chemin parti de `pathStart` (vers une source ou une sortie). L'universal fait l'aller-retour sur ce chemin et remplit tout ce qui est à portée (`transferToStructures`). Le chemin est coupé au niveau de la dernière extension permise au RCL actuel (`pathEndLevel`) : le créep ne va pas plus loin que nécessaire.
- **Chez nous** : extensions en damier autour du spawn, sans route. Les haulers remplissent en passant (`fillNearby`) mais doivent aller de l'une à l'autre. La piste « Extensions de part et d'autre de routes de service » est déjà dans la [ROADMAP](../ROADMAP.md). TooAngel montre qu'elle tient sur une partie entière.
- **Piste** : rien de neuf à part `pathEndLevel`. Si on fait ces routes de service, ne parcourir que la partie qui dessert les extensions du RCL actuel.

## Ce que TooAngel fait moins bien en début de partie (à ne pas reprendre)

- **Créeps qui vont chercher leur énergie** : builders et universals récoltent eux-mêmes à la source quand il n'y a rien au sol (`getEnergyFromSource`). C'est ce que l'[analyse de harabibot](harabibot-analysis.md) nous a fait abandonner.
- **Pas d'upgrader avant le stockage** : seuls les universals et les builders sans chantier améliorent, entre deux autres tâches. Nos upgraders fixes au dépôt, riches en `WORK`, améliorent sans interruption.
- **Pas de récolte distante avant un stockage « sain »** : une réservation demande `isHealthy()`, soit un stockage d'au moins 100 000. Nous exploitons les voisines dès le RCL 2, ce qui double presque le revenu.
- **Pas de conteneur aux sources** : l'énergie reste au sol jusqu'aux liens, et ce tas perd de l'énergie chaque tick. Nous posons les conteneurs dès le RCL 2.
- **Remplacement en retard** : `setNextSpawn` relance un créep quand sa vie restante égale son trajet, sans compter la durée de spawn. Le poste reste vide pendant ce temps. Nous comptons trajet **et** durée de spawn.
- **Corps tirés de tables fixes** selon la capacité (`config.carry.sizes`, réglages des rôles), sans tenir compte du trajet ni des routes. Nos `MOVE` de mineur et de hauler sont calculés sur le chemin réel.
- **Routes au hasard du passage** : un créep qui marche sur un chemin pose un chantier de route sous ses pieds (au plus 3 par salle) et le construit avec son énergie. Seulement en marais tant que la capacité est sous 550. Les routes arrivent tard et dans le désordre. Nos routes planifiées, posées dès que la salle est équipée, sont plus prévisibles.
- **Mode sans échec gaspillé** : pendant la montée en puissance (`isRampingUp` : pas de stockage ou capacité sous 1 000), le moindre hostile qui attaque déclenche `activateSafeMode`, même un petit raid d'invaders. Notre déclencheur (spawn ou tour sous 50 %, claimer près du contrôleur) garde le mode sans échec pour une vraie menace.

## Points communs

- Dépôt d'énergie près du contrôleur alimenté par les transporteurs, sur la future case du stockage.
- Garde-fou de rétrogradation avec hystérésis (seuil 1/10 de `CONTROLLER_DOWNGRADE`, 1/9 une fois au contrôleur, contre 10 % / 20 % chez nous).
- Un chantier prioritaire à la fois, ordre proche (spawn, puis tour et extensions).
- Haulers qui remplissent les structures adjacentes et ramassent l'énergie en chemin.
