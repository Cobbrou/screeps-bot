# screeps-bot

Bot pour [Screeps World](https://screeps.com), le MMO de stratégie où l'on programme ses unités (les « créeps ») en JavaScript.

L'objectif à terme est un bot autonome capable de gérer ses salles : récolte d'énergie, création de créeps, construction et défense. Pour l'instant, le bot se limite au strict minimum : il maintient récolteurs, améliorateurs et constructeurs selon les besoins de chaque salle, avec des corps adaptés à l'énergie disponible. Dès le RCL 1, il place lui-même routes et conteneurs, puis les extensions au RCL 2, les tours au RCL 3 et le stockage au RCL 4. Dès qu'une source a son conteneur, un mineur s'y installe et des transporteurs acheminent l'énergie. Les tours défendent, soignent et réparent ; des murs ferment les sorties, des défenseurs sont créés face aux hostiles et le mode sans échec sert de dernier recours. Un éclaireur explore les salles voisines : leurs sources sont exploitées à distance, et le bot revendique une nouvelle salle dès que le GCL le permet.

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
│   ├── planner.js           # stockage, tours, extensions, routes, conteneurs, murs (tous les 100 ticks)
│   ├── sources.js           # sources et conteneurs en cache, récolte et collecte d'énergie
│   ├── spawner.js           # création des créeps selon les effectifs voulus
│   ├── stats.js             # CPU par module, indicateurs dans Memory.stats, bucket bas, pixels
│   └── roles/
│       ├── builder.js       # répare le très abîmé (< 50 %), construit, répare le reste sinon
│       ├── claimer.js       # revendique le contrôleur de la salle visée
│       ├── defender.js      # attaque les hostiles de la salle
│       ├── harvester.js     # récolte et remplit spawn et extensions
│       ├── hauler.js        # transporte l'énergie des conteneurs vers spawn, extensions, tours
│       ├── miner.js         # récolte statique sur le conteneur d'une source
│       ├── pioneer.js       # amorce la nouvelle salle (construit son spawn)
│       ├── remote.js        # récolte dans une salle voisine, livre au stockage
│       ├── scout.js         # explore les salles voisines
│       └── upgrader.js      # puise l'énergie et améliore le contrôleur
├── docs/
│   ├── architecture.md      # architecture prévue
│   └── screeps-reference.md # aide-mémoire de l'API Screeps
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
- [docs/screeps-reference.md](docs/screeps-reference.md) : concepts de base de Screeps
