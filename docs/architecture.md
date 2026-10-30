# Architecture

> **À compléter** : ce document décrit l'architecture envisagée. Seuls `memory`, `sources`, `spawner`, `planner`, `defense`, `stats` et les rôles `harvester`, `upgrader`, `builder`, `miner`, `hauler` et `defender` sont implémentés.

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
| `spawner` | Création des créeps selon les besoins de la salle : 2 `defender` si des hostiles dangereux sont présents, 2 `harvester` par source sans conteneur, 1 `miner` et 1 `hauler` par source avec conteneur |
| `roles/*` | Comportement par rôle : `harvester`, `upgrader`, `builder`, `miner`, `hauler`, `defender` |
| `planner` | Placement des structures tous les 100 ticks dès le RCL 1 : stockage (RCL 4), tours (RCL 3) puis extensions (RCL 2) en damier autour du spawn, route spawn → chaque source et spawn → contrôleur, conteneur en bout de route ; dès qu'une tour existe, ceinture de murs à 2 cases des sorties avec remparts sur les routes et au milieu de chaque côté |
| `defense` | Tours (attaque, soin, puis réparation au-dessus de 50 % d'énergie, murs plafonnés à 10 000 × RCL) ; mode sans échec si un spawn ou une tour passe sous 50 % de ses points de vie en présence d'hostiles |
| `stats` | Écrit `Memory.stats` à chaque tick : CPU par module (`defense`, `spawner`, `creeps`, `planner`), limite et bucket ; par salle, RCL, progression, énergie disponible et stockée, cumul d'énergie récoltée. Sous 2 000 de bucket, `planner` est sauté. Bucket plein (`PIXEL_CPU_COST`) : génération d'un pixel sur le serveur officiel |

## Questions ouvertes

- Organisation des rôles : machine à états ou système de tâches ?
- Planification des bases : plan statique ou calculé ?
- Gestion multi-salles et expansion.
