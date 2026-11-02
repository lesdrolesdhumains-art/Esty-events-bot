# 🥊 Mini-tournoi Brawlhalla — Maîtresse du Jeu

## À quoi sert ce module ?

Cette extension gère des **duels 1 contre 1**, et non des équipes de deux joueurs. Elle ajoute seulement **3 commandes pour animer une soirée**, une commande de classement, plus une commande de remise à zéro pour le tournoi suivant :

- `/brawl ajouter pseudo:Esty` : ajouter un pseudo au tournoi (à répéter pour chaque participant).
- `/brawl binomes` : tirer au sort les adversaires pour un nouveau tour. Chaque duel reçoit un numéro.
- `/brawl resultat duel:1 gagnant:Joueur 2 du duel` : indiquer qui a gagné ; +1 point au vainqueur, 0 au perdant. Le bot publie aussi le classement cumulé.
- `/brawl classement` : afficher le classement cumulé à tout moment.
- `/brawl reset confirmer:vrai` : effacer les inscrits, duels et résultats Brawlhalla pour une nouvelle compétition (**Esty seulement**).

À la fin du dernier duel d'un tour, le classement total est publié automatiquement. Pour un autre tour avec les mêmes joueurs, réutiliser `/brawl binomes` ; les scores continuent à s'accumuler.

### Exemple de tirage

🥊 **TOUR 1**

**Duel #1** · 1️⃣ Esty **VS** 2️⃣ Tropi

**Duel #2** · 1️⃣ Marmotte **VS** 2️⃣ Lévis

En cas de nombre impair de participants, une personne est exemptée pour ce tour (sans point gratuit). Le bot alterne les exemptions au fil des tours.

### Qui peut utiliser les commandes ?

La propriétaire (`OWNER_ID`) et les animateurs déjà configurés dans **Les Drôles de Champions** (`/champion animateur definir` ou `/champion animateur ajouter`). Il n'est pas nécessaire de créer un nouveau rôle Discord.

## Installation sur GitHub et ecloudserv

**Fais d'abord une sauvegarde du dépôt et de Neon.** Ne copie pas `.env` ou les secrets dans GitHub.

### Cas A — Les Drôles de Champions est déjà installé

Prends `MAITRESSE_DU_JEU_CHAMPIONS_BRAWLHALLA_MAIN_BOT_JS_CORRIGE.zip` (ou le correctif de démarrage uniquement si les deux jeux sont déjà installés). À la racine de ton dépôt GitHub :

1. **AJOUTE** `brawl.js`.
2. **REMPLACE** `bot.js` et `commands.js` par ceux du ZIP **seulement si** ton bot est encore exactement celui du pack `LES_DROLES_DE_CHAMPIONS_BOT_COMPLET.zip` : ces fichiers sont une version modifiée de ce pack. Si tu as changé le code depuis, compare les modifications pour ne rien perdre.
3. **REMPLACE** `index.js` et `package.json` par les versions corrigées, pour garder `MAIN_FILE=bot.js`. Conserve `champion-core.js`, `champion-db.js`, `banque.js`, `.env.example` et `.gitignore`.
4. Commit, redéploie, et regarde la console : `bot.js` démarre directement Champions **et** Brawlhalla. `index.js` reste un secours.

### Cas B — Tu n'as PAS encore installé Les Drôles de Champions

Prends `MAITRESSE_DU_JEU_CHAMPIONS_BRAWLHALLA_MAIN_BOT_JS_CORRIGE.zip`. C'est le pack Champions déjà fusionné avec le mini-tournoi. À la racine GitHub, remplace les anciens fichiers et ajoute les nouveaux comme l'indique le guide du pack complet. **N'écrase pas un autre jeu encore utile sans vérifier.**

### Démarrage (très important !)

**Ne change pas `MAIN_FILE` : la valeur doit rester `bot.js`.**

- `bot.js` lance Champions et Brawlhalla directement.
- `package.json` : `main: bot.js` et `npm start` lance `node bot.js`.
- `index.js` sert uniquement de secours si un ancien lanceur démarre dessus : il redirige vers `bot.js` même sous `ts-node --esm`.
- `database.init()` et `brawl.init()` créent ou vérifient leurs tables PostgreSQL avant la connexion Discord.

Dans les logs, recherche `🚀 Maîtresse du Jeu : lancement depuis bot.js`, `✅ Maîtresse du Jeu connectée`, puis `✅ /champion et /brawl synchronisés`.

Si la console affiche seulement `[DEP0180] fs.Stats`, ce n'est pas en soi une erreur du code ; vérifie que `MAIN_FILE=bot.js` et que le bon code GitHub est déployé sur le bon hébergement.

### Ce que le bot conserve

- Les données Brawlhalla sont stockées dans la nouvelle table PostgreSQL `brawl_tournaments`.
- Aucune ancienne donnée de la roue des problèmes n'est supprimée par cette extension.
- La table Champions est indépendante. `/brawl reset` ne touche pas aux autres jeux.

### Points importants

- Le bot **ne lit pas le résultat dans Brawlhalla** : l'animateur saisit le gagnant manuellement.
- Les pseudos sont du texte libre : inutile que les joueurs aient un compte Discord associé.
- Une même paire peut se retrouver dans les tours suivants si les autres combinaisons sont épuisées ; le tirage privilégie les adversaires encore non affrontés.
- Avant la soirée, fais un essai avec trois ou quatre pseudos fictifs et remets le tournoi à zéro.
- Ce pack a passé des contrôles de syntaxe et des tests du tirage et des scores, **mais n'a pas été déployé sur ton ecloudserv ni essayé sur Discord en direct**.
