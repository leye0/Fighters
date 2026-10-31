# Fighters — registre des assets réellement utilisés

Le dépôt est public. Les ressources intégrées sont identifiées par nom, auteur, URL source, licence et attribution. Les modèles humains sont des candidats photoréalistes dont les **droits de redistribution et d’attribution** sont séparés des droits d’animation.

| Asset | Auteur | Source | Licence | Emplacement |
| --- | --- | --- | --- | --- |
| Claudia Rigged 002 | **Renderpeople** | [Sketchfab](https://sketchfab.com/3d-models/claudia-rigged-002-3d-rigged-business-women-c659bd0accab47c6bbe390cf822a2b92) | CC BY, tag NoAI ; attribution requise | `assets/source/characters/claudia/`, `public/models/claudia.glb` |
| Carla Rigged 001 | **Renderpeople** | [Sketchfab](https://sketchfab.com/3d-models/carla-rigged-001-rigged-3d-business-women-acf520f450d14dd799f98a6fede3edf5) | CC BY, tag NoAI ; attribution requise | `assets/source/characters/carla/`, `public/models/carla.glb` |
| Realistic Man basic rig | **J.azali** | [Sketchfab](https://sketchfab.com/3d-models/realistic-man-basic-rig-eaea58da1b3c4d4d9a75a68830959122) | CC BY ; attribution requise | `assets/source/characters/realistic-man/`, `public/models/realistic-man.glb` |
| Universal Animation Library Standard | **Quaternius** | [itch.io](https://quaternius.itch.io/universal-animation-library) | CC0 1.0 | 43 clips dans chacun des GLB |
| Universal Animation Library 2 Standard | **Quaternius** | [itch.io](https://quaternius.itch.io/universal-animation-library-2) | CC0 1.0 | 43 clips dans chacun des GLB |

Les trois archives Sketchfab brutes sont conservées dans le dépôt via Git LFS. Chaque dossier contient `ATTRIBUTION.md` et `audit.json` avec les empreintes de la source. Les GLB Web finaux conservent **les géométries, matériaux et squelettes authentiques**, adaptés par ajout des clips Quaternius. Les empreintes exactes des archives d’animation et les instructions reproductibles figurent dans [quaternius-pipeline.md](quaternius-pipeline.md).

**Statut :** 86 clips techniques vérifiés par modèle ; morphologie, rendu et timing des contacts **non approuvés visuellement**. L’intégration d’un modèle ou d’une animation ne constitue pas une autorisation d’utiliser son identité/scannage en dehors des droits accordés.

Les autres candidats éventuels sont enregistrés dans `assets/manifest.json` mais ne constituent pas des assets de jeu. Les futurs décors, effets et sons devront faire l’objet d’un audit de droits par fichier. Favoriser CC0 et respecter chaque attribution CC BY.
