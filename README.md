# Fighters — Motion Lab

Expérience 3D de mouvements sur **deux personnages réellement compatibles** : Superhero Male et Superhero Female, tirés du kit Quaternius Universal Base Characters, avec 86 clips de Universal Animation Libraries 1 et 2 intégrés **dans chaque GLB**.

## Démonstration

- Page GitHub Pages, si la publication est activée : https://leye0.github.io/Fighters/
- Sélection entre deux personnages.
- Catalogue dynamique de 86 animations par personnage (marche, course, coups de poing, épée, réactions, emotes), filtre et recherche.
- Vue 3D orbitale, lecture/pause, vitesse, remise au début, scrubbing.
- Diagnostic affichant les clips et les pistes chargés.
- Les one-shots reviennent à Idle (sauf la mort, dont la pose reste visible).

Ouvrir localement : lancer `python3 -m http.server 8000` depuis la racine, puis aller à http://localhost:8000/docs/ . Le premier chargement a besoin d'Internet pour les bibliothèques JS et, si le dossier docs/models/ est absent, pour les modèles (~35 Mo chacun). La publication Pages télécharge et **vérifie** ces GLB avant de les incorporer aux fichiers servis. Les binaires de 70 Mo ne sont pas dupliqués dans l'historique git.

## Pourquoi ce kit, et pas un retargeting « universel » ?

Le précédent Fighters plaquait des mouvements Quaternius sur Claudia, Carla et Realistic Man (trois rigs Sketchfab distincts) via un algorithme de conversion maison. Les articulations étaient mal orientées malgré des vérifications structurelles trop permissives.

**Ici : pas de transfert de mouvement vers un rig différent**. Les GLB déjà préparés par le projet [NafisRayan/Animate-Rigged-Humanoid-No-Blender](https://github.com/NafisRayan/Animate-Rigged-Humanoid-No-Blender) incorporent les clips directement aux personnages Quaternius Base Characters. Le projet amont fournit lui-même un testeur Three.js des mêmes fichiers.

- Source exacte, commit figé : [5821923](https://github.com/NafisRayan/Animate-Rigged-Humanoid-No-Blender/tree/5821923af517ac5fdc82505faa92a0d575fc1b1a/test).
- Modèle masculin, Git blob SHA-1 : `ad6e0e84b934007d2bc89acf2ebb947a79738333`
- Modèle féminin, Git blob SHA-1 : `d3ebcbbcd14bb742b2962687640e36ee95977e3f`
- Bibliothèques d'origine : [UAL1](https://quaternius.itch.io/universal-animation-library), [UAL2](https://quaternius.itch.io/universal-animation-library-2), [Base Characters](https://quaternius.itch.io/universal-base-characters).
- Licence des personnages et animations : CC0 (Quaternius). Three.js : MIT.
- Attention : les deux bibliothèques possèdent chacune un clip nommé `A_TPose`. Le navigateur les identifie par **index**, donc les deux restent accessibles même si leur nom est identique.

## Vérification

La tâche Pages exécute `node scripts/verify-glb.mjs docs/models/human_male.glb docs/models/human_female.glb` avant toute publication. Elle vérifie le SHA Git exact des deux binaires, glTF 2, les meshes, squelettes, 86 clips, les mouvements requis, toutes les références de cibles et les samplers.

Cela établit une compatibilité **structurelle du kit exact**, pas une garantie absolue de qualité des poses, de collisions, d'absence de glissement au sol, ni de compatibilité avec n'importe quel autre personnage. Valider visuellement la marche, le jab, le cross, le hook, le sword combo et les réactions sur les **deux modèles** reste indispensable.

## Architecture

Aucune dépendance à installer : `docs/index.html` contient l'interface statique, importe Three.js 0.180.0 depuis jsDelivr, et lit les deux GLB déjà assemblés. `scripts/verify-glb.mjs` vérifie les fichiers en CI. La publication repose sur GitHub Pages et GitHub Actions.