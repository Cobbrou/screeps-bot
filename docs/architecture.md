# Architecture

> **À compléter** : ce document décrit l'architecture envisagée. Seuls `memory`, `move`, `sources`, `spawner`, `planner`, `defense`, `intel`, `expansion`, `stats` et les rôles `harvester`, `upgrader`, `builder`, `miner`, `hauler`, `defender`, `scout`, `claimer`, `pioneer` et `remote` sont implémentés.

## Principes

- `main.js` reste un orchestrateur : il appelle les modules dans un ordre fixe à chaque tick.
- Chaque module a une seule responsabilité et peut être désactivé si le CPU manque.
- L'état persistant passe par `Memory` ; les données recalculables restent en cache (objet `global`).

## Déroulement prévu d'un tick

1. Nettoyage de `Memory` (créeps morts).
2. Analyse de chaque salle possédée.
3. Décisions de spawn.
4. Exécution du rôle de chaque créep.
5. Planification et construction des structures.
6. Mesure du CPU consommé.

## Modules envisagés

| Module | Rôle |
|--------|------|
| `memory` | Nettoyage de `Memory` : créeps morts à chaque tick, renseignements de plus de 50 000 ticks tous les 1 000 ticks |
| `move` | Remplace `creep.moveTo` : chemins réutilisés 20 ticks (`reusePath`) ; après 2 ticks consécutifs sans bouger (hors fatigue), oublie le chemin en cache et en recalcule un qui contourne les créeps (`ignoreCreeps: false`) |
| `sources` | Sources et conteneurs en cache, attribution des récolteurs, collecte d'énergie (conteneur ou stockage, récolte sinon). Dans nos salles à partir du RCL 4 (dès le RCL 1 si la salle n'a qu'une source), un créep dont la source est vide pour plus de 100 ticks ou entourée de créeps part récolter dans une salle voisine sûre (`creep.memory.away`, 2 créeps au plus par source de la salle voisine), puis rentre plein. Les `harvester` ne partent jamais. Une source tenue par un `miner` n'est plus récoltée par les autres : ils puisent dans son conteneur ou ramassent l'énergie qu'il pose au sol, ou s'écartent (voire partent ailleurs) quand il n'y a rien |
| `spawner` | Création des créeps selon les besoins de la salle : 2 `defender` si des hostiles dangereux sont présents, récolte statique dès le RCL 1 : des `miner` (corps le plus gros finançable, 5 `WORK` au plus) sur chaque source jusqu'à 5 `WORK` au total, plafonnés au nombre de cases libres autour de la source, posant l'énergie dans le conteneur ou au sol sans conteneur ; assez de `hauler` pour suivre le débit réel des mineurs (2 énergie/tick par `WORK`) sur l'aller-retour spawn ↔ source, demandés avant les mineurs pour les alterner ; `harvester` seulement en urgence (ni harvester, ni paire mineur + hauler) ; 2 `upgrader` (1 tant que des extensions sont en chantier), plus 1 par tranche de 100 000 énergie stockée et 1 par tranche de 500 énergie en attente (conteneur du contrôleur, et sans stockage conteneurs des sources et énergie au sol), 6 de plus au maximum ; corps `[WORK, WORK, CARRY, MOVE]` entre 300 et 399 de capacité ; 2 `builder` s'il y a des chantiers, sinon 1 si une structure est sous 50 % et qu'aucune tour ne l'entretient ; 1 `scout` ; avec un stockage, 2 `remote` par source des salles voisines sûres (2 salles au plus, celles qui ont le plus de sources) ; pour la salle d'origine de l'expansion, 1 `claimer` puis 2 `pioneer` une fois la salle revendiquée |
| `roles/*` | Comportement par rôle : `harvester`, `upgrader`, `builder`, `miner`, `hauler`, `defender`, `scout`, `claimer`, `pioneer`, `remote` |
| `intel` | Renseignements par salle dans `Memory.rooms[nom].intel` (sources, contrôleur, propriétaire, réservation, dernier passage d'hostiles), écrits par le `scout` et par les `remote` qui croisent des hostiles. Une salle est sûre si son contrôleur est libre et sans hostiles depuis 1 500 ticks |
| `expansion` | Tous les 100 ticks, si le GCL autorise une salle de plus : choisit dans `Memory.expansion` la salle sûre qui a le plus de sources, à 5 salles au plus d'une salle RCL 4 avec stockage. Une fois revendiquée, pose le chantier du spawn (case libre la plus proche du contrôleur et des sources). Terminée quand le spawn existe ; abandonnée si la salle est prise ou non revendiquée après 5 000 ticks, et rendue (`unclaim`) si son spawn n'est pas construit 5 000 ticks après la revendication |
| `planner` | Placement des structures tous les 100 ticks dès le RCL 1 : stockage (RCL 4), tours (RCL 3) puis extensions (RCL 2) en damier autour du spawn, à partir du RCL 2 conteneur près de chaque source, et près du contrôleur une fois toutes les extensions du RCL construites (sinon les chantiers de conteneur non entamés sont retirés) ; à partir du RCL 3 route spawn → chaque source et spawn → contrôleur (avant, les chantiers de route non entamés sont retirés) (chemin gardé dans `room.memory.routes`, recalculé seulement s'il est bloqué) ; dès qu'une tour et le stockage existent, ceinture de murs à 2 cases des sorties avec remparts sur les routes et au milieu de chaque côté |
| `defense` | Tours (tir concentré sur un même hostile, soigneurs d'abord ; soin ; puis réparation au-dessus de 50 % d'énergie, cible recherchée tous les 10 ticks, des structures sous 80 % de leur cible, murs plafonnés à 10 000 × RCL) ; mode sans échec si un spawn ou une tour passe sous 50 % de ses points de vie en présence d'hostiles |
| `stats` | Écrit `Memory.stats` à chaque tick : CPU par module (`defense`, `spawner`, `creeps`, `planner`, `expansion`), limite et bucket ; par salle, RCL, progression, énergie disponible et stockée, cumul d'énergie récoltée (y compris à distance, compté pour la salle d'origine du créep). Sous 2 000 de bucket, `planner` et `expansion` sont sautés. Bucket plein (`PIXEL_CPU_COST`), pas d'expansion en cours ni d'hostiles dans nos salles : génération d'un pixel sur le serveur officiel |

## Questions ouvertes

- Organisation des rôles : machine à états ou système de tâches ?
- Planification des bases : plan statique ou calculé ?
