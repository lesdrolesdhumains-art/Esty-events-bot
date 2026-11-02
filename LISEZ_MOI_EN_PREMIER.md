# 👑 MAÎTRESSE DU JEU — LES DRÔLES DE CHAMPIONS

## Ce pack remplace l'ancien bot « Les Problèmes d'Esty » du 28 octobre 2026

Il a été préparé à partir du ZIP `LES_PROBLEMES_DESTY_ECLOUDSERV_DEMARRAGE_CORRIGE.zip` retrouvé dans les anciens fichiers de l'utilisatrice. Le correctif du 30 octobre ne concernait que `roue.js`, désormais supprimé. Le dépôt GitHub public `lesdrolesdhumains-art/Esty-events-bot` consulté lors de la préparation montrait encore un état plus ancien (Don Juan) : **vérifiez quel code est réellement déployé avant de remplacer les fichiers**.

Ce pack est un **remplacement complet du bot Roue des problèmes**, pas une mise à jour automatique d'un autre bot personnalisé. Il ne contient plus le jeu des problèmes et n'installe aucune commande `/roue`, `/probleme` ni `/animation`.

**Aucun changement n'a été effectué sur GitHub, Discord, ecloudserv ni Neon par cette archive.**

## 1. Démarrage : LE POINT IMPORTANT !

- `index.js` contient le démarrage réel : si exécuté directement, il lance `require('./bot.js')`.
- `package.json` contient `main: index.js` et `start: node index.js`.
- Configurez ecloudserv sur **Node.js 22** et démarrez par `npm start` ou `node index.js`.
- Si ecloudserv lance directement `bot.js`, cela fonctionne aussi car `bot.js` démarre le client.
- Le bot synchronise `/champion` dès sa connexion. Les anciennes commandes du serveur sont supprimées par la synchronisation.
- Toutes les données des champions sont stockées dans de nouvelles tables PostgreSQL (`champion_states`, `champion_questions`). Le code **ne supprime pas** les données de l'ancien jeu en base.

## 2. Mise en place depuis l'iPhone (GitHub / ecloudserv)

1. Sauvegardez le dépôt GitHub et effectuez si possible un snapshot de Neon. Évitez les mises à jour en pleine soirée.
2. Décompressez cette archive dans l'application Fichiers de l'iPhone.
3. Vérifiez le dépôt et le service ecloudserv réellement actifs. Si vous utilisez encore le **bot Roue seul**, remplacez/ajoutez à la racine de votre dépôt les fichiers : `index.js`, `bot.js`, `commands.js`, `champion-core.js`, `champion-db.js`, `banque.js`, `package.json`, `.gitignore`, `.env.example`.
4. Supprimez les anciens fichiers **du jeu des problèmes** : `roue.js`, `wheel-db.js`, et l'ancien `db.js` (à condition qu'il ne serve à aucun autre module). Si des modules Reine des Cœurs ou Don Juan sont encore actifs sur votre version réelle, **ne remplacez pas leur moteur à l'aveugle** : ce pack doit alors être fusionné avec leur code.
5. Ne téléversez PAS les vraies variables secrètes dans GitHub, même dans un dépôt privé. Gardez `DISCORD_TOKEN` et `DATABASE_URL` dans le panneau ecloudserv.
6. Vérifiez les variables existantes : `DISCORD_TOKEN`, `DATABASE_URL`, `GUILD_ID`, `OWNER_ID`, `ANIMATION_CHANNEL_ID` (facultative si `/champion installer` a été utilisé). Les variables ont le même sens que dans l'ancien pack.
7. Sur ecloudserv : Node.js 22 ; `npm install` puis `node index.js` ou `npm start`. Contrôlez les logs :
   - `🚀 Démarrage de La Maîtresse du Jeu — Les Drôles de Champions…`
   - `✅ Maîtresse du Jeu connectée`
   - `✅ /champion synchronisé`
8. Dans Discord, tapez `/champion aide`, puis installez le plateau avec `/champion installer salon:#votre-salon`.
9. Faites une soirée test à 2 candidats avant la vraie animation.

## 3. Ordre des commandes (exemple)

`/champion installer salon:#animations`

`/champion animateur definir membre:@Tropi` (réservé au compte `OWNER_ID`)

`/champion animateur ajouter membre:@AutreAnimateur`

`/champion joueur ajouter membre:@Candidat1`

`/champion joueur ajouter membre:@Candidat2`

`/champion joueur ajouter membre:@Candidat3`

`/champion manche configurer numero:1 qualifies:2 format:classement questions:20`

`/champion manche configurer numero:2 qualifies:1 format:serie`

`/champion partie lancer`

`/champion question lancer mode:automatique` (ou `mode:orale texte:...`)

Ensuite le candidat appuie sur **BUZZER**, rédige sa réponse dans le formulaire (20 secondes), et le bot affiche la réponse publiquement. L'animateur clique sur **✅ Bonne** ou **❌ Mauvaise** dans le plateau. La solution peut être consultée par l'animateur **uniquement après l'envoi de la réponse**, en mode privé. Une mauvaise réponse relance la même question et le même candidat peut retenter tant qu'il n'a pas consulté la solution.

Une fois la manche terminée : `/champion manche suivante`.

Pour le **4 à la suite**, faites d'abord `/champion manche configurer numero:2 qualifies:1 format:serie`, puis pour chaque candidat `/champion manche tour membre:@Candidat`. Il répond individuellement ; le bot lance les questions suivantes automatiquement jusqu'à 4 bonnes réponses consécutives ou l'épuisement des 40 secondes de révélation active. Le record consécutif sert de score ; les autres joueurs ne peuvent pas répondre pendant son tour.

Pour une **égalité à la dernière place qualificative**, tapez `/champion manche departager` : le buzzer de la question décisive est limité aux ex æquo.

La **finale** se gagne au premier à 12 points ; une réponse précoce rapporte jusqu'à 4 points.

## 4. Les questions

- La banque intégrée comporte **110 questions** dans 6 thèmes : Géographie, Histoire, Sciences, Culture, Sport, Nature.
- Les animateurs ajoutent des questions depuis Discord par `/champion question ajouter`. Le texte, la solution, le thème et les points sont enregistrés dans PostgreSQL.
- Le mode automatique exclut les questions créées par les candidats encore en jeu.
- Le mode oral fonctionne avec `texte` facultatif : sans texte, seul le buzzer est affiché et l'animateur lit la question dans le vocal.
- **Important pour l'équité :** si votre dépôt GitHub est PUBLIC, le fichier `banque.js` et ses solutions sont visibles par tous. Pour un tournoi compétitif, privilégiez des questions inédites stockées dans PostgreSQL via Discord ou un dépôt privé compatible avec votre hébergement.

## 5. Règles d'animation

- Vous ajoutez les joueurs manuellement : **aucun maximum arbitraire** pour la première manche. L'affichage des listes est paginé pour rester compatible avec Discord.
- Les nombres de qualifiés pour les manches 2 et 3 sont réglables indépendamment.
- Les questions écrites apparaissent par **5 mots toutes les 2 secondes**, sur le même message.
- Le premier buzzer reçu par le bot gagne le droit de répondre ; la latence Internet/Discord peut jouer.
- Le formulaire est uniquement accessible au joueur qui a buzzé ; sa réponse est publiée après envoi.
- **Le bot ne corrige jamais automatiquement.** L'animateur tranche.
- En cas de mauvaise réponse, pas d'élimination de cette question : reprise du texte et réouverture du buzzer, y compris pour le joueur qui vient de se tromper.
- L'animateur peut être candidat. S'il consulte la solution d'une question, il ne peut plus buzzer sur cette même question. Ses propres réponses sont verrouillées avant vérification ; un coanimateur reste préférable pour un arbitrage neutre.
- Plusieurs animateurs peuvent piloter la soirée ; seuls `OWNER_ID` peut les nommer/retirer.
- Les scores, questions ajoutées, animateurs et états sont en base. Après redémarrage, **la partie passe en pause** : `/champion partie reprendre`.

## 6. Supprimer l'ancien jeu DES BASES DE DONNÉES (FACULTATIF ET DÉFINITIF)

Le nouveau code n'utilise plus les anciennes tables. Vous pouvez les conserver sans dommage.

Si vous voulez **vraiment supprimer définitivement tous les dossiers de la Roue des problèmes**, après sauvegarde et vérification que ces tables ne sont pas utilisées par d'autres jeux, ouvrez **Neon > SQL Editor** et examinez le fichier `SUPPRESSION_ANCIEN_JEU_NEON.sql`. N'exécutez pas la suppression sans sauvegarde : elle est **IRRÉVERSIBLE sans restauration de la base**.

Ne supprimez PAS `champion_states` ni `champion_questions` : ce sont les nouvelles tables.

Les anciens messages Discord déjà publiés doivent être retirés manuellement du salon si vous souhaitez également nettoyer l'historique ; les anciens boutons ne fonctionneront plus.

## 7. Vérifications techniques réalisées

- Contrôle de syntaxe `node --check` de tous les fichiers JS : OK.
- Tests unitaires : progression des mots, droits buzzer, droits animateur, qualifications/égalités et points de finale : OK.
- **Non testé en direct** sur Discord, PostgreSQL Neon ou ecloudserv (pas de token ni d'accès à votre serveur). `npm install` nécessite un environnement avec accès aux dépendances.

Ce pack est une base utilisable mais doit être testé sur votre vraie installation avant une soirée publique.
