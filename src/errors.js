// Isolation des erreurs : une exception est affichée en console et signalée par e-mail (Game.notify)
// sans interrompre le reste du tick (autres salles, autres modules, autres créeps).

// Une même étiquette n'envoie qu'un e-mail par NOTIFY_EVERY ticks : une erreur répétée à chaque tick ne noie pas la boîte.
const NOTIFY_EVERY = 1500;
// Délai de regroupement des e-mails par le serveur (minutes).
const NOTIFY_GROUP = 60;

// Dernier tick d'envoi par étiquette. Gardé dans le heap : un reset du global renvoie au plus un e-mail de plus.
const notified = {};

// Exécute `fn` ; en cas d'exception, l'affiche et la signale sous `label` (par exemple « defense E25S3 »).
function attempt(label, fn) {
  try {
    fn();
  } catch (e) {
    const message = `[${label}] ${e.stack || e}`;
    console.log(message);
    if (notified[label] === undefined || Game.time - notified[label] >= NOTIFY_EVERY) {
      notified[label] = Game.time;
      Game.notify(message, NOTIFY_GROUP);
    }
  }
}

module.exports.attempt = attempt;
module.exports.NOTIFY_EVERY = NOTIFY_EVERY;
