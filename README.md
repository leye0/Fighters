# Fighters — Night Street

Prototype de **beat ’em up 2,5D** inspiré des classiques d'arcade à la Double Dragon : Nova coiffée et habillée en paysanne contre des adversaires masculins portant différentes couleurs de vêtements civils médiévaux. Aucune armure. Le jeu réutilise les animations intégrées aux GLB Quaternius. Pour le coup de pied absent du kit standard, il utilise un mouvement procédural appliqué directement aux os de la jambe du personnage, sans retargeting vers un modèle tiers.

## Jouer

[Démo jouable sur le domaine du dépôt](https://www.streamlev.com/Fighters/)

- **Mobile, main gauche :** glisser dans une direction, puis garder le doigt posé pour continuer à avancer; lever le doigt stoppe le déplacement. Pas de pavé directionnel affiché.
- **Mobile, main droite :** gestes de 8 directions, reconnus dès le mouvement (pas besoin de lever le doigt) :
  - **↑** : saut immédiat dès un geste bref de 20 pixels; un saut peut interrompre un coup.
  - **↖ / ↗** : coups de poing hauts (jab rapide / cross puissant), **y compris en l’air** avec mélange additif des animations du haut du corps.
  - **← / →** : coups de poing au corps (rapide / puissant, avec fenêtres de récupération différentes).
  - **↙ / ↘** : coups de pied gauche / droit (plus de portée, mais plus de récupération), aussi possibles pendant un saut.
  - **↓ tenu** : garde qui absorbe environ 80 % des dégâts frontaux. **↓ bref** : roulade d'esquive.
  - **Tap**, **double/triple tap** : combo automatique jab / cross / hook. **Appui long**, même sans glisser : garde tant que le doigt reste posé.
- Les coups s'enchaînent via une courte file d'attente, mais chaque attaque crée une fenêtre de vulnérabilité : choix entre portée, vitesse et défense.
- **Clavier : flèches ou WASD** : déplacement horizontal et profondeur de rue.
- **J** : jab (Punch_Jab).
- **K** : cross (Punch_Cross).
- **L** : hook (Melee_Hook).
- **Espace** : saut (Jump_Start / Jump_Loop / Jump_Land).
- **Shift** : esquive roulée (Roll).
- **Q maintenu** : garde (réduit les dégâts de face).
- **P** : pause.
- Gestes tactiles sans boutons dessinés par-dessus le jeu, et premiers contrôles de manette.

La simulation avance par pas fixes de 1/60 s, avec rattrapage borné des images lentes, afin que la durée des déplacements et fenêtres de coups ne dépende pas directement des FPS.

Affichage : **plein écran sans en-tête ni panneaux externes**. Le HTML et le body sont verrouillés en position fixe et sans débordement; aucun scroll, pinch-zoom, double-tap zoom, sélection ou menu de copie sur la scène. Seul le HUD minimal de vie/score et le contrôle discret de pause restent sur l'image de jeu.

Nova se déplace et combat **45 % plus rapidement** : vitesse au sol, vitesse de ses clips d'animation, synchronisation des impacts, récupération, sauts et roulades. Les ennemis conservent leur vitesse d'origine. Cette distinction est vérifiée dans le QA navigateur.

Fonctionnalités : caméra latérale qui suit l'action, garde défensive, combos bufferisés, vagues d'ennemis, IA d'approche, fenêtres de contact, dégâts, vie rechargée entre les rounds, recul, animations de réaction/de mort, KO, score et redémarrage.

**[Laboratoire des 86 animations par personnage](https://www.streamlev.com/Fighters/motion-lab.html)** : vue orbitale indépendante pour choisir entre Superhero Male et Superhero Female et examiner chaque animation, avec vitesse et scrubbing.

## Vêtements civils et coiffures Quaternius

- Vêtements : **Female Peasant** et **Male Peasant**, sans armure, issus du kit CC0 officiel [Modular Character Outfits – Fantasy](https://quaternius.itch.io/modular-character-outfits-fantasy).
- Coiffures : **Hair Buns** châtain sur Nova, **Hair Buzzed / Simple Parted** de différentes couleurs sur les adversaires, tirées du kit [Universal Base Characters](https://quaternius.itch.io/universal-base-characters).
- Les cinq GLB modulaires proviennent du kit Quaternius CC0 (distribué aussi par [PixelTriks](https://www.pixeltriks.com/browse?pack=quaternius-modular-outfits-fantasy)). Le déploiement utilise une copie déjà publiée en secours et vérifie systématiquement chaque SHA-256.
- **Même ordre de 65 os** pour tous les modèles. La tenue et les cheveux féminins partagent exactement les matrices de skinning de Nova. La tenue masculine a une légère différence de pose de repos; les deux ont été contrôlées en rendu WebGL.
- Le moteur conserve la tête et les yeux d’origine et ne rend plus le corps situé sous les vêtements afin d’éviter que la peau traverse le tissu. Toutes les pièces sont attachées au squelette déjà animé du personnage.

## Attaques aériennes

Le saut dure environ une seconde pour laisser le temps d’enchaîner un geste offensif. Le poing aérien mélange les animations Quaternius du haut du corps avec le saut et corrige la trajectoire de la main selon le sens du personnage, même en se retournant en l’air. Le coup de pied pivote brièvement le corps et déploie rapidement la jambe sur le rig natif. Aucune animation étrangère n’est retargetée. L’attaque aérienne ajoute un petit bonus de dégâts et de portée; lancer un saut pendant un coup au sol l’interrompt. La barre de vie revient à 100 % au début de chaque nouveau round.

## Armes — état de compatibilité (sans intégration)

Les deux fichiers `human_male.glb` et `human_female.glb` contiennent **sur leurs propres 65 os** les clips de combat `Sword_*` et `Pistol_*` des bibliothèques Standard Quaternius. Le vérificateur `scripts/verify-glb.mjs` impose maintenant la présence des 11 clips d'épée et des 6 clips de pistolet dans **chacun** des GLB déjà épinglés par SHA. Il ne valide pas la géométrie d'une arme ni son point de préhension.

**Exemple de sockets à étudier, pas encore homologué pour Nova :** [asset-tooling — humanoid-sockets](https://github.com/moritzbrantner/asset-tooling/blob/main/docs/humanoid-sockets.md), avec [descripteur de sockets féminin](https://github.com/moritzbrantner/asset-tooling/blob/main/assets/descriptors/humanoid.ranger.female.sockets.json) et [calcul des prises à partir des os de la main](https://github.com/moritzbrantner/asset-tooling/blob/main/examples/weapons/derive-sockets.ts). Cet exemple s'applique au Ranger Quaternius composé et n'a **pas** été validé bit à bit contre la pose de repos de notre `Superhero_Female` ni avec les modèles d'épée et de pistolet que nous retiendrions. Le simple nom `hand_r` ne suffit pas à prouver qu'une arme est correctement tenue dans tous les clips.

**Barrière d'intégration :** utiliser un modèle d'arme existant avec grip défini, prouver le matching du rig et des matrices de repos (ou récupérer un exemple réellement monté sur ce même GLB), puis vérifier visuellement des poses des clips natifs : repos, attaque et garde pour l'épée; repos, visée, tir et rechargement pour le pistolet. Aucun placement au hasard, aucun retargeting et aucun mouvement de main créé pour les armes. Les fusils longs ne sont pas couverts par des clips dédiés identifiés dans nos 86 animations.

## Choix technique crucial

Ici, **les deux personnages et leurs 86 animations sont déjà assemblés** dans les GLB du projet [NafisRayan/Animate-Rigged-Humanoid-No-Blender](https://github.com/NafisRayan/Animate-Rigged-Humanoid-No-Blender), fondé sur [Quaternius Universal Base Characters](https://quaternius.itch.io/universal-base-characters) et les bibliothèques [UAL1](https://quaternius.itch.io/universal-animation-library) et [UAL2](https://quaternius.itch.io/universal-animation-library-2). L'héroïne utilise le GLB féminin, les ennemis sont des clones du GLB masculin **avec le même rig interne**.

Le kit contient des poings et des gestes à l'épée, mais **aucun clip de coup de pied standard**. Pour répondre aux contrôles ↙ / ↘, le prototype produit un kick original avec rotation calculée des os `thigh_l/thigh_r` en coordonnées mondiales, convertie dans le repère local du squelette courant. C'est un mouvement **procédural sur le même rig**, et non une animation Quaternius préfabriquée; son apparence doit être jugée sur les captures QA et en jeu, sans promesse de perfection.

- Source immuable : [commit 5821923](https://github.com/NafisRayan/Animate-Rigged-Humanoid-No-Blender/tree/5821923af517ac5fdc82505faa92a0d575fc1b1a/test).
- Masculin, Git blob SHA-1 : `ad6e0e84b934007d2bc89acf2ebb947a79738333`.
- Féminin, Git blob SHA-1 : `d3ebcbbcd14bb742b2962687640e36ee95977e3f`.
- Personnages et animations : Quaternius, licence CC0. Three.js : MIT.

## Développement et validations

La racine de la démo est `docs/index.html`. Le laboratoire de mouvements est `docs/motion-lab.html`. Aucun bundler nécessaire ; les modules Three.js 0.180.0 viennent de jsDelivr. Pour servir localement, lancer `python3 -m http.server 8000 --directory docs` et ouvrir http://localhost:8000 .

Le workflow GitHub Pages télécharge les deux GLB (~35 Mo chacun), compare leur SHA exact, vérifie glTF 2.0, les 86 clips, les squelettes et les cibles des canaux (`scripts/verify-glb.mjs`), puis incorpore les fichiers vérifiés à l'artefact Pages. Les gros binaires ne sont pas dupliqués dans l'historique Git.

Le workflow de QA navigateur teste le vrai canvas WebGL avec Chrome SwiftShader en CI et produit des captures pour la revue. Il utilise le laboratoire pour contrôler les animations séparément et la scène de jeu pour vérifier les contrôles.

**Limites honnêtes :** il s'agit d'un prototype de beat ’em up et non d'un jeu de production. La compatibilité structurelle des GLB n'est pas une preuve de qualité de tous les contacts, des poses de mains, des pieds au sol ni du ressenti du combat. La revue humaine des captures reste indispensable.