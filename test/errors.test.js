// Vérifie l'isolation des erreurs et la limite d'un e-mail par étiquette : node test/errors.test.js
const assert = require('assert');

const sent = [];
global.Game = { time: 100, notify: (message) => sent.push(message) };
const log = console.log;
console.log = () => {};
const { attempt, NOTIFY_EVERY } = require('../src/errors');
const fail = () => { throw new Error('boom'); };

// L'exception ne remonte pas, le code sans erreur s'exécute.
let ran = false;
attempt('ok', () => { ran = true; });
assert.ok(ran);
assert.doesNotThrow(() => attempt('defense E25S3', fail));
assert.strictEqual(sent.length, 1);
// Même étiquette : pas de nouvel e-mail avant NOTIFY_EVERY ticks ; autre étiquette : e-mail.
Game.time += NOTIFY_EVERY - 1;
attempt('defense E25S3', fail);
assert.strictEqual(sent.length, 1);
attempt('spawner E25S3', fail);
assert.strictEqual(sent.length, 2);
Game.time += 1;
attempt('defense E25S3', fail);
assert.strictEqual(sent.length, 3);

console.log = log;
console.log('errors : ok');
