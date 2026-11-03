# screeps-bot

Bot pour [Screeps World](https://screeps.com), le MMO de stratégie où l'on programme ses unités (les « créeps ») en JavaScript.

L'objectif à terme est un bot autonome capable de gérer ses salles : récolte d'énergie, création de créeps, construction et défense. Pour l'instant, le bot se limite au strict minimum : il maintient récolteurs, améliorateurs et constructeurs selon les besoins de chaque salle, avec des corps adaptés à l'énergie disponible. Il place lui-même conteneurs et extensions au RCL 2, tours au RCL 3, routes dès que la salle est équipée (extensions et conteneurs construits) ou au plus tard au RCL 3 et le stockage au RCL 4. Dès le RCL 1, des mineurs s'installent sur les sources et des transporteurs acheminent l'énergie. Les tours défendent, soignent et réparent ; des murs ferment les sorties, des défenseurs sont créés face aux hostiles et le mode sans échec sert de dernier recours. Un éclaireur explore les salles voisines : dès le RCL 2, leurs sources sont exploitées à distance par des mineurs et des transporteurs, et le bot revendique une nouvelle salle dès que le GCL le permet.

## Prérequis

- [Node.js](https://nodejs.org) en version LTS
- Un compte Screeps (serveur officiel) ou l'accès à un serveur privé

## Installation

```bash
git clone <url-du-depot> screeps-bot
cd screeps-bot
npm install
```

## Configuration

Copier le modèle d'identifiants puis le remplir :

```bash
cp secrets.example.json secrets.json
```

| Clé | Description |
|-----|-------------|
| `token` | Token d'API (serveur officiel : *Account Settings > Auth Tokens*) |
| `protocol` | `https` ou `http` |
| `hostname` | `screeps.com` ou l'hôte du serveur privé |
| `port` | Port du serveur (nombre) : `443` pour le serveur officiel |
| `path` | Chemin de l'API : `/` pour le serveur officiel, `/ptr` pour le PTR |
| `branch` | Branche de code cible dans Screeps (`default`, ou `auto` pour la branche git courante) |

Pour un serveur privé sans token, remplacer `token` par `email` et `password`.

`secrets.json` est ignoré par git : **ne jamais le commiter**.

## Commandes

| Commande | Effet |
|----------|-------|
| `npm run build` | Bundle `src/main.js` vers `dist/main.js`, sans envoi |
| `npm run deploy` | Build puis envoi du code sur le serveur défini dans `secrets.json` |
| `npm run watch` | Rebuild et envoi à chaque modification de `src/` |

Sans `secrets.json`, `deploy` et `watch` se contentent du build et affichent un avertissement.

## Arborescence

```
screeps-bot/
├── src/
│   ├── main.js              # point d'entrée (loop exécutée à chaque tick)
│   ├── defense.js           # tours, mode sans échec, détection des hostiles
│   ├── expansion.js         # choix de la salle à revendiquer, pose de son premier spawn
│   ├── intel.js             # renseignements sur les salles explorées (Memory.rooms[*].intel)
│   ├── memory.js            # nettoyage de Memory (créeps morts)
│   ├── move.js              # déplacements : moveTo avec contournement des créeps en cas de blocage
│   ├── remoteMining.js      # récolte distante : salles et sources exploitées, besoins en mineurs, transporteurs et reservers
│   ├── planner.js           # plan de base gardé (hub du contrôleur, stockage, tours, extensions), routes, conteneurs, murs (tous les 100 ticks et à chaque montée de RCL)
│   ├── sources.js           # sources et conteneurs en cache, récolte et collecte d'énergie
│   ├── spawner.js           # création des créeps selon les effectifs voulus (upgraders et builders sur le revenu net)
│   ├── stats.js             # CPU par module, indicateurs dans Memory.stats, bucket bas, pixels
│   └── roles/
│       ├── builder.js       # répare le très abîmé (< 50 %), construit, répare le reste sinon ; nourri par les haulers sans stockage
│       ├── claimer.js       # revendique le contrôleur de la salle visée
│       ├── defender.js      # tire à distance depuis le rempart le plus proche de l'ennemi
│       ├── filler.js        # remplit spawn, extensions et tours depuis le stockage quand les sources sont liées
│       ├── harvester.js     # récolte et remplit spawn, extensions et tours, construit le surplus
│       ├── hauler.js        # transporte l'énergie des conteneurs vers spawn, extensions, tours, dépôt du contrôleur
│       ├── miner.js         # récolte statique sur une source (conteneur, ou au sol)
│       ├── pioneer.js       # amorce la nouvelle salle (construit son spawn)
│       ├── remoteBuilder.js # construit et entretient les routes des salles distantes
│       ├── remoteHauler.js  # ramasse l'énergie d'une source distante (sol, conteneur) et la rapporte
│       ├── remoteMiner.js   # récolte statique sur une source distante, construit et entretient son conteneur
│       ├── reserver.js      # réserve le contrôleur d'une salle de récolte distante
│       ├── scout.js         # explore les salles voisines
│       └── upgrader.js      # posté au dépôt du contrôleur, améliore sans aller chercher l'énergie
├── docs/
│   ├── architecture.md      # architecture prévue
│   ├── e25s3-analysis.md    # état de E25S3 et corrections à apporter (relevé du 2026-11-03)
│   ├── harabibot-analysis.md # comparaison avec harabibot v2 : pistes pour l'early game
│   ├── harabibot-planner-analysis.md # comparaison des planners : pistes pour le plan de base
│   ├── screeps-reference.md # aide-mémoire de l'API Screeps
│   ├── tooangel-analysis.md # comparaison avec TooAngel : robustesse, entraide entre salles
│   └── tooangel-early-analysis.md # comparaison avec TooAngel : début de partie (RCL 1 à 4)
├── .editorconfig
├── .gitignore
├── AGENTS.md                # consignes pour les agents IA
├── package.json
├── rollup.config.js         # configuration du build et du déploiement
├── ROADMAP.md               # étapes de développement prévues
├── secrets.example.json     # modèle d'identifiants
└── README.md
```

## Documentation

- [AGENTS.md](AGENTS.md) : règles à suivre pour les agents IA travaillant sur le dépôt
- [ROADMAP.md](ROADMAP.md) : étapes de développement prévues
- [docs/architecture.md](docs/architecture.md) : architecture prévue
- [docs/e25s3-analysis.md](docs/e25s3-analysis.md) : analyse de la salle E25S3 (bugs, CPU, économie, défense), corrections classées
- [docs/harabibot-analysis.md](docs/harabibot-analysis.md) : pourquoi l'early game de harabibot v2 est meilleur, pistes à reprendre
- [docs/harabibot-planner-analysis.md](docs/harabibot-planner-analysis.md) : planner de harabibot v2 comparé au nôtre, améliorations du plan de base
- [docs/screeps-reference.md](docs/screeps-reference.md) : concepts de base de Screeps
- [docs/tooangel-analysis.md](docs/tooangel-analysis.md) : ce qui marche chez TooAngel comparé à notre bot, pistes classées par impact
- [docs/tooangel-early-analysis.md](docs/tooangel-early-analysis.md) : début de partie de TooAngel comparé au nôtre, jalons de référence par RCL
