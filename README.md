# Fighters 🥊

Jeu de combat **2,5D photoréaliste pour le Web** : combats rapides vus de côté, personnages et arènes en 3D, contrôles classiques, combos, coups spéciaux, ambiance sonore et effets cinématiques.

> Projet original inspiré des conventions des jeux de combat arcade, sans reprendre les personnages, marques, graphismes, sons ni interfaces protégés d'autres jeux.

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

## État

Le noyau TypeScript reste séparé du rendu. **L'application Vite/Three.js et sa caméra WebGL 2 sont maintenant codées** : éclairage physique de référence, sol de collision visuel, chargement GLB licencié, animations squelettiques, HUD conditionnel et métriques FPS/draw calls. **Les modèles encore candidats ne sont pas chargés** ; aucun personnage de remplacement n'est présenté comme photoréaliste ou jouable. La compilation Vite et le rendu navigateur doivent encore être vérifiés sur la version publiée. Les cases à cocher du plan font foi.

Pour le projet (Node.js 24) : **npm install**, **npm run dev**, **npm test**, **npm run typecheck**, **npm run build**. Les modèles de combattants juridiquement autorisés doivent être déposés dans public/models/ et décrits comme intégrés dans le manifeste avant d'apparaître en jeu.

Les captures navigateur utilisent l'[adaptation de WebSuite](docs/visual-qa.md) de WarConquer ; le workflow GitHub Actions est **manuel uniquement** pour préserver les minutes.
