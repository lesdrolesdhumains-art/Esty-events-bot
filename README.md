# 👑 Esty Events Bot — Les Drôles d'Humains

Bot Discord Node.js **semi-automatique** : Esty choisit quand annoncer, démarrer, avancer, clore les QCM et révéler les dossiers secrets.

## 📁 Organisation

- **`index.js`** : SEUL fichier à remplacer pour adapter la soirée (titre, annonce, introduction, étapes et conclusion).
- `bot.js` : moteur Discord, formulaires privés, tirage, votes, résultats et commandes.
- `db.js` : base PostgreSQL qui conserve les dossiers, votes et état de la session, même après redémarrage.
- `commands.js` : définition des commandes slash.
- `package.json` : dépendances et commande `npm start`.
- `.env.example` : noms des variables à configurer chez l'hébergeur (pas de secrets sur GitHub).
- `.gitignore` : empêche de mettre les secrets locaux dans Git.

## 🔑 1. Créer l'application Discord

1. Ouvre https://discord.com/developers/applications et crée une **New Application** : `Esty Events`.
2. Section **Bot** : récupère le token et garde-le **privé**. Si tu le divulgues, régénère-le.
3. Section **Installation / OAuth2** : installe le bot sur le serveur LDH avec les scopes `bot` et `applications.commands`.
4. Donne-lui les permissions **View Channels**, **Send Messages**, **Read Message History** et **Embed Links** (les autres ne sont pas nécessaires pour la V1).
5. Active le *mode développeur* de Discord, puis copie : l'ID du serveur LDH, ton ID utilisateur, l'ID du salon d'animation et celui des annonces.
6. Inutile d'activer *Message Content Intent* : ce bot ne lit pas les MP automatiquement. **Tu recopies les dossiers reçus en MP via la commande privée.**

## ☁️ 2. GitHub

1. Crée un dépôt `esty-events-bot` (idéalement public **sans données sensibles** ; jamais de token dedans).
2. Décompresse l'archive fournie et **envoie tous les fichiers de son dossier** à la racine du dépôt. Si tu es sur iPhone, l'application *Fichiers* peut décompresser le ZIP ; tu peux utiliser Safari pour GitHub en mode ordinateur si besoin.
3. À chaque nouvelle animation, remplace **uniquement `index.js`** sur GitHub puis redéploie.

## 🗄️ 3. PostgreSQL chez ecloudserv

1. Dans ecloudserv, ouvre la partie **Bases de données** et crée une base PostgreSQL.
2. Récupère l'URL de connexion (format `postgresql://...`).
3. Configure une variable secrète `DATABASE_URL` sur le service. **Ne l'ajoute jamais sur GitHub.**
4. ecloudserv documente les sauvegardes automatiques des bases gérées ; fais aussi une exportation de secours avant les soirées importantes.

## 🚀 4. Hébergement chez ecloudserv

1. Crée un service / conteneur **Node.js 20+** sur https://panel.ecloudserv.fr.
2. Relie ton dépôt dans **Projets → Nouveau projet**, sélectionne la branche `main`, et le conteneur cible. La documentation de déploiement Git indique actuellement que les projets liés prennent en charge les dépôts **publics**. Vérifie le choix si tu préfères un dépôt privé.
3. Si demandé, commande d'installation : `npm install`. **Commande de démarrage : `npm start`** (ou `node bot.js`). Attention : `index.js` n'est pas le lanceur, c'est le fichier de l'animation !
4. Ajoute les variables d'environnement :
   - `DISCORD_TOKEN` = token privé du bot
   - `GUILD_ID` = ID du serveur LDH
   - `OWNER_ID` = ton ID Discord
   - `ANIMATION_CHANNEL_ID` = ID salon où le bot anime
   - `ANNONCE_CHANNEL_ID` = ID salon annonces (facultatif ; sinon utilise le salon d'animation)
   - `DATABASE_URL` = URL de la base PostgreSQL
5. Lance le service. Dans la console tu dois lire `Base PostgreSQL prête` puis `Esty Events connecté`, puis `Commandes synchronisées`.
6. Si les commandes ne s'affichent pas, vérifie l'invitation du bot, les scopes `applications.commands` et son accès au serveur.

## 💌 5. Réception des problèmes secrets

Les membres t'envoient leurs questions en MP. Tu fais :

- `/probleme ajouter` : formulaire privé avec question, personne visée et expéditeur facultatifs.
- `/probleme liste` : 15 derniers dossiers, leur numéro et état.
- `/probleme voir id:...` : consulter la question complète.
- `/probleme modifier id:...` : correction privée.
- `/probleme supprimer id:...` : suppression définitive.
- `/probleme tirer` : choix aléatoire parmi les dossiers **jamais révélés** ; visible par toi seule.
- `/probleme reveler` : publication du dossier sélectionné dans le salon d'animation.
- `/probleme remettre` : retour du dossier tiré dans la pioche (non publié).

Les dossiers restent dans PostgreSQL lors des mises à jour de `index.js`. Un dossier révélé est marqué pour ne pas ressortir au prochain tirage. Les expéditeurs ne sont **jamais affichés publiquement** par défaut.

## 🎡 6. Animer la soirée

- `/animation annonce` : publie l'annonce écrite dans `index.js`.
- `/animation lancer` : message d'introduction et remise au début du scénario.
- `/animation suivant` : poste la prochaine étape de `index.js`.
- `/animation qcm` : questionnaire improvisé dans un formulaire privé (2 à 4 choix).
- `/animation resultats` : clôture le QCM, désactive ses boutons et annonce les votes et pourcentages.
- `/animation message` : message spontané, publié dans le salon par le bot.
- `/animation pause`, `/animation reprendre`, `/animation statut`, `/animation terminer`.

Les boutons permettent **un vote actif par membre et par QCM**, modifiable jusqu'à la clôture. Les votes restent enregistrés si le bot redémarre, et les boutons des QCM publiés précédemment continuent de fonctionner jusqu'à clôture.

## 🔐 Vie privée et limites V1

- Toutes les commandes de gestion sont vérifiées côté serveur : **seul `OWNER_ID`** y a accès. Les résultats des commandes et les formulaires sont privés.
- Les membres peuvent voter via les boutons des QCM dans le salon.
- Aucun MP de membre n'est lu automatiquement par le bot : c'est Esty qui saisit le texte.
- Ne conserve pas de confidences sensibles, d'adresses ou de données personnelles intimes dans les dossiers ; demande le consentement des participants et conserve la possibilité de passer une question.
- Les dossiers sont stockés en clair dans la base : protège l'accès ecloudserv et évite les captures d'écran non consenties.
- `index.js` est chargé au démarrage : il faut **redéployer / redémarrer** après son remplacement. Termine la session avant de changer de jeu pour éviter de reprendre au milieu d'un nouveau scénario.
- Cette V1 ne programme pas encore d'annonces automatiques à date/heure ; elles sont lancées manuellement pour garder la main à Esty.

## 🛠️ Test facultatif sur ordinateur

Avec Node.js >=20 installé : copier `.env.example` vers `.env`, renseigner les valeurs **localement** puis exécuter `npm install` et `npm start`. Le projet n'inclut aucun vrai identifiant.

## Docs officielles

- https://docs.ecloudserv.fr/deploiement
- https://docs.ecloudserv.fr/bases-de-donnees
- https://discordjs.guide/
