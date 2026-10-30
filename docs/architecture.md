# Architecture

> **À compléter** : ce document décrit l'architecture envisagée. Seuls `memory`, `sources`, `spawner`, `planner` et les rôles `harvester`, `upgrader`, `builder`, `miner` et `hauler` sont implémentés.

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
| `spawner` | Création des créeps selon les besoins de la salle : 2 `harvester` par source sans conteneur, 1 `miner` et 1 `hauler` par source avec conteneur |
| `roles/*` | Comportement par rôle : `harvester`, `upgrader`, `builder`, `miner`, `hauler` |
| `planner` | Placement des structures tous les 100 ticks dès le RCL 2 : stockage (RCL 4) puis extensions en damier autour du spawn, route spawn → chaque source et spawn → contrôleur, conteneur en bout de route |
| `defense` | Tours et réaction aux hostiles |
| `stats` | Suivi du CPU et des indicateurs |

## Questions ouvertes

- Organisation des rôles : machine à états ou système de tâches ?
- Planification des bases : plan statique ou calculé ?
- Gestion multi-salles et expansion.
