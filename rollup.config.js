'use strict';

const fs = require('fs');
const commonjs = require('@rollup/plugin-commonjs');
const screeps = require('rollup-plugin-screeps');

const SECRETS_FILE = 'secrets.json';
const hasSecrets = fs.existsSync(SECRETS_FILE);
// Le déploiement n'a lieu qu'avec `npm run deploy` / `npm run watch` (variable DEPLOY).
const deploy = Boolean(process.env.DEPLOY);

if (deploy && !hasSecrets) {
  console.warn(`[screeps] ${SECRETS_FILE} introuvable : build seul, aucun envoi.`);
}

module.exports = {
  input: 'src/main.js',
  output: {
    file: 'dist/main.js',
    format: 'cjs',
    exports: 'auto',
  },
  plugins: [
    commonjs(),
    screeps({ configFile: SECRETS_FILE, dryRun: !(deploy && hasSecrets) }),
  ],
};
