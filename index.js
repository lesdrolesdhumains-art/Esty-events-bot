'use strict';
/** Point d'entrée Ecloudserv / Node.js. Important : démarrage réel du moteur. */
if (require.main === module) {
  console.log('🚀 Démarrage de La Maîtresse du Jeu — Les Drôles de Champions…');
  require('./bot.js');
}
module.exports = { title: '🏆 LES DRÔLES DE CHAMPIONS' };
