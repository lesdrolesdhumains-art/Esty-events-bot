const { SlashCommandBuilder } = require('discord.js');

const probleme = new SlashCommandBuilder()
  .setName('probleme')
  .setDescription('Gérer les dossiers secrets des Problèmes d’Esty')
  .addSubcommand(s => s.setName('ajouter').setDescription('Ajouter un dossier secret via un formulaire privé'))
  .addSubcommand(s => s.setName('liste').setDescription('Voir les dossiers enregistrés (privé)'))
  .addSubcommand(s => s.setName('voir').setDescription('Lire un dossier (privé)')
    .addIntegerOption(o => o.setName('id').setDescription('Numéro du dossier').setMinValue(1).setRequired(true)))
  .addSubcommand(s => s.setName('modifier').setDescription('Modifier un dossier (privé)')
    .addIntegerOption(o => o.setName('id').setDescription('Numéro du dossier').setMinValue(1).setRequired(true)))
  .addSubcommand(s => s.setName('supprimer').setDescription('Supprimer définitivement un dossier')
    .addIntegerOption(o => o.setName('id').setDescription('Numéro du dossier').setMinValue(1).setRequired(true)))
  .addSubcommand(s => s.setName('tirer').setDescription('Tirer au sort un dossier inédit sans le publier'))
  .addSubcommand(s => s.setName('reveler').setDescription('Publier le dossier tiré dans le salon d’animation'))
  .addSubcommand(s => s.setName('remettre').setDescription('Remettre le dossier tiré dans la pioche'));

const animation = new SlashCommandBuilder()
  .setName('animation')
  .setDescription('Contrôler Esty Events en mode semi-automatique')
  .addSubcommand(s => s.setName('annonce').setDescription('Publier l’annonce préparée dans index.js'))
  .addSubcommand(s => s.setName('lancer').setDescription('Lancer une nouvelle session'))
  .addSubcommand(s => s.setName('suivant').setDescription('Publier l’étape suivante préparée dans index.js'))
  .addSubcommand(s => s.setName('qcm').setDescription('Créer un QCM improvisé avec des boutons'))
  .addSubcommand(s => s.setName('resultats').setDescription('Clôturer le QCM en cours et publier les résultats'))
  .addSubcommand(s => s.setName('pause').setDescription('Mettre la session en pause'))
  .addSubcommand(s => s.setName('reprendre').setDescription('Reprendre la session'))
  .addSubcommand(s => s.setName('message').setDescription('Envoyer un message personnalisé via formulaire'))
  .addSubcommand(s => s.setName('statut').setDescription('Voir l’état et la progression (privé)'))
  .addSubcommand(s => s.setName('terminer').setDescription('Terminer la session'));

module.exports = [probleme, animation];
