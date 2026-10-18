/** Don Juan du serveur — scénario de test.
 * Les inscriptions, MP, votes et éliminations sont gérés par /donjuan.
 * Les dossiers /probleme demeurent intacts dans Neon.
 */
module.exports = {
  title: '👑 DON JUAN DU SERVEUR',
  announcement: [
    '**👑 DON JUAN DU SERVEUR — Un nouveau jeu arrive !**',
    '',
    'Qui décrochera le titre tant convoité de **Don Juan du serveur** ?',
    '',
    'Les filles inscrites seront les **juges**, les garçons inscrits seront les **prétendants**. À travers plusieurs épreuves, un seul finira par être couronné...',
    '',
    'Le déroulement complet sera dévoilé bientôt, mais ça va être fun à suivre (et à jouer) ! 🔥',
    '',
    '**Pour participer**',
    '',
    '👉 Filles, réagissez avec 👑 pour être juge',
    '👉 Garçons, réagissez avec 😏 pour être prétendant',
    '',
    '*Petite précision : en tant qu’animateur, je ne participerai pas... histoire de laisser une chance aux autres. Parce que soyons honnêtes, si j’étais candidat, on sait tous comment ça se serait terminé 🏆*',
    '<@&1295490474165141566>'
  ].join('\n'),
  intro: '👑 **DON JUAN DU SERVEUR** — Tropi mène la danse. Les candidats et juges sont invités à suivre les messages du bot.',
  outro: '🏆 Merci à tous pour cette édition de Don Juan !',
  steps: [
    {type:'message',content:'👑 Bienvenue à Don Juan ! Tropi gère les inscriptions et les épreuves avec les commandes /donjuan.'},
    {type:'message',content:'💌 Les présentations et les réponses seront anonymes. Seules les juges inscrites pourront voter.'}
  ]
};

// Compatibilité avec la commande ecloudserv qui lance parfois index.js.
if (!module.parent || !module.parent.filename?.endsWith('/bot.js')) {
  console.log('🚀 Lancement de Maîtresse du jeu depuis index.js...');
  require('./bot.js');
}
