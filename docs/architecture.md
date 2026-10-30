# Architecture

> **À compléter** : ce document décrit l'architecture envisagée. Seuls `memory`, `sources`, `spawner`, `planner`, `defense`, `intel`, `expansion`, `stats` et les rôles `harvester`, `upgrader`, `builder`, `miner`, `hauler`, `defender`, `scout`, `claimer`, `pioneer` et `remote` sont implémentés.

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
| `memory` | Nettoyage et initialisation de `Memory` |
| `sources` | Sources et conteneurs en cache, attribution des récolteurs, collecte d'énergie (conteneur ou stockage, récolte sinon) |
| `spawner` | Création des créeps selon les besoins de la salle : 2 `defender` si des hostiles dangereux sont présents, 2 `harvester` par source sans conteneur, 1 `miner` et 1 `hauler` par source avec conteneur ; dès le RCL 2, 1 `scout` ; avec un stockage, 2 `remote` par source des salles voisines sûres ; pour la salle d'origine de l'expansion, 1 `claimer` puis 2 `pioneer` une fois la salle revendiquée |
| `roles/*` | Comportement par rôle : `harvester`, `upgrader`, `builder`, `miner`, `hauler`, `defender`, `scout`, `claimer`, `pioneer`, `remote` |
| `intel` | Renseignements par salle dans `Memory.rooms[nom].intel` (sources, contrôleur, propriétaire, réservation, dernier passage d'hostiles), écrits par le `scout` et par les `remote` qui croisent des hostiles. Une salle est sûre si son contrôleur est libre et sans hostiles depuis 1 500 ticks |
| `expansion` | Tous les 100 ticks, si le GCL autorise une salle de plus : choisit dans `Memory.expansion` la salle sûre qui a le plus de sources, à 5 salles au plus d'une salle RCL 4 avec stockage. Une fois revendiquée, pose le chantier du spawn (case libre la plus proche du contrôleur et des sources). Terminée quand le spawn existe ; abandonnée si la salle est prise ou non revendiquée après 5 000 ticks |
| `planner` | Placement des structures tous les 100 ticks dès le RCL 1 : stockage (RCL 4), tours (RCL 3) puis extensions (RCL 2) en damier autour du spawn, route spawn → chaque source et spawn → contrôleur, conteneur en bout de route (chemin gardé dans `room.memory.routes`, recalculé seulement s'il est bloqué) ; dès qu'une tour existe, ceinture de murs à 2 cases des sorties avec remparts sur les routes et au milieu de chaque côté |
| `defense` | Tours (attaque, soin, puis réparation au-dessus de 50 % d'énergie, murs plafonnés à 10 000 × RCL) ; mode sans échec si un spawn ou une tour passe sous 50 % de ses points de vie en présence d'hostiles |
| `stats` | Écrit `Memory.stats` à chaque tick : CPU par module (`defense`, `spawner`, `creeps`, `planner`, `expansion`), limite et bucket ; par salle, RCL, progression, énergie disponible et stockée, cumul d'énergie récoltée. Sous 2 000 de bucket, `planner` et `expansion` sont sautés. Bucket plein (`PIXEL_CPU_COST`) : génération d'un pixel sur le serveur officiel |

## Questions ouvertes

- Organisation des rôles : machine à états ou système de tâches ?
- Planification des bases : plan statique ou calculé ?
