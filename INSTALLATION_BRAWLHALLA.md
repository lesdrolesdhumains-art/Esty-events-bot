# 🥊 Mini-tournoi Brawlhalla — Maîtresse du Jeu

## À quoi sert ce module ?

Cette extension gère des **duels 1 contre 1**, et non des équipes de deux joueurs. Elle ajoute seulement **3 commandes pour animer une soirée**, plus une commande de remise à zéro pour le tournoi suivant :

- `/brawl ajouter pseudo:Esty` : ajouter un pseudo au tournoi (à répéter pour chaque participant).
- `/brawl binomes` : tirer au sort les adversaires pour un nouveau tour. Chaque duel reçoit un numéro.
- `/brawl resultat duel:1 gagnant:Joueur 2 du duel` : indiquer qui a gagné ; +1 point au vainqueur, 0 au perdant. Le bot publie aussi le classement cumulé.
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

Prends `AJOUT_BRAWLHALLA_AU_BOT_CHAMPION.zip`. À la racine de ton dépôt GitHub :

1. **AJOUTE** `brawl.js`.
2. **REMPLACE** `bot.js` et `commands.js` par ceux du ZIP **seulement si** ton bot est encore exactement celui du pack `LES_DROLES_DE_CHAMPIONS_BOT_COMPLET.zip` : ces fichiers sont une version modifiée de ce pack. Si tu as changé le code depuis, compare les modifications pour ne rien perdre.
3. **CONSERVE** `index.js`, `package.json`, `champion-core.js`, `champion-db.js`, `banque.js`, `.env.example` et `.gitignore`.
4. Commit, redéploie, et regarde la console : `index.js` démarre `bot.js`, qui démarre maintenant Champions **et** Brawlhalla.

### Cas B — Tu n'as PAS encore installé Les Drôles de Champions

Prends `BOT_COMPLET_CHAMPIONS_ET_BRAWLHALLA.zip`. C'est le pack Champions déjà fusionné avec le mini-tournoi. À la racine GitHub, remplace les anciens fichiers et ajoute les nouveaux comme l'indique le guide du pack complet. **N'écrase pas un autre jeu encore utile sans vérifier.**

### Démarrage (très important !)

Le fichier de démarrage **reste `index.js`**, qui appelle `require('./bot.js')` lorsqu'il est exécuté directement :

```bash
node index.js
```

Dans `package.json`, `npm start` exécute aussi `node index.js`. N'ajoute pas une deuxième connexion Discord. Dans `bot.js` :

- `await database.init();` est suivi de `await brawl.init();`.
- `/brawl` est ajouté à l'enregistrement des commandes Discord, sans supprimer `/champion`.
- Le bot traite aussi les interactions `/brawl`.

Tu devrais voir dans la console : `✅ /champion et /brawl synchronisés`.

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
