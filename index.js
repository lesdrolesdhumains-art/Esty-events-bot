/**
 * Configuration du jeu « Les problèmes d’Esty ».
 * Les dossiers sont dans Neon/PostgreSQL et ne sont PAS effacés en remplaçant ce fichier.
 */
module.exports={
  title:'🎡 LES PROBLÈMES D’ESTY',
  announcement:[
    '# 🎡 LES PROBLÈMES D’ESTY !',
    'Une roue, un bouton... et un problème surprise à chaque tour ! 💣',
    'Qui sera cité ? Quel dossier sortira ? 😈',
    '💗 Chacun a le droit de passer ; les dossiers servent à s’amuser, pas à accuser.'
  ].join('\n'),
  intro:'👑 Bienvenue aux Problèmes d’Esty ! Cliquez sur la roue pour révéler vos dossiers.',
  outro:'💗 Fin des Problèmes d’Esty ! Les dossiers non tirés restent sauvegardés.',
  steps:[] // Pas de manches QCM, ni de vérités ou de gages dans ce jeu.
};
// Démarrage de secours ecloudserv : index.js OU bot.js. Évite un double lancement.
if(require.main===module){
  console.log('🚀 Lancement des Problèmes d’Esty depuis index.js...');
  require('./bot.js');
}
