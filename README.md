# Fighters — Night Street

Prototype de **beat ’em up 2,5D** inspiré des classiques d'arcade à la Double Dragon : une héroïne, Nova, contre des adversaires masculins. Le jeu utilise uniquement des animations qui existent déjà dans les GLB Quaternius, sans retargeting sur des modèles tiers.

## Jouer

[Démo jouable sur le domaine du dépôt](https://www.streamlev.com/Fighters/)

- **Mobile, main gauche :** glisser dans une direction, puis garder le doigt posé pour continuer à avancer; lever le doigt stoppe le déplacement. Pas de pavé directionnel affiché.
- **Mobile, main droite :** tap = jab ; double/triple tap rapide = combo jab / cross / hook ; balayage horizontal = cross/hook ; balayage vers le bas = roulade ; vers le haut = saut ; appui long = garde tant que le doigt reste posé. Les combos se mettent en file pendant l'attaque courante.
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

Fonctionnalités : caméra latérale qui suit l'action, garde défensive, combos bufferisés, vagues d'ennemis, IA d'approche, fenêtres de contact, dégâts, vies, knockback, animations de réaction/de mort, KO, score et redémarrage.

**[Laboratoire des 86 animations par personnage](https://www.streamlev.com/Fighters/motion-lab.html)** : vue orbitale indépendante pour choisir entre Superhero Male et Superhero Female et examiner chaque animation, avec vitesse et scrubbing.

## Choix technique crucial

Le précédent Fighters était parti de Claudia, Carla et Realistic Man (trois rigs Sketchfab distincts), puis avait tenté d'y plaquer des animations Quaternius via une conversion d'axes et de poses de repos. Cette opération n'était pas garantie et avait produit des membres désalignés.

Ici, **les deux personnages et leurs 86 animations sont déjà assemblés** dans les GLB du projet [NafisRayan/Animate-Rigged-Humanoid-No-Blender](https://github.com/NafisRayan/Animate-Rigged-Humanoid-No-Blender), fondé sur [Quaternius Universal Base Characters](https://quaternius.itch.io/universal-base-characters) et les bibliothèques [UAL1](https://quaternius.itch.io/universal-animation-library) et [UAL2](https://quaternius.itch.io/universal-animation-library-2). L'héroïne utilise le GLB féminin, les ennemis sont des clones du GLB masculin **avec le même rig interne**.

Le kit contient des coups de poing et des gestes à l'épée, mais pas de vrai coup de pied sans retargeting. Le gameplay utilise donc jab, cross et hook; aucun « kick » factice.

- Source immuable : [commit 5821923](https://github.com/NafisRayan/Animate-Rigged-Humanoid-No-Blender/tree/5821923af517ac5fdc82505faa92a0d575fc1b1a/test).
- Masculin, Git blob SHA-1 : `ad6e0e84b934007d2bc89acf2ebb947a79738333`.
- Féminin, Git blob SHA-1 : `d3ebcbbcd14bb742b2962687640e36ee95977e3f`.
- Personnages et animations : Quaternius, licence CC0. Three.js : MIT.

## Développement et validations

La racine de la démo est `docs/index.html`. Le laboratoire de mouvements est `docs/motion-lab.html`. Aucun bundler nécessaire ; les modules Three.js 0.180.0 viennent de jsDelivr. Pour servir localement, lancer `python3 -m http.server 8000 --directory docs` et ouvrir http://localhost:8000 .

Le workflow GitHub Pages télécharge les deux GLB (~35 Mo chacun), compare leur SHA exact, vérifie glTF 2.0, les 86 clips, les squelettes et les cibles des canaux (`scripts/verify-glb.mjs`), puis incorpore les fichiers vérifiés à l'artefact Pages. Les gros binaires ne sont pas dupliqués dans l'historique Git.

Le workflow de QA navigateur teste le vrai canvas WebGL avec Chrome SwiftShader en CI et produit des captures pour la revue. Il utilise le laboratoire pour contrôler les animations séparément et la scène de jeu pour vérifier les contrôles.

**Limites honnêtes :** il s'agit d'un prototype de beat ’em up et non d'un jeu de production. La compatibilité structurelle des GLB n'est pas une preuve de qualité de tous les contacts, des poses de mains, des pieds au sol ni du ressenti du combat. La revue humaine des captures reste indispensable.