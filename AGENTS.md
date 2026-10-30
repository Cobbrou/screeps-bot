# AGENTS.md

Consignes pour les agents IA qui travaillent sur ce dépôt.

## Objectif

`screeps-bot` est un bot pour Screeps World. À terme, il doit gérer ses salles de façon autonome : récolte des sources, création et pilotage des créeps par rôle, planification et construction des structures, défense, puis expansion. Le dépôt n'en est qu'à son initialisation : ne pas ajouter de logique de jeu sans demande explicite.

## Contraintes Screeps

- **CPU limité** : chaque tick dispose d'un budget `Game.cpu.limit` (complété par la réserve `Game.cpu.bucket`). Mesurer avec `Game.cpu.getUsed()` et éviter les calculs coûteux répétés (pathfinding, `find` sur toute la salle) : les mettre en cache.
- **`Memory`** est sérialisée en JSON et persistée entre les ticks. N'y stocker que des données sérialisables (pas d'objets du jeu, pas de fonctions ; stocker des `id`). Sa taille et son parsing coûtent du CPU.
- **`loop`** est appelée à chaque tick et doit rester légère : elle orchestre, les modules font le travail.
- **Bundle obligatoire** : le runtime n'accepte pas les modules ES natifs. Le code source est en CommonJS et Rollup produit `dist/main.js`.
- **En cas de doute sur l'API**, consulter la documentation officielle (https://docs.screeps.com) plutôt que deviner un nom de méthode, une constante ou un code de retour.

## Conventions de code

- Un module par responsabilité (un fichier par rôle de créep, par gestionnaire, etc.) dans `src/`.
- Pas de logique lourde dans `main.js` : uniquement l'appel des modules.
- CommonJS (`require` / `module.exports`), indentation de 2 espaces (voir `.editorconfig`).
- Commentaires en français ; noms de variables, de fonctions et de fichiers en anglais.

## Sécurité

- Ne jamais afficher, écrire, copier ni commiter `secrets.json` ou un token, même partiellement.
- Ne jamais lancer `npm run deploy` ni `npm run watch` (qui déploie aussi) sans demande explicite de l'utilisateur.
- Ne pas faire de commit git sans demande explicite.

## Vérification

Lancer `npm run build` après chaque modification et s'assurer qu'il passe sans erreur.

## Maintenance de la documentation

Mettre à jour `README.md` (arborescence, commandes) et `docs/` dès que la structure du projet ou l'architecture change.
