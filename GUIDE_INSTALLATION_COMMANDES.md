# 🎡 Les problèmes d’Esty — version « roue uniquement »

## Ce que fait le bot

La roue affiche **« LES PROBLÈMES D’ESTY »**. Tous ses quartiers sont simplement décoratifs : **elle ne choisit plus entre Problème, Vérité et Gage**. Le clic réserve **un problème aléatoire** dans Neon/PostgreSQL, poste le GIF animé de la roue, puis poste le texte une fois le GIF arrêté (environ 3 secondes). La personne éventuellement désignée **dans le texte du problème** est affichée. Aucune désignation préalable d’un joueur n’est requise.

La base contient les problèmes créés avec `/probleme ajouter`, et non les 200 problèmes proposés en conversation, sauf si tu les as ajoutés toi-même. Les fichiers `catalogue.json` et `CATALOGUE_LISIBLE.txt` de l'ancienne version ne sont plus nécessaires et ne font pas partie du ZIP.

Les dossiers déjà révélés ne ressortent pas avant un **redémarrage manuel de la pioche**. Un redémarrage technique du bot n'efface pas l'historique des problèmes : il est en base de données.

## Installation après la finale de la Reine des Cœurs

1. Termine totalement la finale et conserve les réponses, notes et verdict si tu veux les archiver.
2. Fais une sauvegarde de ton dépôt GitHub actuel et, si possible, de ta base Neon.
3. Décompresse le ZIP et copie ses fichiers à la racine du dépôt GitHub (pas dans un sous-dossier). Remplace `bot.js`, `roue.js`, `wheel-db.js`, `db.js`, `commands.js`, `index.js` et `package.json` par ceux de cette archive.
4. Retire les modules devenus inutiles **`reine.js`, `reine-db.js`, `reine-finale.js`, `reine-finale-db.js`**, s'ils existent. L'ancien `bot.js` ne doit plus être utilisé après leur suppression. **Ne supprime pas `db.js`.** D'autres fichiers anciens de la Reine doivent aussi être retirés s'ils ont été ajoutés depuis ta dernière version.
5. **Ne supprime pas les tables Neon** : `problems` et les anciennes tables `rc_*` ne sont pas touchées par l'installation. L'ancienne `wheel_entries` (vérités et gages) n'est pas utilisée, mais n'est pas effacée automatiquement.
6. Sur ecloudserv, synchronise les fichiers depuis GitHub puis redémarre. Vérifie `MAIN_FILE=index.js` si ton panel démarre `index.js`, ou `MAIN_FILE=bot.js` si tu gardes ce démarrage. `npm start` pointe aussi vers `index.js`. Le mécanisme `if(require.main===module)` évite le double démarrage.
7. Conserve les variables d'environnement **`DISCORD_TOKEN`, `DATABASE_URL`, `GUILD_ID`, `OWNER_ID`, `ANIMATION_CHANNEL_ID`** (et éventuellement `ANNONCE_CHANNEL_ID`). Ne publie aucune de leurs valeurs.
8. Vérifie les logs de connexion, puis dans Discord tape `/roue statut` et `/roue installer`.

**Attention :** ne déploie pas ce `bot.js` avant la fin de la Reine des Cœurs : il ne contient plus ses commandes `/reine` et `/coeur`.

## Avant la soirée

- `/probleme ajouter` : ouvre le formulaire privé « Question / dossier », « Personne visée (facultatif) », « Envoyé par (facultatif) ». Valide pour enregistrer. Répète pour chaque problème.
- `/probleme liste` : affiche la première page de 15 dossiers et leurs identifiants.
- `/probleme liste page:2` : affiche la deuxième page ; pratique si tu as des centaines de problèmes.
- `/probleme voir id:12` : lit le dossier n° 12 en privé.
- `/probleme modifier id:12` : modifie le dossier via formulaire.
- `/probleme supprimer id:12` : supprime **définitivement** le dossier n° 12.
- `/roue statut` : vérifie le total, les problèmes à tirer et les problèmes déjà révélés.

## La soirée en trois commandes

**Une fois** : `/roue installer` pour publier le bouton dans `ANIMATION_CHANNEL_ID`.

**Optionnel** : `/roue acces mode:prive` pour que seule Esty puisse cliquer (par défaut), ou `/roue acces mode:tous` pour autoriser tous les membres.

**Puis**, tu cliques autant que tu veux sur le bouton **🎡 Faire tourner les problèmes**.

À chaque clic : GIF → arrêt → publication d'un problème pris au hasard. On discute en vocal ou à l'écrit ; personne n'est obligé de répondre. Les questions contenant des pseudos ne sont pas vérifiées automatiquement comme des mentions Discord : le texte affichera ce que tu as saisi dans le champ « Personne visée ».

Pour fermer à la fin : `/roue fermer`.

## Toutes les commandes « roue »

| Commande | Résultat |
|---|---|
| `/roue installer` | Installe ou actualise le panneau interactif. |
| `/roue statut` | Nombre de problèmes en attente, sélectionnés et révélés. |
| `/roue acces mode:prive` | Seule Esty peut tourner. |
| `/roue acces mode:tous` | Tous les membres peuvent tourner. |
| `/roue fermer` | Ferme les panneaux retrouvés dans les 100 derniers messages du salon. |
| `/roue aide` | Rappelle le mode d'emploi. |

**Commandes retirées :** `/roue designer`, `/roue verite-ajouter`, `/roue gage-ajouter`, `/roue liste`, `/roue voir`, `/roue supprimer`, `/roue reactiver`, `/roue pioche-reset`. Pour gérer les textes des problèmes, utilise `/probleme`.

## Toutes les commandes « problème »

| Commande | Résultat |
|---|---|
| `/probleme ajouter` | Nouveau problème enregistré en privé. |
| `/probleme liste [page:1]` | Affiche 15 dossiers par page. |
| `/probleme voir id:12` | Voir le dossier en privé. |
| `/probleme modifier id:12` | Modifier le dossier. |
| `/probleme supprimer id:12` | Supprimer définitivement le dossier. |
| `/probleme tirer` | Réserver un dossier sans l'afficher (mode manuel facultatif). |
| `/probleme reveler` | Publier le dossier déjà réservé (mode manuel facultatif). |
| `/probleme remettre` | Annuler la réservation du dossier avant publication. |
| `/probleme recommencer confirmation:RECOMMENCER` | Remet tous les dossiers dans la pioche **sans supprimer les textes**. |

Les commandes manuelles `tirer`, `reveler` et `remettre` sont **facultatives** : la roue fait le tirage et l'affichage automatiquement. Si un dossier avait été réservé manuellement avant l'utilisation de la roue, cette dernière révèle d'abord ce dossier sélectionné.

## Et les commandes `/animation` ?

Elles restent disponibles pour préserver les fonctionnalités indépendantes de l'ancien bot (annonce, QCM et messages), mais **elles ne servent absolument pas à la roue des problèmes**. Tu n'as pas à utiliser `/animation lancer` ou `/animation suivant` pour cette soirée. L'ancienne liste d'étapes a été vidée dans `index.js`.

## Dépannage

- **Rien ne s'affiche** : vérifie le salon `ANIMATION_CHANNEL_ID`, les permissions de lecture/envoi de fichiers/messages du bot et les logs ecloudserv.
- **Plus de problèmes** : utilise `/roue statut`, puis si tout est passé `/probleme recommencer confirmation:RECOMMENCER`.
- **Le bot démarre mais les commandes n'apparaissent pas** : vérifie `GUILD_ID`, les droits `applications.commands` et l'enregistrement dans les logs du bot.
- **Le bot ne démarre pas avec index.js** : vérifie que le ZIP complet est installé, que `MAIN_FILE=index.js` et que `index.js` inclut le secours `require('./bot.js')`.
- **Problème réservé mais non dévoilé après panne** : vérifie `/probleme liste` puis utilise `/probleme remettre` avant un nouveau tirage, si tu veux changer de dossier.
- **Anciens panneaux bloqués** : `/roue installer` met à jour les panneaux récents ; pour un très ancien message, supprime-le manuellement et réinstalle.

Les fichiers passent les contrôles de syntaxe et le GIF a été décodé avec succès. Un test simulé a vérifié le parcours « bouton → animation → problème », mais **aucune connexion réelle à Discord, ecloudserv ou Neon n'a été testée**.
