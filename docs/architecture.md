# Architecture

> **À compléter** : ce document décrit l'architecture envisagée. Seuls `memory`, `sources`, `spawner`, `planner` et les rôles `harvester`, `upgrader` et `builder` sont implémentés.

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
| `sources` | Inventaire des sources d'énergie et attribution des récolteurs |
| `spawner` | File de création des créeps selon les besoins de la salle |
| `roles/*` | Comportement par rôle : `harvester`, `upgrader`, `builder`, etc. |
| `planner` | Placement des structures tous les 100 ticks dès le RCL 2 : extensions en damier autour du spawn, route spawn → chaque source et spawn → contrôleur, conteneur en bout de route |
| `defense` | Tours et réaction aux hostiles |
| `stats` | Suivi du CPU et des indicateurs |

## Questions ouvertes

- Organisation des rôles : machine à états ou système de tâches ?
- Planification des bases : plan statique ou calculé ?
- Gestion multi-salles et expansion.
