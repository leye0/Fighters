# Fighters 🥊

Jeu de combat **2,5D photoréaliste pour le Web** : combats rapides vus de côté, personnages et arènes en 3D, contrôles classiques, combos, coups spéciaux, ambiance sonore et effets cinématiques.

> Projet original inspiré des conventions des jeux de combat arcade, sans reprendre les personnages, marques, graphismes, sons ni interfaces protégés d'autres jeux.
>
> **Statut : projet non commercial pour le moment**, dépôt GitHub public. Les droits de redistribution des ressources tierces restent à vérifier.

## Feuille de route

➡️ **[Plan de production détaillé et cases à cocher](docs/production-plan.md)**

Le plan couvre l'intégralité du produit : moteur de combat déterministe, rendu WebGL 2, personnages, rigging, animations Mixamo, arènes, HUD, audio, contrôles, modes, IA, multijoueur, performances, tests, accessibilité, déploiement et provenance des ressources.

## Principes

- **Production dès le départ**, pas de prototype jetable ni de « MVP ».
- **Tous les changements directement sur `main`** ; pas de branche de fonctionnalité ni de pull request.
- Qualité vérifiée avant chaque commit ; tests automatisés ciblés et reproductibles.
- Séparation stricte entre simulation de combat, animations visuelles, rendu 3D et interface.
- Système extensible et piloté par des données : combattants, coups, animations, arènes et effets.
- 60 Hz pour la simulation ; objectif 60 FPS à l'affichage sur les configurations prises en charge.
- Ressources réalistes sous licences compatibles : traçabilité obligatoire et aucune redistribution illégitime de fichiers tiers.

## Orientation technique initiale

- **TypeScript + Vite + Three.js (WebGL 2)** ; architecture permettant d'évaluer WebGPU ensuite.
- **Caméra latérale 2,5D** : déplacement sur un plan de combat, géométrie et éclairage entièrement 3D.
- **glTF/GLB**, matériaux PBR, environnements HDRI, animations squelettiques, textures compressées et LOD.
- Moteur de règles fixe et déterministe à **60 ticks/s**, sans collision physique non déterministe pour la validation des coups.
- Tests : unitaires, intégration, performance visuelle, Playwright en navigateur.

Ces choix sont des décisions de départ documentées ; tout changement doit être argumenté dans le plan.

## Animations Mixamo réellement retrouvées

Le miroir public déjà utilisé dans **WarConquer** permet d'accéder aux vrais fichiers Mixamo sans passer par une page de connexion Adobe éphémère : **471 candidats d'animations étudiés parmi 2 317 mouvements, 302 FBX binaires récupérés et vérifiés en privé, et 302 animations converties en GLB avec de véritables canaux**. L'intégration au jeu est encore à faire : **0 clip approuvé dans le runtime**.

**Présélection du 30 octobre 2026 : [60 animations complémentaires puis 3 pas arrière de boxe supplémentaires, soit 63 candidates](assets/mixamo-shortlist.json).** Les coups peuvent disposer d'une mobilité au sol et en l'air configurable ; le moteur a un découpage haut/bas du corps pour superposer la frappe à la locomotion. Ce sont des capacités de code et une liste de **candidats**, pas des composites visuellement validés. Voir [le protocole d'animation](docs/animation-first.md).

### Choisir soi-même les animations

Le [lecteur de sélection](animation-review.html) est une seconde page Vite, accessible à `http://127.0.0.1:5173/animation-review.html` après `npm run dev` (ou `/animation-review.html` sur un hébergement du build). Il propose **les 63 clips avec quatre prévisualisations MP4 distantes chacun** et leur description Mixamo. **Par défaut, il présente une seule animation à la fois**, avec lecture directe et trois gros boutons « garder / écarter / à revoir ». Le choix passe automatiquement à la prochaine animation non évaluée ; progression, filtres, retour en arrière et grille complète optionnelle sont disponibles. Aucune manipulation ni téléchargement de GLB n'est nécessaire pour ce premier tri.

Les choix sont conservés localement dans le navigateur et **exportables/importables en JSON**, avec identifiants de mouvement et SHA-256, pour que Léon transmette une sélection sans perdre l'identité exacte des clips. Aucun vidéo ni FBX/GLB tiers n'est embarqué dans le dépôt. Les prévisualisations sont lues directement depuis le service source.

### Version légère, prête pour le téléphone

Une version statique de ce **seul lecteur** se trouve sous [`docs/site/`](docs/site/animation-review.html). Elle ne pèse qu'environ **53 Ko hors ressources MP4 distantes**, sans WebGL, backend ni conversion locale. Sa source est la même que celle de l'application (pas une copie manuelle) : `npm run review:catalog` régénère les métadonnées des 63 clips, puis `npm run build:review` produit la page statique.

Pour obtenir un lien Web utilisable directement depuis un téléphone, activer **Settings → Pages → Deploy from a branch → `main` / `/docs` → Save** dans GitHub (une seule fois). L'URL effective dépend du domaine Pages choisi par le propriétaire. **La configuration Pages n'est pas encore activée** ; ne pas présenter le lien comme fonctionnel avant de l'avoir vérifié.

Pour inspecter les prévisualisations en privé sans dépendre du navigateur :

```bash
python3 scripts/review-mixamo-previews.py --destination /tmp/fighters-visual-qa --views 4 --request-interval 1
```

Le tri initial est fondé sur des poses visibles dans les vidéos YBot, **pas sur le rendu des GLB retargetés**. Les animations définitives, leurs superpositions (saut/frappe, avance/frappe, recul/frappe) et les contacts nécessitent toujours une validation humaine sur le personnage final.

[Compte rendu de l'examen et principales lacunes repérées](docs/animation-visual-screening.md).

### Vérification de la superposition avec de vrais GLB

Le [lecteur 3D de superposition](animation-composite.html) est disponible après `npm run dev` à **`http://127.0.0.1:5173/animation-composite.html`**. Il charge **les cinq GLB privés depuis le disque local** et vérifie leur SHA-256 contre l'inventaire de recherche. Une fois chargés, il affiche un YBot animé en WebGL avec orbite de caméra et quatre combinaisons `Lead_Jab_2` + garde, marche avant, marche arrière ou saut. Le temps est manipulable à la main ; la durée du jab est réglable, et les appréciations du propriétaire sont exportées avec identités, SHA et commentaires. **Les GLB ne sont jamais envoyés à un serveur ni ajoutés au dépôt public.**

Pour recréer exactement ces cinq fichiers dans un dossier privé, à partir du dépôt :

```bash
python3 scripts/acquire-mixamo.py --destination /tmp/fighters-composite-fbx --name Fighting_Idle.fbx --name Medium_Step_Forward.fbx --name Step_Backward_3.fbx --name Jump.fbx --name Lead_Jab_2.fbx --workers 1 --request-interval 5
npm install --no-save --package-lock=false fbx2gltf@0.9.7-p1
python3 scripts/convert-mixamo-fbx.py --input /tmp/fighters-composite-fbx --output /tmp/fighters-composite-glb --name Fighting_Idle.fbx --name Medium_Step_Forward.fbx --name Step_Backward_3.fbx --name Jump.fbx --name Lead_Jab_2.fbx --require-all
```

Les translations horizontales et la trajectoire verticale du lecteur ne sont que des **références illustratives** séparées des os : ce n'est ni le moteur autoritatif du match ni une vérification de vitesse/IK. Même une combinaison convaincante sur YBot doit encore passer la validation sur chaque combattant final.

Quatre mélanges `Lead_Jab_2` + (garde, pas avant, pas arrière, saut) ont désormais été testés sur **cinq GLB Mixamo/YBot réellement reconvertis en privé** dans un seul `AnimationMixer` Three.js : **65 os communs, zéro piste en conflit, zéro liaison manquante**, et mouvement effectif des membres hauts et bas. La piste de translation des hanches ne déplace plus le personnage deux fois ; c'est la simulation qui contrôle sa position. Les pas source avancent d'environ **0,92 m** et reculent d'environ **0,60 m**, avant suppression de ce déplacement par le masque. Voir [les mesures et identifiants exacts](assets/mixamo-layering-research.json).

Pour refaire cette vérification sur tes fichiers privés GLB (aucun actif Mixamo n'est publié) :

```bash
npm run mixamo:verify-layers -- --directory /tmp/fighters-research-glb \
  --attack Lead_Jab_2 \
  --locomotion Fighting_Idle \
  --locomotion Medium_Step_Forward \
  --locomotion Step_Backward_3 \
  --locomotion Jump
```

**Cette étape valide le fonctionnement technique des couches, pas encore leur réalisme en rendu.** Le calage de la cadence, la plante des pieds, la synchronisation des sauts et le retargeting sur les combattants restent à vérifier avant d'autoriser ces combinaisons dans l'arsenal.

- [Sources réelles, droits, commandes de récupération et prochaines vérifications](docs/mixamo-real-sources.md)
- [Index de 471 mouvements Mixamo réels](assets/mixamo-available-clips.json)
- `python3 scripts/acquire-mixamo.py --list --family kick` pour inspecter le catalogue.
- `python3 scripts/acquire-mixamo.py --destination /tmp/fighters-research-fbx --name Jab_Cross.fbx` pour récupérer un clip hors dépôt public.

Pour convertir les clips téléchargés en **GLB réellement animés** (recherche privée uniquement) :

```bash
npm install --no-save --package-lock=false fbx2gltf@0.9.7-p1
python3 scripts/convert-mixamo-fbx.py --input /tmp/fighters-research-fbx --output /tmp/fighters-research-glb --workers 4
```

Le chargement/retargeting sur nos combattants photoréalistes nécessite encore la validation des rigs, des droits et des frames de contact.

Le serveur du miroir peut retourner **HTTP 429** pendant une acquisition massive. Le téléchargeur cadence les requêtes et s'arrête lorsqu'il détecte ce code. Pour une reprise prudente :

```bash
python3 scripts/acquire-mixamo.py --destination /tmp/fighters-research-fbx --workers 1 --request-interval 5
```

## Commandes de combat

La [reconnaissance des coups spéciaux et les contrôles](docs/combat-commands.md) sont décrits avec leurs limites actuelles et les tests.

## Ressources et licences

- [Mixamo (Adobe)](https://www.mixamo.com/) — personnages et animations utilisables dans des jeux ; ne pas présumer que les fichiers bruts peuvent être redistribués publiquement.
- [Poly Haven](https://polyhaven.com/) — environnements HDRI, modèles et textures CC0.
- [ambientCG](https://ambientcg.com/) — matériaux PBR CC0, à vérifier lors de l'intégration.
- [MakeHuman](https://www.makehumancommunity.org/) — modèles exportés CC0 sous les conditions publiées.
- [Sketchfab](https://sketchfab.com/) — vérifier **chaque modèle** et sa licence (CC0 / CC BY ou autre).
- [Freesound](https://freesound.org/) — vérifier **chaque effet sonore** et sa licence (préférence CC0).

Consulter le [registre des ressources, avec les premiers candidats photoréalistes](docs/asset-register.md) et son [manifeste JSON](assets/manifest.json). Les règles de distribution détaillées figurent aussi dans le [plan](docs/production-plan.md).

## Arsenal arcade et animations

**Principe directeur : [animation-first](docs/animation-first.md).** Nous choisissons les coups **uniquement après** avoir identifié, acquis et inspecté de **belles animations réelles**, puis nous attribuons boutons, spéciaux et combos selon leurs gestes et leurs temps de contact. Le [catalogue de 71 attaques](docs/arsenal.md) et ses [commandes](docs/combat-commands.md) constituent un **banc de stress-test du moteur**, pas 71 coups promis au joueur. L'interface de production n'affiche que les mouvements réellement approuvés par combattant ; aujourd'hui, **0**.

[70 rôles Mixamo sont recensés pour la recherche](assets/mixamo-catalog.json), mais aucun ne prouve qu'un clip existe ou qu'il est intégré. Le nouvel [inventaire de clips approuvés](assets/animation-inventory.json) démarre vide et pilote la **création des vrais coups** ; les frames de simulation sont déduites des contacts observés dans chaque animation.

## Duels IA contre IA et QA du gameplay

Le [banc de combats IA contre IA](docs/ai-combat-qa.md) exécute de vrais affrontements dans la simulation déterministe, avec attaques, gardes, coups spéciaux et bilan de rythme. Lancer `npm run simulate:ai` ou `npm run test:ai` ; l'option **Mode → IA contre IA** est branchée dans le navigateur dès que deux GLB autorisés avec animations seront intégrés. **Cela ne constitue pas encore un test visuel du plaisir de jeu.**

Concernant les animations de combat Mixamo : **302 sont réellement téléchargées et converties en privé, mais aucune n'est encore intégrée au runtime**. La [procédure d'acquisition et de retargeting](docs/mixamo-integration.md) liste les mouvements nécessaires et les précautions de licence.

## État

Le noyau TypeScript reste séparé du rendu. **L'application Vite/Three.js et sa caméra WebGL 2 sont maintenant codées** : éclairage physique de référence, sol de collision visuel, chargement GLB licencié, animations squelettiques, HUD conditionnel et métriques FPS/draw calls. **Les modèles encore candidats ne sont pas chargés** ; aucun personnage de remplacement n'est présenté comme photoréaliste ou jouable. La compilation Vite et le rendu navigateur doivent encore être vérifiés sur la version publiée. Les cases à cocher du plan font foi.

Pour le projet (Node.js 24) : **npm install**, **npm run dev**, **npm test**, **npm run typecheck**, **npm run build**. Les modèles de combattants juridiquement autorisés doivent être déposés dans public/models/ et décrits comme intégrés dans le manifeste avant d'apparaître en jeu.

Les captures navigateur utilisent l'[adaptation de WebSuite](docs/visual-qa.md) de WarConquer ; le workflow GitHub Actions est **manuel uniquement** pour préserver les minutes.
