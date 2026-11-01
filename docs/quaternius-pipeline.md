# Fighters — animation 3D automatisée et sans compte

**Sources d’animation de la démo :** les deux packs gratuits *Universal Animation Library [Standard]* et *Universal Animation Library 2 [Standard]* de **Quaternius**, sous **CC0 1.0**, plus deux mouvements de pied du projet **ACCAD / The Ohio State University** sous **CC BY 3.0** :

- [Universal Animation Library](https://quaternius.itch.io/universal-animation-library)
- [Universal Animation Library 2](https://quaternius.itch.io/universal-animation-library-2)
- [ACCAD — MoCap System and Data](https://accad.osu.edu/research/motion-lab/mocap-system-and-data) et [licence CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)

Le téléchargement est nécessaire pendant la fabrication des assets. **Le jeu lui-même ne contacte aucun service d’animation** : toutes les courbes sont contenues dans trois fichiers GLB autonomes, jouables hors ligne après mise en cache des fichiers du jeu.

## Fichiers de sources reproductibles

| Pack | Source figée | SHA-256 de l’archive ZIP | Fichiers intégrés |
| --- | --- | --- | --- |
| UAL1 | [Miroir de l’archive gratuite](https://github.com/MightyBubble/Ludots-Assets/blob/main/animations/Quaternius-Universal-Animation-Library-Standard.zip) | `cc73fc4e495b82958207316596317a3f40b9fa38065bde1027937452da537724` | `UAL1_Standard.glb` |
| UAL2 | [Miroir de l’archive gratuite](https://github.com/MightyBubble/Ludots-Assets/blob/main/animations/Quaternius-Universal-Animation-Library-2-Standard.zip) | `4008ea208a604773a2b2177d965f0f5d3195498b5bf838c3f5785d68e95f2a68` | `UAL2_Standard.glb` |
| ACCAD | [Archive officielle Male2_bvh.zip](https://accad.osu.edu/sites/accad.osu.edu/files/Male2_bvh.zip) | `f30dc56f8557d4b9f1bd6b8b0c4218c076471de0a9c1a20f3bc4a8b776cc14b1` | `Male2_G2_FrontKick.bvh`, `Male2_G9_RoundhouseRight.bvh` |

**Pourquoi ce miroir :** URL directe stable avec téléchargement non interactif sur GitHub Actions, empreinte figée et comparée avant extraction. La déclaration CC0 relève **des pages de l’auteur**, pas du miroir.

Les archives Standard contiennent chacune **43 actions nommées**, soit **86 CC0** au total. Deux kicks ACCAD **CC BY 3.0 avec attribution** sont ajoutés, pour **88 clips par personnage**. La publicité « 120+/130+ » de Quaternius couvre davantage que l’unique GLB Standard sélectionné ; Fighters documente le **nombre effectivement intégré**, pas le chiffre marketing.

## Conversion automatique

`.github/workflows/quaternius-animations.yml`, déclenché par un changement des outils sur `main` ou manuellement par le mainteneur :

1. Télécharge les trois ZIP publics sans compte, puis compare leurs SHA-256.
2. Extrait les deux GLB sources Standard et deux BVH ACCAD, puis charge les trois humains déjà présents sous `public/models/`.
3. `scripts/build-quaternius-animations.mjs` reconnaît les principaux os et orientations à partir des squelettes et des poses de repos. Il applique les **88 actions à chacun des squelettes propres** Claudia, Carla et Realistic Man. Pour le BVH, le premier frame de posture sert de référence anatomique automatique ; la vitesse des deux kicks est doublée pour le gameplay. Aucune géométrie ou texture de démonstration n’est transférée.
4. Retire les anciennes pistes d’animation, compacte les buffers inutilisés et écrit trois nouveaux GLB avec métadonnées `asset.extras.fightersMotionSource` et empreintes sources.
5. `scripts/check-quaternius-models.mjs` vérifie les licences/provenance distinctes, 88 noms, les canaux sur les joints réels, la présence de la peau, les proportions anatomiques et **36 poses 3D** par personnage.
6. Typecheck, tests, build Vite ; génération de `docs/site/` puis commit ciblé sur `main` des trois GLB, de l’audit et de la page.
7. Le workflow Pages publie les fichiers produits.

Aucun compte, navigateur, export manuel, rotation anatomique propre à un personnage ou ancien rig intermédiaire n’est requis. Un échec de validation interrompt la publication : il ne substitue pas un modèle ou clip factice.

## Réalisation locale

Installer Node.js 24 et `npm ci`, télécharger les trois ZIP exacts (voir le workflow et SHA ci-dessus), extraire les deux GLB sources et les BVH ACCAD choisis, puis :

```bash
node scripts/build-quaternius-animations.mjs /tmp/UAL1_Standard.glb /tmp/UAL2_Standard.glb /tmp/Male2_G2_FrontKick.bvh /tmp/Male2_G9_RoundhouseRight.bvh public/models /tmp/fighters-cc0
node scripts/check-quaternius-models.mjs /tmp/fighters-cc0
```

La sortie contient `claudia.glb`, `carla.glb`, `realistic-man.glb` et `quaternius-audit.json`. **Ne pas supprimer les modèles originaux CC BY et leurs attributions.** Seuls les binaires validés sont copiés vers le jeu.

## Contrôles et limitations

Les noms `UAL1_*` et `UAL2_*` couvrent marche, course, saut (départ/boucle/réception), coups, réactions et autres gestes. `ACCAD_Front_Kick` et `ACCAD_Roundhouse_Kick` sont de vrais gestes de pied issus du projet universitaire **Open Motion Project by ACCAD / The Ohio State University (CC BY 3.0)**. Les mouvements sont liés à l’animation Three.js des vrais rigs, indépendamment du monde à 60 Hz.

**Compatibilité expérimentale explicitement acceptée par Léon :** les deux coups ACCAD proviennent d'un **squelette BVH différent** de celui des trois modèles. Le retargeting automatique n'apporte **aucune garantie de compatibilité anatomique ou visuelle** : pieds déformés, pose anormale, glissement et contacts décalés restent possibles. Les 36 contrôles structurels par personnage ne prouvent ni la qualité perceptuelle, ni les pieds au sol, ni la lisibilité ou la jouabilité des coups. Les gestes F/G/H/I infligent des dégâts **dans la démo uniquement** selon des fenêtres provisoires ; ils ne deviennent pas des attaques de production approuvées sans revue visuelle. Voir [production-plan.md](production-plan.md) et [animation-first.md](animation-first.md).
