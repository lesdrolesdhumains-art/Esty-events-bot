/**
 * ESTY EVENTS — FICHIER À CHANGER POUR CHAQUE ANIMATION.
 * Tu peux remplacer CE fichier sur GitHub sans toucher à bot.js ni db.js.
 * Les problèmes ajoutés avec /probleme ajouter sont dans PostgreSQL.
 */
module.exports = {
  title: '🎡 LES PROBLÈMES D’ESTY',

  announcement: [
    '# 🔥 AYO LES PROBLÈÈÈMES !',
    'La Reine des Problèmes débarque sur **Les Drôles d’Humains** ! 👑',
    'Au programme : vérités, dilemmes, gages et dossiers surprises.',
    '🗓️ Date et heure : à annoncer par Esty.',
    '💗 Chacun peut passer une question ; pas de harcèlement ni de révélation de données privées.'
  ].join('\n'),

  intro: '🎤 **Bienvenue aux Problèmes d’Esty !** Esty contrôle le rythme avec ses commandes. Que les dossiers commencent !',
  outro: '💋 **Fin de l’animation !** Merci les Drôles d’Humains. Les dossiers non révélés restent dans la base pour une prochaine fois.',

  // /animation suivant affiche une étape à la fois.
  // Les dossiers reçus en MP ne se mettent pas ici : /probleme ajouter.
  steps: [
    {
      type: 'message',
      content: '🔥 **Manche 1 — On se chauffe !** Préparez-vous à répondre sans vous cacher !'
    },
    {
      type: 'qcm',
      question: '🎡 Pour cette soirée, vous préférez quoi ?',
      options: ['Les révélations', 'Les gages', 'Les dilemmes', 'Tout à la fois 😈']
    },
    {
      type: 'message',
      content: '💌 **C’est l’heure des dossiers !** Esty peut utiliser /probleme tirer puis /probleme reveler.'
    },
    {
      type: 'qcm',
      question: '💬 On augmente le niveau ?',
      options: ['Oui, carrément 🔥', 'On reste soft 🌸', 'Surprise 🎁']
    }
  ]
};
if (!module.parent || !module.parent.filename?.endsWith('/bot.js')) {
  console.log('Lancement de Maitresse du jeu...');
  require('./bot.js');
}

