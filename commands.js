'use strict';
const {SlashCommandBuilder,ChannelType}=require('discord.js');
const c=new SlashCommandBuilder().setName('champion').setDescription('🏆 Les Drôles de Champions : animation et buzzer');
const usr=o=>o.addUserOption(x=>x.setName('membre').setDescription('Membre Discord').setRequired(true));
c.addSubcommand(s=>s.setName('installer').setDescription('Choisir le salon du jeu').addChannelOption(o=>o.setName('salon').setDescription('Salon d’animation').addChannelTypes(ChannelType.GuildText).setRequired(true)));
c.addSubcommandGroup(g=>g.setName('animateur').setDescription('Gérer les animateurs')
 .addSubcommand(s=>usr(s.setName('definir').setDescription('Définir l’animateur principal')))
 .addSubcommand(s=>usr(s.setName('remplacer').setDescription('Remplacer l’animateur principal')))
 .addSubcommand(s=>usr(s.setName('ajouter').setDescription('Ajouter un coanimateur')))
 .addSubcommand(s=>usr(s.setName('retirer').setDescription('Retirer un animateur')))
 .addSubcommand(s=>s.setName('liste').setDescription('Afficher les animateurs')));
c.addSubcommandGroup(g=>g.setName('joueur').setDescription('Gestion manuelle des candidats')
 .addSubcommand(s=>usr(s.setName('ajouter').setDescription('Inscrire un candidat sans limite fixée')))
 .addSubcommand(s=>usr(s.setName('retirer').setDescription('Retirer un candidat')))
 .addSubcommand(s=>s.setName('liste').setDescription('Afficher tous les candidats').addIntegerOption(o=>o.setName('page').setDescription('Page de 20 joueurs').setMinValue(1)))
 .addSubcommand(s=>s.setName('vider').setDescription('Vider les inscriptions hors partie')));
c.addSubcommandGroup(g=>g.setName('partie').setDescription('Gérer la soirée')
 .addSubcommand(s=>s.setName('lancer').setDescription('Démarrer la première manche'))
 .addSubcommand(s=>s.setName('pause').setDescription('Suspendre le jeu'))
 .addSubcommand(s=>s.setName('reprendre').setDescription('Relancer le jeu après une pause/redémarrage'))
 .addSubcommand(s=>s.setName('statut').setDescription('Voir l’état de la partie'))
 .addSubcommand(s=>s.setName('terminer').setDescription('Clore la partie')));
c.addSubcommandGroup(g=>g.setName('manche').setDescription('Configurations et qualifications')
 .addSubcommand(s=>s.setName('configurer').setDescription('Fixer les qualifications de la manche')
  .addIntegerOption(o=>o.setName('numero').setDescription('Manche à configurer : 1 ou 2').setRequired(true).addChoices({name:'1',value:1},{name:'2',value:2}))
  .addIntegerOption(o=>o.setName('qualifies').setDescription('Nombre de candidats qui passent la manche').setRequired(true).setMinValue(1))
  .addStringOption(o=>o.setName('format').setDescription('Mode de sélection').addChoices({name:'Au classement',value:'classement'},{name:'Premiers au score cible',value:'objectif'},{name:'4 à la suite (manche 2)',value:'serie'}))
  .addIntegerOption(o=>o.setName('objectif').setDescription('Score cible pour le mode objectif').setMinValue(1))
  .addIntegerOption(o=>o.setName('questions').setDescription('Limite indicative de questions pour le classement').setMinValue(1)))
 .addSubcommand(s=>usr(s.setName('tour').setDescription('Démarrer le 4 à la suite d’un candidat (manche 2)')))
 .addSubcommand(s=>s.setName('departager').setDescription('Question décisive en cas d’égalité à la frontière'))
 .addSubcommand(s=>s.setName('suivante').setDescription('Qualifier les meilleurs et ouvrir la prochaine manche')));
c.addSubcommandGroup(g=>g.setName('question').setDescription('Banque de questions, tirages et quiz')
 .addSubcommand(s=>s.setName('ajouter').setDescription('Ajouter une question + sa solution (formulaire privé)'))
 .addSubcommand(s=>s.setName('lancer').setDescription('Lancer une question au buzzer')
  .addStringOption(o=>o.setName('mode').setDescription('Automatique ou orale').setRequired(true).addChoices({name:'Automatique',value:'automatique'},{name:'Orale',value:'orale'}))
  .addStringOption(o=>o.setName('theme').setDescription('Filtrer la banque intégrée/custom (mode auto)'))
  .addStringOption(o=>o.setName('texte').setDescription('Question que l’animateur lit (mode oral), facultatif').setMaxLength(900))
  .addIntegerOption(o=>o.setName('points').setDescription('Points accordés si bonne réponse (1 à 4)').setMinValue(1).setMaxValue(4)))
 .addSubcommand(s=>s.setName('passer').setDescription('Clore la question actuelle sans point'))
 .addSubcommand(s=>s.setName('liste').setDescription('Nombre et catégories de questions disponibles')));
c.addSubcommandGroup(g=>g.setName('score').setDescription('Classement et correction')
 .addSubcommand(s=>s.setName('classement').setDescription('Voir le classement de la manche').addIntegerOption(o=>o.setName('page').setDescription('Page de 20 scores').setMinValue(1)))
 .addSubcommand(s=>s.setName('corriger').setDescription('Corriger manuellement un score')
  .addUserOption(o=>o.setName('membre').setDescription('Candidat').setRequired(true))
  .addIntegerOption(o=>o.setName('points').setDescription('Nouveau total de points').setRequired(true).setMinValue(0))));
c.addSubcommand(s=>s.setName('aide').setDescription('Afficher les commandes essentielles'));
module.exports=[c,require('./brawl').command];
