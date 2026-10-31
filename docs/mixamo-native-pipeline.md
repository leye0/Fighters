# Fighters — Mixamo natif, sans retargeting maison

## Objectif

Adobe Mixamo doit animer DIRECTEMENT le personnage FBX riggé. Blender regroupe ensuite sept animations propres à ce même personnage sur un seul squelette. Aucune correction angulaire des bras, aucun transfert depuis YBot. Cette étape logiciel est en préparation et testée sur des données synthétiques, mais le service Adobe n'a pas encore validé Claudia.

## A. Export originaux terminé

[Action GitHub vérifiée](https://github.com/leye0/Fighters/actions/runs/41151779894) et [archive des trois FBX originaux](https://github.com/leye0/Fighters/actions/runs/41151779894/artifacts/13023780748).

Claudia et Carla : 89 os et 1 mesh skinné; Realistic Man : 34 os et 3 meshes skinnés. Les poids, matériaux et textures survivent au réimport FBX local.

## B. Animation dans Mixamo, une seule fois par personnage

1. Ouvrir https://www.mixamo.com/ avec une session Adobe et téléverser claudia.fbx par Upload Character.
2. Visualiser une marche de face, de profil et de dos. Arrêter si épaules, coudes, poignets ou poids de skinning sont incorrects. Aucun test numérique ne remplace cette étape.
3. Télécharger pour CLAUDIA (et non YBot) les sept mouvements voulus en FBX With Skin, de préférence In Place et 30 FPS lorsque l'option existe. Tous doivent provenir de la même importation de personnage.
4. Renommer les sept fichiers de manière exacte, en vérifiant que le contenu correspond réellement au mouvement :
   - Fighting_Idle.fbx
   - Walking_21.fbx
   - Walking_6.fbx
   - Walking_Backwards.fbx
   - Left_Turn_3.fbx
   - Jump.fbx
   - Falling_Idle.fbx

L'accès Adobe requiert une session connectée : GitHub Actions ne fournit pas une connexion Mixamo. Ne pas téléverser de FBX téléchargés de Mixamo dans le dépôt public sans validation de la licence.

## C. Intégration en une commande

Dans le dépôt Fighters, avec Blender et Python, placer les sept FBX dans un seul dossier privé puis exécuter :

    bash scripts/build-native-mixamo.sh /private/fighters/claudia-fbx /private/fighters/claudia-native.glb

Cette commande ne publie rien et refuse d'écraser un fichier. Elle vérifie :
- les sept fichiers et le même rig avec mêmes noms d'os, parents et poses de repos;
- au moins 15 articulations réellement animées par clip;
- la suppression des translations/scales de l'animation : la physique autoritaire conserve le déplacement;
- sept noms de clips compatibles avec le moteur Fighters, sept pistes réelles et pas d'animations parasites Blender;
- l'intégrité binaire GLB et le marqueur de provenance same-rig-mixamo-fbx-v1.

Les scripts principaux sont scripts/assemble-native-mixamo.py, scripts/check-native-mixamo-glb.py et scripts/inspect-runtime-glb.py.

## D. Visualisation locale avant publication

La page https://www.streamlev.com/Fighters/site/native-mixamo-review.html ouvre un GLB de l'appareil directement en mémoire. Le fichier n'est pas envoyé à un serveur. Le visualiseur offre les clips, les cinq angles, la lecture/pause, un curseur d'image et le squelette superposé.

Regarder précisément bras, épaules, coudes, poignets, appuis, saut et demi-tour sur plusieurs moments. Ne remplacer les GLB actuels de Fighters qu'après cette inspection et un contrôle du jeu WebGL avec les nouveaux modèles.

## E. Tests techniques, sans surpromesse

Le workflow de préparation exporte à nouveau les trois FBX originaux, réimporte ceux-ci à froid et crée des fixtures temporaires de sept mouvements SYNTHÉTIQUES pour tester toute la mécanique sans session Adobe. Les fixtures sont utilisées sur Claudia et le modèle masculin pour couvrir deux types de rigs. Les tests négatifs doivent rejeter un fichier manquant et un autre squelette.

Ces animations synthétiques ne prouvent PAS le fonctionnement de Mixamo sur Claudia, ne sont pas des clips Mixamo et ne sont pas intégrées au jeu publié. Elles ne doivent jamais être partagées comme des animations de production. Le verdict visuel du service Adobe est encore indispensable.
