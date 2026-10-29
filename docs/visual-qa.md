# Captures et vérification visuelle — Fighters

## Intention

La qualité de Fighters repose **simultanément** sur une simulation de combat puissante, une latence maîtrisée et des personnages/décors véritablement photoréalistes. Une capture belle mais à 12 FPS, ou un 60 FPS obtenu en dégradant discrètement les personnages, ne satisfait pas le mandat.

### Outil existant à réutiliser

WebSuite est déjà développé dans **[leye0/WarConquer](https://github.com/leye0/WarConquer)** :

- [Implémentation générique en Node/CDP](https://github.com/leye0/WarConquer/blob/main/scripts/websuite.mjs)
- [Guide d'utilisation](https://github.com/leye0/WarConquer/blob/main/docs/websuite.md)
- [Workflow GitHub Actions existant](https://github.com/leye0/WarConquer/blob/main/.github/workflows/websuite.yml)

Il gère des captures PNG, des interactions clavier/souris, des assertions DOM et des scénarios JSON, sans dépendance Playwright. **Il n'est pas encore copié dans Fighters.** Nous le réutiliserons et l'adapterons lors de l'intégration du rendu WebGL.

## Adaptations indispensables à Fighters

- **Serveur Vite et modules ES** : le WebSuite initial ouvre les fichiers via file://. Fighters utilisera une application servie en HTTP local ; ajouter la navigation contrôlée vers un URL localhost autorisé, ou préparer un bundle statique avec serveur local. Ne pas contourner CORS avec un navigateur non sécurisé.
- **Véritable canvas WebGL** : attendre le chargement des meshes GLB, textures PBR, shaders, animations et l'affichage d'au moins une frame réelle avant la capture. Deux requestAnimationFrame ne suffisent pas forcément.
- **GPU** : la version WarConquer démarre Chrome avec --disable-gpu. Ce mode ne prouve ni la performance ni la fidélité de rendu GPU ; prévoir un mode GPU réel lorsqu'il est disponible et distinguer explicitement le mode logiciel en CI.
- **Scène déterministe** : fixer caméra, combattants, tick de simulation, phase du coup, exposition, profil graphique et dimensions de viewport pour rendre les captures comparables.
- **Interactions pertinentes** : sélectionner un personnage, lancer un combat, vérifier HUD et commandes, figer une pose d'impact, capturer le même tick avant/après modification graphique.
- **Cohérence visuelle** : vérifier les yeux/peau/cheveux, matériaux, ombres, articulation, contact avec le sol, clipping, anticrénelage et lisibilité des coups.
- **Formats** : références en 1280×720 et 1920×1080, et tests de cadrage ultrawide ; qualité Ultra sur la machine de référence.
- **Coûts CI** : privilégier l'usage local et les déclenchements manuels ou ciblés. Ne pas déclencher une capture lourde pour chaque mise à jour documentaire sur main.
- **Données et droits** : ne jamais mettre des secrets, contenus privés ou assets non redistribuables dans les captures et artefacts publics.

## Ce qui reste spécifique à WarConquer

Ne pas copier les références à patate.html, Character Lab, Perception Lab, scénarios de combat WarConquer ou déclencheurs pull_request. Fighters utilise ses propres scènes et cas de test.

## Deux familles de mesures complémentaires

| Vérification | Outil | Preuve |
| --- | --- | --- |
| **Rendu/cadrage** | WebSuite adapté, Chrome CDP | PNG + paramètres scène/caméra et état de chargement |
| **Performance réelle** | Navigateur avec GPU de référence + métriques moteur | FPS, 1% low, frame time CPU/GPU, VRAM, draw calls, temps de chargement |
| **Comportement d'entrée** | Tests déterministes du moteur + scénarios interactifs WebSuite | Tick/état attendu, événements de coup et HUD |
| **Validation esthétique** | Capture présentée au propriétaire | Avis explicite sur le rendu ; aucun verdict automatique fictif |

Les captures sont un outil de comparaison et de discussion. Elles ne remplacent ni le profilage d'un vrai GPU, ni l'appréciation humaine du rendu.
