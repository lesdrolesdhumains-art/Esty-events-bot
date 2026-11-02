'use strict';
/**
 * Compatibilité anciens panneaux / anciens liens vers index.js.
 * Sur ecloudserv, le fichier de démarrage officiel RESTE bot.js.
 * Sous `ts-node --esm`, require.main peut désigner le lanceur ts-node,
 * et pas ce fichier : on compare donc aussi le chemin du script exécuté.
 * Ne jamais démarrer deux clients : bot.js ne nécessite pas index.js.
 */
const path = require('node:path');
const launchedDirectly = require.main === module ||
  (process.argv[1] && path.resolve(process.argv[1]) === __filename);
if (launchedDirectly) {
  console.log('🔁 index.js : transfert de démarrage vers bot.js…');
  require('./bot.js');
}
module.exports = { title: '🏆 Les Drôles de Champions + Brawlhalla' };
