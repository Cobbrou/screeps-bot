// Vérifie la coupe minimale hors du jeu : node test/minCut.test.js
const assert = require('assert');
const minCut = require('../src/minCut');

// Vrai si une sortie reste joignable depuis la base sans passer par la coupe.
function leaks(walkable, base, cut) {
  const closed = new Set(cut);
  const seen = new Set(base);
  const stack = [...base];
  while (stack.length) {
    const k = stack.pop();
    const x = Math.floor(k / 50);
    const y = k % 50;
    if (x === 0 || y === 0 || x === 49 || y === 49) return true;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const n = (x + dx) * 50 + y + dy;
        if (seen.has(n) || closed.has(n) || !walkable(x + dx, y + dy)) continue;
        seen.add(n);
        stack.push(n);
      }
    }
  }
  return false;
}

const one = () => 1;
// Salle dont le bord est plein, sauf une sortie à gauche ; cloison à x = 20, percée de 3 cases.
const walkable = (x, y) => {
  if (x <= 0 || y <= 0 || x >= 49 || y >= 49) return x === 0 && y >= 20 && y <= 25;
  return x !== 20 || (y >= 10 && y <= 12);
};
const base = new Set([30 * 50 + 25]);

// Le goulot de 3 cases suffit.
const cut = minCut(walkable, base, one);
assert.deepStrictEqual(cut.slice().sort(), [20 * 50 + 10, 20 * 50 + 11, 20 * 50 + 12].sort());
assert(!leaks(walkable, base, cut));

// Base au goulot : la coupe passe ailleurs, reste étanche et respecte la portée 1 des sorties.
const near = new Set([20 * 50 + 10, 20 * 50 + 11, 20 * 50 + 12]);
const beside = minCut(walkable, near, one);
assert(beside.length && !leaks(walkable, near, beside));
assert(beside.every((k) => Math.floor(k / 50) >= 2));

// Base collée à la sortie : ignorée, aucune barrière ne peut l'en séparer.
assert.deepStrictEqual(minCut(walkable, new Set([2 * 50 + 22]), one), []);

// Le coût oriente la coupe : une colonne plus large mais moins chère l'emporte sur le goulot.
const cheap = (x) => (x === 25 ? 1 : 100);
assert(minCut(walkable, base, cheap).every((k) => Math.floor(k / 50) === 25));

console.log('minCut : ok');
