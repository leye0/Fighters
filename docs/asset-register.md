# Registre des ressources — Fighters

**Dernière recherche :** 29 octobre 2026. Ce fichier inventorie des **sources et candidats**, pas des assets déjà inclus dans le jeu.

## États

- **Candidat** : page repérée, description/licence annoncée relevée ; pas encore téléchargé, audité ou approuvé.
- **Licence vérifiée** : conditions de l'asset précis, attribution, droits et diffusion examinés.
- **Intégré** : fichier autorisé, optimisé, retargeté/testé, ajouté à la chaîne de build et crédité.

**Règle stricte :** aucun fichier brut tiers n'est publié ici tant que son droit de redistribution dans un dépôt GitHub public n'a pas été validé. Une licence CC BY oblige notamment à attribuer l'auteur et à signaler les adaptations. Les vidéos/jeux autorisés par Adobe ne rendent pas automatiquement les fichiers Mixamo redistribuables séparément.

## Personnages réalistes — candidats identifiés

| ID | Modèle / auteur | Source | Licence annoncée | Rig / qualité annoncés | Statut |
| --- | --- | --- | --- | --- | --- |
| CHAR-CAND-001 | Human 3D model scanned with iPhone X — **in3D** | [Sketchfab](https://sketchfab.com/3d-models/human-3d-model-scanned-with-iphone-x-73e467dfc8a04914bb314a9410077858) | CC BY | Humain scanné, textures réalistes, riggé et animé | Candidat |
| CHAR-CAND-002 | Rigged T-Pose Human Male w 50 Face Blendshapes — **Mike Alger** | [Sketchfab](https://sketchfab.com/3d-models/rigged-t-pose-human-male-w-50-face-blendshapes-cc7e4596bcd145208a6992c757854c07) | CC BY | Scan riggé, 50 blendshapes ; textures PBR à enrichir | Candidat |
| CHAR-CAND-003 | Realistic man basic rig — **J.azali** | [Sketchfab](https://sketchfab.com/3d-models/realistic-man-basic-rig-eaea58da1b3c4d4d9a75a68830959122) | CC BY | Homme réaliste annoncé riggé avec textures | Candidat |
| CHAR-CAND-004 | Human Models Set Male/Female (Rigged) — **lzyassoul** | [Sketchfab](https://sketchfab.com/3d-models/human-models-set-malefemale-rigged-7311fcfdc03e4234900eeced42a1e669) | CC BY | Base mesh homme/femme riggé ; base de personnalisation, pas prêt photoréal | Candidat |
| CHAR-CAND-005 | Rigged Clothed Body — **Abduleleah Alshreef** | [Sketchfab](https://sketchfab.com/3d-models/rigged-clothed-body-9998b92d12554d67a2788aaf05e66729) | CC BY | Corps vêtu riggé ; qualité à inspecter | Candidat |

Les informations de licence ci-dessus sont **affichées sur les pages sources au moment de la recherche**, et ne constituent **pas** un audit des fichiers et des droits à l'image. Les personnages scannés exigent une vigilance supplémentaire sur le consentement de la personne représentée. Le cas échéant, privilégier les modèles générés.

## Génération de personnages CC0

| Source | Usage | Statut |
| --- | --- | --- |
| [MakeHuman Community / MPFB](https://www.makehumancommunity.org/about/license.html) | Générer des humains, variations morphologiques, rigs et textures ; assets de base/export CC0 selon leurs conditions | Source documentée ; workflow à tester |
| [MPFB — présentation](https://static.makehumancommunity.org/mpfb/about.html) | Génération dans Blender, rigging IK/FK et matériaux peau/yeux | Source documentée ; rendu à comparer |
| [Adobe Mixamo](https://www.mixamo.com/) | Personnages et rigging bipède, animations réutilisables dans un jeu | Source documentée ; catalogue et limites de distribution à étudier |

Important : les **assets de base** MakeHuman/MPFB sont CC0 selon le fournisseur ; les téléchargements communautaires et vêtements tiers doivent être inspectés individuellement. Le **code** des outils possède une licence différente.

## Décors et matériaux

| Source | Type | Licence indiquée | Statut |
| --- | --- | --- | --- |
| [Poly Haven](https://polyhaven.com/license) | HDRI, modèles, surfaces PBR | CC0 | Source vérifiée ; modèles spécifiques à sélectionner |
| [ambientCG](https://ambientcg.com/) | Matériaux PBR et environnements | Vérifier la fiche de chaque ressource | À auditer |

## Effets sonores

| Source | Type | Statut |
| --- | --- | --- |
| [Freesound](https://freesound.org/help/faq/) | Impacts, corps, souffle, pas, ambiance, combat | Catalogue à sélectionner ; privilégier CC0 et documenter toute CC BY |

## Catalogue Mixamo à constituer

Le catalogue détaillé des **mouvements recherchés** se trouve dans [production-plan.md](production-plan.md), section 8.

Pour chaque clip retenu, relever : ID source, nom original, famille (locomotion / poing / pied / garde / réaction / projection / KO / victoire), référence du rig, durée, bouclage, in-place/root motion, frame de contact, retargeting, qualité, droits et emplacement de stockage autorisé.

Ne pas archiver en masse les FBX bruts Mixamo dans le dépôt public sans fondement de redistribution.

## Champs obligatoires pour une ressource intégrée

- Identifiant stable (ex. CHAR-001 / ANIM-001 / STAGE-001 / SFX-001).
- Auteur, plateforme, titre et URL précise de l'asset.
- Date de collecte, licence/version, lien du texte de licence et preuve archivée si possible.
- Usage commercial, droit de modification, droit de redistribution de la source brute et du dérivé dans le jeu.
- Attribution requise, texte de crédit et statut de droit à l'image.
- Hash SHA-256, taille, formats source/export, nombre de triangles/bones/animations/textures.
- Procédé de conversion/retargeting et test visuel effectué.
- État : candidat / licence vérifiée / intégré / rejeté.

Le manifeste machine-readable complémentaire est **assets/manifest.json**. Aucun modèle ni son n'est encore intégré dans le dépôt.
